/**
 * Circuit Breaker Pattern Implementation
 * 
 * Provides protection against cascading failures by:
 * - Monitoring failure rates and response times
 * - Opening circuit when failure threshold is exceeded
 * - Allowing periodic test requests during recovery
 * - Automatic circuit reset when service recovers
 * - Detailed state tracking and metrics
 */

/**
 * Circuit breaker states
 */
const STATES = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Circuit is open, failing fast
  HALF_OPEN: 'HALF_OPEN' // Testing if service has recovered
};

/**
 * Default configuration for circuit breaker
 */
const DEFAULT_CONFIG = {
  failureThreshold: 5,           // Number of failures to trigger open state
  failureRate: 0.5,              // Failure rate (0-1) to trigger open state
  resetTimeout: 60000,           // Time to wait before transitioning to HALF_OPEN (ms)
  monitoringPeriod: 30000,       // Time window for monitoring (ms)
  halfOpenMaxRequests: 3,        // Max requests to allow in HALF_OPEN state
  responseTimeThreshold: 10000,  // Response time threshold (ms)
  minRequestsForStats: 10        // Minimum requests before calculating failure rate
};

/**
 * Circuit breaker class
 */
class CircuitBreaker {
  /**
   * @param {string} name - Circuit breaker name (typically provider name)
   * @param {Object} config - Circuit breaker configuration
   * @param {Object} logger - Logger instance
   * @param {Object} metrics - Metrics collector instance
   */
  constructor(name, config = {}, logger = null, metrics = null) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger || console;
    this.metrics = metrics;
    
    // Circuit state
    this.state = STATES.CLOSED;
    this.lastFailureTime = null;
    this.lastStateChangeTime = Date.now();
    
