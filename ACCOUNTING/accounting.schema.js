/**
 * ACCOUNTING module database schema definitions.
 *
 * This module describes the structure for accounting-related entities such as
 * chart of accounts, journal entries, and transactions.
 */

import databaseConfig from '../databaseConfig.js';

/**
 * Validate that the minimal database configuration required for the ACCOUNTING
 * module is present.
 *
 * @returns {void}
 * @throws {Error} If required database configuration is missing or invalid.
 */
export function validateAccountingDatabaseConfig() {
  const issues = [];

  if (!databaseConfig.url) {
    issues.push('DB_HOST (databaseConfig.url) is not defined');
  }

  if (!databaseConfig.database) {
    issues.push('DB_NAME (databaseConfig.database) is not defined');
  }

  if (Number.isNaN(databaseConfig.port) || databaseConfig.port <= 0) {
    issues.push('DB_PORT (databaseConfig.port) must be a positive number');
  }

  if (issues.length > 0) {
    const error = new Error(
      `[ACCOUNTING_SCHEMA] Invalid database configuration: ${issues.join('; ')}`
    );
    error.code = 'ACCOUNTING_SCHEMA_INVALID_DB_CONFIG';
    throw error;
  }
}

/**
 * ACCOUNTING entity: Chart of Accounts
 * Defines all accounts in the general ledger.
 */
export const chartOfAccountsSchema = Object.freeze({
  entity: 'chart_of_accounts',
  tableName: 'chart_of_accounts',
  primaryKey: 'id',
  columns: {
    id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
    accountNumber: { type: 'string', length: 10, nullable: false, unique: true },
    accountName: { type: 'string', length: 256, nullable: false },
    category: {
      type: 'enum',
      values: ['assets', 'liabilities', 'equity', 'revenue', 'expenses'],
      nullable: false,
    },
    subcategory: { type: 'string', length: 128, nullable: true },
    description: { type: 'text', nullable: true },
    isActive: { type: 'boolean', default: true, nullable: false },
    createdAt: { type: 'datetime', nullable: false },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_coa_account_number', columns: ['accountNumber'], unique: true },
    { name: 'idx_coa_category', columns: ['category'], unique: false },
  ],
});

/**
 * ACCOUNTING entity: Journal Entries
 * Records all financial transactions.
 */
export const journalEntrySchema = Object.freeze({
  entity: 'journal_entry',
  tableName: 'journal_entries',
  primaryKey: 'id',
  columns: {
    id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
    entryDate: { type: 'date', nullable: false },
    description: { type: 'text', nullable: false },
    referenceNumber: { type: 'string', length: 64, nullable: true },
    createdBy: { type: 'string', length: 128, nullable: true },
    createdAt: { type: 'datetime', nullable: false },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_je_entry_date', columns: ['entryDate'], unique: false },
    { name: 'idx_je_reference_number', columns: ['referenceNumber'], unique: false },
  ],
});

/**
 * ACCOUNTING entity: Journal Entry Lines
 * Individual debit/credit lines for each journal entry.
 */
export const journalEntryLineSchema = Object.freeze({
  entity: 'journal_entry_line',
  tableName: 'journal_entry_lines',
  primaryKey: 'id',
  columns: {
    id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
    journalEntryId: { type: 'int', unsigned: true, nullable: false },
    accountId: { type: 'int', unsigned: true, nullable: false },
    debit: { type: 'decimal', precision: 15, scale: 2, nullable: false, default: 0 },
    credit: { type: 'decimal', precision: 15, scale: 2, nullable: false, default: 0 },
    description: { type: 'text', nullable: true },
    createdAt: { type: 'datetime', nullable: false },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_jel_journal_entry', columns: ['journalEntryId'], unique: false },
    { name: 'idx_jel_account', columns: ['accountId'], unique: false },
  ],
  foreignKeys: [
    {
      name: 'fk_jel_journal_entry',
      column: 'journalEntryId',
      references: {
        table: 'journal_entries',
        column: 'id',
      },
      onDelete: 'CASCADE',
    },
    {
      name: 'fk_jel_account',
      column: 'accountId',
      references: {
        table: 'chart_of_accounts',
        column: 'id',
      },
      onDelete: 'RESTRICT',
    },
  ],
});

/**
 * Helper to get all ACCOUNTING schemas after validating configuration.
 *
 * @returns {Array<object>}
 */
export function getAccountingSchemas() {
  validateAccountingDatabaseConfig();
  return [chartOfAccountsSchema, journalEntrySchema, journalEntryLineSchema];
}

export default {
  validateAccountingDatabaseConfig,
  chartOfAccountsSchema,
  journalEntrySchema,
  journalEntryLineSchema,
  getAccountingSchemas,
};

