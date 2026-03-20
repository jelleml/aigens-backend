#!/usr/bin/env node

/**
 * Model Management System - Automated Synchronization Script
 * 
 * This script is designed to be run as a cronjob to automatically synchronize
 * AI model data from all providers. It supports different synchronization modes
 * and includes error handling, logging, and alerting capabilities.
 */

const path = require('path');
const { getMonitoringService } = require('../../../services/model-management/monitoring-service');
const { ModelManagementCLI } = require('../../../services/model-management/cli/cli-core');
const pkg = require('../../../package.json');

// Initialize monitoring service
const monitoring = getMonitoringService();
const logger = monitoring.getLogger('cronjob-sync');

/**
 * Main execution function
 */
async function main() {
  logger.info('[CronJob] Starting model synchronization', {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'development'
  });

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = parseArguments(args);

  try {
    // Start monitoring service
    await monitoring.start();

    // Initialize CLI core
    const cli = new ModelManagementCLI({
      monitoring,
      version: pkg.version || '1.0.0'
    });

    // Set up performance tracking
    const timerId = logger.startTimer('model-sync-execution');

    // Execute sync operation
    logger.info('[CronJob] Executing sync operation', {
      mode: options.mode,
      providers: options.providers || 'all'
    });

    const result = await cli.executeSync({
      provider: options.providers,
      full: options.mode === 'full-sync',
      parallel: options.parallel || 3,
      timeout: options.timeout || 300000
    }, {
      verbose: options.verbose,
      quiet: options.quiet,
      'dry-run': options.dryRun,
      'log-level': options.logLevel || 'info'
    });

    // Log results
    logger.info('[CronJob] Sync operation completed', {
      success: result.success,
      providersProcessed: result.providersProcessed,
      modelsUpdated: result.modelsUpdated,
      modelsCreated: result.modelsCreated,
      duration: result.duration
    });

    // End performance tracking
    logger.endTimer(timerId, {
      result: 'success',
      stats: result
    });

    // Check for significant changes that might need attention
    if (result.modelsCreated > 50) {
      monitoring.handleAlert({
        type: 'significant_model_changes',
        level: 'warning',
        message: `Significant number of new models created: ${result.modelsCreated}`,
        modelsCreated: result.modelsCreated
      });
    }

    process.exit(0);

  } catch (error) {
    logger.error('[CronJob] Sync operation failed', {
      error: error.message,
      stack: error.stack
    });

    // Send alert for critical failure
    monitoring.handleAlert({
      type: 'sync_job_failure',
      level: 'critical',
      message: `Model sync job failed: ${error.message}`,
      error: error.message
    });

    process.exit(1);

  } finally {
    // Ensure monitoring service shuts down properly
    try {
      await monitoring.shutdown();
    } catch (shutdownError) {
      console.error('Error during monitoring shutdown:', shutdownError.message);
    }
  }
}

/**
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {Object} Parsed options
 */
function parseArguments(args) {
  const options = {
    mode: 'update',
    providers: null,
    parallel: 3,
    timeout: 300000,
    verbose: false,
    quiet: false,
    dryRun: false,
    logLevel: 'info'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--mode' || arg === '-m') {
      options.mode = args[++i];
    } else if (arg === '--provider' || arg === '-p') {
      options.providers = args[++i].split(',');
    } else if (arg === '--parallel') {
      options.parallel = parseInt(args[++i], 10);
    } else if (arg === '--timeout') {
      options.timeout = parseInt(args[++i], 10);
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--log-level') {
      options.logLevel = args[++i];
    }
  }

  return options;
}

// Handle uncaught exceptions
// Removed duplicate event listeners to prevent MaxListenersExceededWarning
// These are now handled centrally in server.js
/*
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
*/

// Make script executable
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { main };