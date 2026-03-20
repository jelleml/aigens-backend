/**
 * DeepSeek Provider Adapter
 * 
 * Handles fetching and processing models from the DeepSeek API.
 * Implements the standardized provider interface for consistent model management.
 */

const { BaseProviderAdapter } = require('../base-provider-adapter');
const config = require('../../../config/config');

/**
 * DeepSeek provider adapter implementation
 */
const IntelligentCache = require('./utils/intelligent-cache');

class DeepSeekAdapter extends BaseProviderAdapter {
  constructor(logger) {
    const providerConfig = {
      name: 'deepseek',
      type: 'direct',
      apiUrl: 'https://api.deepseek.com/v1/models',
      timeout: 30000,
      rateLimit: {
        requests: 60,
        window: 60000
      },
      retry: {
        maxRetries: 3,
        initialDelay: 2000,
        maxDelay: 30000,
        factor: 2,
        jitter: 0.1
      }
    };

    super(providerConfig, logger);
    
    // Response validation schema
    this.responseSchema = {
      required: ['data'],
      fields: {
        'data': 'array'
      }
    };
  }

  /**
   * Gets the DeepSeek API key from configuration
   * @returns {string|null} API key or null if not found
   */
  getApiKey() {
    return config.deepseek?.apiKey || null;
  }

  /**
   * Validates the DeepSeek API key by making a test request
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('DeepSeek API key not found in configuration');
      return false;
    }

    try {
      const response = await this.httpClient.get(this.config.apiUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 10000 // Shorter timeout for validation
      });

      return response.status === 200 && !!response.data?.data;
    } catch (error) {
      this.logger.warn(`DeepSeek API key validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Fetches models from the DeepSeek API
   * @returns {Promise<Object[]>} Array of raw model objects from DeepSeek
   */
  async fetchModels() {
    this.logger.info('Fetching models from DeepSeek API...');
    
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('DeepSeek API key not found, using fallback models');
      return this.cache.getFallbackModels(this.config.name);
    }

    try {
      const response = await this.httpClient.get(this.config.apiUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      // Validate response structure
      this.validateResponseData(response.data, this.responseSchema);

      this.logger.info(`Successfully fetched ${response.data.data.length} models from DeepSeek API`);
      
      // Log model details for debugging
      response.data.data.forEach(model => {
        this.logger.debug(`API Model: ${model.id} (owned_by: ${model.owned_by || 'deepseek'})`);
      });

      return response.data.data;
    } catch (error) {
      this.logger.warn(`Failed to fetch models from DeepSeek API: ${error.message}`);
      this.logger.info('Falling back to known DeepSeek models...');
      return this.getFallbackModels();
    }
  }

  /**
   * Formats a raw DeepSeek model object into the standard format
   * @param {Object} rawModel - Raw model object from DeepSeek API
   * @returns {Object} Formatted model object
   */
  formatModel(rawModel) {
    const modelSlug = this.createModelSlug(rawModel.id);
    
    // DeepSeek models typically support various context lengths
    let maxTokens = rawModel.context_length || 16000;
    
    // Set specific context lengths for known models
    if (rawModel.id.includes('deepseek-chat') || rawModel.id.includes('deepseek-coder')) {
      maxTokens = rawModel.context_length || 32000;
    }

    return {
      model_slug: modelSlug,
      api_model_id: rawModel.id,
      name: rawModel.id,
      display_name: rawModel.id,
      description: `DeepSeek ${rawModel.id} model`,
      max_tokens: maxTokens,
      is_active: false,
      metadata: {
        owned_by: rawModel.owned_by || 'deepseek',
        context_length: maxTokens,
        model_type: 'chat'
      },
      pricing: this.extractPricingData(rawModel)
    };
  }

  /**
   * Extracts pricing data from a DeepSeek model object
   * @param {Object} deepseekModel - Model object from DeepSeek API
   * @returns {Object|null} Extracted pricing data or null if unavailable
   */
  extractPricingData(deepseekModel) {
    try {
      // DeepSeek API models don't always include pricing in the models endpoint
      // We'll use fallback pricing based on model type
      const fallbackPricing = {
        // DeepSeek Chat models
        'deepseek-chat': { input: 0.14, output: 0.28 },
        'deepseek-coder': { input: 0.14, output: 0.28 },
        
        // DeepSeek V2 models
        'deepseek-v2-chat': { input: 0.14, output: 0.28 },
        'deepseek-v2-coder': { input: 0.14, output: 0.28 },
        
        // DeepSeek V3 models (if available)
        'deepseek-v3-chat': { input: 0.27, output: 1.10 },
        'deepseek-v3-coder': { input: 0.27, output: 1.10 }
      };
      
      const modelId = deepseekModel.id;
      let pricing = fallbackPricing[modelId];
      
      if (!pricing) {
        // Try to find pricing based on model family
        if (modelId.includes('deepseek-v3')) {
          pricing = { input: 0.27, output: 1.10 };
        } else if (modelId.includes('deepseek-v2') || modelId.includes('deepseek-chat') || modelId.includes('deepseek-coder')) {
          pricing = { input: 0.14, output: 0.28 };
        }
      }
      
      if (pricing) {
        return {
          price_1m_input_tokens: pricing.input,
          price_1m_output_tokens: pricing.output,
          score_cost_per_1k_tokens: (pricing.input + pricing.output) / 1000,
          score_intelligence: null, // To be populated by other scripts
          score_speed: null, // To be populated by other scripts  
          score_overall: null // To be populated by other scripts
        };
      }
      
      this.logger.warn(`No pricing data available for model: ${modelId}`);
      return null;
    } catch (error) {
      this.logger.error(`Error extracting pricing data for model ${deepseekModel?.id || 'unknown'}`, error);
      return null;
    }
  }

  /**
   * Returns fallback models when API is unavailable
   * @returns {Object[]} Array of fallback model objects
   */
    getFallbackModels() {
    this.logger.warn('Unknown API unavailable - no fallback models available');
    this.logger.error('Cannot proceed without API access. Please check your API key and network connection.');
    throw new Error('Unknown API unavailable and no fallback models configured. Please ensure API access is available.');
  },
      {
        id: 'deepseek-coder',
        object: 'model',
        owned_by: 'deepseek',
        context_length: 32000
      },
      {
        id: 'deepseek-v2-chat',
        object: 'model',
        owned_by: 'deepseek',
        context_length: 32000
      },
      {
        id: 'deepseek-v2-coder',
        object: 'model',
        owned_by: 'deepseek',
        context_length: 32000
      },
      {
        id: 'deepseek-v3-chat',
        object: 'model',
        owned_by: 'deepseek',
        context_length: 64000
      },
      {
        id: 'deepseek-v3-coder',
        object: 'model',
        owned_by: 'deepseek',
        context_length: 64000
      }
    ];
  }

  /**
   * Performs a health check specific to DeepSeek
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const startTime = Date.now();
    
    try {
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
}

module.exports = {
  DeepSeekAdapter
};