// express server for the modules backend
// This file is the central entrypoint where individual module routers (e.g. HR) are mounted.
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import fs from 'fs';
import hrRouter from './HR/hr.routes.js';
import { initializeHrDatabase } from './HR/hr.databaseInit.js';
import itRouter from './IT/it.routes.js';
import { initializeItDatabase } from './IT/it.databaseInit.js';
import authRouter from './AUTH/auth.routes.js';
import { initializeAuthDatabase } from './AUTH/auth.databaseInit.js';
import accountingRouter from './ACCOUNTING/accounting.routes.js';
import { initializeAccountingDatabase } from './ACCOUNTING/accounting.databaseInit.js';
import legalRouter from './LEGAL/legal.routes.js';
import { initializeLegalDatabase } from './LEGAL/legal.databaseInit.js';
import { watchDatabaseNameChanges, getDatabaseNameFromConfig } from './databaseMigration.js';
import databaseConfig from './databaseConfig.js';
const app = express();
/**
 * Global middleware
 * - CORS
 * - JSON parsing
 * - Basic request logging
 */
app.use(cors());
app.use(bodyParser.json());
app.use((req, _res, next) => {
    // Basic, non-sensitive request log
    console.info('[MODULES_BACKEND][INFO]', {
        method: req.method,
        path: req.path,
    });
    next();
});
/**
 * Health check for the modules backend.
 */
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});
/**
 * Load modules backend configuration from template_1_config.json.
 * Only non-sensitive data is read, and missing/invalid config fails closed (modules disabled).
 */
/**
 * Load modules backend configuration - Hardcoded for deployment
 * This config was embedded during deployment process at 2025-12-16T22:56:08.855Z
 */
const loadModulesBackendConfig = () => {
    // Return hardcoded config (no file loading in deployment)
    return [
  {
    "name": "auth",
    "enabled": true
  },
  {
    "name": "hr",
    "enabled": true
  },
  {
    "name": "accounting",
    "enabled": true
  },
  {
    "name": "it",
    "enabled": true
  },
  {
    "name": "legal",
    "enabled": true
  }
];
};
/**
 * Initialize enabled modules (create database and tables).
 * This function can be called on startup and when database name changes.
 *
 * @param {Array} modulesBackendConfig - Configuration array from template_1_config.json
 * @param {boolean} mountRouters - Whether to mount routers (only true on startup)
 * @returns {Promise<void>}
 */
