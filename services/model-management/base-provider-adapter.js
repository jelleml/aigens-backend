/**
 * Base Provider Adapter
 * 
 * Provides common functionality and utilities for all provider adapters.
 * Extends the abstract ProviderAdapter interface with concrete implementations
 * of common operations like retry logic, error handling, and model validation.
 */

const axios = require('axios');
const { ProviderAdapter } = require('./interfaces/provider-adapter.interface');

/**
 * Base class for provider adapters with common functionality
 */
class BaseProviderAdapter extends ProviderAdapter {
  /**
   * @param {ProviderConfig} config - Provider configuration
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger) {
    super(config, logger);
    
    // Initialize HTTP client with default configuration
    this.httpClient = axios.create({
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'AIGens-ModelManager/1.0'
      }
    });
    
    // Set up request/response interceptors for metrics and logging
    this.setupInterceptors();
  }

  /**
   * Sets up HTTP client interceptors for logging and metrics
   */
  setupInterceptors() {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        this.logger.debug(`Making ${config.method?.toUpperCase()} request to ${config.url}`);
        config.metadata = { startTime: Date.now() };
        return config;
      },
      (error) => {
        this.logger.error('Request setup error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        const responseTime = Date.now() - response.config.metadata.startTime;
        this.updateMetrics(true, responseTime);
        this.logger.debug(`Request completed in ${responseTime}ms`);
        return response;
      },
      (error) => {
        const responseTime = error.config?.metadata?.startTime 
          ? Date.now() - error.config.metadata.startTime 
          : 0;
        
        const errorType = this.classifyError(error);
        this.updateMetrics(false, responseTime, errorType);
        
        this.logger.warn(`Request failed after ${responseTime}ms: ${error.message}`);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Classifies an error for metrics tracking
   * @param {Error} error - The error to classify
   * @returns {string} Error classification
   */
  classifyError(error) {
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return 'network_error';
    }
    
    if (error.response) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        return 'auth_error';
      } else if (status === 429) {
        return 'rate_limit_error';
      } else if (status >= 500) {
        return 'server_error';
      } else if (status >= 400) {
        return 'client_error';
      }
    }
    
