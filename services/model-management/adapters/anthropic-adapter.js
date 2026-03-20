/**
 * Anthropic Provider Adapter
 * 
 * Handles fetching and processing models from the Anthropic API.
 * Implements the standardized provider interface for consistent model management.
 */

const { BaseProviderAdapter } = require('../base-provider-adapter');
const config = require('../../../config/config');

/**
 * Anthropic provider adapter implementation
 */
const IntelligentCache = require('./utils/intelligent-cache');

class AnthropicAdapter extends BaseProviderAdapter {
  constructor(logger) {
    const providerConfig = {
      name: 'anthropic',
      type: 'direct',
      apiUrl: 'https://api.anthropic.com/v1/models',
      timeout: 30000,
      rateLimit: {
        requests: 50,
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
   * Gets the Anthropic API key from configuration
   * @returns {string|null} API key or null if not found
   */
  getApiKey() {
    return config.anthropic?.apiKey || null;
  }

  /**
   * Validates the Anthropic API key by making a test request
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('Anthropic API key not found in configuration');
      return false;
    }

    try {
      const response = await this.httpClient.get(this.config.apiUrl, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        timeout: 10000 // Shorter timeout for validation
      });

      return response.status === 200 && !!response.data?.data;
    } catch (error) {
      this.logger.warn(`Anthropic API key validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Fetches models from the Anthropic API
   * @returns {Promise<Object[]>} Array of raw model objects from Anthropic
   */
  async fetchModels() {
    this.logger.info('Fetching models from Anthropic API...');
    
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('Anthropic API key not found, using fallback models');
      return this.cache.getFallbackModels(this.config.name);
    }

    try {
      const response = await this.httpClient.get(this.config.apiUrl, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      });

      // Validate response structure
      this.validateResponseData(response.data, this.responseSchema);

      this.logger.info(`Successfully fetched ${response.data.data.length} models from Anthropic API`);
      
      // Log model details for debugging
      response.data.data.forEach(model => {
        this.logger.debug(`API Model: ${model.id} (type: ${model.type || 'unknown'})`);
      });

      return response.data.data;
    } catch (error) {
      this.logger.warn(`Failed to fetch models from Anthropic API: ${error.message}`);
      this.logger.info('Falling back to known Anthropic models...');
      return this.getFallbackModels();
    }
  }

  /**
   * Formats a raw Anthropic model object into the standard format
   * @param {Object} rawModel - Raw model object from Anthropic API
   * @returns {Object} Formatted model object
   */
  formatModel(rawModel) {
    const modelSlug = this.createModelSlug(rawModel.id);
    
    // Anthropic models typically support 200k tokens
    const maxTokens = rawModel.max_tokens || 200000;

    return {
      model_slug: modelSlug,
      api_model_id: rawModel.id,
      name: rawModel.display_name || rawModel.id,
      display_name: rawModel.display_name || rawModel.id,
      description: rawModel.description || `Anthropic ${rawModel.id} model`,
      max_tokens: maxTokens,
      is_active: false,
      metadata: {
        owned_by: 'anthropic',
        context_length: maxTokens,
        model_type: rawModel.type || 'text',
        display_name: rawModel.display_name
      },
      pricing: this.extractPricingData(rawModel)
    };
  }

  /**
   * Extracts pricing data from an Anthropic model object
   * @param {Object} anthropicModel - Model object from Anthropic API
   * @returns {Object|null} Extracted pricing data or null if unavailable
   */
  extractPricingData(anthropicModel) {
    try {
      // Anthropic API models don't always include pricing in the models endpoint
      // We'll use fallback pricing based on model type
      const fallbackPricing = {
        // Claude 3 models
        'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
        'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
        'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
        
        // Claude 3.5 models  
        'claude-3-5-sonnet-20240620': { input: 3.0, output: 15.0 },
        'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
        'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
        
        // Claude 4 models
        'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
        
        // Generic fallbacks
        'claude-3-haiku': { input: 0.25, output: 1.25 },
        'claude-3-sonnet': { input: 3.0, output: 15.0 },
        'claude-3-opus': { input: 15.0, output: 75.0 },
        'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
        'claude-3-7-sonnet': { input: 3.0, output: 15.0 },
        'claude-3-7-sonnet-20250219': { input: 3.0, output: 15.0 }
      };
      
      const modelId = anthropicModel.id;
      let pricing = fallbackPricing[modelId];
      
      if (!pricing) {
        // Try to find pricing based on model family
        if (modelId.includes('haiku')) {
          pricing = { input: 0.25, output: 1.25 };
        } else if (modelId.includes('sonnet')) {
          pricing = { input: 3.0, output: 15.0 };
        } else if (modelId.includes('opus')) {
          pricing = { input: 15.0, output: 75.0 };
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
      this.logger.error(`Error extracting pricing data for model ${anthropicModel?.id || 'unknown'}`, error);
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
        id: 'claude-3-sonnet-20240229',
        display_name: 'Claude 3 Sonnet',
        description: 'Balance of intelligence and speed for everyday tasks',
        max_tokens: 200000,
        type: 'text'
      },
      {
        id: 'claude-3-opus-20240229',
        display_name: 'Claude 3 Opus',
        description: 'Most powerful model for highly complex tasks',
        max_tokens: 200000,
        type: 'text'
      },
      {
        id: 'claude-3-5-sonnet-20240620',
        display_name: 'Claude 3.5 Sonnet',
        description: 'Enhanced version of Claude 3 Sonnet with improved capabilities',
        max_tokens: 200000,
        type: 'text'
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        display_name: 'Claude 3.5 Sonnet (Latest)',
        description: 'Latest version of Claude 3.5 Sonnet with updated training',
        max_tokens: 200000,
        type: 'text'
      },
      {
        id: 'claude-3-5-haiku-20241022',
        display_name: 'Claude 3.5 Haiku',
        description: 'Enhanced version of Claude 3 Haiku with improved capabilities',
        max_tokens: 200000,
        type: 'text'
      },
      {
        id: 'claude-sonnet-4-20250514',
        display_name: 'Claude Sonnet 4',
        description: 'Next generation Claude model with advanced capabilities',
        max_tokens: 200000,
        type: 'text'
      },
      {
        id: 'claude-3-7-sonnet-20250219',
        display_name: 'Claude 3.7 Sonnet',
        description: 'Advanced Claude model with enhanced reasoning capabilities',
        max_tokens: 200000,
        type: 'text'
      }
    ];
  }

  /**
   * Performs a health check specific to Anthropic
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
  AnthropicAdapter
};