/**
 * HR data access layer.
 *
 * All functions here:
 * - Use the shared database configuration (no hard-coded credentials).
 * - Perform minimal input validation / precondition checks.
 * - Use short-lived connections and explicit timeouts.
 * - Return plain JavaScript objects suitable for the API layer.
 */

import pg from 'pg';
const { Client } = pg;
import databaseConfig from '../databaseConfig.js';

/**
 * Validate that core DB configuration is present for HR queries.
 *
 * @returns {void}
 * @throws {Error} If configuration is missing or invalid.
 */
function validateHrQueryConfig() {
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
      `[HR_REPOSITORY] Invalid DB configuration: ${issues.join('; ')}`
    );
    error.code = 'HR_REPOSITORY_INVALID_DB_CONFIG';
    throw error;
  }
}

/**
 * Wrap a promise with a timeout.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {string} label
 * @returns {Promise<T>}
 */
function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(
        `[HR_REPOSITORY][TIMEOUT] Operation "${label}" exceeded ${timeoutMs}ms`
      );
      error.code = 'HR_REPOSITORY_TIMEOUT';
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
 * Build connection options for PostgreSQL using the shared configuration.
 *
 * @returns {import('pg').ClientConfig}
 */
function buildConnectionConfig() {
  return {
    host: databaseConfig.url,
    port: databaseConfig.port,
    user: databaseConfig.username,
    password: databaseConfig.password || undefined,
    database: databaseConfig.database || 'agilon_db',
  };
}

/**
 * Execute a read-only query against the HR database.
 *
 * @template T
 * @param {string} sql
 * @param {Array<unknown>} [params]
 * @param {string} [label]
 * @returns {Promise<Array<T>>}
 */
async function executeQuery(sql, params = [], label = 'hr-query') {
  validateHrQueryConfig();
  const config = buildConnectionConfig();

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();
      const result = await client.query(sql, params);
      return /** @type {Array<T>} */ (result.rows);
    } finally {
      try {
        await client.end();
      } catch {
        // Safe to ignore close errors for short-lived connections.
      }
    }
  };

  return withTimeout(operation(), 8000, label);
}

/**
 * Fetch all employees.
 *
 * @returns {Promise<Array<object>>}
 */
export async function getEmployees() {
  const sql = `
    SELECT
      id,
      "firstName",
      "lastName",
      email,
      department,
      position,
      status,
      "hiredAt",
      "createdAt",
      "updatedAt"
    FROM employees
    ORDER BY id ASC
  `;

  return executeQuery(sql, [], 'getEmployees');
}

/**
 * Create a new employee record.
 *
 * @param {{
 *   firstName: string;
 *   lastName: string;
 *   email: string;
 *   department: string;
 *   position: string;
 *   status?: string;
 *   hiredAt?: string;
 * }} payload
 * @returns {Promise<object>} Newly created employee row.
 */
export async function createEmployee(payload) {
  validateHrQueryConfig();

  const {
    firstName,
    lastName,
    email,
    department,
    position,
    status = 'active',
    hiredAt,
  } = payload;

  const trimmed = {
    firstName: String(firstName ?? '').trim(),
    lastName: String(lastName ?? '').trim(),
    email: String(email ?? '').trim(),
    department: String(department ?? '').trim(),
    position: String(position ?? '').trim(),
  };

  const issues = [];
  if (!trimmed.firstName) issues.push('firstName is required');
  if (!trimmed.lastName) issues.push('lastName is required');
  if (!trimmed.email) issues.push('email is required');
  if (!trimmed.department) issues.push('department is required');
  if (!trimmed.position) issues.push('position is required');

  if (issues.length > 0) {
    const error = new Error(`[HR_REPOSITORY] Invalid employee payload: ${issues.join(', ')}`);
    error.code = 'HR_REPOSITORY_INVALID_EMPLOYEE';
    throw error;
  }

  const config = buildConnectionConfig();
  const now = new Date();
  const hiredAtValue = hiredAt ? new Date(hiredAt) : now;

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();
      const result = await client.query(
        `
        INSERT INTO employees
          ("firstName", "lastName", email, department, position, status, "hiredAt", "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
        `,
        [
          trimmed.firstName,
          trimmed.lastName,
          trimmed.email,
          trimmed.department,
          trimmed.position,
          status,
          hiredAtValue,
          now,
          now,
        ],
      );

      const insertId = result.rows[0]?.id;
      if (!insertId) {
        const error = new Error('[HR_REPOSITORY] Failed to create employee (no id returned)');
        error.code = 'HR_REPOSITORY_INSERT_FAILED';
        throw error;
      }

      const selectResult = await client.query(
        `
        SELECT
          id,
          "firstName",
          "lastName",
          email,
          department,
          position,
          status,
          "hiredAt",
          "createdAt",
          "updatedAt"
        FROM employees
        WHERE id = $1
        `,
        [insertId],
      );

      return selectResult.rows[0];
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore close errors.
      }
    }
  };

  return withTimeout(operation(), 8000, 'createEmployee');
}

