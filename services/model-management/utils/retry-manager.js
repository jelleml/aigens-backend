/**
 * Enhanced Retry Manager with exponential backoff, jitter, and circuit breaker integration
 * 
 * Provides advanced retry capabilities with:
 * - Configurable retry strategies
 * - Exponential backoff with jitter
 * - Error classification and selective retrying
 * - Circuit breaker integration
 * - Detailed metrics and logging
 */

/**
 * Default configuration for retry operations
 */
const DEFAULT_CONFIG = {
  maxRetries: 3,
  initialDelay: 2000,
  maxDelay: 30000,
  factor: 2,
  jitter: 0.1,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT', 
    'ENOTFOUND',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'HTTP_429',
    'HTTP_5XX'
  ],
  nonRetryableErrors: [
    'HTTP_400',
    'HTTP_401',
    'HTTP_403', 
    'HTTP_404',
    'INVALID_API_KEY',
    'SCHEMA_VALIDATION_ERROR'
  ]
};

/**
 * Enhanced retry manager class
 */
class RetryManager {
  /**
   * @param {Object} config - Retry configuration
   * @param {Object} logger - Logger instance
   * @param {Object} metrics - Metrics collector instance
   */
  constructor(config = {}, logger = null, metrics = null) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger || console;
    this.metrics = metrics;
    this.attemptMetrics = new Map(); // Track retry attempts per operation
  }

  /**
   * Execute a function with retry logic
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @param {string} options.operationName - Name for logging and metrics
   * @param {Object} options.retryConfig - Override retry configuration
   * @param {Function} options.shouldRetry - Custom retry decision function
   * @param {Function} options.onRetry - Callback on retry attempt
   * @param {Function} options.onFailure - Callback on final failure
   * @returns {Promise<any>} Result of the function
   */
  async execute(fn, options = {}) {
    const {
      operationName = 'unknown_operation',
      retryConfig = {},
      shouldRetry = null,
      onRetry = null,
      onFailure = null
    } = options;

    const config = { ...this.config, ...retryConfig };
    const operationId = `${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let attempt = 0;
    let errors = [];
    const startTime = Date.now();

    this.logger.debug(`[RetryManager] Starting operation: ${operationName}`, {
      operationId,
      config: {
        maxRetries: config.maxRetries,
        initialDelay: config.initialDelay,
        maxDelay: config.maxDelay
      }
    });

    while (attempt <= config.maxRetries) {
      const attemptStartTime = Date.now();
      
      try {
        const result = await fn();
        
        // Success - record metrics and return result
        const totalTime = Date.now() - startTime;
        const attemptTime = Date.now() - attemptStartTime;
        
        this.recordSuccess(operationName, operationId, attempt, totalTime, attemptTime);
        
        if (attempt > 0) {
          this.logger.info(`[RetryManager] Operation succeeded after ${attempt} retries: ${operationName}`, {
            operationId,
            totalAttempts: attempt + 1,
            totalTime,
            attemptTime
          });
        }
        
        return result;
        
      } catch (error) {
        const attemptTime = Date.now() - attemptStartTime;
        errors.push({ attempt, error, attemptTime });
        
        // Classify error and determine if we should retry
        const errorClassification = this.classifyError(error);
        const shouldRetryDecision = shouldRetry ? 
          shouldRetry(error, attempt, errorClassification) : 
          this.shouldRetryError(error, attempt, errorClassification);
        
        this.logger.debug(`[RetryManager] Attempt ${attempt + 1} failed: ${operationName}`, {
          operationId,
          error: error.message,
          errorType: errorClassification.type,
          shouldRetry: shouldRetryDecision,
          attemptTime
        });

        // If this is the last attempt or error is not retryable
        if (attempt >= config.maxRetries || !shouldRetryDecision) {
          const totalTime = Date.now() - startTime;
          this.recordFailure(operationName, operationId, errors, totalTime);
          
          if (onFailure) {
            onFailure(error, errors, operationId);
          }
          
          // Create enhanced error with retry context
          const enhancedError = this.createEnhancedError(error, errors, operationName, operationId);
          throw enhancedError;
        }
        
        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt, config);
        
        this.logger.warn(`[RetryManager] Retrying operation ${operationName} in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`, {
          operationId,
          error: error.message,
          delay,
          nextAttempt: attempt + 2
        });
        
        if (onRetry) {
          onRetry(error, attempt + 1, delay, operationId);
        }
        
        // Wait before retry
        await this.sleep(delay);
        attempt++;
      }
    }
  }

  /**
   * Classify error type for retry decision making
   * @param {Error} error - Error to classify
   * @returns {Object} Error classification
   */
  classifyError(error) {
    const errorMessage = error.message || '';
    const errorCode = error.code || '';
    const httpStatus = error.response?.status;

    // Network errors (usually retryable)
    if (this.config.retryableErrors.some(code => 
        errorCode.includes(code) || errorMessage.includes(code))) {
      return {
        type: 'NETWORK_ERROR',
        retryable: true,
        severity: 'medium',
        description: 'Network connectivity or timeout error'
      };
    }

    // HTTP status-based classification
    if (httpStatus) {
      if (httpStatus === 429) {
        return {
          type: 'RATE_LIMIT',
          retryable: true,
          severity: 'low',
          description: 'Rate limit exceeded'
        };
      }
      
      if (httpStatus >= 500) {
        return {
          type: 'SERVER_ERROR',
          retryable: true,
          severity: 'high',
          description: 'Server-side error'
        };
      }
      
      if (httpStatus >= 400 && httpStatus < 500) {
        return {
          type: 'CLIENT_ERROR',
          retryable: false,
          severity: 'high',
          description: 'Client-side error (authentication, validation, etc.)'
        };
      }
    }

    // Non-retryable errors
    if (this.config.nonRetryableErrors.some(code => 
        errorCode.includes(code) || errorMessage.includes(code))) {
      return {
        type: 'CLIENT_ERROR',
        retryable: false,
        severity: 'high',
        description: 'Non-retryable client error'
      };
    }

    // Unknown error - be conservative and don't retry
    return {
      type: 'UNKNOWN_ERROR',
      retryable: false,
      severity: 'high',
      description: 'Unknown error type'
    };
  }

  /**
   * Determine if an error should be retried
   * @param {Error} error - Error to evaluate
   * @param {number} attempt - Current attempt number
   * @param {Object} classification - Error classification
   * @returns {boolean} Should retry the operation
   */
  shouldRetryError(error, attempt, classification) {
    // Don't retry if we've exceeded max attempts
    if (attempt >= this.config.maxRetries) {
      return false;
    }

    // Check if error type is retryable
    return classification.retryable;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   * @param {number} attempt - Current attempt number
   * @param {Object} config - Retry configuration
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attempt, config) {
    const { initialDelay, maxDelay, factor, jitter } = config;
    
    // Calculate base delay with exponential backoff
    const baseDelay = initialDelay * Math.pow(factor, attempt);
    
    // Add jitter to prevent thundering herd
    const jitterAmount = baseDelay * jitter * (Math.random() * 2 - 1);
    const delayWithJitter = baseDelay + jitterAmount;
    
    // Ensure delay doesn't exceed maximum
    return Math.min(Math.max(delayWithJitter, 0), maxDelay);
  }

  /**
   * Create enhanced error with retry context
   * @param {Error} originalError - Original error
   * @param {Array} errors - All errors from retry attempts
   * @param {string} operationName - Operation name
   * @param {string} operationId - Operation ID
   * @returns {Error} Enhanced error
   */
  createEnhancedError(originalError, errors, operationName, operationId) {
    const enhancedError = new Error(
      `Operation "${operationName}" failed after ${errors.length} attempts: ${originalError.message}`
    );
    
    enhancedError.name = 'RetryExhaustedException';
    enhancedError.originalError = originalError;
    enhancedError.retryContext = {
      operationName,
      operationId,
      totalAttempts: errors.length,
      attempts: errors.map(({ attempt, error, attemptTime }) => ({
        attempt,
        error: error.message,
        errorType: this.classifyError(error).type,
        attemptTime
      }))
    };
    
    return enhancedError;
  }

  /**
   * Record successful operation metrics
   * @param {string} operationName - Operation name
   * @param {string} operationId - Operation ID
   * @param {number} attempts - Number of attempts made
   * @param {number} totalTime - Total execution time
   * @param {number} attemptTime - Time for final attempt
   */
  recordSuccess(operationName, operationId, attempts, totalTime, attemptTime) {
    if (this.metrics) {
      this.metrics.recordRetrySuccess(operationName, attempts, totalTime, attemptTime);
    }
    
    this.logger.debug(`[RetryManager] Operation successful: ${operationName}`, {
      operationId,
      totalAttempts: attempts + 1,
      totalTime,
      finalAttemptTime: attemptTime
    });
  }

  /**
   * Record failed operation metrics
   * @param {string} operationName - Operation name
   * @param {string} operationId - Operation ID
   * @param {Array} errors - All errors from retry attempts
   * @param {number} totalTime - Total execution time
   */
  recordFailure(operationName, operationId, errors, totalTime) {
    if (this.metrics) {
      this.metrics.recordRetryFailure(operationName, errors.length, totalTime);
    }
    
    this.logger.error(`[RetryManager] Operation failed: ${operationName}`, {
      operationId,
      totalAttempts: errors.length,
      totalTime,
      errors: errors.map(({ attempt, error }) => ({
        attempt,
        error: error.message
      }))
    });
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get retry statistics for monitoring
   * @returns {Object} Retry statistics
   */
  getStats() {
    return {
      config: this.config,
      activeOperations: this.attemptMetrics.size
    };
  }

  /**
   * Reset retry statistics
   */
  resetStats() {
    this.attemptMetrics.clear();
  }
}

module.exports = RetryManager;