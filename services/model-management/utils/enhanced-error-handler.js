/**
 * Enhanced Error Handler - Integration of all error handling components
 * 
 * Provides a unified interface for:
 * - Retry management with exponential backoff
 * - Circuit breaker protection
 * - Error classification and handling strategies
 * - Timeout management and graceful degradation
 * - Comprehensive logging and metrics
 */

const RetryManager = require('./retry-manager');
const { CircuitBreaker } = require('./circuit-breaker');
const { ErrorClassifier } = require('./error-classifier');
const { TimeoutManager } = require('./timeout-manager');

/**
 * Default configuration for enhanced error handler
 */
const DEFAULT_CONFIG = {
  retry: {
    maxRetries: 3,
    initialDelay: 2000,
    maxDelay: 30000,
    factor: 2,
    jitter: 0.1
  },
  circuitBreaker: {
    failureThreshold: 5,
    failureRate: 0.5,
    resetTimeout: 60000,
    monitoringPeriod: 30000,
    halfOpenMaxRequests: 3
  },
  timeout: {
    api_request: {
      request: 30000,
      operation: 120000,
      total: 300000
    }
  },
  fallbackStrategies: {
    network_error: 'USE_CACHED_DATA',
    timeout_error: 'USE_CACHED_DATA',
    server_error: 'USE_CACHED_DATA',
    authentication_error: 'FAIL_FAST',
    rate_limit_error: 'QUEUE_REQUEST'
  }
};

/**
 * Enhanced error handler class
 */
class EnhancedErrorHandler {
  /**
   * @param {Object} config - Error handler configuration
   * @param {Object} logger - Logger instance
   * @param {Object} metrics - Metrics collector instance
   */
  constructor(config = {}, logger = null, metrics = null) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger || console;
    this.metrics = metrics;

    // Initialize error handling components
    this.retryManager = new RetryManager(this.config.retry, logger, metrics);
    this.errorClassifier = new ErrorClassifier(logger);
    this.timeoutManager = new TimeoutManager(this.config.timeout, logger, metrics);
    
    // Circuit breakers per provider (lazy initialization)
    this.circuitBreakers = new Map();

