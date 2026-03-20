/**
 * Together.ai Provider Adapter
 * 
 * Handles fetching and processing models from the Together.ai API.
 * Implements the standardized provider interface for consistent model management.
 */

const { BaseProviderAdapter } = require('../base-provider-adapter');
const config = require('../../../config/config');

/**
 * Together.ai provider adapter implementation
 */
const IntelligentCache = require('./utils/intelligent-cache');

class TogetherAdapter extends BaseProviderAdapter {
  constructor(logger) {
    const providerConfig = {
      name: 'together',
      type: 'direct',
      apiUrl: 'https://api.together.xyz/v1/models',
      timeout: 30000,
      rateLimit: {
        requests: 100,
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
    
    // Together.ai API returns an array directly, not wrapped in a data object
    this.responseSchema = {
      required: [],
      fields: {}
    };
  }

  /**
   * Gets the Together.ai API key from configuration
   * @returns {string|null} API key or null if not found
   */
  getApiKey() {
    return config.together?.apiKey || null;
  }

  /**
   * Validates the Together.ai API key by making a test request
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('Together.ai API key not found in configuration');
      return false;
    }

    try {
      const response = await this.httpClient.get(this.config.apiUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 10000 // Shorter timeout for validation
      });

      return response.status === 200 && Array.isArray(response.data);
    } catch (error) {
      this.logger.warn(`Together.ai API key validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Fetches models from the Together.ai API
   * @returns {Promise<Object[]>} Array of raw model objects from Together.ai
   */
  async fetchModels() {
    this.logger.info('Fetching models from Together.ai API...');
    
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('Together.ai API key not found, using fallback models');
      return this.cache.getFallbackModels(this.config.name);
    }

    try {
      const response = await this.withRetry(async () => {
        return this.httpClient.get(this.config.apiUrl, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
      });

      // Together.ai API returns an array directly
      const models = Array.isArray(response.data) ? response.data : [];
      
      if (!models.length) {
        throw new Error('Response data is not an array or is empty');
      }
      
      // Validate that each model has the required fields
      const invalidModels = models.filter(model => !model.id);
      if (invalidModels.length > 0) {
        this.logger.warn(`Found ${invalidModels.length} models with missing ID field. These will be skipped during processing.`);
      }
      
      // Log models with missing context_length
      const modelsWithoutContext = models.filter(model => !model.context_length || model.context_length <= 0);
      if (modelsWithoutContext.length > 0) {
        this.logger.warn(`Found ${modelsWithoutContext.length} models with missing or invalid context_length. Default max_tokens will be used.`);
      }
      
      this.logger.info(`Successfully fetched ${models.length} models from Together.ai API`);
      
      // Log model count by organization for debugging
      const orgCounts = {};
      models.forEach(model => {
        const org = model.organization || 'unknown';
        orgCounts[org] = (orgCounts[org] || 0) + 1;
      });
      this.logger.debug('Models by organization:', orgCounts);
      
      return models;
    } catch (error) {
      this.logger.warn(`Failed to fetch models from Together.ai API: ${error.message}`);
      this.logger.info('Falling back to known Together.ai models...');
      return this.getFallbackModels();
    }
  }

  /**
   * Formats a raw Together.ai model object into the standard format
   * @param {Object} rawModel - Raw model object from Together.ai API
   * @returns {Object} Formatted model object
   */
  formatModel(rawModel) {
    // Clean the model ID to create a slug
    const modelSlug = this.createModelSlug(rawModel.id);
    
    // Determine max_tokens based on model context_length or use default
    const maxTokens = rawModel.context_length && rawModel.context_length > 0 
      ? rawModel.context_length 
      : 16000; // Default value if context_length is missing or invalid
    
    return {
      model_slug: modelSlug,
      api_model_id: rawModel.id,
      name: rawModel.display_name || rawModel.id,
      display_name: rawModel.display_name || rawModel.id,
      description: `Together.ai model: ${rawModel.display_name || rawModel.id}`,
      max_tokens: maxTokens,
      is_active: false, // New models are inactive by default
      metadata: {
        owned_by: rawModel.organization || 'together',
        context_length: maxTokens,
        model_type: rawModel.type || 'chat',
        organization: rawModel.organization || null,
        additional_info: {
          pricing: rawModel.pricing || null
        }
      },
      pricing: this.extractPricingData(rawModel)
    };
  }

  /**
   * Extracts pricing data from a Together.ai model object
   * @param {Object} togetherModel - Model object from Together.ai API
   * @returns {Object|null} Extracted pricing data or null if unavailable
   */
  extractPricingData(togetherModel) {
    try {
      // Validate pricing data exists
      if (!togetherModel.pricing || typeof togetherModel.pricing !== 'object') {
        this.logger.debug(`No pricing data found for model ${togetherModel.id}`);
        return null;
      }
      
      const pricing = togetherModel.pricing;
      
      // Extract pricing values and convert to numbers
      const inputPrice = parseFloat(pricing.input || '0');
      const outputPrice = parseFloat(pricing.output || '0');
      
      // Validate pricing values
      if (isNaN(inputPrice) || isNaN(outputPrice)) {
        this.logger.warn(`Invalid pricing data for model ${togetherModel.id}: input=${pricing.input}, output=${pricing.output}`);
        return null;
      }
      
      // Skip models with negative pricing (invalid)
      if (inputPrice < 0 || outputPrice < 0) {
        this.logger.warn(`Negative pricing for model ${togetherModel.id}: input=${inputPrice}, output=${outputPrice}`);
        return null;
      }
      
      // Together.ai prices are already per million tokens, so no conversion needed
      const price1mInputTokens = inputPrice;
      const price1mOutputTokens = outputPrice;
      
      // Calculate cost score per 1k tokens (divide by 1000 as requested)
      const scoreCostPer1kTokens = ((inputPrice + outputPrice) / 2) / 1000;
      
      this.logger.debug(`Extracted pricing for model ${togetherModel.id}: input=${price1mInputTokens}, output=${price1mOutputTokens}, score=${scoreCostPer1kTokens}`);
      
      return {
        price_1m_input_tokens: price1mInputTokens,
        price_1m_output_tokens: price1mOutputTokens,
        score_cost_per_1k_tokens: scoreCostPer1kTokens,
        score_intelligence: null, // To be populated by other scripts
        score_speed: null, // To be populated by other scripts
        score_overall: null // To be populated by other scripts
      };
      
    } catch (error) {
      this.logger.error(`Error extracting pricing data for model ${togetherModel.id}`, error);
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
        id: 'meta-llama/Llama-2-70b-chat-hf',
        display_name: 'Llama 2 70B Chat',
        context_length: 4096,
        organization: 'meta-llama',
        type: 'chat',
        pricing: { input: 0.9, output: 0.9 }
      },
      {
        id: 'togethercomputer/llama-2-7b-chat',
        display_name: 'Llama 2 7B Chat',
        context_length: 4096,
        organization: 'togethercomputer',
        type: 'chat',
        pricing: { input: 0.2, output: 0.2 }
      },
      {
        id: 'togethercomputer/RedPajama-INCITE-7B-Chat',
        display_name: 'RedPajama INCITE 7B Chat',
        context_length: 2048,
        organization: 'togethercomputer',
        type: 'chat',
        pricing: { input: 0.2, output: 0.2 }
      },
      {
        id: 'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO',
        display_name: 'Nous Hermes 2 Mixtral 8x7B',
        context_length: 32768,
        organization: 'NousResearch',
        type: 'chat',
        pricing: { input: 0.6, output: 0.6 }
      }
    ];
  }

  /**
   * Performs a health check specific to Together.ai
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
  TogetherAdapter
};