/**
 * HR module database initialisation.
 *
 * Connects to the configured PostgreSQL database server and ensures
 * that the database and core HR tables exist before the HR
 * API is exposed.
 *
 * This module performs only schema-level operations and does not keep any
 * long‑lived connections open.
 */

import pg from 'pg';
const { Client } = pg;
import databaseConfig from '../databaseConfig.js';
import { validateHrDatabaseConfig } from './hr.schema.js';

/**
 * Wrap a promise with a timeout so long‑running operations can be cancelled.
 *
 * @param {Promise<any>} promise - Operation to execute.
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @param {string} label - Human‑readable label for logging.
 * @returns {Promise<any>}
 */
function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(
        `[HR_DB][TIMEOUT] Operation "${label}" exceeded ${timeoutMs}ms`
      );
      error.code = 'HR_DB_TIMEOUT';
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

/**
 * Generic retry helper with exponential backoff.
 *
 * @param {() => Promise<void>} operation - Async operation to execute.
 * @param {{ attempts: number, baseDelayMs: number }} options - Retry options.
 * @returns {Promise<void>}
 */
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
      console.warn('[HR_DB][WARN] Operation failed, will retry', {
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
 * Build a minimal, non‑sensitive connection configuration from
 * the shared databaseConfig. Connects to 'postgres' database for admin operations.
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

/**
 * Create the database if it does not already exist.
 *
 * @param {import('pg').Client} client
 * @param {string} dbName
 * @returns {Promise<void>}
 */
async function ensureHrDatabaseExists(client, dbName) {
  console.info('[HR_DB][INFO] Ensuring HR database exists', {
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
    console.info('[HR_DB][INFO] Created database', { database: dbName });
  } else {
    console.info('[HR_DB][INFO] Database already exists', { database: dbName });
  }
}

/**
 * Create the core HR tables required by the module.
 *
 * NOTE: These statements intentionally use IF NOT EXISTS so the
 * operation is idempotent and safe to run on every startup.
 *
 * @param {import('pg').Client} client
 * @returns {Promise<void>}
 */
async function ensureHrTablesExist(client) {
  console.info('[HR_DB][INFO] Ensuring HR tables exist');

  const statements = [
    // Employees
    `
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      "firstName" VARCHAR(128) NOT NULL,
      "lastName" VARCHAR(128) NOT NULL,
      email VARCHAR(256) NOT NULL,
      department VARCHAR(128) NOT NULL,
      position VARCHAR(128) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated', 'on_leave')),
      "hiredAt" TIMESTAMP NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT idx_employees_email UNIQUE (email)
    );
    `,
    // Create indexes
    `CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);`,
    // Benefits
    `
    CREATE TABLE IF NOT EXISTS benefits (
      id SERIAL PRIMARY KEY,
      name VARCHAR(256) NOT NULL,
      type VARCHAR(32) NOT NULL CHECK (type IN ('medical', 'dental', 'vision', 'retirement', 'other')),
      description TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `,
    // Create indexes
    `CREATE INDEX IF NOT EXISTS idx_benefits_name ON benefits(name);`,
    `CREATE INDEX IF NOT EXISTS idx_benefits_type ON benefits(type);`,
    // Onboarding flows
    `
    CREATE TABLE IF NOT EXISTS onboarding_flows (
      id SERIAL PRIMARY KEY,
      "employeeId" INTEGER NOT NULL,
      position VARCHAR(128) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked')),
      "startedAt" TIMESTAMP,
      "completedAt" TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_onboarding_employee
        FOREIGN KEY ("employeeId") REFERENCES employees(id)
        ON DELETE CASCADE
    );
    `,
    // Create indexes
    `CREATE INDEX IF NOT EXISTS idx_onboarding_employee ON onboarding_flows("employeeId");`,
    // Job postings / recruitment
    `
    CREATE TABLE IF NOT EXISTS job_postings (
      id SERIAL PRIMARY KEY,
      title VARCHAR(256) NOT NULL,
      department VARCHAR(128) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'on_hold')),
      location VARCHAR(256),
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `,
    // Create indexes
    `CREATE INDEX IF NOT EXISTS idx_job_postings_status ON job_postings(status);`,
    `CREATE INDEX IF NOT EXISTS idx_job_postings_department ON job_postings(department);`,
    // Absences
    `
    CREATE TABLE IF NOT EXISTS absences (
      id SERIAL PRIMARY KEY,
      "employeeId" INTEGER NOT NULL,
      type VARCHAR(32) NOT NULL CHECK (type IN ('vacation', 'sick', 'unpaid', 'other')),
      status VARCHAR(32) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'cancelled')),
      "startDate" DATE NOT NULL,
      "endDate" DATE NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_absences_employee
        FOREIGN KEY ("employeeId") REFERENCES employees(id)
        ON DELETE CASCADE
    );
    `,
    // Create indexes
    `CREATE INDEX IF NOT EXISTS idx_absences_employee ON absences("employeeId");`,
    `CREATE INDEX IF NOT EXISTS idx_absences_status ON absences(status);`,
    // Payroll Records
    `
    CREATE TABLE IF NOT EXISTS payroll_records (
      id SERIAL PRIMARY KEY,
      "employeeId" INTEGER NOT NULL,
      "payPeriodStart" DATE NOT NULL,
      "payPeriodEnd" DATE NOT NULL,
      "basePay" DECIMAL(15, 2) NOT NULL,
      bonuses DECIMAL(15, 2) NOT NULL DEFAULT 0,
      deductions DECIMAL(15, 2) NOT NULL DEFAULT 0,
      "netPay" DECIMAL(15, 2) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processed', 'paid')),
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_payroll_employee
        FOREIGN KEY ("employeeId") REFERENCES employees(id)
        ON DELETE CASCADE
    );
    `,
    `CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll_records("employeeId");`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll_records("payPeriodStart", "payPeriodEnd");`,
    // Time Tracking
    `
    CREATE TABLE IF NOT EXISTS time_tracking (
      id SERIAL PRIMARY KEY,
      "employeeId" INTEGER NOT NULL,
      "clockIn" TIMESTAMP NOT NULL,
      "clockOut" TIMESTAMP,
      "hoursWorked" DECIMAL(5, 2),
      "overtimeHours" DECIMAL(5, 2) NOT NULL DEFAULT 0,
      "shiftType" VARCHAR(64),
      status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'approved')),
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_timetrack_employee
        FOREIGN KEY ("employeeId") REFERENCES employees(id)
        ON DELETE CASCADE
    );
    `,
    `CREATE INDEX IF NOT EXISTS idx_timetrack_employee ON time_tracking("employeeId");`,
    `CREATE INDEX IF NOT EXISTS idx_timetrack_date ON time_tracking("clockIn");`,
    // Engagement Surveys
    `
    CREATE TABLE IF NOT EXISTS engagement_surveys (
      id SERIAL PRIMARY KEY,
      "employeeId" INTEGER NOT NULL,
      "surveyType" VARCHAR(32) NOT NULL CHECK ("surveyType" IN ('pulse', 'annual', 'feedback', 'recognition')),
      score INTEGER,
      feedback TEXT,
      "surveyDate" DATE NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_engagement_employee
        FOREIGN KEY ("employeeId") REFERENCES employees(id)
        ON DELETE CASCADE
    );
    `,
    `CREATE INDEX IF NOT EXISTS idx_engagement_employee ON engagement_surveys("employeeId");`,
    `CREATE INDEX IF NOT EXISTS idx_engagement_survey_type ON engagement_surveys("surveyType");`,
  ];

  // Run statements sequentially to make error reporting predictable.
  // eslint-disable-next-line no-restricted-syntax
  for (const sql of statements) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(sql);
  }
}

/**
 * Initialise the HR database schema if the HR module is enabled.
 *
 * This should be called once during backend startup, before the HR routes
 * are mounted.
 *
 * @param {{ timeoutMs?: number, maxRetries?: number }} [options]
 * @returns {Promise<void>}
 */
export async function initializeHrDatabase(options = {}) {
  const { timeoutMs = 15000, maxRetries = 3 } = options;

  // Preconditions: base database configuration must be valid.
  validateHrDatabaseConfig();

  const dbName = databaseConfig.database || 'agilon_db';
  if (!databaseConfig.database) {
    console.warn('[HR_DB][WARN] No database name configured, using default: agilon_db');
  }

  console.info('[HR_DB][INFO] Starting HR database initialisation', {
    database: dbName,
  });

  const operation = async () => {
    // First, connect to postgres database to create the target database if needed
    const adminClient = new Client(buildAdminConnectionConfig());
    let client;

    try {
      await adminClient.connect();
      await ensureHrDatabaseExists(adminClient, dbName);
      await adminClient.end();

      // Now connect to the target database to create tables
      client = new Client(buildConnectionConfig(dbName));
      await client.connect();
      await ensureHrTablesExist(client);

      console.info('[HR_DB][INFO] HR database initialised successfully', {
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
      'initializeHrDatabase'
    );
  } catch (error) {
    console.error('[HR_DB][ERROR] Failed to initialise HR database', {
      code: error.code,
      message: error.message,
    });
    throw error;
  }
}

export default {
  initializeHrDatabase,
};