    this.logger.info('[EnhancedErrorHandler] Initialized with comprehensive error handling');
  }

  /**
   * Execute operation with full error handling protection
   * @param {Function} operation - Operation to execute
   * @param {Object} options - Execution options
   * @param {string} options.provider - Provider name (for circuit breaker)
   * @param {string} options.operationType - Type of operation (api_request, database, etc.)
   * @param {string} options.operationName - Name for logging and metrics
   * @param {boolean} options.enableRetry - Enable retry mechanism (default: true)
   * @param {boolean} options.enableCircuitBreaker - Enable circuit breaker (default: true)
   * @param {boolean} options.enableTimeout - Enable timeout management (default: true)
   * @param {Object} options.retryOptions - Override retry configuration
   * @param {Object} options.timeoutOptions - Override timeout configuration
   * @param {Function} options.fallbackFunction - Custom fallback function
   * @param {Function} options.onError - Error callback
   * @param {Function} options.onSuccess - Success callback
   * @returns {Promise<any>} Result of the operation
   */
  async execute(operation, options = {}) {
    const {
      provider = 'unknown',
      operationType = 'api_request',
      operationName = 'unknown_operation',
      enableRetry = true,
      enableCircuitBreaker = true,
      enableTimeout = true,
      retryOptions = {},
      timeoutOptions = {},
      fallbackFunction = null,
      onError = null,
      onSuccess = null
    } = options;

    const executionId = this.generateExecutionId(provider, operationName);
    const startTime = Date.now();

    this.logger.debug(`[EnhancedErrorHandler] Starting protected execution: ${operationName}`, {
      executionId,
      provider,
      operationType,
      features: {
        retry: enableRetry,
        circuitBreaker: enableCircuitBreaker,
        timeout: enableTimeout
      }
    });

    try {
      // Build the execution chain
      let wrappedOperation = operation;

      // Layer 1: Timeout Management
      if (enableTimeout) {
        wrappedOperation = () => this.executeWithTimeoutProtection(
          operation,
          operationType,
          operationName,
          timeoutOptions,
          fallbackFunction
        );
      }

      // Layer 2: Circuit Breaker Protection
      if (enableCircuitBreaker) {
        const circuitBreaker = this.getOrCreateCircuitBreaker(provider);
        const originalOperation = wrappedOperation;
        wrappedOperation = () => circuitBreaker.execute(originalOperation, {
          fallback: fallbackFunction
        });
      }

      // Layer 3: Retry Management
      if (enableRetry) {
        const originalOperation = wrappedOperation;
        wrappedOperation = () => this.retryManager.execute(originalOperation, {
          operationName: `${provider}_${operationName}`,
          retryConfig: retryOptions,
          shouldRetry: (error, attempt, classification) => 
            this.shouldRetryWithClassification(error, attempt, classification, provider),
          onRetry: (error, attempt, delay, operationId) =>
            this.handleRetry(error, attempt, delay, operationId, provider),
          onFailure: (error, errors, operationId) =>
            this.handleFailure(error, errors, operationId, provider, onError)
        });
      }

      // Execute the wrapped operation
      const result = await wrappedOperation();

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordSuccess(provider, operationType, operationName, duration);

      if (onSuccess) {
        try {
          await onSuccess(result, duration, executionId);
        } catch (callbackError) {
          this.logger.error(`[EnhancedErrorHandler] Success callback failed: ${operationName}`, callbackError);
        }
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Classify the error
      const classification = this.errorClassifier.classify(error, {
        provider,
        operation: operationName,
        requestId: executionId
      });

      this.logger.error(`[EnhancedErrorHandler] Operation failed: ${operationName}`, {
        executionId,
        provider,
        errorType: classification.type.name,
        errorMessage: error.message,
        duration,
        retryable: classification.retryable,
        severity: classification.severity
      });

      // Record failure metrics
      this.recordFailure(provider, operationType, operationName, duration, classification);

      // Execute error callback
      if (onError) {
        try {
          await onError(error, classification, duration, executionId);
        } catch (callbackError) {
          this.logger.error(`[EnhancedErrorHandler] Error callback failed: ${operationName}`, callbackError);
        }
      }

      throw error;
    }
  }

  /**
   * Execute operation with timeout protection
   * @param {Function} operation - Operation to execute
   * @param {string} operationType - Operation type
   * @param {string} operationName - Operation name
   * @param {Object} timeoutOptions - Timeout options
   * @param {Function} fallbackFunction - Fallback function
   * @returns {Promise<any>} Result of the operation
   */
  async executeWithTimeoutProtection(operation, operationType, operationName, timeoutOptions, fallbackFunction) {
    return await this.timeoutManager.executeWithTimeout(operation, {
      operationType,
      operationName,
      ...timeoutOptions,
      fallbackFunction,
      onTimeout: (error, duration, operationId) => {
        this.logger.warn(`[EnhancedErrorHandler] Operation timed out: ${operationName}`, {
          operationId,
          duration,
          timeout: error.timeout
        });
      }
    });
  }

  /**
   * Get or create circuit breaker for provider
   * @param {string} provider - Provider name
   * @returns {CircuitBreaker} Circuit breaker instance
   */
  getOrCreateCircuitBreaker(provider) {
    if (!this.circuitBreakers.has(provider)) {
      const circuitBreaker = new CircuitBreaker(
        provider,
        this.config.circuitBreaker,
        this.logger,
        this.metrics
      );
      this.circuitBreakers.set(provider, circuitBreaker);
    }
    return this.circuitBreakers.get(provider);
  }

  /**
   * Enhanced retry decision with error classification
   * @param {Error} error - Error that occurred
   * @param {number} attempt - Current attempt number
   * @param {Object} classification - Error classification
   * @param {string} provider - Provider name
   * @returns {boolean} Whether to retry
   */
  shouldRetryWithClassification(error, attempt, classification, provider) {
    // Get circuit breaker state
    const circuitBreaker = this.circuitBreakers.get(provider);
    const circuitState = circuitBreaker ? circuitBreaker.getState() : 'CLOSED';

    // Don't retry if circuit is open (it will handle its own retry logic)
    if (circuitState === 'OPEN') {
      return false;
    }

    // Use classification to determine retryability
    return classification.retryable;
  }

  /**
   * Handle retry attempt
   * @param {Error} error - Error that triggered retry
   * @param {number} attempt - Attempt number
   * @param {number} delay - Delay before retry
   * @param {string} operationId - Operation ID
   * @param {string} provider - Provider name
   */
  handleRetry(error, attempt, delay, operationId, provider) {
    this.logger.info(`[EnhancedErrorHandler] Retrying operation for ${provider}`, {
      operationId,
      attempt,
      delay,
      error: error.message
    });

    if (this.metrics) {
      this.metrics.recordRetryAttempt(provider, attempt, delay);
    }
  }

  /**
   * Handle final failure after exhausting retries
   * @param {Error} error - Final error
   * @param {Array} errors - All error attempts
   * @param {string} operationId - Operation ID
   * @param {string} provider - Provider name
   * @param {Function} onError - Error callback
   */
  async handleFailure(error, errors, operationId, provider, onError) {
    this.logger.error(`[EnhancedErrorHandler] Operation failed after retries for ${provider}`, {
      operationId,
      totalAttempts: errors.length,
      finalError: error.message
    });

    if (this.metrics) {
      this.metrics.recordRetryExhaustion(provider, errors.length);
    }
  }

  /**
   * Record successful operation metrics
   * @param {string} provider - Provider name
   * @param {string} operationType - Operation type
   * @param {string} operationName - Operation name
   * @param {number} duration - Operation duration
   */
  recordSuccess(provider, operationType, operationName, duration) {
    if (this.metrics) {
      this.metrics.recordOperationSuccess(provider, operationType, operationName, duration);
    }
  }

  /**
   * Record failed operation metrics
   * @param {string} provider - Provider name
   * @param {string} operationType - Operation type
   * @param {string} operationName - Operation name
   * @param {number} duration - Operation duration
   * @param {Object} classification - Error classification
   */
  recordFailure(provider, operationType, operationName, duration, classification) {
    if (this.metrics) {
      this.metrics.recordOperationFailure(
        provider,
        operationType,
        operationName,
        duration,
        classification.type.name,
        classification.severity
      );
    }
  }

  /**
   * Get health status for all providers
   * @returns {Object} Health status for all providers
   */
  getHealthStatus() {
    const status = {
      overall: 'HEALTHY',
      providers: {},
      components: {
        retryManager: this.retryManager.getStats(),
        timeoutManager: this.timeoutManager.getStats(),
        errorClassifier: { active: true }
      },
      timestamp: Date.now()
    };

    let hasUnhealthyProvider = false;

    // Check each circuit breaker
    for (const [provider, circuitBreaker] of this.circuitBreakers) {
      const stats = circuitBreaker.getStats();
      status.providers[provider] = {
        state: stats.state,
        isHealthy: stats.isHealthy,
        stats: stats.stats,
        lastStateChange: stats.lastStateChange
      };

      if (!stats.isHealthy) {
        hasUnhealthyProvider = true;
      }
    }

    // Update overall status
    if (hasUnhealthyProvider) {
      status.overall = 'DEGRADED';
    }

    // Check if any circuit breakers are open
    const openCircuits = Array.from(this.circuitBreakers.values())
      .filter(cb => cb.getState() === 'OPEN');

    if (openCircuits.length > 0) {
      status.overall = 'UNHEALTHY';
      status.openCircuits = openCircuits.map(cb => cb.name);
    }

    return status;
  }

  /**
   * Reset all components (useful for testing)
   */
  reset() {
    this.retryManager.resetStats();
    this.timeoutManager.reset();
    
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.resetStats();
    }
    
    this.circuitBreakers.clear();
    
    this.logger.info('[EnhancedErrorHandler] All components reset');
  }

  /**
   * Get comprehensive statistics
   * @returns {Object} Statistics from all components
   */
  getStats() {
    return {
      retryManager: this.retryManager.getStats(),
      timeoutManager: this.timeoutManager.getStats(),
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([name, cb]) => ({
        name,
        ...cb.getStats()
      })),
      config: this.config
    };
  }

  /**
   * Generate unique execution ID
   * @param {string} provider - Provider name
   * @param {string} operationName - Operation name
   * @returns {string} Execution ID
   */
  generateExecutionId(provider, operationName) {
    return `${provider}_${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = EnhancedErrorHandler;