/**
 * Fetch all benefit programs.
 *
 * @returns {Promise<Array<object>>}
 */
export async function getBenefits() {
  const sql = `
    SELECT
      id,
      name,
      type,
      description,
      "isActive",
      "createdAt",
      "updatedAt"
    FROM benefits
    ORDER BY id ASC
  `;

  return executeQuery(sql, [], 'getBenefits');
}

/**
 * Create a new benefit program.
 *
 * @param {{
 *   name: string;
 *   type: string;
 *   description?: string | null;
 *   isActive?: boolean;
 * }} payload
 * @returns {Promise<object>}
 */
export async function createBenefit(payload) {
  validateHrQueryConfig();

  const trimmedName = String(payload.name ?? '').trim();
  const trimmedType = String(payload.type ?? '').trim();

  const issues = [];
  if (!trimmedName) issues.push('name is required');
  if (!trimmedType) issues.push('type is required');

  if (issues.length > 0) {
    const error = new Error(
      `[HR_REPOSITORY] Invalid benefit payload: ${issues.join(', ')}`
    );
    error.code = 'HR_REPOSITORY_INVALID_BENEFIT';
    throw error;
  }

  const config = buildConnectionConfig();
  const now = new Date();
  const description =
    payload.description === undefined || payload.description === null
      ? null
      : String(payload.description);
  const isActive = payload.isActive !== false;

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();
      const result = await client.query(
        `
        INSERT INTO benefits
          (name, type, description, "isActive", "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6)
        RETURNING id
        `,
        [trimmedName, trimmedType, description, isActive, now, now],
      );

      const insertId = result.rows[0]?.id;
      if (!insertId) {
        const error = new Error('[HR_REPOSITORY] Failed to create benefit (no id returned)');
        error.code = 'HR_REPOSITORY_INSERT_FAILED';
        throw error;
      }

      const selectResult = await client.query(
        `
        SELECT
          id,
          name,
          type,
          description,
          "isActive",
          "createdAt",
          "updatedAt"
        FROM benefits
        WHERE id = $1
        `,
        [insertId],
      );

      return selectResult.rows[0];
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore close errors.
      }
    }
  };

  return withTimeout(operation(), 8000, 'createBenefit');
}

/**
 * Fetch all onboarding flows.
 *
 * @returns {Promise<Array<object>>}
 */
export async function getOnboardingFlows() {
  const sql = `
    SELECT
      id,
      "employeeId",
      position,
      status,
      "startedAt",
      "completedAt",
      "createdAt",
      "updatedAt"
    FROM onboarding_flows
    ORDER BY id ASC
  `;

  return executeQuery(sql, [], 'getOnboardingFlows');
}

/**
 * Create a new onboarding flow.
 *
 * @param {{
 *   employeeId: number;
 *   position: string;
 *   status?: string;
 *   startedAt?: string | null;
 * }} payload
 * @returns {Promise<object>}
 */
