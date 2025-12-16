/**
 * LEGAL module database initialisation.
 *
 * Creates tables for legal contracts, compliance, IP, and legal matters.
 */

import pg from 'pg';
const { Client } = pg;
import databaseConfig from '../databaseConfig.js';
import { validateLegalDatabaseConfig } from './legal.schema.js';

function withTimeout(promise, timeoutMs, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const error = new Error(
                `[LEGAL_DB][TIMEOUT] Operation "${label}" exceeded ${timeoutMs}ms`
            );
            error.code = 'LEGAL_DB_TIMEOUT';
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
            console.warn('[LEGAL_DB][WARN] Operation failed, will retry', {
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

function buildAdminConnectionConfig() {
    return {
        host: databaseConfig.url,
        port: databaseConfig.port,
        user: databaseConfig.username || undefined,
        password: databaseConfig.password || undefined,
        database: 'postgres',
    };
}

function buildConnectionConfig(dbName) {
    return {
        host: databaseConfig.url,
        port: databaseConfig.port,
        user: databaseConfig.username || undefined,
        password: databaseConfig.password || undefined,
        database: dbName,
    };
}

async function ensureLegalDatabaseExists(client, dbName) {
    console.info('[LEGAL_DB][INFO] Ensuring LEGAL database exists', {
        database: dbName,
    });

    const result = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [dbName]
    );

    if (result.rows.length === 0) {
        await client.query(`CREATE DATABASE "${dbName}"`);
        console.info('[LEGAL_DB][INFO] Created database', { database: dbName });
    } else {
        console.info('[LEGAL_DB][INFO] Database already exists', { database: dbName });
    }
}

async function ensureLegalTablesExist(client) {
    console.info('[LEGAL_DB][INFO] Ensuring LEGAL tables exist');

    const statements = [
        // Contracts
        `
    CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY,
      "contractNumber" VARCHAR(64) NOT NULL,
      title VARCHAR(256) NOT NULL,
      type VARCHAR(64) NOT NULL CHECK (type IN ('NDA', 'MSA', 'SOW', 'Vendor Agreement', 'Customer Agreement', 'DPA', 'Employment', 'Other')),
      counterparty VARCHAR(256) NOT NULL,
      status VARCHAR(32) NOT NULL CHECK (status IN ('draft', 'under_review', 'pending_signature', 'active', 'expired', 'terminated')) DEFAULT 'draft',
      "effectiveDate" DATE,
      "expirationDate" DATE,
      value DECIMAL(15, 2),
      description TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT idx_contracts_number UNIQUE ("contractNumber")
    );
    `,
        `CREATE INDEX IF NOT EXISTS idx_contracts_type ON contracts(type);`,
        `CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);`,

        // Compliance Items
        `
    CREATE TABLE IF NOT EXISTS compliance_items (
      id SERIAL PRIMARY KEY,
      title VARCHAR(256) NOT NULL,
      category VARCHAR(64) NOT NULL CHECK (category IN ('business_registration', 'tax', 'data_protection', 'employment', 'environmental', 'industry_specific', 'other')),
      status VARCHAR(32) NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')) DEFAULT 'pending',
      "dueDate" DATE,
      "completedDate" DATE,
      "assignedTo" VARCHAR(128),
      description TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `,
        `CREATE INDEX IF NOT EXISTS idx_compliance_category ON compliance_items(category);`,
        `CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_items(status);`,
        `CREATE INDEX IF NOT EXISTS idx_compliance_due_date ON compliance_items("dueDate");`,

        // Intellectual Property
        `
    CREATE TABLE IF NOT EXISTS intellectual_property (
      id SERIAL PRIMARY KEY,
      "ipType" VARCHAR(32) NOT NULL CHECK ("ipType" IN ('trademark', 'copyright', 'patent', 'trade_secret', 'domain')),
      title VARCHAR(256) NOT NULL,
      "registrationNumber" VARCHAR(128),
      status VARCHAR(32) NOT NULL CHECK (status IN ('pending', 'filed', 'registered', 'expired', 'abandoned')) DEFAULT 'pending',
      "filingDate" DATE,
      "registrationDate" DATE,
      "expirationDate" DATE,
      jurisdiction VARCHAR(128),
      description TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `,
        `CREATE INDEX IF NOT EXISTS idx_ip_type ON intellectual_property("ipType");`,
        `CREATE INDEX IF NOT EXISTS idx_ip_status ON intellectual_property(status);`,
        `CREATE INDEX IF NOT EXISTS idx_ip_registration_number ON intellectual_property("registrationNumber");`,

        // Legal Matters/Cases
        `
    CREATE TABLE IF NOT EXISTS legal_matters (
      id SERIAL PRIMARY KEY,
      "matterNumber" VARCHAR(64) NOT NULL,
      title VARCHAR(256) NOT NULL,
      "matterType" VARCHAR(64) NOT NULL CHECK ("matterType" IN ('litigation', 'dispute', 'regulatory', 'investigation', 'advisory', 'transaction', 'other')),
      status VARCHAR(32) NOT NULL CHECK (status IN ('open', 'in_progress', 'pending', 'closed', 'settled')) DEFAULT 'open',
      priority VARCHAR(32) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
      "assignedCounsel" VARCHAR(256),
      "openedDate" DATE NOT NULL,
      "closedDate" DATE,
      description TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT idx_lm_matter_number UNIQUE ("matterNumber")
    );
    `,
        `CREATE INDEX IF NOT EXISTS idx_lm_matter_type ON legal_matters("matterType");`,
        `CREATE INDEX IF NOT EXISTS idx_lm_status ON legal_matters(status);`,
    ];

    for (const sql of statements) {
        await client.query(sql);
    }
}

export async function initializeLegalDatabase(options = {}) {
    const { timeoutMs = 15000, maxRetries = 3 } = options;

    validateLegalDatabaseConfig();

    const dbName = databaseConfig.database || 'agilon_db';
    if (!databaseConfig.database) {
        console.warn('[LEGAL_DB][WARN] No database name configured, using default: agilon_db');
    }

    console.info('[LEGAL_DB][INFO] Starting LEGAL database initialisation', {
        database: dbName,
    });

    const operation = async () => {
        const adminClient = new Client(buildAdminConnectionConfig());
        let client;

        try {
            await adminClient.connect();
            await ensureLegalDatabaseExists(adminClient, dbName);
            await adminClient.end();

            client = new Client(buildConnectionConfig(dbName));
            await client.connect();
            await ensureLegalTablesExist(client);

            console.info('[LEGAL_DB][INFO] LEGAL database initialised successfully', {
                database: dbName,
            });
        } finally {
            if (client) {
                try {
                    await client.end();
                } catch {
                    // Safe to ignore close errors
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
            'initializeLegalDatabase',
        );
    } catch (error) {
        console.error('[LEGAL_DB][ERROR] Failed to initialise LEGAL database', {
            code: error.code,
            message: error.message,
        });
        throw error;
    }
}

export default {
    initializeLegalDatabase,
};

