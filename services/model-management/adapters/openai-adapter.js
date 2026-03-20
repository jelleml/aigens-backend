/**
 * OpenAI Provider Adapter
 * 
 * Handles fetching and processing models from the OpenAI API.
 * Implements the standardized provider interface for consistent model management.
 */

const { BaseProviderAdapter } = require('../base-provider-adapter');
const config = require('../../../config/config');

/**
 * OpenAI provider adapter implementation
 */
const IntelligentCache = require('./utils/intelligent-cache');

class OpenAIAdapter extends BaseProviderAdapter {
  constructor(logger) {
    const providerConfig = {
      name: 'openai',
      type: 'direct',
      apiUrl: 'https://api.openai.com/v1/models',
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
        'data': 'array'
      }
    };
  }

  /**
   * Gets the OpenAI API key from configuration
   * @returns {string|null} API key or null if not found
   */
  getApiKey() {
    return config.openai?.apiKey || null;
  }

  /**
   * Validates the OpenAI API key by making a test request
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('OpenAI API key not found in configuration');
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
      this.logger.warn(`OpenAI API key validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Fetches models from the OpenAI API
   * @returns {Promise<Object[]>} Array of raw model objects from OpenAI
   */
  async fetchModels() {
    this.logger.info('Fetching models from OpenAI API...');
    
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('OpenAI API key not found, using fallback models');
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

      // Filter to only include relevant models
      const relevantModels = response.data.data.filter(model => {
        return (
          model.id.includes('gpt') || 
          model.id.includes('davinci') || 
          model.id.includes('text-') ||
          model.id.includes('o1') ||
          model.id.includes('gpt-4o')
        ) && !model.id.includes('embed') && !model.id.includes('moderation');
      });

      this.logger.info(`Successfully fetched ${response.data.data.length} total models, ${relevantModels.length} relevant models from OpenAI API`);
      
      // Log model details for debugging
      relevantModels.forEach(model => {
        this.logger.debug(`API Model: ${model.id} (owned_by: ${model.owned_by || 'unknown'})`);
      });

      return relevantModels;
    } catch (error) {
      this.logger.warn(`Failed to fetch models from OpenAI API: ${error.message}`);
      this.logger.info('Falling back to known OpenAI models...');
      return this.getFallbackModels();
    }
  }

  /**
   * Formats a raw OpenAI model object into the standard format
   * @param {Object} rawModel - Raw model object from OpenAI API
   * @returns {Object} Formatted model object
   */
  formatModel(rawModel) {
    const modelSlug = this.createModelSlug(rawModel.id);
    
    // Determine max_tokens based on model or API data
    let maxTokens = 16000; // Default
    if (rawModel.context_length) {
      maxTokens = rawModel.context_length;
    } else if (rawModel.id.includes('gpt-4o') || rawModel.id.includes('gpt-4-turbo') || rawModel.id.includes('o1')) {
      maxTokens = 128000;
    } else if (rawModel.id.includes('gpt-4')) {
      maxTokens = 8192;
    } else if (rawModel.id.includes('16k')) {
      maxTokens = 16385;
    }

    const commonProperties = this.extractCommonModelProperties(rawModel, {
      max_tokens: maxTokens,
      is_active: false,
      metadata: {
        owned_by: rawModel.owned_by || 'openai',
        context_length: maxTokens,
        model_type: 'chat'
      }
    });

    return {
      model_slug: modelSlug,
      api_model_id: rawModel.id,
      name: `${rawModel.id} (OpenAI)`,
      display_name: `${rawModel.id} (OpenAI)`,
      description: `OpenAI ${rawModel.id} model`,
      max_tokens: maxTokens,
      is_active: false,
      metadata: {
        owned_by: rawModel.owned_by || 'openai',
        context_length: maxTokens,
        model_type: 'chat'
      },
      pricing: this.extractPricingData(rawModel)
    };
  }

  /**
   * Extracts pricing data from an OpenAI model object
   * @param {Object} openaiModel - Model object from OpenAI API
   * @returns {Object|null} Extracted pricing data or null if unavailable
   */
  extractPricingData(openaiModel) {
    try {
      // OpenAI API models don't include pricing in the models endpoint
      // We'll use fallback pricing based on model type
      const fallbackPricing = {
        // GPT-4 models
        'gpt-4o': { input: 2.5, output: 10.0 },
        'gpt-4o-mini': { input: 0.15, output: 0.6 },
        'gpt-4-turbo': { input: 10.0, output: 30.0 },
        'gpt-4-turbo-preview': { input: 10.0, output: 30.0 },
        'gpt-4-vision-preview': { input: 10.0, output: 30.0 },
        'gpt-4': { input: 30.0, output: 60.0 },
        
        // GPT-3.5 models
        'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
        'gpt-3.5-turbo-16k': { input: 3.0, output: 4.0 },
        
        // O1 models
        'o1-preview': { input: 15.0, output: 60.0 },
        'o1-mini': { input: 3.0, output: 12.0 },
        
        // Legacy models
        'text-davinci-003': { input: 20.0, output: 20.0 },
        'text-davinci-002': { input: 20.0, output: 20.0 }
      };
      
      const modelId = openaiModel.id;
      let pricing = fallbackPricing[modelId];
      
      if (!pricing) {
        // Try to find pricing based on model family
        if (modelId.includes('gpt-4o')) {
          pricing = { input: 2.5, output: 10.0 };
        } else if (modelId.includes('gpt-4') && modelId.includes('turbo')) {
          pricing = { input: 10.0, output: 30.0 };
        } else if (modelId.includes('gpt-4')) {
          pricing = { input: 30.0, output: 60.0 };
        } else if (modelId.includes('gpt-3.5')) {
          pricing = { input: 0.5, output: 1.5 };
        } else if (modelId.includes('o1')) {
          pricing = { input: 15.0, output: 60.0 };
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
      this.logger.error(`Error extracting pricing data for model ${openaiModel?.id || 'unknown'}`, error);
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
        id: 'gpt-4o-mini',
        object: 'model', 
        owned_by: 'openai-internal',
        context_length: 128000
      },
      {
        id: 'gpt-4-turbo',
        object: 'model',
        owned_by: 'openai',
        context_length: 128000
      },
      {
        id: 'gpt-4-turbo-preview',
        object: 'model',
        owned_by: 'openai',
        context_length: 128000
      },
      {
        id: 'gpt-4-vision-preview',
        object: 'model',
        owned_by: 'openai',
        context_length: 128000
      },
      {
        id: 'gpt-4',
        object: 'model',
        owned_by: 'openai',
        context_length: 8192
      },
      {
        id: 'gpt-3.5-turbo',
        object: 'model',
        owned_by: 'openai',
        context_length: 16385
      },
      {
        id: 'gpt-3.5-turbo-16k',
        object: 'model',
        owned_by: 'openai',
        context_length: 16385
      },
      {
        id: 'o1-preview',
        object: 'model',
        owned_by: 'openai-internal',
        context_length: 128000
      },
      {
        id: 'o1-mini',
        object: 'model',
        owned_by: 'openai-internal', 
        context_length: 65536
      }
    ];
  }

  /**
   * Performs a health check specific to OpenAI
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
  OpenAIAdapter
};