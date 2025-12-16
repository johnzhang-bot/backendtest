/**
 * AUTH module database initialisation.
 *
 * Ensures AUTH tables exist in the shared database before
 * the AUTH API is exposed. This mirrors the HR and IT initialisation pattern
 * but creates only the AUTH-specific tables.
 */

import pg from 'pg';
const { Client } = pg;
import databaseConfig from '../databaseConfig.js';
import { validateAuthDatabaseConfig } from './auth.schema.js';

function withTimeout(promise, timeoutMs, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const error = new Error(
                `[AUTH_DB][TIMEOUT] Operation "${label}" exceeded ${timeoutMs}ms`
            );
            error.code = 'AUTH_DB_TIMEOUT';
            reject(error);
        }, timeoutMs);

        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

async function retryWithBackoff(operation, { attempts, baseDelayMs }) {
    let attempt = 0;
    let lastError;

    while (attempt < attempts) {
        try {
            // eslint-disable-next-line no-await-in-loop
            await operation();
            return;
        } catch (error) {
            lastError = error;
            attempt += 1;

            if (attempt >= attempts) {
                break;
            }

            const delay = baseDelayMs * 2 ** (attempt - 1);
            console.warn('[AUTH_DB][WARN] Operation failed, will retry', {
                attempt,
                remainingAttempts: attempts - attempt,
                delayMs: delay,
                code: error.code,
                message: error.message,
            });

            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Build connection configuration for admin operations (connects to 'postgres' database).
 *
 * @returns {import('pg').ClientConfig}
 */
function buildAdminConnectionConfig() {
    return {
        host: databaseConfig.url,
        port: databaseConfig.port,
        user: databaseConfig.username || undefined,
        password: databaseConfig.password || undefined,
        database: 'postgres', // Connect to default postgres database for admin operations
    };
}

/**
 * Build connection configuration for a specific database.
 *
 * @param {string} dbName - Database name to connect to.
 * @returns {import('pg').ClientConfig}
 */
function buildConnectionConfig(dbName) {
    return {
        host: databaseConfig.url,
        port: databaseConfig.port,
        user: databaseConfig.username || undefined,
        password: databaseConfig.password || undefined,
        database: dbName,
    };
}

async function ensureAuthDatabaseExists(client, dbName) {
    console.info('[AUTH_DB][INFO] Ensuring AUTH database exists', {
        database: dbName,
    });

    // Check if database exists
    const result = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [dbName]
    );

    if (result.rows.length === 0) {
        // Database doesn't exist, create it
        await client.query(`CREATE DATABASE "${dbName}"`);
        console.info('[AUTH_DB][INFO] Created database', { database: dbName });
    } else {
        console.info('[AUTH_DB][INFO] Database already exists', { database: dbName });
    }
}

async function ensureAuthTablesExist(client) {
    console.info('[AUTH_DB][INFO] Ensuring AUTH tables exist');

    const statements = [
        // Users table
        `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(256) NOT NULL,
      password VARCHAR(255) NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT idx_users_email UNIQUE (email)
    );
    `,
        // Create indexes
        `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`,
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const sql of statements) {
        // eslint-disable-next-line no-await-in-loop
        await client.query(sql);
    }
}

/**
 * Initialise the AUTH database schema if the AUTH module is enabled.
 *
 * @param {{ timeoutMs?: number, maxRetries?: number }} [options]
 * @returns {Promise<void>}
 */
export async function initializeAuthDatabase(options = {}) {
    const { timeoutMs = 15000, maxRetries = 3 } = options;

    // Preconditions: base database configuration must be valid.
    validateAuthDatabaseConfig();

    const dbName = databaseConfig.database || 'agilon_db';
    if (!databaseConfig.database) {
        console.warn('[AUTH_DB][WARN] No database name configured, using default: agilon_db');
    }

    console.info('[AUTH_DB][INFO] Starting AUTH database initialisation', {
        database: dbName,
    });

    const operation = async () => {
        // First, connect to postgres database to create the target database if needed
        const adminClient = new Client(buildAdminConnectionConfig());
        let client;

        try {
            await adminClient.connect();
            await ensureAuthDatabaseExists(adminClient, dbName);
            await adminClient.end();

            // Now connect to the target database to create tables
            client = new Client(buildConnectionConfig(dbName));
            await client.connect();
            await ensureAuthTablesExist(client);

            console.info('[AUTH_DB][INFO] AUTH database initialised successfully', {
                database: dbName,
            });
        } finally {
            if (client) {
                try {
                    await client.end();
                } catch {
                    // Safe to ignore close errors; connection is being discarded.
                }
            }
        }
    };

    try {
        await withTimeout(
            retryWithBackoff(operation, {
                attempts: maxRetries,
                baseDelayMs: 500,
            }),
            timeoutMs,
            'initializeAuthDatabase',
        );
    } catch (error) {
        console.error('[AUTH_DB][ERROR] Failed to initialise AUTH database', {
            code: error.code,
            message: error.message,
        });
        throw error;
    }
}

export default {
    initializeAuthDatabase,
};

