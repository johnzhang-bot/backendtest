/**
 * IT module database schema definitions.
 *
 * This module describes the structure for IT-related entities such as
 * devices and support tickets. It is persistence-agnostic and performs
 * only configuration validation.
 */

import databaseConfig from '../databaseConfig.js';

/**
 * Validate that the minimal database configuration required for the IT
 * module is present.
 *
 * @returns {void}
 * @throws {Error} If required database configuration is missing or invalid.
 */
export function validateItDatabaseConfig() {
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
      `[IT_SCHEMA] Invalid database configuration: ${issues.join('; ')}`
    );
    error.code = 'IT_SCHEMA_INVALID_DB_CONFIG';
    throw error;
  }
}

/**
 * IT entity: Devices managed by the small IT setup.
 */
export const itDeviceSchema = Object.freeze({
  entity: 'it_device',
  tableName: 'it_devices',
  primaryKey: 'id',
  columns: {
    id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
    label: { type: 'string', length: 64, nullable: false },
    owner: { type: 'string', length: 128, nullable: false },
    type: { type: 'string', length: 128, nullable: false },
    status: {
      type: 'enum',
      values: ['in_use', 'available', 'retired'],
      default: 'in_use',
      nullable: false,
    },
    createdAt: { type: 'datetime', nullable: false },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_it_devices_owner', columns: ['owner'], unique: false },
    { name: 'idx_it_devices_status', columns: ['status'], unique: false },
  ],
});

/**
 * IT entity: Simple IT support tickets.
 */
export const itTicketSchema = Object.freeze({
  entity: 'it_ticket',
  tableName: 'it_tickets',
  primaryKey: 'id',
  columns: {
    id: { type: 'int', unsigned: true, autoIncrement: true, nullable: false },
    title: { type: 'string', length: 256, nullable: false },
    owner: { type: 'string', length: 128, nullable: false },
    status: {
      type: 'enum',
      values: ['open', 'in_progress', 'closed'],
      default: 'open',
      nullable: false,
    },
    priority: {
      type: 'enum',
      values: ['low', 'medium', 'high'],
      default: 'low',
      nullable: false,
    },
    createdAt: { type: 'datetime', nullable: false },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_it_tickets_status', columns: ['status'], unique: false },
    { name: 'idx_it_tickets_priority', columns: ['priority'], unique: false },
  ],
});

/**
 * Helper to get all IT schemas after validating configuration.
 *
 * @returns {Array<object>}
 */
export function getItSchemas() {
  validateItDatabaseConfig();
  return [itDeviceSchema, itTicketSchema];
}

export default {
  validateItDatabaseConfig,
  itDeviceSchema,
  itTicketSchema,
  getItSchemas,
};


