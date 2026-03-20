/**
 * Error handling and logging utilities for scripts
 * Provides consistent error handling, retry logic, and logging across scripts
 */

const fs = require('fs').promises;
const path = require('path');

// Configuration for retry logic
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000,    // 30 seconds
  factor: 2,          // Exponential factor
  jitter: 0.1         // Add 10% jitter to avoid thundering herd
};

/**
 * Creates a logger that writes to both console and a log file
 * @param {string} scriptName - Name of the script for log identification
 * @param {Object} options - Logger options
 * @param {boolean} options.logToFile - Whether to write logs to file
 * @param {string} options.logDir - Directory for log files
 * @returns {Object} Logger object with log, info, warn, error, and debug methods
 */
function createLogger(scriptName, options = {}) {
  const {
    logToFile = true,
    logDir = path.join(__dirname, '../../logs')
  } = options;

  // Ensure log directory exists
  if (logToFile) {
    fs.mkdir(logDir, { recursive: true }).catch(err => {
      console.error(`Failed to create log directory: ${err.message}`);
    });
  }

  const logFilePath = path.join(logDir, `${scriptName}-${new Date().toISOString().split('T')[0]}.log`);
  
  // Create timestamp for log entries
  const timestamp = () => new Date().toISOString();
  
  // Write to log file
  const writeToFile = async (level, message) => {
    if (!logToFile) return;
    
    try {
      const logEntry = `[${timestamp()}] [${level.toUpperCase()}] ${message}\n`;
      await fs.appendFile(logFilePath, logEntry);
    } catch (err) {
      console.error(`Failed to write to log file: ${err.message}`);
    }
  };
  
  return {
    /**
     * Log an informational message
     * @param {string} message - Message to log
     */
    info: (message) => {
      const formattedMessage = `[${scriptName}] ${message}`;
      console.log(`ℹ️ ${formattedMessage}`);
      writeToFile('info', formattedMessage);
    },
    
    /**
     * Log a warning message
     * @param {string} message - Message to log
     */
    warn: (message) => {
      const formattedMessage = `[${scriptName}] ${message}`;
      console.warn(`⚠️ ${formattedMessage}`);
      writeToFile('warn', formattedMessage);
    },
    
    /**
     * Log an error message
     * @param {string} message - Message to log
     * @param {Error} [error] - Optional error object
     */
    error: (message, error) => {
      const formattedMessage = `[${scriptName}] ${message}${error ? `: ${error.message}` : ''}`;
      console.error(`❌ ${formattedMessage}`);
      
      if (error && error.stack) {
        writeToFile('error', `${formattedMessage}\n${error.stack}`);
      } else {
        writeToFile('error', formattedMessage);
      }
    },
    
    /**
     * Log a debug message (only in development)
     * @param {string} message - Message to log
     * @param {any} [data] - Optional data to include
     */
    debug: (message, data) => {
      if (process.env.NODE_ENV !== 'production') {
        const formattedMessage = `[${scriptName}] ${message}`;
        console.debug(`🔍 ${formattedMessage}`);
        
        if (data) {
          console.debug(data);
          writeToFile('debug', `${formattedMessage}\n${JSON.stringify(data, null, 2)}`);
        } else {
          writeToFile('debug', formattedMessage);
        }
      }
    },
    
    /**
     * Log a success message
     * @param {string} message - Message to log
     */
    success: (message) => {
      const formattedMessage = `[${scriptName}] ${message}`;
      console.log(`✅ ${formattedMessage}`);
      writeToFile('success', formattedMessage);
    },
    
    /**
     * Generate a summary report
     * @param {Object} results - Results object
     * @returns {string} Formatted summary
     */
    generateSummary: (results) => {
      const summary = [
        '\n📋 SUMMARY REPORT',
        '================',
        `⏱️  Duration: ${Math.round((results.endTime - results.startTime) / 1000)}s`,
      ];
      
      // Add custom summary lines based on results object
      Object.entries(results).forEach(([key, value]) => {
        if (['startTime', 'endTime', 'errors'].includes(key)) return;
        
        if (Array.isArray(value)) {
          summary.push(`📊 ${key}: ${value.length}`);
        } else if (typeof value === 'number') {
          summary.push(`📊 ${key}: ${value}`);
        }
      });
      
      // Add error count
      if (results.errors && Array.isArray(results.errors)) {
        summary.push(`❌ Errors: ${results.errors.length}`);
      }
      
      const summaryText = summary.join('\n');
      console.log(summaryText);
      writeToFile('info', summaryText);
      
      return summaryText;
    }
  };
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts
 * @param {number} options.initialDelay - Initial delay in milliseconds
 * @param {number} options.maxDelay - Maximum delay in milliseconds
 * @param {number} options.factor - Exponential backoff factor
 * @param {number} options.jitter - Random jitter factor (0-1)
 * @param {Function} options.onRetry - Callback function on retry
 * @returns {Promise<any>} Result of the function
 */
async function withRetry(fn, options = {}) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options };
  const { maxRetries, initialDelay, maxDelay, factor, jitter, onRetry } = config;
  
  let attempt = 0;
  
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      
      if (attempt >= maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        initialDelay * Math.pow(factor, attempt - 1) * (1 + jitter * (Math.random() * 2 - 1)),
        maxDelay
      );
      
      if (onRetry) {
        onRetry(error, attempt, delay);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Validate API response data
 * @param {Object} data - Response data to validate
 * @param {Object} schema - Schema definition
 * @returns {Object} Validation result with isValid and errors
 */
function validateResponseData(data, schema) {
  const errors = [];
  
  // Check if data exists
  if (!data) {
    errors.push('Response data is null or undefined');
    return { isValid: false, errors };
  }
  
  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (data[field] === undefined) {
        errors.push(`Required field '${field}' is missing`);
      }
    }
  }
  
  // Check field types
  if (schema.fields) {
    for (const [field, type] of Object.entries(schema.fields)) {
      if (data[field] !== undefined) {
        if (type === 'array' && !Array.isArray(data[field])) {
          errors.push(`Field '${field}' should be an array`);
        } else if (type !== 'array' && typeof data[field] !== type) {
          errors.push(`Field '${field}' should be of type ${type}`);
        }
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Process items in batches
 * @param {Array} items - Array of items to process
 * @param {Function} processFn - Function to process each batch
 * @param {Object} options - Batch processing options
 * @param {number} options.batchSize - Size of each batch
 * @param {number} options.delayBetweenBatches - Delay between batches in milliseconds
 * @param {Function} options.onBatchComplete - Callback when a batch completes
 * @returns {Promise<Array>} Results from all batches
 */
async function processBatches(items, processFn, options = {}) {
  const { 
    batchSize = 50, 
    delayBetweenBatches = 100,
    onBatchComplete = null
  } = options;
  
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(items.length / batchSize);
    
    try {
      const batchResults = await processFn(batch, batchNumber, totalBatches);
      results.push(...(Array.isArray(batchResults) ? batchResults : [batchResults]));
      
      if (onBatchComplete) {
        onBatchComplete(batchResults, batchNumber, totalBatches);
      }
    } catch (error) {
      throw new Error(`Error processing batch ${batchNumber}/${totalBatches}: ${error.message}`);
    }
    
    // Add delay between batches to avoid overwhelming the database
    if (i + batchSize < items.length && delayBetweenBatches > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  return results;
}

/**
 * Safe database transaction wrapper
 * @param {Object} sequelize - Sequelize instance
 * @param {Function} fn - Function to execute within transaction
 * @returns {Promise<any>} Result of the function
 */
async function withTransaction(sequelize, fn) {
  const transaction = await sequelize.transaction();
  
  try {
    const result = await fn(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  createLogger,
  withRetry,
  validateResponseData,
  processBatches,
  withTransaction
};