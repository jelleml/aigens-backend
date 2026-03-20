#!/usr/bin/env node

/**
 * Model Management System - Health Check Script
 * 
 * This script performs comprehensive health checks on the model management system
 * and its providers. It's designed to be run as a cronjob to detect and alert on
 * issues before they impact users.
 */

const { getMonitoringService } = require('../../../services/model-management/monitoring-service');
const { ModelManagementCLI } = require('../../../services/model-management/cli/cli-core');
const pkg = require('../../../package.json');
const db = require('../../../database');

// Initialize monitoring service
const monitoring = getMonitoringService();
const logger = monitoring.getLogger('cronjob-health');

/**
 * Main execution function
 */
async function main() {
  logger.info('[CronJob] Starting health check', {
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
    const timerId = logger.startTimer('health-check-execution');

    // Execute health check operation
    logger.info('[CronJob] Executing health check', {
      providers: options.providers || 'all',
      detailed: options.detailed
    });

    const result = await cli.executeHealth({
      provider: options.providers,
      detailed: options.detailed,
      fix: options.fix
    }, {
      verbose: options.verbose,
      quiet: options.quiet,
      'log-level': options.logLevel || 'info'
    });

    // Check for missed sync jobs
    await checkForMissedSyncJobs();

    // Log results
    logger.info('[CronJob] Health check completed', {
      success: result.success,
      providersChecked: result.providersChecked,
      healthyProviders: result.healthyProviders,
      unhealthyProviders: result.unhealthyProviders,
      duration: result.duration
    });

    // End performance tracking
    logger.endTimer(timerId, {
      result: 'success',
      stats: result
    });

    // Alert on unhealthy providers
    if (result.unhealthyProviders > 0) {
      monitoring.handleAlert({
        type: 'unhealthy_providers',
        level: result.unhealthyProviders > 1 ? 'critical' : 'warning',
        message: `Unhealthy providers detected: ${result.unhealthyProviders}`,
        unhealthyProviders: result.unhealthyProviders,
        details: result.unhealthyDetails
      });
    }

    process.exit(0);

  } catch (error) {
    logger.error('[CronJob] Health check failed', {
      error: error.message,
      stack: error.stack
    });

    // Send alert for critical failure
    monitoring.handleAlert({
      type: 'health_check_failure',
      level: 'critical',
      message: `Health check job failed: ${error.message}`,
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
 * Check for missed synchronization jobs
 * @returns {Promise<void>}
 */
async function checkForMissedSyncJobs() {
  try {
    // Check if ModelSyncLog model exists
    if (!db.models.ModelSyncLog) {
      logger.warn('[CronJob] ModelSyncLog model not available, skipping missed job check');
      return;
    }

    // Get the latest sync log entry
    const latestSync = await db.models.ModelSyncLog.findOne({
      order: [['completed_at', 'DESC']],
      where: {
        status: 'completed'
      }
    });

    if (!latestSync) {
      logger.warn('[CronJob] No completed sync jobs found in database');
      return;
    }

    // Check if the last sync was more than 25 hours ago (daily job should run every 24h)
    const lastSyncTime = new Date(latestSync.completed_at).getTime();
    const currentTime = Date.now();
    const hoursSinceLastSync = (currentTime - lastSyncTime) / (1000 * 60 * 60);

    if (hoursSinceLastSync > 25) {
      logger.warn('[CronJob] Detected missed sync job', {
        lastSyncTime: new Date(lastSyncTime).toISOString(),
        hoursSinceLastSync
      });

      // Send alert for missed job
      monitoring.handleAlert({
        type: 'missed_sync_job',
        level: 'warning',
        message: `Missed sync job detected. Last successful sync was ${hoursSinceLastSync.toFixed(1)} hours ago`,
        lastSyncTime: new Date(lastSyncTime).toISOString(),
        hoursSinceLastSync
      });
    }

  } catch (error) {
    logger.error('[CronJob] Error checking for missed sync jobs', {
      error: error.message
    });
  }
}

/**
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {Object} Parsed options
 */
function parseArguments(args) {
  const options = {
    providers: null,
    detailed: false,
    fix: false,
    verbose: false,
    quiet: false,
    logLevel: 'info'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--provider' || arg === '-p') {
      options.providers = args[++i].split(',');
    } else if (arg === '--detailed' || arg === '-d') {
      options.detailed = true;
    } else if (arg === '--fix') {
      options.fix = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
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