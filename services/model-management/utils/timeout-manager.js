/**
 * Timeout Management and Graceful Degradation
 * 
 * Provides comprehensive timeout handling with:
 * - Configurable timeout strategies per operation type
 * - Cascading timeout levels (request, operation, total)
 * - Graceful degradation with fallback mechanisms
 * - Timeout prediction and adaptive adjustment
 * - Resource cleanup on timeout
 */

/**
 * Default timeout configurations for different operation types
 */
const DEFAULT_TIMEOUTS = {
  api_request: {
    request: 30000,      // Individual HTTP request
    operation: 120000,   // Complete operation (may include multiple requests)
    total: 300000       // Total operation including retries
  },
  database: {
    query: 15000,
    transaction: 60000,
    total: 180000
  },
  file_processing: {
    read: 10000,
    write: 30000,
    total: 120000
  },
  model_sync: {
    fetch: 60000,
    process: 180000,
    total: 600000
  },
  health_check: {
    request: 5000,
    operation: 10000,
    total: 15000
  }
};

/**
 * Fallback strategies
 */
const FALLBACK_STRATEGIES = {
  USE_CACHED_DATA: 'use_cached_data',
  USE_DEFAULT_VALUES: 'use_default_values',
  SKIP_OPERATION: 'skip_operation',
  PARTIAL_RESULTS: 'partial_results',
  FAIL_FAST: 'fail_fast',
  RETRY_WITH_LONGER_TIMEOUT: 'retry_longer_timeout'
};

/**
 * Timeout manager class
 */
class TimeoutManager {
  /**
   * @param {Object} config - Timeout configuration
   * @param {Object} logger - Logger instance
   * @param {Object} metrics - Metrics collector instance
   */
  constructor(config = {}, logger = null, metrics = null) {
    this.config = { ...DEFAULT_TIMEOUTS, ...config };
    this.logger = logger || console;
    this.metrics = metrics;
    
    // Track active operations for cleanup
    this.activeOperations = new Map();
    this.timeoutHistory = new Map(); // Track timeout patterns for adaptation
    
    // Setup periodic cleanup
    this.setupPeriodicCleanup();
  }

  /**
   * Execute function with comprehensive timeout handling
   * @param {Function} fn - Function to execute
   * @param {Object} options - Timeout options
   * @param {string} options.operationType - Type of operation (api_request, database, etc.)
   * @param {string} options.operationName - Name for logging and metrics
   * @param {number} options.requestTimeout - Override request timeout
   * @param {number} options.operationTimeout - Override operation timeout
   * @param {number} options.totalTimeout - Override total timeout
   * @param {string} options.fallbackStrategy - Fallback strategy on timeout
   * @param {Function} options.fallbackFunction - Custom fallback function
   * @param {Function} options.onTimeout - Callback on timeout
   * @param {Function} options.cleanup - Cleanup function
   * @returns {Promise<any>} Result of the function or fallback
   */
  async executeWithTimeout(fn, options = {}) {
    const {
      operationType = 'api_request',
      operationName = 'unknown_operation',
      requestTimeout = null,
      operationTimeout = null,
      totalTimeout = null,
      fallbackStrategy = FALLBACK_STRATEGIES.FAIL_FAST,
      fallbackFunction = null,
      onTimeout = null,
      cleanup = null
    } = options;

    // Get timeout configuration
    const timeouts = this.getTimeoutConfig(operationType, {
      requestTimeout,
      operationTimeout,
      totalTimeout
    });

    const operationId = this.generateOperationId(operationName);
    const startTime = Date.now();

    this.logger.debug(`[TimeoutManager] Starting operation: ${operationName}`, {
      operationId,
      operationType,
      timeouts,
      fallbackStrategy
    });

    // Register operation for tracking
    this.registerOperation(operationId, {
      operationName,
      operationType,
      startTime,
      timeouts,
      cleanup
    });

    try {
      // Execute with cascading timeouts
      const result = await this.executeCascadingTimeouts(fn, timeouts, operationId);
      
      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordOperationSuccess(operationType, operationName, duration, timeouts);
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (this.isTimeoutError(error)) {
        this.logger.warn(`[TimeoutManager] Operation timed out: ${operationName}`, {
          operationId,
          duration,
          timeouts,
          error: error.message
        });
        
        // Execute timeout callback
        if (onTimeout) {
          try {
            await onTimeout(error, duration, operationId);
          } catch (callbackError) {
            this.logger.error(`[TimeoutManager] Timeout callback failed: ${operationName}`, callbackError);
          }
        }
        
        // Record timeout metrics
        this.recordOperationTimeout(operationType, operationName, duration, timeouts);
        
        // Execute fallback strategy
        return await this.executeFallbackStrategy(
          fallbackStrategy,
          fallbackFunction,
          error,
          operationId
        );
      }
      
      // Record failure metrics for non-timeout errors
      this.recordOperationFailure(operationType, operationName, duration, error);
      throw error;
      
    } finally {
      // Cleanup operation tracking
      this.unregisterOperation(operationId);
    }
  }

