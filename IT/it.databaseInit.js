/**
 * IT module database initialisation.
 *
 * Ensures IT tables exist in the shared database before
 * the IT API is exposed. This mirrors the HR initialisation pattern
 * but creates only the IT-specific tables.
 */

import pg from 'pg';
const { Client } = pg;
import databaseConfig from '../databaseConfig.js';
import { validateItDatabaseConfig } from './it.schema.js';

function withTimeout(promise, timeoutMs, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const error = new Error(
                `[IT_DB][TIMEOUT] Operation "${label}" exceeded ${timeoutMs}ms`
            );
            error.code = 'IT_DB_TIMEOUT';
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
            console.warn('[IT_DB][WARN] Operation failed, will retry', {
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

async function ensureItDatabaseExists(client, dbName) {
    console.info('[IT_DB][INFO] Ensuring IT database exists', {
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
        console.info('[IT_DB][INFO] Created database', { database: dbName });
    } else {
        console.info('[IT_DB][INFO] Database already exists', { database: dbName });
    }
}

async function ensureItTablesExist(client) {
    console.info('[IT_DB][INFO] Ensuring IT tables exist');

    const statements = [
        // IT devices
        `
    CREATE TABLE IF NOT EXISTS it_devices (
      id SERIAL PRIMARY KEY,
      label VARCHAR(64) NOT NULL,
      owner VARCHAR(128) NOT NULL,
      type VARCHAR(128) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'in_use' CHECK (status IN ('in_use', 'available', 'retired')),
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `,
        // Create indexes
        `CREATE INDEX IF NOT EXISTS idx_it_devices_owner ON it_devices(owner);`,
        `CREATE INDEX IF NOT EXISTS idx_it_devices_status ON it_devices(status);`,
        // IT tickets
        `
    CREATE TABLE IF NOT EXISTS it_tickets (
      id SERIAL PRIMARY KEY,
      title VARCHAR(256) NOT NULL,
      owner VARCHAR(128) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
      priority VARCHAR(32) NOT NULL DEFAULT 'low' CHECK (priority IN ('low', 'medium', 'high')),
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `,
        // Create indexes
        `CREATE INDEX IF NOT EXISTS idx_it_tickets_status ON it_tickets(status);`,
        `CREATE INDEX IF NOT EXISTS idx_it_tickets_priority ON it_tickets(priority);`,
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const sql of statements) {
        // eslint-disable-next-line no-await-in-loop
        await client.query(sql);
    }
}

/**
 * Initialise the IT database schema if the IT module is enabled.
 *
 * @param {{ timeoutMs?: number, maxRetries?: number }} [options]
 * @returns {Promise<void>}
 */
export async function initializeItDatabase(options = {}) {
    const { timeoutMs = 15000, maxRetries = 3 } = options;

    // Preconditions: base database configuration must be valid.
    validateItDatabaseConfig();

    const dbName = databaseConfig.database || 'agilon_db';
    if (!databaseConfig.database) {
        console.warn('[IT_DB][WARN] No database name configured, using default: agilon_db');
    }

    console.info('[IT_DB][INFO] Starting IT database initialisation', {
        database: dbName,
    });

    const operation = async () => {
        // First, connect to postgres database to create the target database if needed
        const adminClient = new Client(buildAdminConnectionConfig());
        let client;

        try {
            await adminClient.connect();
            await ensureItDatabaseExists(adminClient, dbName);
            await adminClient.end();

            // Now connect to the target database to create tables
            client = new Client(buildConnectionConfig(dbName));
            await client.connect();
            await ensureItTablesExist(client);

            console.info('[IT_DB][INFO] IT database initialised successfully', {
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
            'initializeItDatabase',
        );
    } catch (error) {
        console.error('[IT_DB][ERROR] Failed to initialise IT database', {
            code: error.code,
            message: error.message,
        });
        throw error;
    }
}

export default {
    initializeItDatabase,
};