export async function createOnboardingFlow(payload) {
  validateHrQueryConfig();

  const employeeId = Number(payload.employeeId);
  const position = String(payload.position ?? '').trim();
  const status = payload.status ?? 'not_started';
  const issues = [];

  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    issues.push('employeeId must be a positive number');
  }
  if (!position) {
    issues.push('position is required');
  }

  if (issues.length > 0) {
    const error = new Error(
      `[HR_REPOSITORY] Invalid onboarding payload: ${issues.join(', ')}`
    );
    error.code = 'HR_REPOSITORY_INVALID_ONBOARDING';
    throw error;
  }

  const config = buildConnectionConfig();
  const now = new Date();
  const startedAt =
    payload.startedAt === undefined || payload.startedAt === null
      ? null
      : new Date(payload.startedAt);

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();
      const result = await client.query(
        `
        INSERT INTO onboarding_flows
          ("employeeId", position, status, "startedAt", "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6)
        RETURNING id
        `,
        [employeeId, position, status, startedAt, now, now],
      );

      const insertId = result.rows[0]?.id;
      if (!insertId) {
        const error = new Error(
          '[HR_REPOSITORY] Failed to create onboarding flow (no id returned)',
        );
        error.code = 'HR_REPOSITORY_INSERT_FAILED';
        throw error;
      }

      const selectResult = await client.query(
        `
        SELECT
          id,
          "employeeId",
          position,
          status,
          "startedAt",
          "completedAt",
          "createdAt",
          "updatedAt"
        FROM onboarding_flows
        WHERE id = $1
        `,
        [insertId],
      );

      return selectResult.rows[0];
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore close errors.
      }
    }
  };

  return withTimeout(operation(), 8000, 'createOnboardingFlow');
}

/**
 * Fetch all job postings.
 *
 * @returns {Promise<Array<object>>}
 */
export async function getJobPostings() {
  const sql = `
    SELECT
      id,
      title,
      department,
      status,
      location,
      "createdAt",
      "updatedAt"
    FROM job_postings
    ORDER BY id ASC
  `;

  return executeQuery(sql, [], 'getJobPostings');
}

/**
 * Create a new job posting.
 *
 * @param {{
 *   title: string;
 *   department: string;
 *   status?: string;
 *   location?: string | null;
 * }} payload
 * @returns {Promise<object>}
 */
export async function createJobPosting(payload) {
  validateHrQueryConfig();

  const title = String(payload.title ?? '').trim();
  const department = String(payload.department ?? '').trim();
  const status = payload.status ?? 'draft';
  const location =
    payload.location === undefined || payload.location === null
      ? null
      : String(payload.location);

  const issues = [];
  if (!title) issues.push('title is required');
  if (!department) issues.push('department is required');

  if (issues.length > 0) {
    const error = new Error(
      `[HR_REPOSITORY] Invalid job posting payload: ${issues.join(', ')}`
    );
    error.code = 'HR_REPOSITORY_INVALID_JOB_POSTING';
    throw error;
  }

  const config = buildConnectionConfig();
  const now = new Date();

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();
      const result = await client.query(
        `
        INSERT INTO job_postings
          (title, department, status, location, "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6)
        RETURNING id
        `,
        [title, department, status, location, now, now],
      );

      const insertId = result.rows[0]?.id;
      if (!insertId) {
        const error = new Error(
          '[HR_REPOSITORY] Failed to create job posting (no id returned)',
        );
        error.code = 'HR_REPOSITORY_INSERT_FAILED';
        throw error;
      }

      const selectResult = await client.query(
        `
        SELECT
          id,
          title,
          department,
          status,
          location,
          "createdAt",
          "updatedAt"
        FROM job_postings
        WHERE id = $1
        `,
        [insertId],
      );

      return selectResult.rows[0];
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore close errors.
      }
    }
  };

  return withTimeout(operation(), 8000, 'createJobPosting');
}

