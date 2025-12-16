/**
 * ACCOUNTING data access layer.
 *
 * Manages chart of accounts, journal entries, and financial transactions.
 */

import pg from 'pg';
const { Client } = pg;
import databaseConfig from '../databaseConfig.js';
import { validateAccountingDatabaseConfig } from './accounting.schema.js';

function validateAccountingQueryConfig() {
  const issues = [];

  if (!databaseConfig.url) {
    issues.push('DB_HOST (databaseConfig.url) is not defined');
  }

  if (Number.isNaN(databaseConfig.port) || databaseConfig.port <= 0) {
    issues.push('DB_PORT (databaseConfig.port) must be a positive number');
  }

  if (!databaseConfig.username) {
    issues.push('DB_USER (databaseConfig.username) is not defined');
  }

  if (issues.length > 0) {
    const error = new Error(
      `[ACCOUNTING_REPOSITORY] Invalid DB configuration: ${issues.join('; ')}`
    );
    error.code = 'ACCOUNTING_REPOSITORY_INVALID_DB_CONFIG';
    throw error;
  }
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(
        `[ACCOUNTING_REPOSITORY][TIMEOUT] Operation "${label}" exceeded ${timeoutMs}ms`
      );
      error.code = 'ACCOUNTING_REPOSITORY_TIMEOUT';
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

function buildConnectionConfig() {
  return {
    host: databaseConfig.url,
    port: databaseConfig.port,
    user: databaseConfig.username,
    password: databaseConfig.password || undefined,
    database: databaseConfig.database || 'agilon_db',
  };
}

async function executeQuery(sql, params = [], label = 'accounting-query') {
  validateAccountingDatabaseConfig();
  validateAccountingQueryConfig();

  const config = buildConnectionConfig();

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore close errors
      }
    }
  };

  return withTimeout(operation(), 8000, label);
}

/**
 * Fetch all accounts from chart of accounts.
 *
 * @param {string} [category] - Optional category filter
 * @returns {Promise<Array<object>>}
 */
export async function getChartOfAccounts(category = null) {
  let sql = `
    SELECT
      id,
      "accountNumber",
      "accountName",
      category,
      subcategory,
      description,
      "isActive",
      "createdAt",
      "updatedAt"
    FROM chart_of_accounts
  `;

  const params = [];
  if (category) {
    sql += ` WHERE category = $1`;
    params.push(category);
  }

  sql += ` ORDER BY "accountNumber" ASC`;

  return executeQuery(sql, params, 'getChartOfAccounts');
}

/**
 * Get account balances grouped by category.
 *
 * @returns {Promise<object>}
 */
export async function getAccountBalances() {
  const sql = `
    SELECT
      coa.category,
      coa."accountNumber",
      coa."accountName",
      COALESCE(SUM(jel.debit), 0) AS total_debit,
      COALESCE(SUM(jel.credit), 0) AS total_credit,
      COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0) AS balance
    FROM chart_of_accounts coa
    LEFT JOIN journal_entry_lines jel ON coa.id = jel."accountId"
    WHERE coa."isActive" = true
    GROUP BY coa.id, coa.category, coa."accountNumber", coa."accountName"
    ORDER BY coa."accountNumber" ASC
  `;

  const rows = await executeQuery(sql, [], 'getAccountBalances');

  // Group by category
  const grouped = {
    assets: [],
    liabilities: [],
    equity: [],
    revenue: [],
    expenses: [],
  };

  rows.forEach((row) => {
    if (grouped[row.category]) {
      grouped[row.category].push({
        accountNumber: row.accountNumber,
        accountName: row.accountName,
        balance: parseFloat(row.balance) || 0,
        totalDebit: parseFloat(row.total_debit) || 0,
        totalCredit: parseFloat(row.total_credit) || 0,
      });
    }
  });

  return grouped;
}

/**
 * Fetch recent journal entries with their lines.
 *
 * @param {number} [limit=50] - Maximum number of entries to return
 * @returns {Promise<Array<object>>}
 */
export async function getJournalEntries(limit = 50) {
  const sql = `
    SELECT
      je.id,
      je."entryDate",
      je.description,
      je."referenceNumber",
      je."createdBy",
      je."createdAt",
      je."updatedAt"
    FROM journal_entries je
    ORDER BY je."entryDate" DESC, je.id DESC
    LIMIT $1
  `;

  return executeQuery(sql, [limit], 'getJournalEntries');
}

/**
 * Get lines for a specific journal entry.
 *
 * @param {number} journalEntryId
 * @returns {Promise<Array<object>>}
 */
