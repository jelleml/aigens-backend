/**
 * OpenAI Adapter Tests
 * 
 * Tests for the OpenAI provider adapter implementation.
 */

const { OpenAIAdapter } = require('../../../services/model-management/adapters/openai-adapter');
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
  openai: {
    apiKey: 'test-api-key'
  }
}));

describe('OpenAIAdapter', () => {
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
    adapter = new OpenAIAdapter(mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(adapter.name).toBe('openai');
      expect(adapter.type).toBe('direct');
      expect(adapter.config.apiUrl).toBe('https://api.openai.com/v1/models');
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
      const originalApiKey = config.openai.apiKey;
      delete config.openai.apiKey;
      
      expect(adapter.getApiKey()).toBeNull();
      
      // Restore config
      config.openai.apiKey = originalApiKey;
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
    });

    it('should return false for invalid API key', async () => {
      // Mock API error response
      adapter.httpClient.get.mockRejectedValue(new Error('Unauthorized'));

      const result = await adapter.validateApiKey();
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('OpenAI API key validation failed')
      );
    });

    it('should return false when API key is not configured', async () => {
      // Temporarily remove API key
      const originalApiKey = config.openai.apiKey;
      delete config.openai.apiKey;

      const result = await adapter.validateApiKey();
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'OpenAI API key not found in configuration'
      );

      // Restore API key
      config.openai.apiKey = originalApiKey;
    });
  });

  describe('fetchModels', () => {
    const mockApiResponse = {
      data: {
        data: [
          {
            id: 'gpt-4o',
            object: 'model',
            owned_by: 'openai-internal'
          },
          {
            id: 'gpt-3.5-turbo',
            object: 'model',
            owned_by: 'openai'
          },
          {
            id: 'text-embedding-ada-002',
            object: 'model',
            owned_by: 'openai-internal'
          }
        ]
      }
    };

    it('should fetch and filter models successfully', async () => {
      // Mock successful API response
      adapter.httpClient.get.mockResolvedValue(mockApiResponse);

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(2); // Should filter out embedding model
      expect(models[0].id).toBe('gpt-4o');
      expect(models[1].id).toBe('gpt-3.5-turbo');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully fetched 3 total models, 2 relevant models')
      );
    });

    it('should return fallback models when API fails', async () => {
      // Mock API error
      adapter.httpClient.get.mockRejectedValue(new Error('Network error'));

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(10); // Fallback models count
      expect(models[0].id).toBe('gpt-4o');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch models from OpenAI API')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Falling back to known OpenAI models...'
      );
    });

    it('should return fallback models when API key is missing', async () => {
      // Temporarily remove API key
      const originalApiKey = config.openai.apiKey;
      delete config.openai.apiKey;

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(10); // Fallback models count
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'OpenAI API key not found, using fallback models'
      );

      // Restore API key
      config.openai.apiKey = originalApiKey;
    });
  });

  describe('formatModel', () => {
    const rawModel = {
      id: 'gpt-4o',
      object: 'model',
      owned_by: 'openai-internal'
    };

    it('should format model correctly', () => {
      const formatted = adapter.formatModel(rawModel);
      
      expect(formatted.model_slug).toBe('gpt-4o-openai');
      expect(formatted.api_model_id).toBe('gpt-4o');
      expect(formatted.name).toBe('gpt-4o (OpenAI)');
      expect(formatted.description).toBe('OpenAI gpt-4o model');
      expect(formatted.max_tokens).toBe(128000); // GPT-4o should have 128k tokens
      expect(formatted.is_active).toBe(false);
      expect(formatted.metadata.owned_by).toBe('openai-internal');
    });

    it('should handle different token limits correctly', () => {
      const gpt4Model = { id: 'gpt-4', object: 'model', owned_by: 'openai' };
      const gpt35Model = { id: 'gpt-3.5-turbo-16k', object: 'model', owned_by: 'openai' };
      
      const formatted4 = adapter.formatModel(gpt4Model);
      const formatted35 = adapter.formatModel(gpt35Model);
      
      expect(formatted4.max_tokens).toBe(8192);
      expect(formatted35.max_tokens).toBe(16385);
    });

    it('should include pricing data when available', () => {
      const formatted = adapter.formatModel(rawModel);
      
      expect(formatted.pricing).toBeDefined();
      expect(formatted.pricing.price_1m_input_tokens).toBe(2.5);
      expect(formatted.pricing.price_1m_output_tokens).toBe(10.0);
    });
  });

  describe('extractPricingData', () => {
    it('should extract pricing for known models', () => {
      const gpt4oModel = { id: 'gpt-4o' };
      const pricing = adapter.extractPricingData(gpt4oModel);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_1m_input_tokens).toBe(2.5);
      expect(pricing.price_1m_output_tokens).toBe(10.0);
      expect(pricing.score_cost_per_1k_tokens).toBe(0.0125);
    });

    it('should handle unknown models with family-based pricing', () => {
      const unknownGpt4Model = { id: 'gpt-4-unknown-variant' };
      const pricing = adapter.extractPricingData(unknownGpt4Model);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_1m_input_tokens).toBe(30.0);
      expect(pricing.price_1m_output_tokens).toBe(60.0);
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
      
      expect(fallbackModels).toHaveLength(10);
      expect(fallbackModels[0].id).toBe('gpt-4o');
      expect(fallbackModels[1].id).toBe('gpt-4o-mini');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Using fallback model data for OpenAI models'
      );
    });

    it('should include context_length for all models', () => {
      const fallbackModels = adapter.getFallbackModels();
      
      fallbackModels.forEach(model => {
        expect(model.context_length).toBeDefined();
        expect(typeof model.context_length).toBe('number');
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