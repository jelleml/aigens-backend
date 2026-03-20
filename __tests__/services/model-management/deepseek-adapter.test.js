/**
 * DeepSeek Adapter Tests
 * 
 * Tests for the DeepSeek provider adapter implementation.
 */

const { DeepSeekAdapter } = require('../../../services/model-management/adapters/deepseek-adapter');
const config = require('../../../config/config');

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
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
  deepseek: {
    apiKey: 'test-api-key'
  }
}));

describe('DeepSeekAdapter', () => {
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
    adapter = new DeepSeekAdapter(mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(adapter.name).toBe('deepseek');
      expect(adapter.type).toBe('direct');
      expect(adapter.config.apiUrl).toBe('https://api.deepseek.com/v1/models');
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
      const originalApiKey = config.deepseek.apiKey;
      delete config.deepseek.apiKey;
      
      expect(adapter.getApiKey()).toBeNull();
      
      // Restore config
      config.deepseek.apiKey = originalApiKey;
    });
  });

  describe('validateApiKey', () => {
    it('should return true for valid API key', async () => {
      // Mock successful API response
      adapter.httpClient.get.mockResolvedValue({
        status: 200,
        data: { data: [] }
      });

      const result = await adapter.validateApiKey();
      expect(result).toBe(true);
      expect(adapter.httpClient.get).toHaveBeenCalledWith(
        adapter.config.apiUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
    });

    it('should return false for invalid API key', async () => {
      // Mock API error response
      adapter.httpClient.get.mockRejectedValue(new Error('Unauthorized'));

      const result = await adapter.validateApiKey();
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('DeepSeek API key validation failed')
      );
    });

    it('should return false when API key is not configured', async () => {
      // Temporarily remove API key
      const originalApiKey = config.deepseek.apiKey;
      delete config.deepseek.apiKey;

      const result = await adapter.validateApiKey();
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'DeepSeek API key not found in configuration'
      );

      // Restore API key
      config.deepseek.apiKey = originalApiKey;
    });
  });

  describe('fetchModels', () => {
    const mockApiResponse = {
      data: {
        data: [
          {
            id: 'deepseek-chat',
            object: 'model',
            owned_by: 'deepseek',
            context_length: 32000
          },
          {
            id: 'deepseek-coder',
            object: 'model',
            owned_by: 'deepseek',
            context_length: 32000
          }
        ]
      }
    };

    it('should fetch models successfully', async () => {
      // Mock successful API response
      adapter.httpClient.get.mockResolvedValue(mockApiResponse);

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('deepseek-chat');
      expect(models[1].id).toBe('deepseek-coder');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully fetched 2 models from DeepSeek API')
      );
    });

    it('should return fallback models when API fails', async () => {
      // Mock API error
      adapter.httpClient.get.mockRejectedValue(new Error('Network error'));

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(6); // Fallback models count
      expect(models[0].id).toBe('deepseek-chat');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch models from DeepSeek API')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Falling back to known DeepSeek models...'
      );
    });

    it('should return fallback models when API key is missing', async () => {
      // Temporarily remove API key
      const originalApiKey = config.deepseek.apiKey;
      delete config.deepseek.apiKey;

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(6); // Fallback models count
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'DeepSeek API key not found, using fallback models'
      );

      // Restore API key
      config.deepseek.apiKey = originalApiKey;
    });
  });

  describe('formatModel', () => {
    const rawModel = {
      id: 'deepseek-chat',
      object: 'model',
      owned_by: 'deepseek',
      context_length: 32000
    };

    it('should format model correctly', () => {
      const formatted = adapter.formatModel(rawModel);
      
      expect(formatted.model_slug).toBe('deepseek-chat-deepseek');
      expect(formatted.api_model_id).toBe('deepseek-chat');
      expect(formatted.name).toBe('deepseek-chat');
      expect(formatted.description).toBe('DeepSeek deepseek-chat model');
      expect(formatted.max_tokens).toBe(32000);
      expect(formatted.is_active).toBe(false);
      expect(formatted.metadata.owned_by).toBe('deepseek');
      expect(formatted.metadata.model_type).toBe('chat');
    });

    it('should handle models without context_length', () => {
      const modelWithoutContext = {
        id: 'deepseek-v3-chat',
        object: 'model',
        owned_by: 'deepseek'
      };
      
      const formatted = adapter.formatModel(modelWithoutContext);
      
      expect(formatted.max_tokens).toBe(16000); // Default fallback
    });

    it('should set correct context length for known model families', () => {
      const coderModel = {
        id: 'deepseek-coder',
        object: 'model',
        owned_by: 'deepseek'
      };
      
      const formatted = adapter.formatModel(coderModel);
      
      expect(formatted.max_tokens).toBe(32000); // Known model family default
    });

    it('should include pricing data when available', () => {
      const formatted = adapter.formatModel(rawModel);
      
      expect(formatted.pricing).toBeDefined();
      expect(formatted.pricing.price_1m_input_tokens).toBe(0.14);
      expect(formatted.pricing.price_1m_output_tokens).toBe(0.28);
    });
  });

  describe('extractPricingData', () => {
    it('should extract pricing for known models', () => {
      const deepseekChatModel = { id: 'deepseek-chat' };
      const pricing = adapter.extractPricingData(deepseekChatModel);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_1m_input_tokens).toBe(0.14);
      expect(pricing.price_1m_output_tokens).toBe(0.28);
      expect(pricing.score_cost_per_1k_tokens).toBe(0.00042);
    });

    it('should handle V3 models with different pricing', () => {
      const deepseekV3Model = { id: 'deepseek-v3-chat' };
      const pricing = adapter.extractPricingData(deepseekV3Model);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_1m_input_tokens).toBe(0.27);
      expect(pricing.price_1m_output_tokens).toBe(1.10);
    });

    it('should handle unknown models with family-based pricing', () => {
      const unknownV2Model = { id: 'deepseek-v2-unknown' };
      const pricing = adapter.extractPricingData(unknownV2Model);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_1m_input_tokens).toBe(0.14);
      expect(pricing.price_1m_output_tokens).toBe(0.28);
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
    it('should return correct fallback models', () => {
      const fallbackModels = adapter.getFallbackModels();
      
      expect(fallbackModels).toHaveLength(6);
      expect(fallbackModels[0].id).toBe('deepseek-chat');
      expect(fallbackModels[1].id).toBe('deepseek-coder');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Using fallback model data for DeepSeek models'
      );
    });

    it('should include required properties for all models', () => {
      const fallbackModels = adapter.getFallbackModels();
      
      fallbackModels.forEach(model => {
        expect(model.id).toBeDefined();
        expect(model.object).toBe('model');
        expect(model.owned_by).toBe('deepseek');
        expect(model.context_length).toBeDefined();
        expect(typeof model.context_length).toBe('number');
      });
    });

    it('should have correct context lengths for different model versions', () => {
      const fallbackModels = adapter.getFallbackModels();
      
      const v3Models = fallbackModels.filter(m => m.id.includes('v3'));
      const otherModels = fallbackModels.filter(m => !m.id.includes('v3'));
      
      v3Models.forEach(model => {
        expect(model.context_length).toBe(64000);
      });
      
      otherModels.forEach(model => {
        expect(model.context_length).toBe(32000);
      });
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