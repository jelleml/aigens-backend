/**
 * Google Veo Provider Adapter
 * 
 * Handles fetching and processing models from the Google Veo service.
 * Implements the standardized provider interface for consistent model management.
 * 
 * Note: Google Veo doesn't have a traditional models API endpoint, so this adapter
 * uses predefined model data based on their available models.
 */

const { BaseProviderAdapter } = require('../base-provider-adapter');
const config = require('../../../config/config');

/**
 * Google Veo provider adapter implementation
 */
class GoogleVeoAdapter extends BaseProviderAdapter {
  constructor(logger) {
    const providerConfig = {
      name: 'google-veo',
      type: 'direct',
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
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
   * Gets the Google API key from configuration
   * @returns {string|null} API key or null if not found
   */
  getApiKey() {
    return process.env.GOOGLE_GEMINI_KEY || config.google?.apiKey || null;
  }

  /**
   * Validates the Google API key by making a test request
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('Google API key not found in configuration');
      return false;
    }

    try {
      // Test with a simple API call to Gemini API
      const response = await this.httpClient.get(
        'https://generativelanguage.googleapis.com/v1beta/models',
        {
          headers: {
            'x-goog-api-key': apiKey
          },
          timeout: 10000
        }
      );

      return response.status === 200;
    } catch (error) {
      // Check if it's an authentication error
      if (error.response?.status === 401 || error.response?.status === 403) {
        this.logger.warn(`Google API key validation failed: ${error.message}`);
        return false;
      }
      
      // Other errors might still indicate a valid API key
      this.logger.debug(`Google API validation got non-auth error: ${error.message}`);
      return true;
    }
  }

  /**
   * Fetches models from Google Veo (returns predefined models since no dedicated endpoint exists)
   * @returns {Promise<Object[]>} Array of raw model objects
   */
  async fetchModels() {
    this.logger.info('Fetching Google Veo models (using predefined model data)...');
    
    // Since Google Veo doesn't have a dedicated models API, we return predefined models
    const predefinedModels = this.getPredefinedModels();
    
    this.logger.info(`Successfully loaded ${predefinedModels.length} predefined Google Veo models`);
    
    // Log model details for debugging
    predefinedModels.forEach(model => {
      this.logger.debug(`Model: ${model.id} (version: ${model.version})`);
    });

    return predefinedModels;
  }

  /**
   * Gets predefined Google Veo models since no dedicated API endpoint exists
   * @returns {Object[]} Array of predefined model objects
   */
  getPredefinedModels() {
    return [
      {
        id: 'veo-3.0-generate-preview-google',
        api_model_id: 'veo-3.0-generate-preview',
        version: '3.0',
        display_name: 'Veo 3 (Video + Audio)',
        description: 'High-quality video generation with synchronized audio, dialogue, and sound effects',
        capabilities: ['video_generation', 'audio_generation', 'text_to_video'],
        max_duration_seconds: 8,
        resolution: '720p',
        price_per_second: 0.75
      },
      {
        id: 'veo-3.0-generate-video-only-preview-google',
        api_model_id: 'veo-3.0-generate-video-only-preview',
        version: '3.0',
        display_name: 'Veo 3 (Video Only)',
        description: 'High-quality video generation without audio',
        capabilities: ['video_generation', 'text_to_video'],
        max_duration_seconds: 8,
        resolution: '720p',
        price_per_second: 0.25
      },
      {
        id: 'veo-3.0-fast-generate-preview-google',
        api_model_id: 'veo-3.0-fast-generate-preview',
        version: '3.0-fast',
        display_name: 'Veo 3 Fast (Video + Audio)',
        description: 'Faster, cost-effective video generation with synchronized audio',
        capabilities: ['video_generation', 'audio_generation', 'text_to_video', 'fast_generation'],
        max_duration_seconds: 8,
        resolution: '720p',
        price_per_second: 0.40
      },
      {
        id: 'veo-3.0-fast-generate-video-only-preview-google',
        api_model_id: 'veo-3.0-fast-generate-video-only-preview',
        version: '3.0-fast',
        display_name: 'Veo 3 Fast (Video Only)',
        description: 'Faster, cost-effective video generation without audio',
        capabilities: ['video_generation', 'text_to_video', 'fast_generation'],
        max_duration_seconds: 8,
        resolution: '720p',
        price_per_second: 0.25
      }
    ];
  }

  /**
   * Formats a raw Google Veo model object into the standard format
   * @param {Object} rawModel - Raw model object (predefined)
   * @returns {Object} Formatted model object
   */
  formatModel(rawModel) {
    const modelSlug = this.createModelSlug(rawModel.id);
    
    // Video models don't use tokens
    const maxTokens = 0;

    return {
      model_slug: modelSlug,
      api_model_id: rawModel.api_model_id,
      name: rawModel.display_name || rawModel.id,
      display_name: rawModel.display_name || rawModel.id,
      description: rawModel.description || `Google Veo ${rawModel.id} model`,
      max_tokens: maxTokens,
      is_active: false,
      metadata: {
        owned_by: 'google-veo',
        model_type: 'video_generation',
        version: rawModel.version,
        capabilities: rawModel.capabilities || [],
        max_duration_seconds: rawModel.max_duration_seconds,
        resolution: rawModel.resolution,
        price_per_second: rawModel.price_per_second
      },
      pricing: this.extractPricingData(rawModel)
    };
  }

  /**
   * Extracts pricing data from a Google Veo model object
   * @param {Object} veoModel - Model object (predefined)
   * @returns {Object|null} Extracted pricing data or null if unavailable
   */
  extractPricingData(veoModel) {
    try {
      if (veoModel.price_per_second) {
        return {
          price_video: JSON.stringify({
            Generate: veoModel.price_per_second,
            maxDuration: veoModel.max_duration_seconds
          }),
          // Set token prices to 0 for video models
          price_1m_input_tokens: 0,
          price_1m_output_tokens: 0,
          score_cost_per_1k_tokens: null, // Not applicable for video models
          score_intelligence: null, // To be populated by other scripts
          score_speed: null, // To be populated by other scripts  
          score_overall: null // To be populated by other scripts
        };
      }
      
      this.logger.warn(`No pricing data available for model: ${veoModel.id}`);
      return null;
    } catch (error) {
      this.logger.error(`Error extracting pricing data for model ${veoModel?.id || 'unknown'}`, error);
      return null;
    }
  }

  /**
   * Returns fallback models when needed
   * @returns {Object[]} Array of fallback model objects
   */
  getFallbackModels() {
    this.logger.warn('Google Veo API unavailable - using fallback models');
    return this.getPredefinedModels();
  }

  /**
   * Performs a health check specific to Google Veo
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
  GoogleVeoAdapter
};