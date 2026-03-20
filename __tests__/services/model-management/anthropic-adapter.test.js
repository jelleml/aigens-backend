/**
 * Anthropic Adapter Tests
 * 
 * Tests for the Anthropic provider adapter implementation.
 */

const { AnthropicAdapter } = require('../../../services/model-management/adapters/anthropic-adapter');
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
  anthropic: {
    apiKey: 'test-api-key'
  }
}));

describe('AnthropicAdapter', () => {
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
    adapter = new AnthropicAdapter(mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(adapter.name).toBe('anthropic');
      expect(adapter.type).toBe('direct');
      expect(adapter.config.apiUrl).toBe('https://api.anthropic.com/v1/models');
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
      const originalApiKey = config.anthropic.apiKey;
      delete config.anthropic.apiKey;
      
      expect(adapter.getApiKey()).toBeNull();
      
      // Restore config
      config.anthropic.apiKey = originalApiKey;
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
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01'
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
        expect.stringContaining('Anthropic API key validation failed')
      );
    });

    it('should return false when API key is not configured', async () => {
      // Temporarily remove API key
      const originalApiKey = config.anthropic.apiKey;
      delete config.anthropic.apiKey;

      const result = await adapter.validateApiKey();
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Anthropic API key not found in configuration'
      );

      // Restore API key
      config.anthropic.apiKey = originalApiKey;
    });
  });

  describe('fetchModels', () => {
    const mockApiResponse = {
      data: {
        data: [
          {
            id: 'claude-3-5-sonnet-20241022',
            display_name: 'Claude 3.5 Sonnet',
            type: 'text',
            max_tokens: 200000
          },
          {
            id: 'claude-3-haiku-20240307',
            display_name: 'Claude 3 Haiku',
            type: 'text',
            max_tokens: 200000
          }
        ]
      }
    };

    it('should fetch models successfully', async () => {
      // Mock successful API response
      adapter.httpClient.get.mockResolvedValue(mockApiResponse);

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('claude-3-5-sonnet-20241022');
      expect(models[1].id).toBe('claude-3-haiku-20240307');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully fetched 2 models from Anthropic API')
      );
    });

    it('should return fallback models when API fails', async () => {
      // Mock API error
      adapter.httpClient.get.mockRejectedValue(new Error('Network error'));

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(8); // Fallback models count
      expect(models[0].id).toBe('claude-3-haiku-20240307');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch models from Anthropic API')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Falling back to known Anthropic models...'
      );
    });

    it('should return fallback models when API key is missing', async () => {
      // Temporarily remove API key
      const originalApiKey = config.anthropic.apiKey;
      delete config.anthropic.apiKey;

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(8); // Fallback models count
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Anthropic API key not found, using fallback models'
      );

      // Restore API key
      config.anthropic.apiKey = originalApiKey;
    });
  });

  describe('formatModel', () => {
    const rawModel = {
      id: 'claude-3-5-sonnet-20241022',
      display_name: 'Claude 3.5 Sonnet',
      description: 'Enhanced version of Claude 3 Sonnet',
      type: 'text',
      max_tokens: 200000
    };

    it('should format model correctly', () => {
      const formatted = adapter.formatModel(rawModel);
      
      expect(formatted.model_slug).toBe('claude-3-5-sonnet-20241022-anthropic');
      expect(formatted.api_model_id).toBe('claude-3-5-sonnet-20241022');
      expect(formatted.name).toBe('Claude 3.5 Sonnet');
      expect(formatted.description).toBe('Enhanced version of Claude 3 Sonnet');
      expect(formatted.max_tokens).toBe(200000);
      expect(formatted.is_active).toBe(false);
      expect(formatted.metadata.owned_by).toBe('anthropic');
      expect(formatted.metadata.model_type).toBe('text');
    });

    it('should handle models without display_name', () => {
      const modelWithoutDisplayName = {
        id: 'claude-3-opus-20240229',
        type: 'text'
      };
      
      const formatted = adapter.formatModel(modelWithoutDisplayName);
      
      expect(formatted.name).toBe('claude-3-opus-20240229');
      expect(formatted.description).toBe('Anthropic claude-3-opus-20240229 model');
    });

    it('should use default max_tokens when not provided', () => {
      const modelWithoutTokens = {
        id: 'claude-3-sonnet-20240229',
        display_name: 'Claude 3 Sonnet',
        type: 'text'
      };
      
      const formatted = adapter.formatModel(modelWithoutTokens);
      
      expect(formatted.max_tokens).toBe(200000); // Default for Anthropic
    });

    it('should include pricing data when available', () => {
      const formatted = adapter.formatModel(rawModel);
      
      expect(formatted.pricing).toBeDefined();
      expect(formatted.pricing.price_1m_input_tokens).toBe(3.0);
      expect(formatted.pricing.price_1m_output_tokens).toBe(15.0);
    });
  });

  describe('extractPricingData', () => {
    it('should extract pricing for known models', () => {
      const claudeHaikuModel = { id: 'claude-3-haiku-20240307' };
      const pricing = adapter.extractPricingData(claudeHaikuModel);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_1m_input_tokens).toBe(0.25);
      expect(pricing.price_1m_output_tokens).toBe(1.25);
      expect(pricing.score_cost_per_1k_tokens).toBe(0.0015);
    });

    it('should handle unknown models with family-based pricing', () => {
      const unknownSonnetModel = { id: 'claude-4-sonnet-future' };
      const pricing = adapter.extractPricingData(unknownSonnetModel);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_1m_input_tokens).toBe(3.0);
      expect(pricing.price_1m_output_tokens).toBe(15.0);
    });

    it('should handle unknown haiku models', () => {
      const unknownHaikuModel = { id: 'claude-4-haiku-future' };
      const pricing = adapter.extractPricingData(unknownHaikuModel);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_1m_input_tokens).toBe(0.25);
      expect(pricing.price_1m_output_tokens).toBe(1.25);
    });

    it('should handle unknown opus models', () => {
      const unknownOpusModel = { id: 'claude-4-opus-future' };
      const pricing = adapter.extractPricingData(unknownOpusModel);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_1m_input_tokens).toBe(15.0);
      expect(pricing.price_1m_output_tokens).toBe(75.0);
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
      
      expect(fallbackModels).toHaveLength(8);
      expect(fallbackModels[0].id).toBe('claude-3-haiku-20240307');
      expect(fallbackModels[1].id).toBe('claude-3-sonnet-20240229');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Using fallback model data for Anthropic models'
      );
    });

    it('should include required properties for all models', () => {
      const fallbackModels = adapter.getFallbackModels();
      
      fallbackModels.forEach(model => {
        expect(model.id).toBeDefined();
        expect(model.display_name).toBeDefined();
        expect(model.description).toBeDefined();
        expect(model.max_tokens).toBe(200000);
        expect(model.type).toBe('text');
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