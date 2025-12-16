/**
 * LEGAL data access layer.
 *
 * Manages contracts, compliance items, IP, and legal matters.
 */

import pg from 'pg';
const { Client } = pg;
import databaseConfig from '../databaseConfig.js';
import { validateLegalDatabaseConfig } from './legal.schema.js';

function validateLegalQueryConfig() {
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
            `[LEGAL_REPOSITORY] Invalid DB configuration: ${issues.join('; ')}`
        );
        error.code = 'LEGAL_REPOSITORY_INVALID_DB_CONFIG';
        throw error;
    }
}

function withTimeout(promise, timeoutMs, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const error = new Error(
                `[LEGAL_REPOSITORY][TIMEOUT] Operation "${label}" exceeded ${timeoutMs}ms`
            );
            error.code = 'LEGAL_REPOSITORY_TIMEOUT';
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

async function executeQuery(sql, params = [], label = 'legal-query') {
    validateLegalDatabaseConfig();
    validateLegalQueryConfig();

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

// ========== CONTRACTS ==========

export async function getContracts() {
    const sql = `
    SELECT
      id, "contractNumber", title, type, counterparty, status,
      "effectiveDate", "expirationDate", value, description,
      "createdAt", "updatedAt"
    FROM contracts
    ORDER BY "createdAt" DESC
  `;
    return executeQuery(sql, [], 'getContracts');
}

export async function createContract(payload) {
    validateLegalQueryConfig();

    const { contractNumber, title, type, counterparty, status, effectiveDate, expirationDate, value, description } = payload;

    const issues = [];
    if (!contractNumber) issues.push('contractNumber is required');
    if (!title) issues.push('title is required');
    if (!type) issues.push('type is required');
    if (!counterparty) issues.push('counterparty is required');

    if (issues.length > 0) {
        const error = new Error(`[LEGAL_REPOSITORY] Invalid contract: ${issues.join(', ')}`);
        error.code = 'LEGAL_REPOSITORY_INVALID_CONTRACT';
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
        INSERT INTO contracts
          ("contractNumber", title, type, counterparty, status, "effectiveDate", "expirationDate", value, description, "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        `,
                [contractNumber, title, type, counterparty, status || 'draft', effectiveDate || null, expirationDate || null, value || null, description || null, now, now]
            );

            return result.rows[0];
        } finally {
            try {
                await client.end();
            } catch {
                // Ignore close errors
            }
        }
    };

    return withTimeout(operation(), 8000, 'createContract');
}

// ========== COMPLIANCE ==========

export async function getComplianceItems() {
    const sql = `
    SELECT
      id, title, category, status, "dueDate", "completedDate", "assignedTo", description,
      "createdAt", "updatedAt"
    FROM compliance_items
    ORDER BY "dueDate" ASC NULLS LAST, "createdAt" DESC
  `;
    return executeQuery(sql, [], 'getComplianceItems');
}

export async function createComplianceItem(payload) {
    validateLegalQueryConfig();

    const { title, category, status, dueDate, completedDate, assignedTo, description } = payload;

    const issues = [];
    if (!title) issues.push('title is required');
    if (!category) issues.push('category is required');

    if (issues.length > 0) {
        const error = new Error(`[LEGAL_REPOSITORY] Invalid compliance item: ${issues.join(', ')}`);
        error.code = 'LEGAL_REPOSITORY_INVALID_COMPLIANCE';
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
        INSERT INTO compliance_items
          (title, category, status, "dueDate", "completedDate", "assignedTo", description, "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        `,
                [title, category, status || 'pending', dueDate || null, completedDate || null, assignedTo || null, description || null, now, now]
            );

            return result.rows[0];
        } finally {
            try {
                await client.end();
            } catch {
                // Ignore close errors
            }
        }
    };

    return withTimeout(operation(), 8000, 'createComplianceItem');
}

// ========== INTELLECTUAL PROPERTY ==========

export async function getIntellectualProperty() {
    const sql = `
    SELECT
      id, "ipType", title, "registrationNumber", status, "filingDate", "registrationDate",
      "expirationDate", jurisdiction, description, "createdAt", "updatedAt"
    FROM intellectual_property
    ORDER BY "createdAt" DESC
  `;
    return executeQuery(sql, [], 'getIntellectualProperty');
}