  /**
   * Execute with cascading timeout levels
   * @param {Function} fn - Function to execute
   * @param {Object} timeouts - Timeout configuration
   * @param {string} operationId - Operation ID
   * @returns {Promise<any>} Result of the function
   */
  async executeCascadingTimeouts(fn, timeouts, operationId) {
    const promises = [];
    
    // Create timeout promises for each level
    const totalTimeoutPromise = this.createTimeoutPromise(
      timeouts.total,
      'TOTAL_TIMEOUT',
      operationId
    );
    
    const operationTimeoutPromise = this.createTimeoutPromise(
      timeouts.operation,
      'OPERATION_TIMEOUT',
      operationId
    );

    // Execute main function with operation timeout
    const mainPromise = this.executeWithOperationTimeout(fn, timeouts, operationId);
    
    // Race between main execution and timeout promises
    const raceResult = await Promise.race([
      mainPromise,
      operationTimeoutPromise,
      totalTimeoutPromise
    ]);
    
    return raceResult;
  }

  /**
   * Execute function with operation-level timeout handling
   * @param {Function} fn - Function to execute
   * @param {Object} timeouts - Timeout configuration
   * @param {string} operationId - Operation ID
   * @returns {Promise<any>} Result of the function
   */
  async executeWithOperationTimeout(fn, timeouts, operationId) {
    // If the function expects request timeout (e.g., HTTP requests),
    // we can pass it as a parameter
    if (fn.length > 0) {
      // Function expects parameters, pass timeout as option
      return await fn({ timeout: timeouts.request, operationId });
    } else {
      // Function doesn't expect parameters, execute normally
      return await fn();
    }
  }