/**
 * Fetch all absences.
 *
 * @returns {Promise<Array<object>>}
 */
export async function getAbsences() {
  const sql = `
    SELECT
      id,
      "employeeId",
      type,
      status,
      "startDate",
      "endDate",
      "createdAt",
      "updatedAt"
    FROM absences
    ORDER BY id ASC
  `;

  return executeQuery(sql, [], 'getAbsences');
}

/**
 * Create a new absence record.
 *
 * @param {{
 *   employeeId: number;
 *   type: string;
 *   status?: string;
 *   startDate: string;
 *   endDate: string;
 * }} payload
 * @returns {Promise<object>}
 */
export async function createAbsence(payload) {
  validateHrQueryConfig();

  const employeeId = Number(payload.employeeId);
  const type = String(payload.type ?? '').trim();
  const status = payload.status ?? 'requested';
  const startDate = payload.startDate;
  const endDate = payload.endDate;

  const issues = [];
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    issues.push('employeeId must be a positive number');
  }
  if (!type) {
    issues.push('type is required');
  }
  if (!startDate) {
    issues.push('startDate is required');
  }
  if (!endDate) {
    issues.push('endDate is required');
  }

  if (issues.length > 0) {
    const error = new Error(
      `[HR_REPOSITORY] Invalid absence payload: ${issues.join(', ')}`
    );
    error.code = 'HR_REPOSITORY_INVALID_ABSENCE';
    throw error;
  }

  const config = buildConnectionConfig();
  const now = new Date();

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();
      const result = await client.query(
        `
        INSERT INTO absences
          ("employeeId", type, status, "startDate", "endDate", "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        `,
        [employeeId, type, status, startDate, endDate, now, now],
      );

      const insertId = result.rows[0]?.id;
      if (!insertId) {
        const error = new Error(
          '[HR_REPOSITORY] Failed to create absence (no id returned)',
        );
        error.code = 'HR_REPOSITORY_INSERT_FAILED';
        throw error;
      }

      const selectResult = await client.query(
        `
        SELECT
          id,
          "employeeId",
          type,
          status,
          "startDate",
          "endDate",
          "createdAt",
          "updatedAt"
        FROM absences
        WHERE id = $1
        `,
        [insertId],
      );

      return selectResult.rows[0];
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore close errors.
      }
    }
  };

  return withTimeout(operation(), 8000, 'createAbsence');
}

// ========== PAYROLL ==========

export async function getPayrollRecords() {
  const sql = `
    SELECT
      id, "employeeId", "payPeriodStart", "payPeriodEnd", "basePay", bonuses, deductions, "netPay", status, "createdAt", "updatedAt"
    FROM payroll_records
    ORDER BY "payPeriodEnd" DESC
  `;
  return executeQuery(sql, [], 'getPayrollRecords');
}

export async function createPayrollRecord(payload) {
  validateHrQueryConfig();

  const { employeeId, payPeriodStart, payPeriodEnd, basePay, bonuses, deductions } = payload;

  const issues = [];
  if (!Number.isFinite(Number(employeeId)) || Number(employeeId) <= 0) issues.push('employeeId is required');
  if (!payPeriodStart) issues.push('payPeriodStart is required');
  if (!payPeriodEnd) issues.push('payPeriodEnd is required');
  if (!basePay) issues.push('basePay is required');

  if (issues.length > 0) {
    const error = new Error(`[HR_REPOSITORY] Invalid payroll record: ${issues.join(', ')}`);
    error.code = 'HR_REPOSITORY_INVALID_PAYROLL';
    throw error;
  }

  const config = buildConnectionConfig();
  const now = new Date();
  const basePayNum = Number(basePay) || 0;
  const bonusesNum = Number(bonuses) || 0;
  const deductionsNum = Number(deductions) || 0;
  const netPay = basePayNum + bonusesNum - deductionsNum;

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();
      const result = await client.query(
        `
        INSERT INTO payroll_records
          ("employeeId", "payPeriodStart", "payPeriodEnd", "basePay", bonuses, deductions, "netPay", status, "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        `,
        [employeeId, payPeriodStart, payPeriodEnd, basePayNum, bonusesNum, deductionsNum, netPay, payload.status || 'draft', now, now]
      );

      return result.rows[0];
    } finally {
      try {
        await client.end();
      } catch { }
    }
  };

  return withTimeout(operation(), 8000, 'createPayrollRecord');
}

