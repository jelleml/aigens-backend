#!/usr/bin/env node

/**
 * Model Statistics Update Script
 * 
 * This script orchestrates the process of updating model statistics in the database
 * by calling the Python addon API endpoints and verifying the results.
 * 
 * The script performs the following operations:
 * 1. Refreshes model statistics in the models_stats_aa table
 * 2. Refreshes model relationships in the models_models_stats_aa table
 * 3. Updates price scores from the artificial analysis data
 * 
 * Each operation includes verification steps and appropriate delays to ensure
 * the database is updated correctly.
 */

// Import dependencies
const pythonAddonClient = require('../../scripts/api-addons-py/python-addon-api-client');
const { verification, wait, logger } = require('../../scripts/api-addons-py/utils');
const db = require('../../database');

// Configuration
const CONFIG = {
  // Delay between operations in milliseconds
  operationDelay: 2000,
  // Maximum number of retries for failed operations
  maxRetries: 3,
  // Delay between retries in milliseconds
  retryDelay: 5000,
  // Whether to exit with error code on failure
  exitOnFailure: true
};

/**
 * Main function to orchestrate the model statistics update process
 */
async function updateModelStats() {
  logger.logStart('Model Statistics Update');
  
  const results = {
    startTime: new Date(),
    endTime: null,
    operations: {
      refreshStats: { success: false, data: null, errors: [] },
      refreshRelationships: { success: false, data: null, errors: [] },
      updatePriceScores: { success: false, data: null, errors: [] }
    },
    summary: {
      totalOperations: 3,
      successfulOperations: 0,
      failedOperations: 0,
      duration: 0
    }
  };

  try {
    // Ensure database connection is established
    await ensureDatabaseConnection();
    
    // Step 1: Refresh model statistics
    await executeWithRetry(
      'Refresh Model Statistics',
      async () => {
        const response = await pythonAddonClient.refreshModelStats();
        results.operations.refreshStats.data = response;
        results.operations.refreshStats.success = true;
        return response;
      },
      results.operations.refreshStats.errors
    );
    
    // Wait between operations
    logger.logProgress('Model Statistics Update', `Waiting ${CONFIG.operationDelay}ms before next operation`);
    await wait(CONFIG.operationDelay);
    
    // Step 2: Refresh model relationships
    await executeWithRetry(
      'Refresh Model Relationships',
      async () => {
        const response = await pythonAddonClient.refreshModelRelationships();
        results.operations.refreshRelationships.data = response;
        results.operations.refreshRelationships.success = true;
        return response;
      },
      results.operations.refreshRelationships.errors
    );
    
    // Wait between operations
    logger.logProgress('Model Statistics Update', `Waiting ${CONFIG.operationDelay}ms before next operation`);
    await wait(CONFIG.operationDelay);
    
    // Step 3: Update price scores
    await executeWithRetry(
      'Update Price Scores',
      async () => {
        const response = await pythonAddonClient.updatePriceScores();
        results.operations.updatePriceScores.data = response;
        results.operations.updatePriceScores.success = true;
        return response;
      },
      results.operations.updatePriceScores.errors
    );
    
    // Calculate summary
    results.endTime = new Date();
    results.summary.successfulOperations = Object.values(results.operations)
      .filter(op => op.success).length;
    results.summary.failedOperations = Object.values(results.operations)
      .filter(op => !op.success).length;
    results.summary.duration = results.endTime - results.startTime;
    
    // Verify overall operation success
    const overallSuccess = verification.verifyOperation({
      dataFetched: results.operations.refreshStats.success,
      dataStored: results.operations.refreshStats.success,
      associationsCreated: results.operations.refreshRelationships.success,
      errors: [
        ...results.operations.refreshStats.errors,
        ...results.operations.refreshRelationships.errors,
        ...results.operations.updatePriceScores.errors
      ]
    });
    
    // Log summary
    logger.logSummary({
      'Total Operations': results.summary.totalOperations,
      'Successful Operations': results.summary.successfulOperations,
      'Failed Operations': results.summary.failedOperations,
      'Duration (ms)': results.summary.duration,
      'Overall Success': overallSuccess ? 'Yes' : 'No'
    });
    
    // Exit with appropriate code
    if (!overallSuccess && CONFIG.exitOnFailure) {
      logger.logError('Model Statistics Update', 'Operation failed, exiting with error code');
      process.exit(1);
    }
    
    logger.logComplete('Model Statistics Update', overallSuccess);
    return results;
    
  } catch (error) {
    logger.logError('Model Statistics Update', error);
    
    results.endTime = new Date();
    results.summary.duration = results.endTime - results.startTime;
    results.summary.failedOperations = results.summary.totalOperations - results.summary.successfulOperations;
    
    logger.logSummary({
      'Total Operations': results.summary.totalOperations,
      'Successful Operations': results.summary.successfulOperations,
      'Failed Operations': results.summary.failedOperations,
      'Duration (ms)': results.summary.duration,
      'Overall Success': 'No'
    });
    
    if (CONFIG.exitOnFailure) {
      process.exit(1);
    }
    
    return results;
  } finally {
    // Close database connection
    await closeDatabaseConnection();
  }
}

/**
 * Execute an operation with retry logic
 * @param {string} operationName - Name of the operation
 * @param {Function} operation - Async function to execute
 * @param {Array} errorList - List to collect errors
 * @returns {Promise<any>} - Result of the operation
 */
async function executeWithRetry(operationName, operation, errorList) {
  let attempts = 0;
  
  while (attempts < CONFIG.maxRetries) {
    attempts++;
    
    try {
      logger.logProgress('Model Statistics Update', `Executing ${operationName} (Attempt ${attempts}/${CONFIG.maxRetries})`);
      const result = await operation();
      logger.logProgress('Model Statistics Update', `${operationName} completed successfully`);
      return result;
    } catch (error) {
      logger.logError(operationName, error);
      errorList.push(error.message);
      
      if (attempts < CONFIG.maxRetries) {
        logger.logProgress('Model Statistics Update', `Retrying ${operationName} in ${CONFIG.retryDelay}ms`);
        await wait(CONFIG.retryDelay);
      } else {
        logger.logProgress('Model Statistics Update', `${operationName} failed after ${CONFIG.maxRetries} attempts`);
        throw error;
      }
    }
  }
}

/**
 * Ensure database connection is established
 * @returns {Promise<void>}
 */
async function ensureDatabaseConnection() {
  try {
    logger.logProgress('Database', 'Checking database connection');
    await db.sequelize.authenticate();
    logger.logProgress('Database', 'Database connection established');
  } catch (error) {
    logger.logError('Database', 'Failed to connect to database', error);
    throw new Error('Database connection failed');
  }
}

/**
 * Close database connection
 * @returns {Promise<void>}
 */
async function closeDatabaseConnection() {
  try {
    logger.logProgress('Database', 'Closing database connection');
    await db.sequelize.close();
    logger.logProgress('Database', 'Database connection closed');
  } catch (error) {
    logger.logError('Database', 'Failed to close database connection', error);
  }
}

/**
 * Run the script if executed directly
 */
if (require.main === module) {
  updateModelStats()
    .then(() => {
      // Script completed, exit will happen in the function
    })
    .catch(error => {
      console.error('Unhandled error in updateModelStats:', error);
      process.exit(1);
    });
} else {
  // Export for use as a module
  module.exports = {
    updateModelStats,
    executeWithRetry,
    ensureDatabaseConnection,
    closeDatabaseConnection,
    CONFIG
  };
}