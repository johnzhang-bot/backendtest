/**
 * LEGAL module database schema definitions.
 *
 * Covers corporate entity management, contracts, compliance, IP, and legal documentation.
 */

import databaseConfig from '../databaseConfig.js';

export function validateLegalDatabaseConfig() {
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
            `[LEGAL_SCHEMA] Invalid database configuration: ${issues.join('; ')}`
        );
        error.code = 'LEGAL_SCHEMA_INVALID_DB_CONFIG';
        throw error;
    }
}

/**
 * LEGAL entity: Contracts and Agreements
 */
export const contractSchema = Object.freeze({
    entity: 'contract',
    tableName: 'contracts',
    primaryKey: 'id',
    columns: {
        id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
        contractNumber: { type: 'string', length: 64, nullable: false, unique: true },
        title: { type: 'string', length: 256, nullable: false },
        type: { type: 'string', length: 64, nullable: false },
        counterparty: { type: 'string', length: 256, nullable: false },
        status: { type: 'string', length: 32, nullable: false },
        effectiveDate: { type: 'date', nullable: true },
        expirationDate: { type: 'date', nullable: true },
        value: { type: 'decimal', precision: 15, scale: 2, nullable: true },
        description: { type: 'text', nullable: true },
        createdAt: { type: 'datetime', nullable: false },
        updatedAt: { type: 'datetime', nullable: false },
    },
    indexes: [
        { name: 'idx_contracts_number', columns: ['contractNumber'], unique: true },
        { name: 'idx_contracts_type', columns: ['type'], unique: false },
        { name: 'idx_contracts_status', columns: ['status'], unique: false },
    ],
});

/**
 * LEGAL entity: Compliance Items
 */
export const complianceSchema = Object.freeze({
    entity: 'compliance',
    tableName: 'compliance_items',
    primaryKey: 'id',
    columns: {
        id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
        title: { type: 'string', length: 256, nullable: false },
        category: { type: 'string', length: 64, nullable: false },
        status: { type: 'string', length: 32, nullable: false },
        dueDate: { type: 'date', nullable: true },
        completedDate: { type: 'date', nullable: true },
        assignedTo: { type: 'string', length: 128, nullable: true },
        description: { type: 'text', nullable: true },
        createdAt: { type: 'datetime', nullable: false },
        updatedAt: { type: 'datetime', nullable: false },
    },
    indexes: [
        { name: 'idx_compliance_category', columns: ['category'], unique: false },
        { name: 'idx_compliance_status', columns: ['status'], unique: false },
        { name: 'idx_compliance_due_date', columns: ['dueDate'], unique: false },
    ],
});

/**
 * LEGAL entity: Intellectual Property
 */
export const intellectualPropertySchema = Object.freeze({
    entity: 'intellectual_property',
    tableName: 'intellectual_property',
    primaryKey: 'id',
    columns: {
        id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
        ipType: { type: 'string', length: 32, nullable: false },
        title: { type: 'string', length: 256, nullable: false },
        registrationNumber: { type: 'string', length: 128, nullable: true },
        status: { type: 'string', length: 32, nullable: false },
        filingDate: { type: 'date', nullable: true },
        registrationDate: { type: 'date', nullable: true },
        expirationDate: { type: 'date', nullable: true },
        jurisdiction: { type: 'string', length: 128, nullable: true },
        description: { type: 'text', nullable: true },
        createdAt: { type: 'datetime', nullable: false },
        updatedAt: { type: 'datetime', nullable: false },
    },
    indexes: [
        { name: 'idx_ip_type', columns: ['ipType'], unique: false },
        { name: 'idx_ip_status', columns: ['status'], unique: false },
        { name: 'idx_ip_registration_number', columns: ['registrationNumber'], unique: false },
    ],
});

/**
 * LEGAL entity: Legal Matters/Cases
 */
export const legalMatterSchema = Object.freeze({
    entity: 'legal_matter',
    tableName: 'legal_matters',
    primaryKey: 'id',
    columns: {
        id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
        matterNumber: { type: 'string', length: 64, nullable: false, unique: true },
        title: { type: 'string', length: 256, nullable: false },
        matterType: { type: 'string', length: 64, nullable: false },
        status: { type: 'string', length: 32, nullable: false },
        priority: { type: 'string', length: 32, nullable: false },
        assignedCounsel: { type: 'string', length: 256, nullable: true },
        openedDate: { type: 'date', nullable: false },
        closedDate: { type: 'date', nullable: true },
        description: { type: 'text', nullable: true },
        createdAt: { type: 'datetime', nullable: false },
        updatedAt: { type: 'datetime', nullable: false },
    },
    indexes: [
        { name: 'idx_lm_matter_number', columns: ['matterNumber'], unique: true },
        { name: 'idx_lm_matter_type', columns: ['matterType'], unique: false },
        { name: 'idx_lm_status', columns: ['status'], unique: false },
    ],
});

export function getLegalSchemas() {
    validateLegalDatabaseConfig();
    return [contractSchema, complianceSchema, intellectualPropertySchema, legalMatterSchema];
}

export default {
    validateLegalDatabaseConfig,
    contractSchema,
    complianceSchema,
    intellectualPropertySchema,
    legalMatterSchema,
    getLegalSchemas,
};