    // Statistics tracking
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      consecutiveFailures: 0,
      lastResetTime: Date.now()
    };
    
    // Request tracking for monitoring period
    this.recentRequests = [];
    this.halfOpenRequestCount = 0;
    
    this.logger.info(`[CircuitBreaker:${this.name}] Initialized`, {
      config: this.config,
      state: this.state
    });
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @param {number} options.timeout - Request timeout (overrides default)
   * @param {Function} options.fallback - Fallback function if circuit is open
   * @returns {Promise<any>} Result of the function or fallback
   */
  async execute(fn, options = {}) {
    const { timeout = this.config.responseTimeThreshold, fallback = null } = options;
    
    // Check if circuit should allow request
    if (!this.canExecute()) {
      this.logger.warn(`[CircuitBreaker:${this.name}] Circuit is OPEN, rejecting request`, {
        state: this.state,
        consecutiveFailures: this.stats.consecutiveFailures,
        lastFailureTime: this.lastFailureTime
      });
      
      if (fallback) {
        this.logger.info(`[CircuitBreaker:${this.name}] Executing fallback function`);
        return await fallback();
      }
      
      throw new Error(`Circuit breaker for ${this.name} is OPEN. Service may be unavailable.`);
    }

    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn, timeout, requestId);
      const responseTime = Date.now() - startTime;
      
      // Record successful execution
      this.recordSuccess(responseTime, requestId);
      
      return result;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Record failure
      this.recordFailure(error, responseTime, requestId);
      
      throw error;
    }
  }

  /**
   * Check if the circuit breaker allows execution
   * @returns {boolean} Whether execution is allowed
   */
  canExecute() {
    const now = Date.now();
    
    switch (this.state) {
      case STATES.CLOSED:
        return true;
        
      case STATES.OPEN:
        // Check if enough time has passed to try HALF_OPEN
        if (now - this.lastFailureTime >= this.config.resetTimeout) {
          this.transitionTo(STATES.HALF_OPEN);
          this.halfOpenRequestCount = 0;
          return true;
        }
        return false;
        
      case STATES.HALF_OPEN:
        // Allow limited requests in HALF_OPEN state
        return this.halfOpenRequestCount < this.config.halfOpenMaxRequests;
        
      default:
        return false;
    }
  }

  /**
   * Execute function with timeout
   * @param {Function} fn - Function to execute
   * @param {number} timeout - Timeout in milliseconds
   * @param {string} requestId - Request ID for logging
   * @returns {Promise<any>} Result of the function
   */
  async executeWithTimeout(fn, timeout, requestId) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      try {
        const result = await fn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Record successful execution
   * @param {number} responseTime - Response time in milliseconds
   * @param {string} requestId - Request ID
   */
  recordSuccess(responseTime, requestId) {
    this.stats.totalRequests++;
    this.stats.successfulRequests++;
    this.stats.totalResponseTime += responseTime;
    this.stats.averageResponseTime = this.stats.totalResponseTime / this.stats.totalRequests;
    this.stats.consecutiveFailures = 0; // Reset consecutive failures
    
    // Add to recent requests for monitoring
    this.addRecentRequest(true, responseTime);
    
    this.logger.debug(`[CircuitBreaker:${this.name}] Request succeeded`, {
      requestId,
      responseTime,
      state: this.state,
      stats: {
        totalRequests: this.stats.totalRequests,
        successRate: this.getSuccessRate(),
        averageResponseTime: Math.round(this.stats.averageResponseTime)
      }
    });

    // Handle HALF_OPEN state transitions
    if (this.state === STATES.HALF_OPEN) {
      this.halfOpenRequestCount++;
      
      // If we've had enough successful requests in HALF_OPEN, close the circuit
      if (this.halfOpenRequestCount >= this.config.halfOpenMaxRequests) {
        this.transitionTo(STATES.CLOSED);
        this.resetStats();
      }
    }
    
    if (this.metrics) {
      this.metrics.recordCircuitBreakerSuccess(this.name, responseTime);
    }
  }

  /**
   * Record failed execution
   * @param {Error} error - Error that occurred
   * @param {number} responseTime - Response time in milliseconds
   * @param {string} requestId - Request ID
   */
  recordFailure(error, responseTime, requestId) {
    this.stats.totalRequests++;
    this.stats.failedRequests++;
    this.stats.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    
    // Add to recent requests for monitoring
    this.addRecentRequest(false, responseTime);
    
    this.logger.warn(`[CircuitBreaker:${this.name}] Request failed`, {
      requestId,
      error: error.message,
      responseTime,
      state: this.state,
      consecutiveFailures: this.stats.consecutiveFailures,
      stats: {
        totalRequests: this.stats.totalRequests,
        failureRate: this.getFailureRate(),
        averageResponseTime: Math.round(this.stats.averageResponseTime)
      }
    });

    // Check if we should open the circuit
    if (this.shouldOpenCircuit()) {
      this.transitionTo(STATES.OPEN);
    }
    
    // If we're in HALF_OPEN and get a failure, go back to OPEN
    if (this.state === STATES.HALF_OPEN) {
      this.transitionTo(STATES.OPEN);
    }
    
    if (this.metrics) {
      this.metrics.recordCircuitBreakerFailure(this.name, error.message, responseTime);
    }
  }

  /**
   * Check if circuit should be opened based on failure criteria
   * @returns {boolean} Whether to open the circuit
   */
  shouldOpenCircuit() {
    // Don't open if we don't have enough requests for meaningful stats
    if (this.stats.totalRequests < this.config.minRequestsForStats) {
      return false;
    }
    
    // Open if we've exceeded consecutive failure threshold
    if (this.stats.consecutiveFailures >= this.config.failureThreshold) {
      return true;
    }
    
    // Open if failure rate is too high
    const failureRate = this.getFailureRate();
    if (failureRate >= this.config.failureRate) {
      return true;
    }
    
    return false;
  }

  /**
   * Transition to a new state
   * @param {string} newState - New circuit breaker state
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChangeTime = Date.now();
    
    this.logger.info(`[CircuitBreaker:${this.name}] State transition: ${oldState} -> ${newState}`, {
      consecutiveFailures: this.stats.consecutiveFailures,
      failureRate: this.getFailureRate(),
      totalRequests: this.stats.totalRequests
    });
    
    if (this.metrics) {
      this.metrics.recordCircuitBreakerStateChange(this.name, oldState, newState);
    }
  }

  /**
   * Add request to recent requests for monitoring
   * @param {boolean} success - Whether request was successful
   * @param {number} responseTime - Response time in milliseconds
   */
  addRecentRequest(success, responseTime) {
    const now = Date.now();
    const request = { success, responseTime, timestamp: now };
    
    this.recentRequests.push(request);
    
    // Remove requests outside monitoring period
    const cutoff = now - this.config.monitoringPeriod;
    this.recentRequests = this.recentRequests.filter(req => req.timestamp > cutoff);
  }

  /**
   * Calculate current failure rate
   * @returns {number} Failure rate (0-1)
   */
  getFailureRate() {
    if (this.stats.totalRequests === 0) return 0;
    return this.stats.failedRequests / this.stats.totalRequests;
  }

  /**
   * Calculate current success rate
   * @returns {number} Success rate (0-1)
   */
  getSuccessRate() {
    if (this.stats.totalRequests === 0) return 0;
    return this.stats.successfulRequests / this.stats.totalRequests;
  }

  /**
   * Get current circuit breaker state
   * @returns {string} Current state
   */
  getState() {
    return this.state;
  }

  /**
   * Check if circuit is healthy
   * @returns {boolean} Whether circuit is healthy
   */
  isHealthy() {
    return this.state === STATES.CLOSED && this.stats.consecutiveFailures < 3;
  }

  /**
   * Get comprehensive statistics
   * @returns {Object} Circuit breaker statistics
   */
  getStats() {
    const now = Date.now();
    const recentRequests = this.recentRequests.filter(
      req => req.timestamp > now - this.config.monitoringPeriod
    );
    
    const recentSuccesses = recentRequests.filter(req => req.success).length;
    const recentFailures = recentRequests.length - recentSuccesses;
    const recentFailureRate = recentRequests.length > 0 ? recentFailures / recentRequests.length : 0;
    
    return {
      name: this.name,
      state: this.state,
      lastStateChange: this.lastStateChangeTime,
      timeSinceLastStateChange: now - this.lastStateChangeTime,
      isHealthy: this.isHealthy(),
      stats: {
        total: {
          requests: this.stats.totalRequests,
          successes: this.stats.successfulRequests,
          failures: this.stats.failedRequests,
          failureRate: this.getFailureRate(),
          successRate: this.getSuccessRate(),
          averageResponseTime: Math.round(this.stats.averageResponseTime),
          consecutiveFailures: this.stats.consecutiveFailures
        },
        recent: {
          requests: recentRequests.length,
          successes: recentSuccesses,
          failures: recentFailures,
          failureRate: recentFailureRate,
          monitoringPeriod: this.config.monitoringPeriod
        }
      },
      config: this.config,
      nextRetryAllowed: this.state === STATES.OPEN ? 
        this.lastFailureTime + this.config.resetTimeout : null
    };
  }

  /**
   * Reset circuit breaker statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      consecutiveFailures: 0,
      lastResetTime: Date.now()
    };
    
    this.recentRequests = [];
    this.halfOpenRequestCount = 0;
    
    this.logger.info(`[CircuitBreaker:${this.name}] Statistics reset`);
  }

  /**
   * Force circuit breaker to specific state (for testing)
   * @param {string} state - State to force
   */
  forceState(state) {
    if (!Object.values(STATES).includes(state)) {
      throw new Error(`Invalid circuit breaker state: ${state}`);
    }
    
    this.logger.warn(`[CircuitBreaker:${this.name}] Force state change to ${state}`);
    this.transitionTo(state);
  }

  /**
   * Generate unique request ID
   * @returns {string} Request ID
   */
  generateRequestId() {
    return `${this.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = { CircuitBreaker, STATES };