    return 'unknown_error';
  }

  /**
   * Executes a function with retry logic and exponential backoff
   * @param {Function} fn - Function to execute
   * @param {Object} [retryConfig] - Override retry configuration
   * @returns {Promise<*>} Result of the function execution
   */
  async withRetry(fn, retryConfig = null) {
    const config = retryConfig || this.config.retry || {
      maxRetries: 3,
      initialDelay: 2000,
      maxDelay: 30000,
      factor: 2,
      jitter: 0.1
    };

    let lastError;
    let delay = config.initialDelay;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain error types
        if (this.isNonRetryableError(error)) {
          this.logger.warn(`Non-retryable error encountered: ${error.message}`);
          throw error;
        }
        
        if (attempt === config.maxRetries) {
          this.logger.error(`Max retries (${config.maxRetries}) exceeded`);
          break;
        }
        
        // Calculate next delay with jitter
        const jitter = Math.random() * config.jitter * delay;
        const nextDelay = Math.min(delay * config.factor + jitter, config.maxDelay);
        
        this.logger.info(`Attempt ${attempt + 1} failed, retrying in ${Math.round(nextDelay)}ms: ${error.message}`);
        
        await this.sleep(nextDelay);
        delay = nextDelay;
      }
    }
    
    throw lastError;
  }

  /**
   * Determines if an error should not be retried
   * @param {Error} error - The error to check
   * @returns {boolean} True if error should not be retried
   */
  isNonRetryableError(error) {
    // Don't retry authentication errors
    if (error.response?.status === 401 || error.response?.status === 403) {
      return true;
    }
    
    // Don't retry client errors (except rate limiting)
    if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
      return true;
    }
    
    return false;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validates response data against a schema
   * @param {Object} data - Response data to validate
   * @param {Object} schema - Validation schema
   * @throws {Error} If validation fails
   */
  validateResponseData(data, schema) {
    if (!data) {
      throw new Error('Response data is null or undefined');
    }

    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data)) {
          throw new Error(`Required field '${field}' is missing from response`);
        }
      }
    }

    if (schema.fields) {
      for (const [field, expectedType] of Object.entries(schema.fields)) {
        if (field in data) {
          const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];
          if (actualType !== expectedType) {
            throw new Error(`Field '${field}' should be ${expectedType}, got ${actualType}`);
          }
        }
      }
    }
  }

  /**
   * Creates a standardized model slug from an API model ID
   * @param {string} apiModelId - Original API model identifier
   * @param {string} [suffix] - Optional suffix to append
   * @returns {string} Standardized model slug
   */
  createModelSlug(apiModelId, suffix = null) {
    // Clean the API model ID
    let slug = apiModelId
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-') // Replace invalid chars with hyphens (removed . from allowed chars)
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    
    // Add provider suffix if provided
    if (suffix) {
      slug += `-${suffix}`;
    } else if (this.name) {
      slug += `-${this.name}`;
    }
    
    return slug;
  }

  /**
   * Extracts common model properties from raw model data
   * @param {Object} rawModel - Raw model object from provider
   * @param {Object} defaults - Default values to use
   * @returns {Object} Extracted common properties
   */
  extractCommonModelProperties(rawModel, defaults = {}) {
    return {
      api_model_id: rawModel.id || rawModel.model_id || rawModel.name,
      name: rawModel.name || rawModel.id || 'Unknown Model',
      description: rawModel.description || `${this.name} model`,
      max_tokens: rawModel.max_tokens || rawModel.context_length || defaults.max_tokens || 16000,
      is_active: defaults.is_active !== undefined ? defaults.is_active : false,
      metadata: {
        owned_by: rawModel.owned_by || rawModel.owner || this.name,
        context_length: rawModel.context_length || rawModel.max_tokens,
        model_type: rawModel.type || rawModel.model_type || 'chat',
        ...defaults.metadata
      }
    };
  }

  /**
   * Processes models in batches to avoid overwhelming the system
   * @param {Array} items - Items to process
   * @param {Function} processor - Function to process each batch
   * @param {number} [batchSize] - Size of each batch
   * @returns {Promise<Object>} Aggregated results
   */
  async processBatches(items, processor, batchSize = 20) {
    const totalResults = {
      processed: 0,
      updated: 0,
      created: 0,
      skipped: 0,
      errors: 0
    };

    const totalBatches = Math.ceil(items.length / batchSize);
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      
      this.logger.info(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)...`);
      
      try {
        const batchResults = await processor(batch);
        
        // Aggregate results
        Object.keys(totalResults).forEach(key => {
          if (typeof batchResults[key] === 'number') {
            totalResults[key] += batchResults[key];
          }
        });
        
        this.logger.debug(`Batch ${batchNumber} completed: ${JSON.stringify(batchResults)}`);
        
      } catch (error) {
        this.logger.error(`Batch ${batchNumber} failed:`, error);
        totalResults.errors += batch.length;
        totalResults.processed += batch.length;
      }
    }
    
    return totalResults;
  }

  /**
   * Logs a summary of processing results
   * @param {Object} results - Processing results
   * @param {string} [operation] - Operation name for logging
   */
  logSummary(results, operation = 'operation') {
    this.logger.info('');
    this.logger.info(`📊 ${this.name.toUpperCase()} ${operation.toUpperCase()} SUMMARY:`);
    this.logger.info('='.repeat(50));
    this.logger.info(`Total processed: ${results.processed}`);
    this.logger.info(`Updated: ${results.updated}`);
    this.logger.info(`Created: ${results.created}`);
    this.logger.info(`Skipped: ${results.skipped}`);
    this.logger.info(`Errors: ${results.errors}`);
    
    if (results.errors > 0) {
      this.logger.warn(`⚠️  Completed with ${results.errors} errors`);
    } else {
      this.logger.info('✅ Operation completed successfully!');
    }
  }

  /**
   * Gets the provider ID from the database
   * @param {Object} db - Database instance
   * @returns {Promise<number>} Provider ID
   */
  async getProviderId(db) {
    if (this._providerId) {
      return this._providerId;
    }

    const { Provider } = db.models;
    
    try {
      const provider = await Provider.findOne({
        where: { name: this.name }
      });
      
      if (!provider) {
        throw new Error(`Provider '${this.name}' not found in database`);
      }
      
      this._providerId = provider.id;
      this.logger.debug(`Found provider '${this.name}' with ID: ${provider.id}`);
      
      return this._providerId;
    } catch (error) {
      this.logger.error(`Error finding provider '${this.name}':`, error);
      throw error;
    }
  }

  /**
   * Default implementation of validateApiKey
   * Subclasses should override this with provider-specific validation
   * @returns {Promise<boolean>}
   */
  async validateApiKey() {
    // Default implementation - just check if API key exists in config
    const apiKey = this.getApiKey();
    return !!apiKey && apiKey.length > 0;
  }

  /**
   * Gets the API key for the provider
   * Subclasses should override this to specify where the API key is stored
   * @returns {string|null} API key or null if not found
   */
  getApiKey() {
    // Default implementation - subclasses should override
    return null;
  }

  /**
   * Default implementation of getFallbackModels
   * Subclasses should override this with provider-specific fallback models
   * @returns {StandardModel[]}
   */
  getFallbackModels() {
    this.logger.warn(`No fallback models defined for provider: ${this.name}`);
    return [];
  }
}

module.exports = {
  BaseProviderAdapter
};