  /**
   * Create a timeout promise that rejects after specified time
   * @param {number} timeout - Timeout in milliseconds
   * @param {string} type - Timeout type for error message
   * @param {string} operationId - Operation ID
   * @returns {Promise} Promise that rejects on timeout
   */
  createTimeoutPromise(timeout, type, operationId) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(`${type}: Operation timed out after ${timeout}ms`);
        error.name = 'TimeoutError';
        error.type = type;
        error.timeout = timeout;
        error.operationId = operationId;
        reject(error);
      }, timeout);
    });
  }

  /**
   * Execute fallback strategy on timeout
   * @param {string} strategy - Fallback strategy
   * @param {Function} fallbackFunction - Custom fallback function
   * @param {Error} timeoutError - Original timeout error
   * @param {string} operationId - Operation ID
   * @returns {Promise<any>} Fallback result
   */
  async executeFallbackStrategy(strategy, fallbackFunction, timeoutError, operationId) {
    this.logger.info(`[TimeoutManager] Executing fallback strategy: ${strategy}`, {
      operationId,
      timeoutType: timeoutError.type
    });

    switch (strategy) {
      case FALLBACK_STRATEGIES.USE_CACHED_DATA:
        return await this.getCachedData(operationId);
        
      case FALLBACK_STRATEGIES.USE_DEFAULT_VALUES:
        return this.getDefaultValues(operationId);
        
      case FALLBACK_STRATEGIES.SKIP_OPERATION:
        this.logger.info(`[TimeoutManager] Skipping operation due to timeout: ${operationId}`);
        return null;
        
      case FALLBACK_STRATEGIES.PARTIAL_RESULTS:
        return await this.getPartialResults(operationId);
        
      case FALLBACK_STRATEGIES.FAIL_FAST:
        throw timeoutError;
        
      case FALLBACK_STRATEGIES.RETRY_WITH_LONGER_TIMEOUT:
        throw new Error('RETRY_WITH_LONGER_TIMEOUT strategy should be handled by RetryManager');
        
      default:
        if (fallbackFunction) {
          return await fallbackFunction(timeoutError, operationId);
        }
        throw timeoutError;
    }
  }

  /**
   * Get timeout configuration for operation type
   * @param {string} operationType - Operation type
   * @param {Object} overrides - Timeout overrides
   * @returns {Object} Timeout configuration
   */
  getTimeoutConfig(operationType, overrides = {}) {
    const baseConfig = this.config[operationType] || this.config.api_request;
    
    return {
      request: overrides.requestTimeout || baseConfig.request,
      operation: overrides.operationTimeout || baseConfig.operation,
      total: overrides.totalTimeout || baseConfig.total
    };
  }

  /**
   * Register operation for tracking and cleanup
   * @param {string} operationId - Operation ID
   * @param {Object} operationData - Operation metadata
   */
  registerOperation(operationId, operationData) {
    this.activeOperations.set(operationId, {
      ...operationData,
      registeredAt: Date.now()
    });
  }

  /**
   * Unregister operation
   * @param {string} operationId - Operation ID
   */
  unregisterOperation(operationId) {
    const operation = this.activeOperations.get(operationId);
    if (operation && operation.cleanup) {
      try {
        operation.cleanup();
      } catch (error) {
        this.logger.error(`[TimeoutManager] Cleanup failed for operation: ${operationId}`, error);
      }
    }
    
    this.activeOperations.delete(operationId);
  }

  /**
   * Check if error is a timeout error
   * @param {Error} error - Error to check
   * @returns {boolean} Whether error is timeout-related
   */
  isTimeoutError(error) {
    return error.name === 'TimeoutError' ||
           error.message.includes('timeout') ||
           error.message.includes('timed out') ||
           error.code === 'ETIMEDOUT' ||
           error.code === 'ECONNABORTED';
  }

  /**
   * Get cached data for fallback
   * @param {string} operationId - Operation ID
   * @returns {Promise<any>} Cached data or null
   */
  async getCachedData(operationId) {
    // Implementation would depend on caching strategy
    this.logger.info(`[TimeoutManager] Attempting to retrieve cached data for: ${operationId}`);
    // For now, return null - this would be implemented based on specific caching needs
    return null;
  }

  /**
   * Get default values for fallback
   * @param {string} operationId - Operation ID
   * @returns {any} Default values
   */
  getDefaultValues(operationId) {
    this.logger.info(`[TimeoutManager] Using default values for: ${operationId}`);
    // Return sensible defaults based on operation type
    return {
      success: false,
      data: [],
      message: 'Operation timed out, using default values'
    };
  }

  /**
   * Get partial results if available
   * @param {string} operationId - Operation ID
   * @returns {Promise<any>} Partial results or null
   */
  async getPartialResults(operationId) {
    this.logger.info(`[TimeoutManager] Attempting to retrieve partial results for: ${operationId}`);
    // This would be implemented based on specific operation requirements
    return null;
  }

  /**
   * Record successful operation metrics
   * @param {string} operationType - Operation type
   * @param {string} operationName - Operation name
   * @param {number} duration - Operation duration
   * @param {Object} timeouts - Timeout configuration used
   */
  recordOperationSuccess(operationType, operationName, duration, timeouts) {
    if (this.metrics) {
      this.metrics.recordTimeoutSuccess(operationType, operationName, duration, timeouts);
    }
    
    // Update timeout history for adaptation
    this.updateTimeoutHistory(operationType, operationName, duration, 'SUCCESS');
  }

  /**
   * Record operation timeout metrics
   * @param {string} operationType - Operation type
   * @param {string} operationName - Operation name
   * @param {number} duration - Operation duration before timeout
   * @param {Object} timeouts - Timeout configuration used
   */
  recordOperationTimeout(operationType, operationName, duration, timeouts) {
    if (this.metrics) {
      this.metrics.recordTimeoutFailure(operationType, operationName, duration, timeouts);
    }
    
    // Update timeout history for adaptation
    this.updateTimeoutHistory(operationType, operationName, duration, 'TIMEOUT');
  }

  /**
   * Record operation failure metrics
   * @param {string} operationType - Operation type
   * @param {string} operationName - Operation name
   * @param {number} duration - Operation duration
   * @param {Error} error - Error that occurred
   */
  recordOperationFailure(operationType, operationName, duration, error) {
    if (this.metrics) {
      this.metrics.recordTimeoutError(operationType, operationName, duration, error);
    }
  }

  /**
   * Update timeout history for adaptive timeout adjustment
   * @param {string} operationType - Operation type
   * @param {string} operationName - Operation name
   * @param {number} duration - Operation duration
   * @param {string} result - Operation result (SUCCESS, TIMEOUT, ERROR)
   */
  updateTimeoutHistory(operationType, operationName, duration, result) {
    const key = `${operationType}_${operationName}`;
    
    if (!this.timeoutHistory.has(key)) {
      this.timeoutHistory.set(key, {
        operations: [],
        averageDuration: 0,
        timeoutRate: 0,
        lastUpdated: Date.now()
      });
    }
    
    const history = this.timeoutHistory.get(key);
    history.operations.push({ duration, result, timestamp: Date.now() });
    
    // Keep only last 100 operations
    if (history.operations.length > 100) {
      history.operations = history.operations.slice(-100);
    }
    
    // Recalculate statistics
    const successfulOps = history.operations.filter(op => op.result === 'SUCCESS');
    const timeoutOps = history.operations.filter(op => op.result === 'TIMEOUT');
    
    history.averageDuration = successfulOps.length > 0 ?
      successfulOps.reduce((sum, op) => sum + op.duration, 0) / successfulOps.length : 0;
    
    history.timeoutRate = history.operations.length > 0 ?
      timeoutOps.length / history.operations.length : 0;
    
    history.lastUpdated = Date.now();
  }

  /**
   * Get suggested timeouts based on historical data
   * @param {string} operationType - Operation type
   * @param {string} operationName - Operation name
   * @returns {Object} Suggested timeout configuration
   */
  getSuggestedTimeouts(operationType, operationName) {
    const key = `${operationType}_${operationName}`;
    const history = this.timeoutHistory.get(key);
    
    if (!history || history.operations.length < 10) {
      // Not enough data, return defaults
      return this.getTimeoutConfig(operationType);
    }
    
    const baseTimeouts = this.getTimeoutConfig(operationType);
    const avgDuration = history.averageDuration;
    
    // Adjust timeouts based on historical performance
    const suggestedRequest = Math.max(avgDuration * 1.5, baseTimeouts.request * 0.8);
    const suggestedOperation = Math.max(avgDuration * 2, baseTimeouts.operation * 0.8);
    const suggestedTotal = Math.max(avgDuration * 3, baseTimeouts.total * 0.8);
    
    return {
      request: Math.round(suggestedRequest),
      operation: Math.round(suggestedOperation),
      total: Math.round(suggestedTotal),
      confidence: Math.min(history.operations.length / 50, 1), // Confidence score 0-1
      basedOnSamples: history.operations.length
    };
  }

  /**
   * Setup periodic cleanup of stale operations
   */
  setupPeriodicCleanup() {
    setInterval(() => {
      this.cleanupStaleOperations();
    }, 60000); // Run every minute
  }

  /**
   * Cleanup operations that have been running too long
   */
  cleanupStaleOperations() {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes
    
    for (const [operationId, operation] of this.activeOperations) {
      if (now - operation.registeredAt > staleThreshold) {
        this.logger.warn(`[TimeoutManager] Cleaning up stale operation: ${operationId}`, {
          operationName: operation.operationName,
          runningTime: now - operation.registeredAt
        });
        
        this.unregisterOperation(operationId);
      }
    }
  }

  /**
   * Generate unique operation ID
   * @param {string} operationName - Operation name
   * @returns {string} Operation ID
   */
  generateOperationId(operationName) {
    return `${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current statistics
   * @returns {Object} Timeout manager statistics
   */
  getStats() {
    return {
      activeOperations: this.activeOperations.size,
      timeoutHistory: Array.from(this.timeoutHistory.entries()).map(([key, history]) => ({
        operation: key,
        samples: history.operations.length,
        averageDuration: Math.round(history.averageDuration),
        timeoutRate: Math.round(history.timeoutRate * 100) / 100,
        lastUpdated: history.lastUpdated
      })),
      config: this.config
    };
  }

  /**
   * Reset timeout history and statistics
   */
  reset() {
    this.timeoutHistory.clear();
    this.activeOperations.clear();
    this.logger.info('[TimeoutManager] Statistics and history reset');
  }
}

module.exports = { TimeoutManager, FALLBACK_STRATEGIES };