/**
 * Ideogram Adapter Tests
 * 
 * Tests for the Ideogram provider adapter implementation.
 */

const { IdeogramAdapter } = require('../../../services/model-management/adapters/ideogram-adapter');
const config = require('../../../config/config');

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    },
    defaults: {
      timeout: 30000
    }
  }))
}));

// Mock config
jest.mock('../../../config/config', () => ({
  ideogram: {
    apiKey: 'test-api-key'
  }
}));

describe('IdeogramAdapter', () => {
  let adapter;
  let mockLogger;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Reset axios mock
    jest.clearAllMocks();

    // Create adapter instance
    adapter = new IdeogramAdapter(mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(adapter.name).toBe('ideogram');
      expect(adapter.type).toBe('direct');
      expect(adapter.config.apiUrl).toBe('https://api.ideogram.ai/generate');
      expect(adapter.config.timeout).toBe(30000);
    });

    it('should set up HTTP client with correct defaults', () => {
      expect(adapter.httpClient).toBeDefined();
      expect(adapter.httpClient.defaults.timeout).toBe(30000);
    });
  });

  describe('getApiKey', () => {
    it('should return API key from config', () => {
      expect(adapter.getApiKey()).toBe('test-api-key');
    });

    it('should return null when API key is not configured', () => {
      // Temporarily modify config
      const originalApiKey = config.ideogram.apiKey;
      delete config.ideogram.apiKey;
      
      expect(adapter.getApiKey()).toBeNull();
      
      // Restore config
      config.ideogram.apiKey = originalApiKey;
    });
  });

  describe('validateApiKey', () => {
    it('should return true for valid API key with 200 response', async () => {
      // Mock successful API response
      adapter.httpClient.post.mockResolvedValue({
        status: 200,
        data: { data: [] }
      });

      const result = await adapter.validateApiKey();
      expect(result).toBe(true);
      expect(adapter.httpClient.post).toHaveBeenCalledWith(
        adapter.config.apiUrl,
        expect.objectContaining({
          image_request: expect.objectContaining({
            prompt: 'test',
            aspect_ratio: 'ASPECT_1_1',
            count: 1,
            model: 'V_2'
          })
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Api-Key': 'test-api-key',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should return true for valid API key with 400 response (bad request but valid auth)', async () => {
      // Mock API response with 400 (bad request but valid API key)
      adapter.httpClient.post.mockResolvedValue({
        status: 400,
        data: { error: 'Invalid prompt' }
      });

      const result = await adapter.validateApiKey();
      expect(result).toBe(true);
    });

    it('should return false for invalid API key (401/403)', async () => {
      // Mock API error response with authentication error
      const authError = new Error('Unauthorized');
      authError.response = { status: 401 };
      adapter.httpClient.post.mockRejectedValue(authError);

      const result = await adapter.validateApiKey();
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Ideogram API key validation failed')
      );
    });

    it('should return true for non-auth errors', async () => {
      // Mock API error response with non-auth error
      const networkError = new Error('Network error');
      adapter.httpClient.post.mockRejectedValue(networkError);

      const result = await adapter.validateApiKey();
      expect(result).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Ideogram API validation got non-auth error')
      );
    });

    it('should return false when API key is not configured', async () => {
      // Temporarily remove API key
      const originalApiKey = config.ideogram.apiKey;
      delete config.ideogram.apiKey;

      const result = await adapter.validateApiKey();
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Ideogram API key not found in configuration'
      );

      // Restore API key
      config.ideogram.apiKey = originalApiKey;
    });
  });

  describe('fetchModels', () => {
    it('should return predefined models', async () => {
      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(5);
      expect(models[0].id).toBe('ideogram-v1');
      expect(models[1].id).toBe('ideogram-alpha');
      expect(models[2].id).toBe('ideogram-v2');
      expect(models[3].id).toBe('ideogram-xl');
      expect(models[4].id).toBe('ideogram-v3');
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fetching Ideogram models (using predefined model data)...'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Successfully loaded 5 predefined Ideogram models'
      );
    });

    it('should log model details for debugging', async () => {
      await adapter.fetchModels();
      
      expect(mockLogger.debug).toHaveBeenCalledWith('Model: ideogram-v1 (version: V_1)');
      expect(mockLogger.debug).toHaveBeenCalledWith('Model: ideogram-v2 (version: V_2)');
      expect(mockLogger.debug).toHaveBeenCalledWith('Model: ideogram-v3 (version: V_3)');
    });
  });

  describe('getPredefinedModels', () => {
    it('should return correct predefined models', () => {
      const models = adapter.getPredefinedModels();
      
      expect(models).toHaveLength(5);
      
      // Check V1 model
      const v1Model = models.find(m => m.id === 'ideogram-v1');
      expect(v1Model).toBeDefined();
      expect(v1Model.version).toBe('V_1');
      expect(v1Model.capabilities).toContain('image_generation');
      
      // Check V2 model
      const v2Model = models.find(m => m.id === 'ideogram-v2');
      expect(v2Model).toBeDefined();
      expect(v2Model.version).toBe('V_2');
      expect(v2Model.capabilities).toContain('style_control');
      
      // Check V3 model
      const v3Model = models.find(m => m.id === 'ideogram-v3');
      expect(v3Model).toBeDefined();
      expect(v3Model.version).toBe('V_3');
      expect(v3Model.capabilities).toContain('magic_prompt');
    });

    it('should include required properties for all models', () => {
      const models = adapter.getPredefinedModels();
      
      models.forEach(model => {
        expect(model.id).toBeDefined();
        expect(model.version).toBeDefined();
        expect(model.display_name).toBeDefined();
        expect(model.description).toBeDefined();
        expect(model.capabilities).toBeDefined();
        expect(Array.isArray(model.capabilities)).toBe(true);
        expect(model.supported_aspect_ratios).toBeDefined();
        expect(Array.isArray(model.supported_aspect_ratios)).toBe(true);
      });
    });
  });

  describe('formatModel', () => {
    const rawModel = {
      id: 'ideogram-v2',
      version: 'V_2',
      display_name: 'Ideogram V2',
      description: 'Enhanced image generation with better quality',
      capabilities: ['image_generation', 'style_control'],
      max_resolution: '1024x1024',
      supported_aspect_ratios: ['1:1', '4:3', '3:4']
    };

    it('should format model correctly', () => {
      const formatted = adapter.formatModel(rawModel);
      
      expect(formatted.model_slug).toBe('ideogram-v2-ideogram');
      expect(formatted.api_model_id).toBe('ideogram-v2');
      expect(formatted.name).toBe('Ideogram V2');
      expect(formatted.description).toBe('Enhanced image generation with better quality');
      expect(formatted.max_tokens).toBe(0); // Image models don't use tokens
      expect(formatted.is_active).toBe(false);
      expect(formatted.metadata.owned_by).toBe('ideogram');
      expect(formatted.metadata.model_type).toBe('image_generation');
      expect(formatted.metadata.version).toBe('V_2');
      expect(formatted.metadata.capabilities).toEqual(['image_generation', 'style_control']);
    });

    it('should handle models without display_name', () => {
      const modelWithoutDisplayName = {
        id: 'ideogram-test',
        version: 'V_1',
        description: 'Test model'
      };
      
      const formatted = adapter.formatModel(modelWithoutDisplayName);
      
      expect(formatted.name).toBe('ideogram-test');
      expect(formatted.description).toBe('Test model');
    });

    it('should include pricing data when available', () => {
      const formatted = adapter.formatModel(rawModel);
      
      expect(formatted.pricing).toBeDefined();
      expect(formatted.pricing.price_image).toBe(0.10);
      expect(formatted.pricing.price_1m_input_tokens).toBe(0);
      expect(formatted.pricing.price_1m_output_tokens).toBe(0);
    });
  });

  describe('extractPricingData', () => {
    it('should extract pricing for known models', () => {
      const v1Model = { id: 'ideogram-v1' };
      const pricing = adapter.extractPricingData(v1Model);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_image).toBe(0.08);
      expect(pricing.price_1m_input_tokens).toBe(0);
      expect(pricing.price_1m_output_tokens).toBe(0);
      expect(pricing.score_cost_per_1k_tokens).toBeNull();
    });

    it('should handle V2 models', () => {
      const v2Model = { id: 'ideogram-v2' };
      const pricing = adapter.extractPricingData(v2Model);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_image).toBe(0.10);
    });

    it('should handle V3 models', () => {
      const v3Model = { id: 'ideogram-v3' };
      const pricing = adapter.extractPricingData(v3Model);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_image).toBe(0.15);
    });

    it('should handle XL models', () => {
      const xlModel = { id: 'ideogram-xl' };
      const pricing = adapter.extractPricingData(xlModel);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_image).toBe(0.12);
    });

    it('should handle unknown models with family-based pricing', () => {
      const unknownV3Model = { id: 'ideogram-v3-future' };
      const pricing = adapter.extractPricingData(unknownV3Model);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_image).toBe(0.15);
    });

    it('should return null for completely unknown models', () => {
      const unknownModel = { id: 'unknown-model' };
      const pricing = adapter.extractPricingData(unknownModel);
      
      expect(pricing).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No pricing data available for model: unknown-model'
      );
    });

    it('should handle errors gracefully', () => {
      const invalidModel = null;
      const pricing = adapter.extractPricingData(invalidModel);
      
      expect(pricing).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getFallbackModels', () => {
    it('should return same as predefined models', () => {
      const fallbackModels = adapter.getFallbackModels();
      const predefinedModels = adapter.getPredefinedModels();
      
      expect(fallbackModels).toEqual(predefinedModels);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Using fallback model data for Ideogram models'
      );
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when API key is valid', async () => {
      // Mock successful validation
      jest.spyOn(adapter, 'validateApiKey').mockResolvedValue(true);
      
      const health = await adapter.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.consecutiveFailures).toBe(0);
      expect(health.responseTime).toBeGreaterThanOrEqual(0);
      expect(health.lastCheck).toBeInstanceOf(Date);
    });

    it('should return unhealthy status when API key is invalid', async () => {
      // Mock failed validation
      jest.spyOn(adapter, 'validateApiKey').mockResolvedValue(false);
      
      const health = await adapter.healthCheck();
      
      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('API key validation failed');
      expect(health.consecutiveFailures).toBeGreaterThan(0);
    });

    it('should handle validation errors', async () => {
      // Mock validation error
      jest.spyOn(adapter, 'validateApiKey').mockRejectedValue(new Error('Network error'));
      
      const health = await adapter.healthCheck();
      
      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Network error');
      expect(health.consecutiveFailures).toBeGreaterThan(0);
    });
  });
});