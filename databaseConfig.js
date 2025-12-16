// Database configuration for modules backend
// Uses environment variables to avoid hard-coded credentials.
// Database name is loaded from template_1_config.json (campany_database.name) if DB_NAME is not set.

import fs from 'fs';

/**
 * Load the database name - Hardcoded for deployment
 * Database name was embedded during deployment process at 2025-12-16T22:56:08.856Z
 * @returns {string} Database name
 */
function loadDatabaseNameFromConfig() {
    // Return hardcoded database name (no file reading in deployment)
    // Still check environment variable first for flexibility
    if (process.env.DB_NAME) {
        return process.env.DB_NAME;
    }
    return 'testing723422';
}

const databaseConfig = {
    url: process.env.DB_HOST ?? 'localhost', // Default to localhost for development
    port: Number(process.env.DB_PORT ?? 5432), // PostgreSQL default port
    username: process.env.DB_USER ?? '',
    password: process.env.DB_PASSWORD ?? '',
    database: loadDatabaseNameFromConfig(),
};

/**
 * Update the database name in the config object.
 * This is used by the migration utility when the database name changes.
 *
 * @param {string} newDatabaseName
 */
export function updateDatabaseName(newDatabaseName) {
    databaseConfig.database = newDatabaseName;
}

export default databaseConfig;
