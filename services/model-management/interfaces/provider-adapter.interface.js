/**
 * Provider Adapter Interface
 * 
 * Defines the standardized interface that all provider adapters must implement.
 * This ensures consistency across different AI providers and enables unified management.
 */

/**
 * @typedef {Object} StandardModel
 * @property {string} model_id - Unique identifier for the model
 * @property {string} model_slug - Database-friendly slug for the model
 * @property {string} api_model_id - Original API identifier from the provider
 * @property {number} id_provider - Provider ID from the database
 * @property {string} name - Human-readable model name
 * @property {string} description - Model description
 * @property {number} max_tokens - Maximum token limit for the model
 * @property {boolean} is_active - Whether the model is active for use
 * @property {PricingInfo} [pricing] - Optional pricing information
 * @property {string[]} [capabilities] - Optional array of model capabilities
 * @property {ModelMetadata} [metadata] - Optional additional metadata
 */

/**
 * @typedef {Object} PricingInfo
 * @property {number} price_1m_input_tokens - Price per million input tokens
 * @property {number} price_1m_output_tokens - Price per million output tokens
 * @property {number} [score_cost_per_1k_tokens] - Cost score per 1k tokens
 * @property {number} [score_intelligence] - Intelligence score
 * @property {number} [score_speed] - Speed score
 * @property {number} [score_overall] - Overall score
 */

/**
 * @typedef {Object} ModelMetadata
 * @property {string} [owned_by] - Model owner/organization
 * @property {number} [context_length] - Context window size
 * @property {string} [model_type] - Type of model (chat, completion, etc.)
 * @property {string[]} [supported_formats] - Supported input/output formats
 * @property {Object} [additional_info] - Any additional provider-specific info
 */

/**
 * @typedef {Object} ProviderConfig
 * @property {string} name - Provider name
 * @property {string} type - Provider type ('direct' | 'aggregator')
 * @property {string} apiUrl - Base API URL
 * @property {number} timeout - Request timeout in milliseconds
 * @property {Object} rateLimit - Rate limiting configuration
 * @property {number} rateLimit.requests - Max requests per window
 * @property {number} rateLimit.window - Time window in milliseconds
 * @property {Object} retry - Retry configuration
 * @property {number} retry.maxRetries - Maximum retry attempts
 * @property {number} retry.initialDelay - Initial delay between retries
 * @property {number} retry.maxDelay - Maximum delay between retries
 * @property {number} retry.factor - Exponential backoff factor
 * @property {number} retry.jitter - Jitter factor for randomization
 */

/**
 * @typedef {Object} HealthStatus
 * @property {string} status - Health status ('healthy' | 'degraded' | 'unhealthy')
 * @property {number} responseTime - Response time in milliseconds
 * @property {string} [error] - Error message if unhealthy
 * @property {number} consecutiveFailures - Number of consecutive failures
 * @property {Date} lastCheck - Timestamp of last health check
 */

/**
 * @typedef {Object} ProviderMetrics
 * @property {number} totalRequests - Total number of requests made
 * @property {number} successfulRequests - Number of successful requests
 * @property {number} failedRequests - Number of failed requests
 * @property {number} averageResponseTime - Average response time in milliseconds
 * @property {number} lastRequestTime - Timestamp of last request
 * @property {Object} errorCounts - Count of different error types
 */

/**
 * @typedef {Object} ExecutionContext
 * @property {string} mode - Execution mode ('init' | 'update' | 'sync')
 * @property {string[]} providers - List of providers to process
 * @property {Object} options - Execution options
 * @property {boolean} options.dryRun - Whether to run in dry-run mode
 * @property {boolean} options.force - Whether to force updates
 * @property {boolean} options.skipValidation - Whether to skip validation
 * @property {number} options.batchSize - Batch size for processing
 * @property {Object} logger - Logger instance
 * @property {Object} metrics - Metrics collector instance
 */

/**
 * Abstract base class for provider adapters
 * All provider adapters must extend this class and implement its abstract methods
 */
