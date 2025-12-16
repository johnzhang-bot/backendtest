/**
 * HR module database schema definitions.
 *
 * This module is intentionally persistence-agnostic: it describes the
 * structure of HR-related entities (tables/collections) without coupling
 * to a specific database driver or ORM.
 *
 * All functions perform defensive checks and are side‑effect free so the
 * module can be safely imported from any part of the modules backend.
 */

import databaseConfig from '../databaseConfig.js';

/**
 * Validate that the minimal database configuration required for the HR
 * module is present.
 *
 * This does not open any connections; it only checks configuration
 * preconditions and throws a descriptive error if they are not met.
 *
 * @returns {void}
 * @throws {Error} If required database configuration is missing or invalid.
 */
export function validateHrDatabaseConfig() {
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
        // Centralised, non-sensitive error description
        const error = new Error(
            `[HR_SCHEMA] Invalid database configuration: ${issues.join('; ')}`
        );
        error.code = 'HR_SCHEMA_INVALID_DB_CONFIG';
        throw error;
    }
}

/**
 * Core HR entity: Employee records.
 *
 * This schema is expressed as a simple, serialisable description that can
 * be interpreted by any migration or ORM layer.
 */
export const employeeSchema = Object.freeze({
    entity: 'employee',
    tableName: 'employees',
    primaryKey: 'id',
    columns: {
        id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
        firstName: { type: 'string', length: 128, nullable: false },
        lastName: { type: 'string', length: 128, nullable: false },
        email: { type: 'string', length: 256, nullable: false, unique: true },
        department: { type: 'string', length: 128, nullable: false },
        position: { type: 'string', length: 128, nullable: false },
        status: {
            type: 'enum',
            values: ['active', 'inactive', 'terminated', 'on_leave'],
            default: 'active',
            nullable: false,
        },
        hiredAt: { type: 'datetime', nullable: false },
        createdAt: { type: 'datetime', nullable: false },
        updatedAt: { type: 'datetime', nullable: false },
    },
    indexes: [
        { name: 'idx_employees_email', columns: ['email'], unique: true },
        { name: 'idx_employees_department', columns: ['department'], unique: false },
    ],
});

/**
 * HR entity: Benefit programs and plans.
 */
export const benefitSchema = Object.freeze({
    entity: 'benefit',
    tableName: 'benefits',
    primaryKey: 'id',
    columns: {
        id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
        name: { type: 'string', length: 256, nullable: false },
        type: {
            type: 'enum',
            values: ['medical', 'dental', 'vision', 'retirement', 'other'],
            nullable: false,
        },
        description: { type: 'text', nullable: true },
        isActive: { type: 'boolean', default: true, nullable: false },
        createdAt: { type: 'datetime', nullable: false },
        updatedAt: { type: 'datetime', nullable: false },
    },
    indexes: [
        { name: 'idx_benefits_name', columns: ['name'], unique: false },
        { name: 'idx_benefits_type', columns: ['type'], unique: false },
    ],
});

/**
 * HR entity: Onboarding workflows for new employees.
 */
export const onboardingSchema = Object.freeze({
    entity: 'onboarding',
    tableName: 'onboarding_flows',
    primaryKey: 'id',
    columns: {
        id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
        employeeId: { type: 'int', unsigned: true, nullable: false },
        position: { type: 'string', length: 128, nullable: false },
        status: {
            type: 'enum',
            values: ['not_started', 'in_progress', 'completed', 'blocked'],
            default: 'not_started',
            nullable: false,
        },
        startedAt: { type: 'datetime', nullable: true },
        completedAt: { type: 'datetime', nullable: true },
        createdAt: { type: 'datetime', nullable: false },
        updatedAt: { type: 'datetime', nullable: false },
    },
    indexes: [
        {
            name: 'idx_onboarding_employee',
            columns: ['employeeId'],
            unique: false,
        },
    ],
    foreignKeys: [
        {
            name: 'fk_onboarding_employee',
            column: 'employeeId',
            references: {
                table: 'employees',
                column: 'id',
            },
            onDelete: 'CASCADE',
        },
    ],
});

/**
 * HR entity: Recruitment / job postings overview.
 */
export const recruitmentSchema = Object.freeze({
    entity: 'recruitment',
    tableName: 'job_postings',
    primaryKey: 'id',
    columns: {
        id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
        title: { type: 'string', length: 256, nullable: false },
        department: { type: 'string', length: 128, nullable: false },
        status: {
            type: 'enum',
            values: ['draft', 'active', 'closed', 'on_hold'],
            default: 'draft',
            nullable: false,
        },
        location: { type: 'string', length: 256, nullable: true },
        createdAt: { type: 'datetime', nullable: false },
        updatedAt: { type: 'datetime', nullable: false },
    },
    indexes: [
        { name: 'idx_job_postings_status', columns: ['status'], unique: false },
        {
            name: 'idx_job_postings_department',
            columns: ['department'],
            unique: false,
        },
    ],
});

/**
 * HR entity: Absence / leave management records.
 */
