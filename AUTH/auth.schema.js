/**
 * AUTH module database schema definitions.
 *
 * This module describes the structure for authentication-related entities such as
 * users. It is persistence-agnostic and performs only configuration validation.
 */

import databaseConfig from '../databaseConfig.js';

/**
 * Validate that the minimal database configuration required for the AUTH
 * module is present.
 *
 * @returns {void}
 * @throws {Error} If required database configuration is missing or invalid.
 */
export function validateAuthDatabaseConfig() {
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
      `[AUTH_SCHEMA] Invalid database configuration: ${issues.join('; ')}`
    );
    error.code = 'AUTH_SCHEMA_INVALID_DB_CONFIG';
    throw error;
  }
}

/**
 * AUTH entity: User accounts for authentication.
 */
export const userSchema = Object.freeze({
  entity: 'user',
  tableName: 'users',
  primaryKey: 'id',
  columns: {
    id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
    email: { type: 'string', length: 256, nullable: false, unique: true },
    password: { type: 'string', length: 255, nullable: false }, // Hashed password
    createdAt: { type: 'datetime', nullable: false },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_users_email', columns: ['email'], unique: true },
  ],
});

/**
 * Helper to get all AUTH schemas after validating configuration.
 *
 * @returns {Array<object>}
 */
export function getAuthSchemas() {
  validateAuthDatabaseConfig();
  return [userSchema];
}

export default {
  validateAuthDatabaseConfig,
  userSchema,
  getAuthSchemas,
};

