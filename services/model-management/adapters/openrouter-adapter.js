/**
 * OpenRouter Provider Adapter
 * 
 * Handles fetching and processing models from the OpenRouter API.
 * Implements the standardized provider interface for consistent model management.
 */

const { BaseProviderAdapter } = require('../base-provider-adapter');
const config = require('../../../config/config');

/**
 * OpenRouter provider adapter implementation
 */
const IntelligentCache = require('./utils/intelligent-cache');

class OpenRouterAdapter extends BaseProviderAdapter {
  constructor(logger) {
    const providerConfig = {
      name: 'openrouter',
      type: 'aggregator',
      apiUrl: 'https://openrouter.ai/api/v1/models',
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
    
    // Response validation schema
    this.responseSchema = {
      required: ['data'],
      fields: {
        data: 'array'
      }
    };
  }

  /**
   * Gets the OpenRouter API key from configuration
   * @returns {string|null} API key or null if not found
   */
  getApiKey() {
    return config.openrouter?.apiKey || null;
  }

  /**
   * Validates the OpenRouter API key by making a test request
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('OpenRouter API key not found in configuration');
      return false;
    }

    try {
      const response = await this.httpClient.get(this.config.apiUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // Shorter timeout for validation
      });

      return response.status === 200 && response.data && Array.isArray(response.data.data);
    } catch (error) {
      this.logger.warn(`OpenRouter API key validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Fetches models from the OpenRouter API
   * @returns {Promise<Object[]>} Array of raw model objects from OpenRouter
   */
  async fetchModels() {
    this.logger.info('Fetching models from OpenRouter API...');
    
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('OpenRouter API key not found, using fallback models');
      return this.cache.getFallbackModels(this.config.name);
    }

    try {
      const response = await this.httpClient.get(this.config.apiUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      this.validateResponseData(response.data, this.responseSchema);

      const models = response.data.data;
      
      // Filter out models with negative pricing
      const validModels = models.filter(model => {
        const inputPrice = parseFloat(model.pricing?.prompt || '0');
        const outputPrice = parseFloat(model.pricing?.completion || '0');
        return inputPrice >= 0 && outputPrice >= 0;
      });

      this.logger.info(`Successfully fetched ${validModels.length} valid models from OpenRouter API (${models.length} total)`);
      
      // Log model details for debugging
      validModels.forEach(model => {
        this.logger.debug(`API Model: ${model.id} (context: ${model.context_length || 'unknown'})`);
      });

      return validModels;
    } catch (error) {
      this.logger.warn(`Failed to fetch models from OpenRouter API: ${error.message}`);
      this.logger.info('Falling back to known OpenRouter models...');
      return this.getFallbackModels();
    }
  }

  /**
   * Formats a raw OpenRouter model object into the standard format
   * @param {Object} rawModel - Raw model object from OpenRouter API
   * @returns {Object} Formatted model object
   */
  formatModel(rawModel) {
    // Handle missing ID field
    const modelId = rawModel.id || rawModel.name || 'unknown-model';
    
    // Clean model ID to create slug (remove special characters and slashes)
    const cleanModelId = modelId.replace(/[\/\s\.]/g, '-').replace(/--+/g, '-').toLowerCase();
    const modelSlug = `${cleanModelId}-${this.name}`;
    
    // Create API model ID by removing the provider suffix
    const apiModelId = modelSlug.replace(/-[^-]+$/, '');

    return {
      model_slug: modelSlug,
      api_model_id: apiModelId,
      name: rawModel.name || rawModel.id,
      display_name: rawModel.name || rawModel.id,
      description: rawModel.description || `OpenRouter aggregated model: ${rawModel.name || rawModel.id}`,
      max_tokens: rawModel.context_length || 16000,
      is_active: true,
      metadata: {
        owned_by: rawModel.owned_by || 'openrouter',
        context_length: rawModel.context_length,
        model_type: 'chat',
        original_id: rawModel.id,
        created: rawModel.created,
        top_provider: rawModel.top_provider
      },
      pricing: this.extractPricingData(rawModel)
    };
  }

  /**
   * Extracts pricing data from an OpenRouter model object
   * @param {Object} openRouterModel - Model object from OpenRouter API
   * @returns {Object|null} Extracted pricing data or null if unavailable
   */
  extractPricingData(openRouterModel) {
    try {
      if (openRouterModel.pricing) {
        const inputPrice = parseFloat(openRouterModel.pricing.prompt || '0');
        const outputPrice = parseFloat(openRouterModel.pricing.completion || '0');
        
        if (inputPrice >= 0 && outputPrice >= 0) {
          // OpenRouter pricing is per-token, convert to per-million-tokens
          const pricePerMillionInput = inputPrice * 1000000;
          const pricePerMillionOutput = outputPrice * 1000000;
          
          return {
            price_1m_input_tokens: pricePerMillionInput,
            price_1m_output_tokens: pricePerMillionOutput,
            score_cost_per_1k_tokens: (pricePerMillionInput + pricePerMillionOutput) / 1000,
            score_intelligence: null, // To be populated by other scripts
            score_speed: null, // To be populated by other scripts  
            score_overall: null // To be populated by other scripts
          };
        }
      }
      
      this.logger.debug(`No valid pricing data available for model: ${openRouterModel.id}`);
      return null;
    } catch (error) {
      this.logger.error(`Error extracting pricing data for model ${openRouterModel?.id || 'unknown'}`, error);
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
        id: 'openai/gpt-4',
        name: 'GPT-4',
        description: 'OpenAI GPT-4 via OpenRouter',
        context_length: 8192,
        owned_by: 'openai',
        pricing: { prompt: 0.00003, completion: 0.00006 }
      },
      {
        id: 'anthropic/claude-3-haiku',
        name: 'Claude 3 Haiku',
        description: 'Anthropic Claude 3 Haiku via OpenRouter',
        context_length: 200000,
        owned_by: 'anthropic',
        pricing: { prompt: 0.00000025, completion: 0.00000125 }
      },
      {
        id: 'anthropic/claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        description: 'Anthropic Claude 3 Sonnet via OpenRouter',
        context_length: 200000,
        owned_by: 'anthropic',
        pricing: { prompt: 0.000003, completion: 0.000015 }
      },
      {
        id: 'anthropic/claude-3-opus',
        name: 'Claude 3 Opus',
        description: 'Anthropic Claude 3 Opus via OpenRouter',
        context_length: 200000,
        owned_by: 'anthropic',
        pricing: { prompt: 0.000015, completion: 0.000075 }
      },
      {
        id: 'meta-llama/llama-3-8b-instruct',
        name: 'Llama 3 8B Instruct',
        description: 'Meta Llama 3 8B Instruct via OpenRouter',
        context_length: 8192,
        owned_by: 'meta-llama',
        pricing: { prompt: 0.00000018, completion: 0.00000018 }
      },
      {
        id: 'meta-llama/llama-3-70b-instruct',
        name: 'Llama 3 70B Instruct',
        description: 'Meta Llama 3 70B Instruct via OpenRouter',
        context_length: 8192,
        owned_by: 'meta-llama',
        pricing: { prompt: 0.00000059, completion: 0.00000079 }
      },
      {
        id: 'mistralai/mixtral-8x7b-instruct',
        name: 'Mixtral 8x7B Instruct',
        description: 'Mistral AI Mixtral 8x7B Instruct via OpenRouter',
        context_length: 32768,
        owned_by: 'mistralai',
        pricing: { prompt: 0.00000024, completion: 0.00000024 }
      }
    ];
  }

  /**
   * Performs a health check specific to OpenRouter
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
  OpenRouterAdapter
};