// ========== TIME TRACKING ==========

export async function getTimeTracking() {
  const sql = `
    SELECT
      id, "employeeId", "clockIn", "clockOut", "hoursWorked", "overtimeHours", "shiftType", status, "createdAt", "updatedAt"
    FROM time_tracking
    ORDER BY "clockIn" DESC
  `;
  return executeQuery(sql, [], 'getTimeTracking');
}

export async function createTimeEntry(payload) {
  validateHrQueryConfig();

  const { employeeId, clockIn, clockOut, hoursWorked, overtimeHours, shiftType } = payload;

  const issues = [];
  if (!Number.isFinite(Number(employeeId)) || Number(employeeId) <= 0) issues.push('employeeId is required');
  if (!clockIn) issues.push('clockIn is required');

  if (issues.length > 0) {
    const error = new Error(`[HR_REPOSITORY] Invalid time entry: ${issues.join(', ')}`);
    error.code = 'HR_REPOSITORY_INVALID_TIME_ENTRY';
    throw error;
  }

  const config = buildConnectionConfig();
  const now = new Date();

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();
      const result = await client.query(
        `
        INSERT INTO time_tracking
          ("employeeId", "clockIn", "clockOut", "hoursWorked", "overtimeHours", "shiftType", status, "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        `,
        [employeeId, clockIn, clockOut || null, hoursWorked || null, Number(overtimeHours) || 0, shiftType || null, payload.status || 'active', now, now]
      );

      return result.rows[0];
    } finally {
      try {
        await client.end();
      } catch { }
    }
  };

  return withTimeout(operation(), 8000, 'createTimeEntry');
}

// ========== ENGAGEMENT ==========

export async function getEngagementSurveys() {
  const sql = `
    SELECT
      id, "employeeId", "surveyType", score, feedback, "surveyDate", "createdAt", "updatedAt"
    FROM engagement_surveys
    ORDER BY "surveyDate" DESC
  `;
  return executeQuery(sql, [], 'getEngagementSurveys');
}

export async function createEngagementSurvey(payload) {
  validateHrQueryConfig();

  const { employeeId, surveyType, score, feedback, surveyDate } = payload;

  const issues = [];
  if (!Number.isFinite(Number(employeeId)) || Number(employeeId) <= 0) issues.push('employeeId is required');
  if (!surveyType) issues.push('surveyType is required');
  if (!surveyDate) issues.push('surveyDate is required');

  if (issues.length > 0) {
    const error = new Error(`[HR_REPOSITORY] Invalid engagement survey: ${issues.join(', ')}`);
    error.code = 'HR_REPOSITORY_INVALID_ENGAGEMENT';
    throw error;
  }

  const config = buildConnectionConfig();
  const now = new Date();

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();
      const result = await client.query(
        `
        INSERT INTO engagement_surveys
          ("employeeId", "surveyType", score, feedback, "surveyDate", "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [employeeId, surveyType, score ? Number(score) : null, feedback || null, surveyDate, now, now]
      );

      return result.rows[0];
    } finally {
      try {
        await client.end();
      } catch { }
    }
  };

  return withTimeout(operation(), 8000, 'createEngagementSurvey');
}

export default {
  getEmployees,
  createEmployee,
  getBenefits,
  createBenefit,
  getOnboardingFlows,
  createOnboardingFlow,
  getJobPostings,
  createJobPosting,
  getAbsences,
  createAbsence,
  getPayrollRecords,
  createPayrollRecord,
  getTimeTracking,
  createTimeEntry,
  getEngagementSurveys,
  createEngagementSurvey,
};
