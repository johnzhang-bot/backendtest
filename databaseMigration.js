/**
 * Database name change watcher utility.
 *
 * Monitors template_1_config.json for changes to campany_database.name
 * and updates the database name, then triggers re-initialization of enabled modules.
 */

import fs from 'fs';
import databaseConfig, { updateDatabaseName } from './databaseConfig.js';

/**
 * Get the config file path.
 *
 * @returns {string}
 */
function getConfigPath() {
    const configUrl = new URL('../public/template_1_config.json', import.meta.url);
    return configUrl.pathname;
}

/**
 * Load the current database name from config.
 *
 * @returns {string | null}
 */
/**
 * Get the current database name - Hardcoded for deployment
 * @returns {string | null}
 */
export function getDatabaseNameFromConfig() {
    // Return hardcoded database name (no file reading in deployment)
    return 'testing723422';
}

/**
 * Start watching the config file for database name changes.
 *
 * @param {string} currentDbName - Current database name to monitor against.
 * @param {() => Promise<void>} onDatabaseNameChanged - Callback to re-initialize modules when database name changes.
 * @returns {() => void} Function to stop watching.
 */
/**
 * Watch database name changes - Disabled in deployment
 * @param {string} currentDbName - Current database name
 * @param {() => Promise<void>} onDatabaseNameChanged - Callback (not used in deployment)
 * @returns {() => void} Function to stop watching (no-op)
 */
export function watchDatabaseNameChanges(currentDbName, onDatabaseNameChanged) {
    // File watching disabled in deployment - using hardcoded config
    console.info('[DB_WATCHER][INFO] File watching disabled in deployment', {
        currentDatabase: currentDbName,
    });
    
    // Return no-op stop function
    return () => {
        console.info('[DB_WATCHER][INFO] Stop watching called (no-op in deployment)');
    };
}
