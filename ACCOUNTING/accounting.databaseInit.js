/**
 * ACCOUNTING module database initialisation.
 *
 * Ensures ACCOUNTING tables exist and seeds a standard chart of accounts
 * for a small business.
 */

import pg from 'pg';
const { Client } = pg;
import databaseConfig from '../databaseConfig.js';
import { validateAccountingDatabaseConfig } from './accounting.schema.js';

function withTimeout(promise, timeoutMs, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const error = new Error(
                `[ACCOUNTING_DB][TIMEOUT] Operation "${label}" exceeded ${timeoutMs}ms`
            );
            error.code = 'ACCOUNTING_DB_TIMEOUT';
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
            console.warn('[ACCOUNTING_DB][WARN] Operation failed, will retry', {
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

/**
 * Seed standard chart of accounts for a small business.
 *
 * @param {import('pg').Client} client
 * @returns {Promise<void>}
 */
async function seedChartOfAccounts(client) {
    // Check if accounts already exist
    const result = await client.query('SELECT COUNT(*) AS count FROM chart_of_accounts');
    const count = Number(result.rows[0]?.count ?? 0);

    if (count > 0) {
        console.info('[ACCOUNTING_DB][INFO] Chart of accounts already seeded, skipping');
        return;
    }

    console.info('[ACCOUNTING_DB][INFO] Seeding standard chart of accounts');

    const now = new Date();
    const accounts = [
        // Assets (1000-1999)
        { number: '1010', name: 'Cash - Checking', category: 'assets', subcategory: 'Current Assets' },
        { number: '1020', name: 'Cash - Savings', category: 'assets', subcategory: 'Current Assets' },
        { number: '1030', name: 'Petty Cash', category: 'assets', subcategory: 'Current Assets' },
        { number: '1100', name: 'Accounts Receivable', category: 'assets', subcategory: 'Current Assets' },
        { number: '1200', name: 'Inventory', category: 'assets', subcategory: 'Current Assets' },
        { number: '1300', name: 'Prepaid Insurance', category: 'assets', subcategory: 'Current Assets' },
        { number: '1310', name: 'Prepaid Rent', category: 'assets', subcategory: 'Current Assets' },
        { number: '1500', name: 'Furniture & Equipment', category: 'assets', subcategory: 'Fixed Assets' },
        { number: '1510', name: 'Vehicles', category: 'assets', subcategory: 'Fixed Assets' },
        { number: '1520', name: 'Machinery', category: 'assets', subcategory: 'Fixed Assets' },
        { number: '1530', name: 'Leasehold Improvements', category: 'assets', subcategory: 'Fixed Assets' },
        { number: '1600', name: 'Accumulated Depreciation', category: 'assets', subcategory: 'Fixed Assets' },

        // Liabilities (2000-2999)
        { number: '2010', name: 'Accounts Payable', category: 'liabilities', subcategory: 'Current Liabilities' },
        { number: '2020', name: 'Credit Card Payable', category: 'liabilities', subcategory: 'Current Liabilities' },
        { number: '2100', name: 'Accrued Payroll', category: 'liabilities', subcategory: 'Current Liabilities' },
        { number: '2110', name: 'Accrued Interest', category: 'liabilities', subcategory: 'Current Liabilities' },
        { number: '2120', name: 'Accrued Utilities', category: 'liabilities', subcategory: 'Current Liabilities' },
        { number: '2200', name: 'Sales Tax Payable', category: 'liabilities', subcategory: 'Current Liabilities' },
        { number: '2210', name: 'Payroll Tax Payable', category: 'liabilities', subcategory: 'Current Liabilities' },
        { number: '2300', name: 'Short-Term Loans Payable', category: 'liabilities', subcategory: 'Current Liabilities' },
        { number: '2310', name: 'Line of Credit', category: 'liabilities', subcategory: 'Current Liabilities' },
        { number: '2500', name: 'Long-Term Loans Payable', category: 'liabilities', subcategory: 'Long-Term Liabilities' },
        { number: '2510', name: 'Mortgage Payable', category: 'liabilities', subcategory: 'Long-Term Liabilities' },

        // Equity (3000-3999)
        { number: '3010', name: "Owner's Capital", category: 'equity', subcategory: "Owner's Equity" },
        { number: '3020', name: 'Common Stock', category: 'equity', subcategory: "Shareholder's Equity" },
        { number: '3030', name: 'Additional Paid-In Capital', category: 'equity', subcategory: "Shareholder's Equity" },
        { number: '3100', name: 'Retained Earnings', category: 'equity', subcategory: 'Retained Earnings' },
        { number: '3200', name: "Owner's Drawings", category: 'equity', subcategory: 'Distributions' },
        { number: '3210', name: 'Dividends', category: 'equity', subcategory: 'Distributions' },

        // Revenue (4000-4999)
        { number: '4010', name: 'Product Sales Revenue', category: 'revenue', subcategory: 'Operating Revenue' },
        { number: '4020', name: 'Service Revenue', category: 'revenue', subcategory: 'Operating Revenue' },
        { number: '4100', name: 'Other Operating Revenue', category: 'revenue', subcategory: 'Operating Revenue' },
        { number: '4900', name: 'Interest Income', category: 'revenue', subcategory: 'Non-Operating Revenue' },
        { number: '4910', name: 'Other Income', category: 'revenue', subcategory: 'Non-Operating Revenue' },

        // Cost of Goods Sold & Expenses (5000-6999)
        { number: '5010', name: 'Cost of Materials', category: 'expenses', subcategory: 'Cost of Goods Sold' },
        { number: '5020', name: 'Direct Labor', category: 'expenses', subcategory: 'Cost of Goods Sold' },
        { number: '5030', name: 'Subcontract Manufacturing', category: 'expenses', subcategory: 'Cost of Goods Sold' },
        { number: '5040', name: 'Freight-In', category: 'expenses', subcategory: 'Cost of Goods Sold' },
        { number: '6010', name: 'Salaries and Wages', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6020', name: 'Payroll Taxes', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6030', name: 'Employee Benefits', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6100', name: 'Rent Expense', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6110', name: 'Utilities - Electric', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6120', name: 'Utilities - Water & Gas', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6130', name: 'Internet & Phone', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6200', name: 'Office Supplies', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6300', name: 'Marketing & Advertising', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6400', name: 'Travel Expense', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6410', name: 'Meals & Entertainment', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6500', name: 'Insurance Expense', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6600', name: 'Legal Fees', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6610', name: 'Accounting Fees', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6620', name: 'Consulting Fees', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6700', name: 'Software & Subscriptions', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6800', name: 'Repairs & Maintenance', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6900', name: 'Bank Fees', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6910', name: 'Merchant Fees', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6950', name: 'Depreciation Expense', category: 'expenses', subcategory: 'Operating Expenses' },
        { number: '6990', name: 'Income Tax Expense', category: 'expenses', subcategory: 'Operating Expenses' },
    ];

    for (const account of accounts) {
        await client.query(
            `
            INSERT INTO chart_of_accounts
              ("accountNumber", "accountName", category, subcategory, "isActive", "createdAt", "updatedAt")
            VALUES
              ($1, $2, $3, $4, true, $5, $6)
            `,
            [account.number, account.name, account.category, account.subcategory, now, now]
        );
    }

    console.info('[ACCOUNTING_DB][INFO] Seeded chart of accounts', {
        accountsAdded: accounts.length,
    });
}

async function ensureAccountingDatabaseExists(client, dbName) {
    console.info('[ACCOUNTING_DB][INFO] Ensuring ACCOUNTING database exists', {
        database: dbName,
    });

    const result = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [dbName]
    );

    if (result.rows.length === 0) {
        await client.query(`CREATE DATABASE "${dbName}"`);
        console.info('[ACCOUNTING_DB][INFO] Created database', { database: dbName });
    } else {
        console.info('[ACCOUNTING_DB][INFO] Database already exists', { database: dbName });
    }
}

async function ensureAccountingTablesExist(client) {
    console.info('[ACCOUNTING_DB][INFO] Ensuring ACCOUNTING tables exist');

    const statements = [
        // Chart of Accounts
        `
    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id SERIAL PRIMARY KEY,
      "accountNumber" VARCHAR(10) NOT NULL,
      "accountName" VARCHAR(256) NOT NULL,
      category VARCHAR(32) NOT NULL CHECK (category IN ('assets', 'liabilities', 'equity', 'revenue', 'expenses')),
      subcategory VARCHAR(128),
      description TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT idx_coa_account_number UNIQUE ("accountNumber")
    );
    `,
        `CREATE INDEX IF NOT EXISTS idx_coa_category ON chart_of_accounts(category);`,
        // Journal Entries
        `
    CREATE TABLE IF NOT EXISTS journal_entries (
      id SERIAL PRIMARY KEY,
      "entryDate" DATE NOT NULL,
      description TEXT NOT NULL,
      "referenceNumber" VARCHAR(64),
      "createdBy" VARCHAR(128),
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `,
        `CREATE INDEX IF NOT EXISTS idx_je_entry_date ON journal_entries("entryDate");`,
        `CREATE INDEX IF NOT EXISTS idx_je_reference_number ON journal_entries("referenceNumber");`,
        // Journal Entry Lines
        `
    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id SERIAL PRIMARY KEY,
      "journalEntryId" INTEGER NOT NULL,
      "accountId" INTEGER NOT NULL,
      debit DECIMAL(15, 2) NOT NULL DEFAULT 0,
      credit DECIMAL(15, 2) NOT NULL DEFAULT 0,
      description TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_jel_journal_entry
        FOREIGN KEY ("journalEntryId") REFERENCES journal_entries(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_jel_account
        FOREIGN KEY ("accountId") REFERENCES chart_of_accounts(id)
        ON DELETE RESTRICT
    );
    `,
        `CREATE INDEX IF NOT EXISTS idx_jel_journal_entry ON journal_entry_lines("journalEntryId");`,
        `CREATE INDEX IF NOT EXISTS idx_jel_account ON journal_entry_lines("accountId");`,
    ];

    for (const sql of statements) {
        await client.query(sql);
    }
}

/**
 * Initialise the ACCOUNTING database schema if the ACCOUNTING module is enabled.
 *
 * @param {{ timeoutMs?: number, maxRetries?: number }} [options]
 * @returns {Promise<void>}
 */
export async function initializeAccountingDatabase(options = {}) {
    const { timeoutMs = 15000, maxRetries = 3 } = options;

    validateAccountingDatabaseConfig();

    const dbName = databaseConfig.database || 'agilon_db';
    if (!databaseConfig.database) {
        console.warn('[ACCOUNTING_DB][WARN] No database name configured, using default: agilon_db');
    }

    console.info('[ACCOUNTING_DB][INFO] Starting ACCOUNTING database initialisation', {
        database: dbName,
    });

    const operation = async () => {
        const adminClient = new Client(buildAdminConnectionConfig());
        let client;

        try {
            await adminClient.connect();
            await ensureAccountingDatabaseExists(adminClient, dbName);
            await adminClient.end();

            client = new Client(buildConnectionConfig(dbName));
            await client.connect();
            await ensureAccountingTablesExist(client);
            await seedChartOfAccounts(client);

            console.info('[ACCOUNTING_DB][INFO] ACCOUNTING database initialised successfully', {
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
            'initializeAccountingDatabase',
        );
    } catch (error) {
        console.error('[ACCOUNTING_DB][ERROR] Failed to initialise ACCOUNTING database', {
            code: error.code,
            message: error.message,
        });
        throw error;
    }
}

export default {
    initializeAccountingDatabase,
};

