/**
 * Amazon Nova Provider Adapter
 * 
 * Handles fetching and processing models from the Amazon Nova service.
 * Implements the standardized provider interface for consistent model management.
 * 
 * Note: Amazon Nova doesn't have a traditional models API endpoint, so this adapter
 * uses predefined model data based on their available models.
 */

const { BaseProviderAdapter } = require('../base-provider-adapter');
const config = require('../../../config/config');
const AWS = require('aws-sdk');

/**
 * Amazon Nova provider adapter implementation
 */
class AmazonNovaAdapter extends BaseProviderAdapter {
  constructor(logger) {
    const providerConfig = {
      name: 'amazon-nova',
      type: 'direct',
      apiUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
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

    // Initialize AWS configuration
    this.initializeAWS();
  }

  /**
   * Initialize AWS configuration
   */
  initializeAWS() {
    const awsRegion = process.env.AWS_REGION || config?.aws?.region || 'us-east-1';
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID || config?.aws?.accessKeyId;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || config?.aws?.secretAccessKey;

    if (awsAccessKeyId && awsSecretAccessKey) {
      AWS.config.update({
        region: awsRegion,
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey
      });

      this.bedrock = new AWS.Bedrock({ region: awsRegion });
      this.bedrockRuntime = new AWS.BedrockRuntime({ region: awsRegion });
    }
  }

  /**
   * Gets AWS credentials from configuration
   * @returns {boolean} True if credentials are available
   */
  hasAwsCredentials() {
    return !!(process.env.AWS_ACCESS_KEY_ID || config?.aws?.accessKeyId);
  }

  /**
   * Validates the AWS credentials by making a test request
   * @returns {Promise<boolean>} True if credentials are valid
   */
  async validateApiKey() {
    if (!this.hasAwsCredentials()) {
      this.logger.warn('AWS credentials not found in configuration');
      return false;
    }

    if (!this.bedrock) {
      this.logger.warn('AWS Bedrock not initialized');
      return false;
    }

    try {
      // Test with a simple list models request
      await this.bedrock.listFoundationModels({
        byProvider: 'amazon'
      }).promise();

      return true;
    } catch (error) {
      // Check if it's an authentication error
      if (error.code === 'UnauthorizedOperation' || error.code === 'AccessDenied') {
        this.logger.warn(`AWS credentials validation failed: ${error.message}`);
        return false;
      }
      
      // Other errors might still indicate valid credentials
      this.logger.debug(`AWS validation got non-auth error: ${error.message}`);
      return true;
    }
  }

  /**
   * Fetches models from Amazon Nova (returns predefined models since no dedicated endpoint exists)
   * @returns {Promise<Object[]>} Array of raw model objects
   */
  async fetchModels() {
    this.logger.info('Fetching Amazon Nova models (using predefined model data)...');
    
    // Since Amazon Nova doesn't have a dedicated models API, we return predefined models
    const predefinedModels = this.getPredefinedModels();
    
    this.logger.info(`Successfully loaded ${predefinedModels.length} predefined Amazon Nova models`);
    
    // Log model details for debugging
    predefinedModels.forEach(model => {
      this.logger.debug(`Model: ${model.id} (version: ${model.version})`);
    });

    return predefinedModels;
  }

  /**
   * Gets predefined Amazon Nova models since no dedicated API endpoint exists
   * @returns {Object[]} Array of predefined model objects
   */
  getPredefinedModels() {
    return [
      {
        id: 'nova-reel-v1.0-amazon',
        api_model_id: 'amazon.nova-reel-v1:0',
        version: '1.0',
        display_name: 'Nova Reel 1.0',
        description: 'Single-shot video generation up to 6 seconds with 720p resolution',
        capabilities: ['video_generation', 'text_to_video'],
        max_duration_seconds: 6,
        resolution: '1280x720',
        fps: 24,
        price_per_second: 0.08
      },
      {
        id: 'nova-reel-v1.1-amazon',
        api_model_id: 'amazon.nova-reel-v1:1',
        version: '1.1',
        display_name: 'Nova Reel 1.1',
        description: 'Multi-shot video generation up to 2 minutes with style consistency across shots',
        capabilities: ['video_generation', 'text_to_video', 'multi_shot_video', 'style_consistency'],
        max_duration_seconds: 120,
        resolution: '1280x720',
        fps: 24,
        price_per_second: 0.08
      }
    ];
  }

  /**
   * Formats a raw Amazon Nova model object into the standard format
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
      description: rawModel.description || `Amazon Nova ${rawModel.id} model`,
      max_tokens: maxTokens,
      is_active: false,
      metadata: {
        owned_by: 'amazon-nova',
        model_type: 'video_generation',
        version: rawModel.version,
        capabilities: rawModel.capabilities || [],
        max_duration_seconds: rawModel.max_duration_seconds,
        resolution: rawModel.resolution,
        fps: rawModel.fps,
        price_per_second: rawModel.price_per_second
      },
      pricing: this.extractPricingData(rawModel)
    };
  }

  /**
   * Extracts pricing data from an Amazon Nova model object
   * @param {Object} novaModel - Model object (predefined)
   * @returns {Object|null} Extracted pricing data or null if unavailable
   */
  extractPricingData(novaModel) {
    try {
      if (novaModel.price_per_second) {
        return {
          price_video: JSON.stringify({
            Generate: novaModel.price_per_second,
            maxDuration: novaModel.max_duration_seconds
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
      
      this.logger.warn(`No pricing data available for model: ${novaModel.id}`);
      return null;
    } catch (error) {
      this.logger.error(`Error extracting pricing data for model ${novaModel?.id || 'unknown'}`, error);
      return null;
    }
  }

  /**
   * Returns fallback models when needed
   * @returns {Object[]} Array of fallback model objects
   */
  getFallbackModels() {
    this.logger.warn('Amazon Nova API unavailable - using fallback models');
    return this.getPredefinedModels();
  }

  /**
   * Performs a health check specific to Amazon Nova
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
          error: 'AWS credentials validation failed',
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
  AmazonNovaAdapter
};