export async function getJournalEntryLines(journalEntryId) {
  const sql = `
    SELECT
      jel.id,
      jel."journalEntryId",
      jel."accountId",
      jel.debit,
      jel.credit,
      jel.description,
      coa."accountNumber",
      coa."accountName"
    FROM journal_entry_lines jel
    JOIN chart_of_accounts coa ON jel."accountId" = coa.id
    WHERE jel."journalEntryId" = $1
    ORDER BY jel.id ASC
  `;

  return executeQuery(sql, [journalEntryId], 'getJournalEntryLines');
}

/**
 * Create a new journal entry with lines.
 *
 * @param {{
 *   entryDate: string;
 *   description: string;
 *   referenceNumber?: string;
 *   createdBy?: string;
 *   lines: Array<{ accountId: number; debit: number; credit: number; description?: string }>;
 * }} payload
 * @returns {Promise<object>}
 */
export async function createJournalEntry(payload) {
  validateAccountingDatabaseConfig();
  validateAccountingQueryConfig();

  const { entryDate, description, referenceNumber, createdBy, lines } = payload;

  const issues = [];
  if (!entryDate) issues.push('entryDate is required');
  if (!description) issues.push('description is required');
  if (!Array.isArray(lines) || lines.length === 0) {
    issues.push('lines array is required and must not be empty');
  }

  // Validate balanced entry (total debits = total credits)
  if (lines && lines.length > 0) {
    const totalDebits = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    const totalCredits = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      issues.push(
        `journal entry must be balanced (debits: ${totalDebits}, credits: ${totalCredits})`
      );
    }
  }

  if (issues.length > 0) {
    const error = new Error(
      `[ACCOUNTING_REPOSITORY] Invalid journal entry payload: ${issues.join(', ')}`
    );
    error.code = 'ACCOUNTING_REPOSITORY_INVALID_JOURNAL_ENTRY';
    throw error;
  }

  const config = buildConnectionConfig();
  const now = new Date();

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();

      // Begin transaction
      await client.query('BEGIN');

      try {
        // Insert journal entry
        const jeResult = await client.query(
          `
          INSERT INTO journal_entries
            ("entryDate", description, "referenceNumber", "createdBy", "createdAt", "updatedAt")
          VALUES
            ($1, $2, $3, $4, $5, $6)
          RETURNING id
          `,
          [entryDate, description, referenceNumber || null, createdBy || null, now, now]
        );

        const journalEntryId = jeResult.rows[0]?.id;
        if (!journalEntryId) {
          throw new Error('[ACCOUNTING_REPOSITORY] Failed to create journal entry');
        }

        // Insert lines
        for (const line of lines) {
          await client.query(
            `
            INSERT INTO journal_entry_lines
              ("journalEntryId", "accountId", debit, credit, description, "createdAt", "updatedAt")
            VALUES
              ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              journalEntryId,
              line.accountId,
              Number(line.debit) || 0,
              Number(line.credit) || 0,
              line.description || null,
              now,
              now,
            ]
          );
        }

        // Commit transaction
        await client.query('COMMIT');

        // Fetch created entry with lines
        const entry = await client.query(
          'SELECT * FROM journal_entries WHERE id = $1',
          [journalEntryId]
        );

        const linesData = await client.query(
          `
          SELECT
            jel.*,
            coa."accountNumber",
            coa."accountName"
          FROM journal_entry_lines jel
          JOIN chart_of_accounts coa ON jel."accountId" = coa.id
          WHERE jel."journalEntryId" = $1
          `,
          [journalEntryId]
        );

        return {
          ...entry.rows[0],
          lines: linesData.rows,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore close errors
      }
    }
  };

  return withTimeout(operation(), 10000, 'createJournalEntry');
}

/**
 * Get accounting overview/summary.
 *
 * @returns {Promise<object>}
 */
export async function getAccountingOverview() {
  const balances = await getAccountBalances();

  const totalAssets = balances.assets.reduce((sum, acc) => sum + acc.balance, 0);
  const totalLiabilities = balances.liabilities.reduce((sum, acc) => sum + acc.balance, 0);
  const totalEquity = balances.equity.reduce((sum, acc) => sum + acc.balance, 0);
  const totalRevenue = balances.revenue.reduce((sum, acc) => sum + acc.balance, 0);
  const totalExpenses = balances.expenses.reduce((sum, acc) => sum + acc.balance, 0);

  return {
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalRevenue,
    totalExpenses,
    netIncome: totalRevenue - totalExpenses,
  };
}

export default {
  getChartOfAccounts,
  getAccountBalances,
  getJournalEntries,
  getJournalEntryLines,
  createJournalEntry,
  getAccountingOverview,
};

