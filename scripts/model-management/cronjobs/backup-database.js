#!/usr/bin/env node

/**
 * Model Management System - Database Backup Script
 * 
 * This script creates backups of the model management database tables
 * and stores them in a configurable location. It supports retention policies
 * and compression to optimize storage usage.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const { getMonitoringService } = require('../../../services/model-management/monitoring-service');
const db = require('../../../database');

// Promisified functions
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);

// Initialize monitoring service
const monitoring = getMonitoringService();
const logger = monitoring.getLogger('cronjob-backup');

// Configuration
const CONFIG = {
  backupDir: process.env.BACKUP_DIR || path.join(process.cwd(), 'backups', 'model-management'),
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10),
  compress: process.env.BACKUP_COMPRESS !== 'false',
  tables: [
    'models',
    'providers',
    'model_sync_logs',
    'provider_health_status',
    'aggregated_models',
    'models_capabilities',
    'model_stats_aa'
  ]
};

/**
 * Main execution function
 */
async function main() {
  logger.info('[CronJob] Starting database backup', {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'development'
  });

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = parseArguments(args);

  try {
    // Start monitoring service
    await monitoring.start();

    // Set up performance tracking
    const timerId = logger.startTimer('database-backup-execution');

    // Ensure backup directory exists
    await ensureBackupDirectory();

    // Create backup
    const backupResult = await createBackup(options);

    // Clean up old backups
    await cleanupOldBackups();

    // Log results
    logger.info('[CronJob] Database backup completed', {
      success: true,
      tablesBackedUp: backupResult.tablesBackedUp,
      totalRecords: backupResult.totalRecords,
      backupSize: backupResult.backupSize,
      backupPath: backupResult.backupPath,
      duration: backupResult.duration
    });

    // End performance tracking
    logger.endTimer(timerId, {
      result: 'success',
      stats: backupResult
    });

    process.exit(0);

  } catch (error) {
    logger.error('[CronJob] Database backup failed', {
      error: error.message,
      stack: error.stack
    });

    // Send alert for critical failure
    monitoring.handleAlert({
      type: 'backup_job_failure',
      level: 'critical',
      message: `Database backup job failed: ${error.message}`,
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
 * Ensure backup directory exists
 * @returns {Promise<void>}
 */
async function ensureBackupDirectory() {
  try {
    await mkdir(CONFIG.backupDir, { recursive: true });
    logger.debug('[CronJob] Backup directory ensured', {
      directory: CONFIG.backupDir
    });
  } catch (error) {
    throw new Error(`Failed to create backup directory: ${error.message}`);
  }
}

/**
 * Create database backup
 * @param {Object} options - Backup options
 * @returns {Promise<Object>} Backup results
 */
async function createBackup(options) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(CONFIG.backupDir, `model-management-backup-${timestamp}`);

  const result = {
    tablesBackedUp: 0,
    totalRecords: 0,
    backupSize: 0,
    backupPath,
    duration: 0,
    tables: {}
  };

  // Create backup directory for this run
  await mkdir(backupPath, { recursive: true });

  // Determine tables to backup
  const tables = options.tables || CONFIG.tables;

  // Backup each table
  for (const tableName of tables) {
    try {
      logger.debug(`[CronJob] Backing up table: ${tableName}`);

      // Get model for table
      const model = db.models[tableName] ||
        Object.values(db.models).find(m => m.tableName === tableName);

      if (!model) {
        logger.warn(`[CronJob] Table not found in models: ${tableName}`);
        continue;
      }

      // Query all records
      const records = await model.findAll();

      // Skip empty tables
      if (records.length === 0) {
        logger.debug(`[CronJob] Table is empty: ${tableName}`);
        continue;
      }

      // Convert to JSON
      const data = JSON.stringify(records.map(r => r.toJSON()), null, 2);

      // Write to file
      const filePath = path.join(backupPath, `${tableName}.json`);

      if (CONFIG.compress) {
        // Compress data
        const compressed = await promisify(zlib.gzip)(Buffer.from(data));
        await writeFile(`${filePath}.gz`, compressed);
        result.backupSize += compressed.length;
      } else {
        // Write uncompressed
        await writeFile(filePath, data);
        result.backupSize += data.length;
      }

      // Update results
      result.tablesBackedUp++;
      result.totalRecords += records.length;
      result.tables[tableName] = records.length;

      logger.debug(`[CronJob] Table backup completed: ${tableName}`, {
        records: records.length,
        size: CONFIG.compress ?
          (await stat(`${filePath}.gz`)).size :
          (await stat(filePath)).size
      });

    } catch (error) {
      logger.error(`[CronJob] Failed to backup table: ${tableName}`, {
        error: error.message
      });

      // Continue with other tables
    }
  }

  // Create metadata file
  const metadata = {
    timestamp: new Date().toISOString(),
    tables: result.tables,
    totalRecords: result.totalRecords,
    compressed: CONFIG.compress,
    environment: process.env.NODE_ENV || 'development'
  };

  await writeFile(
    path.join(backupPath, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  // Calculate duration
  result.duration = Date.now() - startTime;

  return result;
}

/**
 * Clean up old backups based on retention policy
 * @returns {Promise<Object>} Cleanup results
 */
async function cleanupOldBackups() {
  const result = {
    deletedBackups: 0,
    freedSpace: 0
  };

  try {
    // Get all backup directories
    const entries = await readdir(CONFIG.backupDir, { withFileTypes: true });
    const backupDirs = entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('model-management-backup-'))
      .map(entry => entry.name);

    // Calculate cutoff date
    const cutoffTime = Date.now() - (CONFIG.retentionDays * 24 * 60 * 60 * 1000);

    // Process each backup directory
    for (const dirName of backupDirs) {
      const dirPath = path.join(CONFIG.backupDir, dirName);

      try {
        // Get directory stats
        const dirStats = await stat(dirPath);

        // Check if older than retention period
        if (dirStats.mtime.getTime() < cutoffTime) {
          // Calculate size before deletion
          const dirSize = await calculateDirectorySize(dirPath);

          // Delete directory and contents
          await deleteDirectory(dirPath);

          // Update results
          result.deletedBackups++;
          result.freedSpace += dirSize;

          logger.debug(`[CronJob] Deleted old backup: ${dirName}`, {
            age: Math.floor((Date.now() - dirStats.mtime.getTime()) / (24 * 60 * 60 * 1000)),
            size: dirSize
          });
        }
      } catch (error) {
        logger.error(`[CronJob] Failed to process backup directory: ${dirName}`, {
          error: error.message
        });
      }
    }

    logger.info('[CronJob] Backup cleanup completed', {
      deletedBackups: result.deletedBackups,
      freedSpace: result.freedSpace
    });

    return result;

  } catch (error) {
    logger.error('[CronJob] Backup cleanup failed', {
      error: error.message
    });

    return result;
  }
}

/**
 * Calculate directory size recursively
 * @param {string} dirPath - Directory path
 * @returns {Promise<number>} Directory size in bytes
 */
async function calculateDirectorySize(dirPath) {
  let size = 0;

  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      size += await calculateDirectorySize(fullPath);
    } else {
      const fileStats = await stat(fullPath);
      size += fileStats.size;
    }
  }

  return size;
}

/**
 * Delete directory and contents recursively
 * @param {string} dirPath - Directory path
 * @returns {Promise<void>}
 */
async function deleteDirectory(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await deleteDirectory(fullPath);
    } else {
      await unlink(fullPath);
    }
  }

  await promisify(fs.rmdir)(dirPath);
}

/**
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {Object} Parsed options
 */
function parseArguments(args) {
  const options = {
    tables: null,
    verbose: false,
    quiet: false,
    logLevel: 'info'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--tables') {
      options.tables = args[++i].split(',');
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