class ProviderAdapter {
  /**
   * @param {ProviderConfig} config - Provider configuration
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger) {
    if (this.constructor === ProviderAdapter) {
      throw new Error('ProviderAdapter is an abstract class and cannot be instantiated directly');
    }
    
    this.config = config;
    this.logger = logger;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: null,
      errorCounts: {}
    };
    this.healthStatus = {
      status: 'healthy',
      responseTime: 0,
      consecutiveFailures: 0,
      lastCheck: new Date()
    };
  }

  /**
   * Provider identification
   * @returns {string} Provider name
   */
  get name() {
    return this.config.name;
  }

  /**
   * Provider type
   * @returns {string} Provider type ('direct' | 'aggregator')
   */
  get type() {
    return this.config.type;
  }

  // Abstract methods that must be implemented by concrete adapters

  /**
   * Fetches models from the provider's API
   * @returns {Promise<Object[]>} Array of raw model objects from the provider
   * @abstract
   */
  async fetchModels() {
    throw new Error('fetchModels() must be implemented by concrete adapter');
  }

  /**
   * Validates the API key for the provider
   * @returns {Promise<boolean>} True if API key is valid
   * @abstract
   */
  async validateApiKey() {
    throw new Error('validateApiKey() must be implemented by concrete adapter');
  }

  /**
   * Formats a raw model object into the standard format
   * @param {Object} rawModel - Raw model object from provider API
   * @returns {StandardModel} Formatted model object
   * @abstract
   */
  formatModel(rawModel) {
    throw new Error('formatModel() must be implemented by concrete adapter');
  }

  /**
   * Returns fallback models when API is unavailable
   * @returns {StandardModel[]} Array of fallback models
   * @abstract
   */
  getFallbackModels() {
    throw new Error('getFallbackModels() must be implemented by concrete adapter');
  }

  // Concrete methods with default implementations

  /**
   * Gets the provider configuration
   * @returns {ProviderConfig} Provider configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Performs a health check on the provider
   * @returns {Promise<HealthStatus>} Health status
   */
  async healthCheck() {
    const startTime = Date.now();
    
    try {
      // Try to validate API key as a basic health check
      const isValid = await this.validateApiKey();
      const responseTime = Date.now() - startTime;
      
      if (isValid) {
        this.healthStatus = {
          status: 'healthy',
          responseTime,
          consecutiveFailures: 0,
          lastCheck: new Date()
        };
      } else {
        this.healthStatus = {
          status: 'unhealthy',
          responseTime,
          error: 'API key validation failed',
          consecutiveFailures: this.healthStatus.consecutiveFailures + 1,
          lastCheck: new Date()
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.healthStatus = {
        status: 'unhealthy',
        responseTime,
        error: error.message,
        consecutiveFailures: this.healthStatus.consecutiveFailures + 1,
        lastCheck: new Date()
      };
    }
    
    return this.healthStatus;
  }

  /**
   * Gets current metrics for the provider
   * @returns {ProviderMetrics} Provider metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Updates metrics after a request
   * @param {boolean} success - Whether the request was successful
   * @param {number} responseTime - Response time in milliseconds
   * @param {string} [errorType] - Type of error if request failed
   */
  updateMetrics(success, responseTime, errorType = null) {
    this.metrics.totalRequests++;
    this.metrics.lastRequestTime = Date.now();
    
    if (success) {
      this.metrics.successfulRequests++;
      this.healthStatus.consecutiveFailures = 0;
    } else {
      this.metrics.failedRequests++;
      this.healthStatus.consecutiveFailures++;
      
      if (errorType) {
        this.metrics.errorCounts[errorType] = (this.metrics.errorCounts[errorType] || 0) + 1;
      }
    }
    
    // Update average response time (only for successful requests)
    if (success) {
      const totalSuccessful = this.metrics.successfulRequests;
      if (totalSuccessful > 0) {
        this.metrics.averageResponseTime = 
          ((this.metrics.averageResponseTime * (totalSuccessful - 1)) + responseTime) / totalSuccessful;
      }
    }
  }

  /**
   * Resets metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: null,
      errorCounts: {}
    };
  }
}

module.exports = {
  ProviderAdapter
};