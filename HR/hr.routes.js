import { Router } from 'express';
import {
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
} from './hr.repository.js';
/**
 * HR module router
 *
 * Exposes core HR endpoints:
 * - Employee data
 * - Benefits
 * - Onboarding
 * - Recruitment
 * - Absence management
 *
 * All handlers use basic structured error handling and logging.
 */
const hrRouter = Router();
/**
 * Utility to safely handle async route handlers with consistent error reporting.
 */
const asyncHandler = (handler) => {
    return async (req, res, next) => {
        try {
            await handler(req, res, next);
        }
        catch (error) {
            // Centralised error logging for this module
            // Do not log sensitive values
            console.error('[HR][ERROR]', {
                path: req.path,
                method: req.method,
                message: error.message,
            });
            next(error);
        }
    };
};
/**
 * Basic health/status endpoint for the HR module.
 */
hrRouter.get('/status', asyncHandler(async (_req, res) => {
    res.status(200).json({
        module: 'hr',
        status: 'ok',
    });
}));
/**
 * Employee data - list employees from the database.
 */
hrRouter.get('/employees', asyncHandler(async (_req, res) => {
    const employees = await getEmployees();
    res.status(200).json({
        data: employees,
    });
}));
/**
 * Employee data - create a new employee record.
 */
hrRouter.post('/employees', asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const newEmployee = await createEmployee(payload);
    res.status(201).json({
        data: newEmployee,
    });
}));
/**
 * Benefits - list benefit programs from the database.
 */
hrRouter.get('/benefits', asyncHandler(async (_req, res) => {
    const benefits = await getBenefits();
    res.status(200).json({
        data: benefits,
    });
}));
/**
 * Benefits - create a new benefit program.
 */
hrRouter.post('/benefits', asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const benefit = await createBenefit(payload);
    res.status(201).json({
        data: benefit,
    });
}));
/**
 * Onboarding - basic overview list from the database.
 */
hrRouter.get('/onboarding', asyncHandler(async (_req, res) => {
    const onboarding = await getOnboardingFlows();
    res.status(200).json({
        data: onboarding,
    });
}));
/**
 * Onboarding - create a new onboarding flow.
 */
hrRouter.post('/onboarding', asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const flow = await createOnboardingFlow(payload);
    res.status(201).json({
        data: flow,
    });
}));
/**
 * Recruitment - job postings overview from the database.
 */
hrRouter.get('/recruitment', asyncHandler(async (_req, res) => {
    const jobs = await getJobPostings();
    res.status(200).json({
        data: jobs,
    });
}));
/**
 * Recruitment - create a new job posting.
 */
hrRouter.post('/recruitment', asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const job = await createJobPosting(payload);
    res.status(201).json({
        data: job,
    });
}));
/**
 * Absence management - recent absences from the database.
 */
hrRouter.get('/absences', asyncHandler(async (_req, res) => {
    const absences = await getAbsences();
    res.status(200).json({
        data: absences,
    });
}));
/**
 * Absence management - create a new absence record.
 */
hrRouter.post('/absences', asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const absence = await createAbsence(payload);
    res.status(201).json({
        data: absence,
    });
}));

/**
 * Payroll - list payroll records.
 */
hrRouter.get('/payroll', asyncHandler(async (_req, res) => {
    const records = await getPayrollRecords();
    res.status(200).json({
        data: records,
    });
}));

/**
 * Payroll - create a new payroll record.
 */
hrRouter.post('/payroll', asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const record = await createPayrollRecord(payload);
    res.status(201).json({
        data: record,
    });
}));

/**
 * Time tracking - list time entries.
 */
hrRouter.get('/time-tracking', asyncHandler(async (_req, res) => {
    const entries = await getTimeTracking();
    res.status(200).json({
        data: entries,
    });
}));

/**
 * Time tracking - create a new time entry.
 */
hrRouter.post('/time-tracking', asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const entry = await createTimeEntry(payload);
    res.status(201).json({
        data: entry,
    });
}));

/**
 * Engagement - list engagement surveys.
 */
hrRouter.get('/engagement', asyncHandler(async (_req, res) => {
    const surveys = await getEngagementSurveys();
    res.status(200).json({
        data: surveys,
    });
}));

/**
 * Engagement - create a new engagement survey.
 */
hrRouter.post('/engagement', asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const survey = await createEngagementSurvey(payload);
    res.status(201).json({
        data: survey,
    });
}));

export default hrRouter;
