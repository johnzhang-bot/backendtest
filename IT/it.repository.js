/**
 * IT data access layer.
 *
 * Uses the shared PostgreSQL configuration to read IT-specific data such
 * as devices and tickets. All functions are read-only for now and
 * can be extended with create/update operations later.
 */

import pg from 'pg';
const { Client } = pg;
import databaseConfig from '../databaseConfig.js';
import { validateItDatabaseConfig } from './it.schema.js';

function validateItQueryConfig() {
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
      `[IT_REPOSITORY] Invalid DB configuration: ${issues.join('; ')}`
    );
    error.code = 'IT_REPOSITORY_INVALID_DB_CONFIG';
    throw error;
  }
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(
        `[IT_REPOSITORY][TIMEOUT] Operation "${label}" exceeded ${timeoutMs}ms`
      );
      error.code = 'IT_REPOSITORY_TIMEOUT';
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

async function executeQuery(sql, params = [], label = 'it-query') {
  validateItDatabaseConfig();
  validateItQueryConfig();

  const config = buildConnectionConfig();

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();
      const result = await client.query(sql, params);
      return /** @type {Array<any>} */ (result.rows);
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore close errors for short-lived connections.
      }
    }
  };

  return withTimeout(operation(), 8000, label);
}

/**
 * Fetch all IT devices.
 *
 * @returns {Promise<Array<object>>}
 */
export async function getItDevices() {
  const sql = `
    SELECT
      id,
      label,
      owner,
      type,
      status,
      "createdAt",
      "updatedAt"
    FROM it_devices
    ORDER BY id ASC
  `;

  return executeQuery(sql, [], 'getItDevices');
}

/**
 * Fetch all IT tickets.
 *
 * @returns {Promise<Array<object>>}
 */
export async function getItTickets() {
  const sql = `
    SELECT
      id,
      title,
      owner,
      status,
      priority,
      "createdAt",
      "updatedAt"
    FROM it_tickets
    ORDER BY id ASC
  `;

  return executeQuery(sql, [], 'getItTickets');
}

/**
 * Create a new IT ticket.
 *
 * @param {{ title: string; owner: string; status?: string; priority?: string }} payload
 * @returns {Promise<object>}
 */
export async function createItTicket(payload) {
  validateItDatabaseConfig();
  validateItQueryConfig();

  const title = String(payload.title ?? '').trim();
  const owner = String(payload.owner ?? '').trim();
  const status = payload.status ?? 'open';
  const priority = payload.priority ?? 'low';

  const issues = [];
  if (!title) issues.push('title is required');
  if (!owner) issues.push('owner is required');

  if (issues.length > 0) {
    const error = new Error(
      `[IT_REPOSITORY] Invalid ticket payload: ${issues.join(', ')}`
    );
    error.code = 'IT_REPOSITORY_INVALID_TICKET';
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
        INSERT INTO it_tickets
          (title, owner, status, priority, "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6)
        RETURNING id
        `,
        [title, owner, status, priority, now, now],
      );

      const insertId = result.rows[0]?.id;
      if (!insertId) {
        const error = new Error(
          '[IT_REPOSITORY] Failed to create ticket (no id returned)',
        );
        error.code = 'IT_REPOSITORY_INSERT_FAILED';
        throw error;
      }

      const selectResult = await client.query(
        `
        SELECT
          id,
          title,
          owner,
          status,
          priority,
          "createdAt",
          "updatedAt"
        FROM it_tickets
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

  return withTimeout(operation(), 8000, 'createItTicket');
}

/**
 * Fetch a tiny overview for the IT dashboard:
 * - managedDevices: count of all devices
 * - openTickets: count of tickets with status open/in_progress
 *
 * @returns {Promise<{ managedDevices: number; openTickets: number }>}
 */
export async function getItOverview() {
  const [deviceRows, ticketRows] = await Promise.all([
    executeQuery('SELECT COUNT(*) AS count FROM it_devices', [], 'countItDevices'),
    executeQuery(
      `SELECT COUNT(*) AS count FROM it_tickets WHERE status = ANY($1)`,
      [['open', 'in_progress']],
      'countItTickets',
    ),
  ]);

  const managedDevices = Number(deviceRows[0]?.count ?? 0);
  const openTickets = Number(ticketRows[0]?.count ?? 0);

  return {
    managedDevices,
    openTickets,
  };
}

export default {
  getItDevices,
  getItTickets,
  createItTicket,
  getItOverview,
};
