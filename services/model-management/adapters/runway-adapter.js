/**
 * Runway Provider Adapter
 * 
 * Handles fetching and processing models from the Runway ML service.
 * Implements the standardized provider interface for consistent model management.
 * 
 * Note: Runway doesn't have a traditional models API endpoint, so this adapter
 * uses predefined model data based on their available models.
 */

const { BaseProviderAdapter } = require('../base-provider-adapter');
const config = require('../../../config/config');

/**
 * Runway provider adapter implementation
 */
class RunwayAdapter extends BaseProviderAdapter {
  constructor(logger) {
    const providerConfig = {
      name: 'runway',
      type: 'direct',
      apiUrl: 'https://api.runwayml.com/v1',
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
   * Gets the Runway API key from configuration
   * @returns {string|null} API key or null if not found
   */
  getApiKey() {
    return process.env.RUNWAY_API_KEY || config.runway?.apiKey || null;
  }

  /**
   * Validates the Runway API key by making a test request
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('Runway API key not found in configuration');
      return false;
    }

    try {
      // Test with a simple API call to check account info
      const response = await this.httpClient.get(
        `${this.config.apiUrl}/account`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.status === 200;
    } catch (error) {
      // Check if it's an authentication error
      if (error.response?.status === 401 || error.response?.status === 403) {
        this.logger.warn(`Runway API key validation failed: ${error.message}`);
        return false;
      }
      
      // Other errors might still indicate a valid API key
      this.logger.debug(`Runway API validation got non-auth error: ${error.message}`);
      return true;
    }
  }

  /**
   * Fetches models from Runway (returns predefined models since no dedicated endpoint exists)
   * @returns {Promise<Object[]>} Array of raw model objects
   */
  async fetchModels() {
    this.logger.info('Fetching Runway models (using predefined model data)...');
    
    // Since Runway doesn't have a dedicated models API, we return predefined models
    const predefinedModels = this.getPredefinedModels();
    
    this.logger.info(`Successfully loaded ${predefinedModels.length} predefined Runway models`);
    
    // Log model details for debugging
    predefinedModels.forEach(model => {
      this.logger.debug(`Model: ${model.id} (version: ${model.version})`);
    });

    return predefinedModels;
  }

  /**
   * Gets predefined Runway models since no dedicated API endpoint exists
   * @returns {Object[]} Array of predefined model objects
   */
  getPredefinedModels() {
    return [
      {
        id: 'gen-3-alpha-runway',
        api_model_id: 'gen-3-alpha',
        version: 'Gen-3 Alpha',
        display_name: 'Gen-3 Alpha',
        description: 'High-fidelity video generation with superior motion and consistency',
        capabilities: ['video_generation', 'text_to_video', 'image_to_video'],
        max_duration_seconds: 10,
        resolution: 'HD',
        price_per_second: 1.00
      },
      {
        id: 'gen-3-alpha-turbo-runway',
        api_model_id: 'gen-3-alpha-turbo',
        version: 'Gen-3 Alpha Turbo',
        display_name: 'Gen-3 Alpha Turbo',
        description: 'Faster video generation optimized for speed and cost efficiency',
        capabilities: ['video_generation', 'text_to_video', 'image_to_video', 'fast_generation'],
        max_duration_seconds: 10,
        resolution: 'HD',
        price_per_second: 0.50
      },
      {
        id: 'gen-4-runway',
        api_model_id: 'gen-4',
        version: 'Gen-4',
        display_name: 'Gen-4',
        description: 'Next-generation video model with consistent characters and objects across scenes',
        capabilities: ['video_generation', 'text_to_video', 'image_to_video', 'character_consistency'],
        max_duration_seconds: 10,
        resolution: 'HD',
        price_per_second: 1.20
      },
      {
        id: 'gen-4-turbo-runway',
        api_model_id: 'gen-4-turbo',
        version: 'Gen-4 Turbo',
        display_name: 'Gen-4 Turbo',
        description: 'Faster Gen-4 model for rapid video generation with good quality',
        capabilities: ['video_generation', 'text_to_video', 'image_to_video', 'character_consistency', 'fast_generation'],
        max_duration_seconds: 10,
        resolution: 'HD',
        price_per_second: 0.50
      }
    ];
  }

  /**
   * Formats a raw Runway model object into the standard format
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
      description: rawModel.description || `Runway ${rawModel.id} model`,
      max_tokens: maxTokens,
      is_active: false,
      metadata: {
        owned_by: 'runway',
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
   * Extracts pricing data from a Runway model object
   * @param {Object} runwayModel - Model object (predefined)
   * @returns {Object|null} Extracted pricing data or null if unavailable
   */
  extractPricingData(runwayModel) {
    try {
      if (runwayModel.price_per_second) {
        return {
          price_video: JSON.stringify({
            Generate: runwayModel.price_per_second,
            maxDuration: runwayModel.max_duration_seconds
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
      
      this.logger.warn(`No pricing data available for model: ${runwayModel.id}`);
      return null;
    } catch (error) {
      this.logger.error(`Error extracting pricing data for model ${runwayModel?.id || 'unknown'}`, error);
      return null;
    }
  }

  /**
   * Returns fallback models when needed
   * @returns {Object[]} Array of fallback model objects
   */
  getFallbackModels() {
    this.logger.warn('Runway API unavailable - using fallback models');
    return this.getPredefinedModels();
  }

  /**
   * Performs a health check specific to Runway
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
  RunwayAdapter
};