export const absenceSchema = Object.freeze({
    entity: 'absence',
    tableName: 'absences',
    primaryKey: 'id',
    columns: {
        id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
        employeeId: { type: 'int', unsigned: true, nullable: false },
        type: {
            type: 'enum',
            values: ['vacation', 'sick', 'unpaid', 'other'],
            nullable: false,
        },
        status: {
            type: 'enum',
            values: ['requested', 'approved', 'rejected', 'cancelled'],
            default: 'requested',
            nullable: false,
        },
        startDate: { type: 'date', nullable: false },
        endDate: { type: 'date', nullable: false },
        createdAt: { type: 'datetime', nullable: false },
        updatedAt: { type: 'datetime', nullable: false },
    },
    indexes: [
        { name: 'idx_absences_employee', columns: ['employeeId'], unique: false },
        { name: 'idx_absences_status', columns: ['status'], unique: false },
    ],
    foreignKeys: [
        {
            name: 'fk_absences_employee',
            column: 'employeeId',
            references: {
                table: 'employees',
                column: 'id',
            },
            onDelete: 'CASCADE',
        },
    ],
});

/**
 * HR entity: Payroll records for compensation management.
 */
export const payrollSchema = Object.freeze({
    entity: 'payroll',
    tableName: 'payroll_records',
    primaryKey: 'id',
    columns: {
        id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
        employeeId: { type: 'int', unsigned: true, nullable: false },
        payPeriodStart: { type: 'date', nullable: false },
        payPeriodEnd: { type: 'date', nullable: false },
        basePay: { type: 'decimal', precision: 15, scale: 2, nullable: false },
        bonuses: { type: 'decimal', precision: 15, scale: 2, nullable: false, default: 0 },
        deductions: { type: 'decimal', precision: 15, scale: 2, nullable: false, default: 0 },
        netPay: { type: 'decimal', precision: 15, scale: 2, nullable: false },
        status: {
            type: 'enum',
            values: ['draft', 'processed', 'paid'],
            default: 'draft',
            nullable: false,
        },
        createdAt: { type: 'datetime', nullable: false },
        updatedAt: { type: 'datetime', nullable: false },
    },
    indexes: [
        { name: 'idx_payroll_employee', columns: ['employeeId'], unique: false },
        { name: 'idx_payroll_period', columns: ['payPeriodStart', 'payPeriodEnd'], unique: false },
    ],
    foreignKeys: [
        {
            name: 'fk_payroll_employee',
            column: 'employeeId',
            references: {
                table: 'employees',
                column: 'id',
            },
            onDelete: 'CASCADE',
        },
    ],
});

/**
 * HR entity: Time tracking for attendance and scheduling.
 */
export const timeTrackingSchema = Object.freeze({
    entity: 'time_tracking',
    tableName: 'time_tracking',
    primaryKey: 'id',
    columns: {
        id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
        employeeId: { type: 'int', unsigned: true, nullable: false },
        clockIn: { type: 'datetime', nullable: false },
        clockOut: { type: 'datetime', nullable: true },
        hoursWorked: { type: 'decimal', precision: 5, scale: 2, nullable: true },
        overtimeHours: { type: 'decimal', precision: 5, scale: 2, nullable: false, default: 0 },
        shiftType: { type: 'string', length: 64, nullable: true },
        status: {
            type: 'enum',
            values: ['active', 'completed', 'approved'],
            default: 'active',
            nullable: false,
        },
        createdAt: { type: 'datetime', nullable: false },
        updatedAt: { type: 'datetime', nullable: false },
    },
    indexes: [
        { name: 'idx_timetrack_employee', columns: ['employeeId'], unique: false },
        { name: 'idx_timetrack_date', columns: ['clockIn'], unique: false },
    ],
    foreignKeys: [
        {
            name: 'fk_timetrack_employee',
            column: 'employeeId',
            references: {
                table: 'employees',
                column: 'id',
            },
            onDelete: 'CASCADE',
        },
    ],
});

/**
 * HR entity: Employee engagement and culture surveys.
 */
export const engagementSchema = Object.freeze({
    entity: 'engagement',
    tableName: 'engagement_surveys',
    primaryKey: 'id',
    columns: {
        id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
        employeeId: { type: 'int', unsigned: true, nullable: false },
        surveyType: {
            type: 'enum',
            values: ['pulse', 'annual', 'feedback', 'recognition'],
            nullable: false,
        },
        score: { type: 'int', nullable: true },
        feedback: { type: 'text', nullable: true },
        surveyDate: { type: 'date', nullable: false },
        createdAt: { type: 'datetime', nullable: false },
        updatedAt: { type: 'datetime', nullable: false },
    },
    indexes: [
        { name: 'idx_engagement_employee', columns: ['employeeId'], unique: false },
        { name: 'idx_engagement_survey_type', columns: ['surveyType'], unique: false },
    ],
    foreignKeys: [
        {
            name: 'fk_engagement_employee',
            column: 'employeeId',
            references: {
                table: 'employees',
                column: 'id',
            },
            onDelete: 'CASCADE',
        },
    ],
});

/**
 * Get all schema definitions for the HR module.
 *
 * This helper validates the database configuration before returning
 * the schema list so callers can fail fast during application startup
 * or migration initialisation.
 *
 * @returns {Array<object>} Array of HR schema definition objects.
 * @throws {Error} If database configuration is invalid.
 */
export function getHrSchemas() {
    // Preconditions: database configuration must be valid before using schemas
    validateHrDatabaseConfig();

    return [
        employeeSchema,
        benefitSchema,
        onboardingSchema,
        recruitmentSchema,
        absenceSchema,
        payrollSchema,
        timeTrackingSchema,
        engagementSchema,
    ];
}

/**
 * Default export groups the HR schemas and helpers to keep the public
 * surface area of this module explicit and easily discoverable.
 */
export default {
    validateHrDatabaseConfig,
    employeeSchema,
    benefitSchema,
    onboardingSchema,
    recruitmentSchema,
    absenceSchema,
    payrollSchema,
    timeTrackingSchema,
    engagementSchema,
    getHrSchemas,
};