const initializeEnabledModules = async (modulesBackendConfig, mountRouters = false) => {
    /**
     * Mount HR module routes under /api/hr only when enabled in template_1_config.json.
         * When enabled, initialise the HR database and tables before exposing the API.
     */
    const isHrEnabled = modulesBackendConfig.some((entry) => entry.name === 'hr' && entry.enabled === true);
    if (isHrEnabled) {
        try {
            await initializeHrDatabase();
            if (mountRouters) {
                app.use('/api/hr', hrRouter);
                console.info('[MODULES_BACKEND][INFO] HR module enabled at /api/hr');
            }
            else {
                console.info('[MODULES_BACKEND][INFO] HR database re-initialized');
            }
        }
        catch (error) {
            console.error('[MODULES_BACKEND][ERROR] Failed to initialise HR module', {
                message: error.message,
                code: error.code,
            });
            throw error;
        }
    }
    else {
        console.info('[MODULES_BACKEND][INFO] HR module disabled by config');
    }
    /**
     * Mount IT module routes under /api/it only when enabled in template_1_config.json.
     * This module currently serves static data suitable for a very small company.
     */
    const isItEnabled = modulesBackendConfig.some((entry) => entry.name === 'it' && entry.enabled === true);
    if (isItEnabled) {
        try {
            await initializeItDatabase();
            if (mountRouters) {
                app.use('/api/it', itRouter);
                console.info('[MODULES_BACKEND][INFO] IT module enabled at /api/it');
            }
            else {
                console.info('[MODULES_BACKEND][INFO] IT database re-initialized');
            }
        }
        catch (error) {
            console.error('[MODULES_BACKEND][ERROR] Failed to initialise IT module', {
                message: error.message,
                code: error.code,
            });
            throw error;
        }
    }
    else {
        console.info('[MODULES_BACKEND][INFO] IT module disabled by config');
    }
    /**
     * Mount AUTH module routes under /api/auth only when enabled in template_1_config.json.
     * When enabled, initialise the AUTH database and tables before exposing the API.
     */
    const isAuthEnabled = modulesBackendConfig.some((entry) => entry.name === 'auth' && entry.enabled === true);
    if (isAuthEnabled) {
        try {
            await initializeAuthDatabase();
            if (mountRouters) {
                app.use('/api/auth', authRouter);
                console.info('[MODULES_BACKEND][INFO] AUTH module enabled at /api/auth');
            }
            else {
                console.info('[MODULES_BACKEND][INFO] AUTH database re-initialized');
            }
        }
        catch (error) {
            console.error('[MODULES_BACKEND][ERROR] Failed to initialise AUTH module', {
                message: error.message,
                code: error.code,
            });
            throw error;
        }
    }
    else {
        console.info('[MODULES_BACKEND][INFO] AUTH module disabled by config');
    }
    /**
     * Mount ACCOUNTING module routes under /api/accounting only when enabled.
     */
    const isAccountingEnabled = modulesBackendConfig.some((entry) => entry.name === 'accounting' && entry.enabled === true);
    if (isAccountingEnabled) {
        try {
            await initializeAccountingDatabase();
            if (mountRouters) {
                app.use('/api/accounting', accountingRouter);
                console.info('[MODULES_BACKEND][INFO] ACCOUNTING module enabled at /api/accounting');
            }
            else {
                console.info('[MODULES_BACKEND][INFO] ACCOUNTING database re-initialized');
            }
        }
        catch (error) {
            console.error('[MODULES_BACKEND][ERROR] Failed to initialise ACCOUNTING module', {
                message: error.message,
                code: error.code,
            });
            throw error;
        }
    }
    else {
        console.info('[MODULES_BACKEND][INFO] ACCOUNTING module disabled by config');
    }
    /**
     * Mount LEGAL module routes under /api/legal only when enabled.
     */
    const isLegalEnabled = modulesBackendConfig.some((entry) => entry.name === 'legal' && entry.enabled === true);
    if (isLegalEnabled) {
        try {
            await initializeLegalDatabase();
            if (mountRouters) {
                app.use('/api/legal', legalRouter);
                console.info('[MODULES_BACKEND][INFO] LEGAL module enabled at /api/legal');
            }
            else {
                console.info('[MODULES_BACKEND][INFO] LEGAL database re-initialized');
            }
        }
        catch (error) {
            console.error('[MODULES_BACKEND][ERROR] Failed to initialise LEGAL module', {
                message: error.message,
                code: error.code,
            });
            throw error;
        }
    }
    else {
        console.info('[MODULES_BACKEND][INFO] LEGAL module disabled by config');
    }
};

const startServer = async () => {
    const modulesBackendConfig = loadModulesBackendConfig();

    // Start watching for database name changes
    const currentDbName = databaseConfig.database || 'testing723422' || 'agilon_db';

    // Callback to re-initialize modules when database name changes
    const onDatabaseNameChanged = async () => {
        console.info('[MODULES_BACKEND][INFO] Re-initializing modules for new database');
        await initializeEnabledModules(modulesBackendConfig, false);
    };

    // File watching disabled in deployment - using hardcoded config
    const stopWatching = () => {
        console.info('[MODULES_BACKEND][INFO] File watching disabled in deployment');
    };

    // Ensure we stop watching on process exit
    process.on('SIGINT', () => {
        stopWatching();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        stopWatching();
        process.exit(0);
    });

    // Initialize modules on startup
    try {
        await initializeEnabledModules(modulesBackendConfig, true);
    }
    catch (error) {
        // Fail closed: do not start server in a partially initialised state.
        console.error('[MODULES_BACKEND][ERROR] Failed to initialise modules on startup', {
            message: error.message,
            code: error.code,
        });
        process.exitCode = 1;
        return;
    }
    /**
     * Global error handler for all modules.
     * Ensures structured error responses and avoids leaking sensitive details.
         * This must be registered after all route and middleware registrations.
     */
    app.use(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (err, _req, res, _next) => {
            console.error('[MODULES_BACKEND][ERROR]', {
                message: err.message,
            });
            res.status(500).json({
                error: 'Internal server error',
            });
        });
    const PORT = 3008;
    app.listen(PORT, () => {
        console.log(`Modules backend server is running on port ${PORT}`);
    });
};
startServer().catch((error) => {
    console.error('[MODULES_BACKEND][ERROR] Unhandled error during startup', {
        message: error.message,
        code: error.code,
    });
    process.exitCode = 1;
});