export async function createIntellectualProperty(payload) {
    validateLegalQueryConfig();

    const { ipType, title, registrationNumber, status, filingDate, registrationDate, expirationDate, jurisdiction, description } = payload;

    const issues = [];
    if (!ipType) issues.push('ipType is required');
    if (!title) issues.push('title is required');

    if (issues.length > 0) {
        const error = new Error(`[LEGAL_REPOSITORY] Invalid IP: ${issues.join(', ')}`);
        error.code = 'LEGAL_REPOSITORY_INVALID_IP';
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
        INSERT INTO intellectual_property
          ("ipType", title, "registrationNumber", status, "filingDate", "registrationDate", "expirationDate", jurisdiction, description, "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        `,
                [ipType, title, registrationNumber || null, status || 'pending', filingDate || null, registrationDate || null, expirationDate || null, jurisdiction || null, description || null, now, now]
            );

            return result.rows[0];
        } finally {
            try {
                await client.end();
            } catch {
                // Ignore close errors
            }
        }
    };

    return withTimeout(operation(), 8000, 'createIntellectualProperty');
}

// ========== LEGAL MATTERS ==========

export async function getLegalMatters() {
    const sql = `
    SELECT
      id, "matterNumber", title, "matterType", status, priority, "assignedCounsel",
      "openedDate", "closedDate", description, "createdAt", "updatedAt"
    FROM legal_matters
    ORDER BY priority DESC, "openedDate" DESC
  `;
    return executeQuery(sql, [], 'getLegalMatters');
}

export async function createLegalMatter(payload) {
    validateLegalQueryConfig();

    const { matterNumber, title, matterType, status, priority, assignedCounsel, openedDate, closedDate, description } = payload;

    const issues = [];
    if (!matterNumber) issues.push('matterNumber is required');
    if (!title) issues.push('title is required');
    if (!matterType) issues.push('matterType is required');
    if (!openedDate) issues.push('openedDate is required');

    if (issues.length > 0) {
        const error = new Error(`[LEGAL_REPOSITORY] Invalid legal matter: ${issues.join(', ')}`);
        error.code = 'LEGAL_REPOSITORY_INVALID_MATTER';
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
        INSERT INTO legal_matters
          ("matterNumber", title, "matterType", status, priority, "assignedCounsel", "openedDate", "closedDate", description, "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        `,
                [matterNumber, title, matterType, status || 'open', priority || 'medium', assignedCounsel || null, openedDate, closedDate || null, description || null, now, now]
            );

            return result.rows[0];
        } finally {
            try {
                await client.end();
            } catch {
                // Ignore close errors
            }
        }
    };

    return withTimeout(operation(), 8000, 'createLegalMatter');
}

// ========== OVERVIEW ==========

export async function getLegalOverview() {
    const [contractsCount, complianceCount, ipCount, mattersCount] = await Promise.all([
        executeQuery('SELECT COUNT(*) AS count FROM contracts WHERE status = $1', ['active'], 'countActiveContracts'),
        executeQuery('SELECT COUNT(*) AS count FROM compliance_items WHERE status IN ($1, $2)', ['pending', 'in_progress'], 'countPendingCompliance'),
        executeQuery('SELECT COUNT(*) AS count FROM intellectual_property WHERE status = $1', ['registered'], 'countRegisteredIP'),
        executeQuery('SELECT COUNT(*) AS count FROM legal_matters WHERE status IN ($1, $2)', ['open', 'in_progress'], 'countOpenMatters'),
    ]);

    return {
        activeContracts: Number(contractsCount[0]?.count ?? 0),
        pendingCompliance: Number(complianceCount[0]?.count ?? 0),
        registeredIP: Number(ipCount[0]?.count ?? 0),
        openMatters: Number(mattersCount[0]?.count ?? 0),
    };
}

export default {
    getContracts,
    createContract,
    getComplianceItems,
    createComplianceItem,
    getIntellectualProperty,
    createIntellectualProperty,
    getLegalMatters,
    createLegalMatter,
    getLegalOverview,
};

