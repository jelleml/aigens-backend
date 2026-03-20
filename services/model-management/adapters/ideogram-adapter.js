/**
 * Ideogram Provider Adapter
 * 
 * Handles fetching and processing models from the Ideogram service.
 * Implements the standardized provider interface for consistent model management.
 * 
 * Note: Ideogram doesn't have a traditional models API endpoint, so this adapter
 * uses predefined model data based on their available models.
 */

const { BaseProviderAdapter } = require('../base-provider-adapter');
const config = require('../../../config/config');

/**
 * Ideogram provider adapter implementation
 */
const IntelligentCache = require('./utils/intelligent-cache');

class IdeogramAdapter extends BaseProviderAdapter {
  constructor(logger) {
    const providerConfig = {
      name: 'ideogram',
      type: 'direct',
      apiUrl: 'https://api.ideogram.ai/generate', // Main API endpoint (not for models)
      timeout: 30000,
      rateLimit: {
        requests: 30,
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
  }

  /**
   * Gets the Ideogram API key from configuration
   * @returns {string|null} API key or null if not found
   */
  getApiKey() {
    return config.ideogram?.apiKey || null;
  }

  /**
   * Validates the Ideogram API key by making a test request
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('Ideogram API key not found in configuration');
      return false;
    }

    try {
      // Since Ideogram doesn't have a models endpoint, we'll test with a minimal generation request
      // This is a lightweight test to validate the API key
      const testPayload = {
        image_request: {
          prompt: "test",
          aspect_ratio: "ASPECT_1_1",
          count: 1,
          model: "V_2"
        }
      };

      const response = await this.httpClient.post(this.config.apiUrl, testPayload, {
        headers: {
          'Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // Shorter timeout for validation
      });

      // If we get a response (even if it's an error about the prompt), the API key is valid
      return response.status === 200 || response.status === 400;
    } catch (error) {
      // Check if it's an authentication error
      if (error.response?.status === 401 || error.response?.status === 403) {
        this.logger.warn(`Ideogram API key validation failed: ${error.message}`);
        return false;
      }
      
      // Other errors might still indicate a valid API key
      this.logger.debug(`Ideogram API validation got non-auth error: ${error.message}`);
      return true;
    }
  }

  /**
   * Fetches models from Ideogram (returns predefined models since no API endpoint exists)
   * @returns {Promise<Object[]>} Array of raw model objects
   */
  async fetchModels() {
    this.logger.info('Fetching Ideogram models (using predefined model data)...');
    
    // Since Ideogram doesn't have a models API, we return predefined models
    const predefinedModels = this.getPredefinedModels();
    
    this.logger.info(`Successfully loaded ${predefinedModels.length} predefined Ideogram models`);
    
    // Log model details for debugging
    predefinedModels.forEach(model => {
      this.logger.debug(`Model: ${model.id} (version: ${model.version})`);
    });

    return predefinedModels;
  }

  /**
   * Gets predefined Ideogram models since no API endpoint exists
   * @returns {Object[]} Array of predefined model objects
   */
  getPredefinedModels() {
    return [
      {
        id: 'ideogram-v1',
        version: 'V_1',
        display_name: 'Ideogram V1',
        description: 'Basic image generation model',
        capabilities: ['image_generation'],
        max_resolution: '1024x1024',
        supported_aspect_ratios: ['1:1', '4:3', '3:4', '16:9', '9:16']
      },
      {
        id: 'ideogram-alpha',
        version: 'V_1',
        display_name: 'Ideogram Alpha',
        description: 'Alpha version of Ideogram image generation',
        capabilities: ['image_generation'],
        max_resolution: '1024x1024',
        supported_aspect_ratios: ['1:1', '4:3', '3:4', '16:9', '9:16']
      },
      {
        id: 'ideogram-v2',
        version: 'V_2',
        display_name: 'Ideogram V2',
        description: 'Enhanced image generation with better quality and style control',
        capabilities: ['image_generation', 'style_control'],
        max_resolution: '1024x1024',
        supported_aspect_ratios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3']
      },
      {
        id: 'ideogram-xl',
        version: 'V_2',
        display_name: 'Ideogram XL',
        description: 'High-resolution image generation',
        capabilities: ['image_generation', 'high_resolution', 'style_control'],
        max_resolution: '1536x1536',
        supported_aspect_ratios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3']
      },
      {
        id: 'ideogram-v3',
        version: 'V_3',
        display_name: 'Ideogram V3',
        description: 'Latest image generation model with advanced features',
        capabilities: ['image_generation', 'style_control', 'advanced_prompting', 'magic_prompt'],
        max_resolution: '1024x1024',
        supported_aspect_ratios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '16:10', '10:16']
      }
    ];
  }

  /**
   * Formats a raw Ideogram model object into the standard format
   * @param {Object} rawModel - Raw model object (predefined)
   * @returns {Object} Formatted model object
   */
  formatModel(rawModel) {
    const modelSlug = this.createModelSlug(rawModel.id);
    
    // Ideogram models don't use tokens, they generate images
    const maxTokens = 0;

    return {
      model_slug: modelSlug,
      api_model_id: rawModel.id,
      name: rawModel.display_name || rawModel.id,
      display_name: rawModel.display_name || rawModel.id,
      description: rawModel.description || `Ideogram ${rawModel.id} model`,
      max_tokens: maxTokens,
      is_active: false,
      metadata: {
        owned_by: 'ideogram',
        model_type: 'image_generation',
        version: rawModel.version,
        capabilities: rawModel.capabilities || [],
        max_resolution: rawModel.max_resolution,
        supported_aspect_ratios: rawModel.supported_aspect_ratios || []
      },
      pricing: this.extractPricingData(rawModel)
    };
  }

  /**
   * Extracts pricing data from an Ideogram model object
   * @param {Object} ideogramModel - Model object (predefined)
   * @returns {Object|null} Extracted pricing data or null if unavailable
   */
  extractPricingData(ideogramModel) {
    try {
      // Ideogram pricing based on their official pricing
      const fallbackPricing = {
        // Ideogram V1/Alpha models
        'ideogram-v1': { price_image: 0.08 },
        'ideogram-alpha': { price_image: 0.08 },
        
        // Ideogram V2 models
        'ideogram-v2': { price_image: 0.10 },
        'ideogram-xl': { price_image: 0.12 },
        
        // Ideogram V3 models (newest)
        'ideogram-v3': { price_image: 0.15 }
      };
      
      const modelId = ideogramModel.id;
      let pricing = fallbackPricing[modelId];
      
      if (!pricing) {
        // Try to find pricing based on model family
        if (modelId.includes('v3')) {
          pricing = { price_image: 0.15 };
        } else if (modelId.includes('xl')) {
          pricing = { price_image: 0.12 };
        } else if (modelId.includes('v2')) {
          pricing = { price_image: 0.10 };
        } else if (modelId.includes('v1') || modelId.includes('alpha')) {
          pricing = { price_image: 0.08 };
        }
      }
      
      if (pricing) {
        return {
          price_image: pricing.price_image,
          // Set token prices to 0 for image models
          price_1m_input_tokens: 0,
          price_1m_output_tokens: 0,
          score_cost_per_1k_tokens: null, // Not applicable for image models
          score_intelligence: null, // To be populated by other scripts
          score_speed: null, // To be populated by other scripts  
          score_overall: null // To be populated by other scripts
        };
      }
      
      this.logger.warn(`No pricing data available for model: ${modelId}`);
      return null;
    } catch (error) {
      this.logger.error(`Error extracting pricing data for model ${ideogramModel?.id || 'unknown'}`, error);
      return null;
    }
  }

  /**
   * Returns fallback models when needed (same as predefined models)
   * @returns {Object[]} Array of fallback model objects
   */
    getFallbackModels() {
    this.logger.warn('Unknown API unavailable - no fallback models available');
    this.logger.error('Cannot proceed without API access. Please check your API key and network connection.');
    throw new Error('Unknown API unavailable and no fallback models configured. Please ensure API access is available.');
  }

  /**
   * Performs a health check specific to Ideogram
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
  IdeogramAdapter
};