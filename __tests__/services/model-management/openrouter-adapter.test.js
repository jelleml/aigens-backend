/**
 * OpenRouter Adapter Tests
 * 
 * Tests for the OpenRouter provider adapter implementation.
 */

const { OpenRouterAdapter } = require('../../../services/model-management/adapters/openrouter-adapter');
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
  openrouter: {
    apiKey: 'test-openrouter-api-key'
  }
}));

describe('OpenRouterAdapter', () => {
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
    adapter = new OpenRouterAdapter(mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(adapter.name).toBe('openrouter');
      expect(adapter.type).toBe('aggregator');
      expect(adapter.config.apiUrl).toBe('https://openrouter.ai/api/v1/models');
      expect(adapter.config.timeout).toBe(30000);
    });

    it('should set up HTTP client with correct defaults', () => {
      expect(adapter.httpClient).toBeDefined();
      expect(adapter.httpClient.defaults.timeout).toBe(30000);
    });

    it('should set up response validation schema', () => {
      expect(adapter.responseSchema).toEqual({
        required: ['data'],
        fields: {
          data: 'array'
        }
      });
    });
  });

  describe('getApiKey', () => {
    it('should return API key from config', () => {
      expect(adapter.getApiKey()).toBe('test-openrouter-api-key');
    });

    it('should return null when API key is not configured', () => {
      // Temporarily modify config
      const originalApiKey = config.openrouter.apiKey;
      delete config.openrouter.apiKey;
      
      expect(adapter.getApiKey()).toBeNull();
      
      // Restore config
      config.openrouter.apiKey = originalApiKey;
    });
  });

  describe('validateApiKey', () => {
    it('should return true for valid API key', async () => {
      // Mock successful API response
      adapter.httpClient.get.mockResolvedValue({
        status: 200,
        data: {
          data: []
        }
      });

      const result = await adapter.validateApiKey();
      expect(result).toBe(true);
      expect(adapter.httpClient.get).toHaveBeenCalledWith(
        adapter.config.apiUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-openrouter-api-key',
            'Content-Type': 'application/json'
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
        expect.stringContaining('OpenRouter API key validation failed')
      );
    });

    it('should return false when API key is not configured', async () => {
      // Temporarily remove API key
      const originalApiKey = config.openrouter.apiKey;
      delete config.openrouter.apiKey;

      const result = await adapter.validateApiKey();
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'OpenRouter API key not found in configuration'
      );

      // Restore API key
      config.openrouter.apiKey = originalApiKey;
    });

    it('should return false for invalid response format', async () => {
      // Mock invalid response format
      adapter.httpClient.get.mockResolvedValue({
        status: 200,
        data: { error: 'Invalid response' }
      });

      const result = await adapter.validateApiKey();
      expect(result).toBe(false);
    });

    it('should return false when data is not an array', async () => {
      // Mock response with non-array data
      adapter.httpClient.get.mockResolvedValue({
        status: 200,
        data: {
          data: 'not an array'
        }
      });

      const result = await adapter.validateApiKey();
      expect(result).toBe(false);
    });
  });

  describe('fetchModels', () => {
    const mockApiResponse = {
      data: {
        data: [
          {
            id: 'openai/gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            description: 'OpenAI GPT-3.5 Turbo',
            context_length: 16385,
            owned_by: 'openai',
            pricing: { prompt: 0.0000015, completion: 0.000002 }
          },
          {
            id: 'anthropic/claude-3-haiku',
            name: 'Claude 3 Haiku',
            description: 'Anthropic Claude 3 Haiku',
            context_length: 200000,
            owned_by: 'anthropic',
            pricing: { prompt: 0.00000025, completion: 0.00000125 }
          },
          {
            id: 'invalid/negative-pricing',
            name: 'Invalid Model',
            description: 'Model with negative pricing',
            context_length: 8192,
            pricing: { prompt: -0.001, completion: 0.002 }
          },
          {
            id: 'free/model',
            name: 'Free Model',
            description: 'Free model',
            context_length: 4096,
            pricing: { prompt: 0, completion: 0 }
          }
        ]
      }
    };

    it('should fetch and filter valid models successfully', async () => {
      // Mock successful API response
      adapter.httpClient.get.mockResolvedValue(mockApiResponse);

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(3); // Excludes negative pricing model
      expect(models[0].id).toBe('openai/gpt-3.5-turbo');
      expect(models[1].id).toBe('anthropic/claude-3-haiku');
      expect(models[2].id).toBe('free/model');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully fetched 3 valid models from OpenRouter API (4 total)')
      );
    });

    it('should return fallback models when API fails', async () => {
      // Mock API error
      adapter.httpClient.get.mockRejectedValue(new Error('Network error'));

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(8); // Fallback models count
      expect(models[0].id).toBe('openai/gpt-3.5-turbo');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch models from OpenRouter API')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Falling back to known OpenRouter models...'
      );
    });

    it('should return fallback models when API key is missing', async () => {
      // Temporarily remove API key
      const originalApiKey = config.openrouter.apiKey;
      delete config.openrouter.apiKey;

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(8); // Fallback models count
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'OpenRouter API key not found, using fallback models'
      );

      // Restore API key
      config.openrouter.apiKey = originalApiKey;
    });

    it('should handle invalid response format', async () => {
      // Mock invalid response
      adapter.httpClient.get.mockResolvedValue({
        data: { error: 'Invalid format' }
      });

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(8); // Fallback models count
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch models from OpenRouter API')
      );
    });

    it('should filter out models with negative pricing', async () => {
      const responseWithNegativePricing = {
        data: {
          data: [
            {
              id: 'valid/model',
              name: 'Valid Model',
              pricing: { prompt: 0.001, completion: 0.002 }
            },
            {
              id: 'negative/input',
              name: 'Negative Input',
              pricing: { prompt: -0.001, completion: 0.002 }
            },
            {
              id: 'negative/output',
              name: 'Negative Output',
              pricing: { prompt: 0.001, completion: -0.002 }
            }
          ]
        }
      };

      adapter.httpClient.get.mockResolvedValue(responseWithNegativePricing);

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('valid/model');
    });
  });

  describe('formatModel', () => {
    const rawModel = {
      id: 'openai/gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      description: 'OpenAI GPT-3.5 Turbo model',
      context_length: 16385,
      owned_by: 'openai',
      created: 1234567890,
      top_provider: 'openai',
      pricing: { prompt: 0.0000015, completion: 0.000002 }
    };

    it('should format model correctly', () => {
      const formatted = adapter.formatModel(rawModel);
      
      expect(formatted.model_slug).toBe('openai-gpt-3-5-turbo-openrouter');
      expect(formatted.api_model_id).toBe('openai-gpt-3-5-turbo');
      expect(formatted.name).toBe('GPT-3.5 Turbo');
      expect(formatted.description).toBe('OpenAI GPT-3.5 Turbo model');
      expect(formatted.max_tokens).toBe(16385);
      expect(formatted.is_active).toBe(true);
      expect(formatted.metadata.owned_by).toBe('openai');
      expect(formatted.metadata.context_length).toBe(16385);
      expect(formatted.metadata.model_type).toBe('chat');
      expect(formatted.metadata.original_id).toBe('openai/gpt-3.5-turbo');
      expect(formatted.metadata.created).toBe(1234567890);
      expect(formatted.metadata.top_provider).toBe('openai');
    });

    it('should handle complex model IDs with special characters', () => {
      const complexModel = {
        id: 'meta-llama/Llama-3.1-8B-Instruct',
        name: 'Llama 3.1 8B Instruct',
        context_length: 8192
      };
      
      const formatted = adapter.formatModel(complexModel);
      
      expect(formatted.model_slug).toBe('meta-llama-llama-3-1-8b-instruct-openrouter');
      expect(formatted.api_model_id).toBe('meta-llama-llama-3-1-8b-instruct');
    });

    it('should use default values when properties are missing', () => {
      const minimalModel = {
        id: 'test/minimal-model'
      };
      
      const formatted = adapter.formatModel(minimalModel);
      
      expect(formatted.name).toBe('test/minimal-model');
      expect(formatted.description).toBe('OpenRouter aggregated model: test/minimal-model');
      expect(formatted.max_tokens).toBe(16000);
      expect(formatted.metadata.owned_by).toBe('openrouter');
      expect(formatted.metadata.model_type).toBe('chat');
    });

    it('should include pricing data when available', () => {
      const formatted = adapter.formatModel(rawModel);
      
      expect(formatted.pricing).toBeDefined();
      expect(formatted.pricing.price_1m_input_tokens).toBeCloseTo(1.5, 5); // 0.0000015 * 1000000
      expect(formatted.pricing.price_1m_output_tokens).toBeCloseTo(2.0, 5); // 0.000002 * 1000000
      expect(formatted.pricing.score_cost_per_1k_tokens).toBeCloseTo(0.0035, 6); // (1.5 + 2.0) / 1000
    });

    it('should handle model without name', () => {
      const modelWithoutName = {
        id: 'test/no-name-model',
        context_length: 4096
      };
      
      const formatted = adapter.formatModel(modelWithoutName);
      
      expect(formatted.name).toBe('test/no-name-model');
    });
  });

  describe('extractPricingData', () => {
    it('should extract pricing data correctly', () => {
      const model = {
        id: 'test-model',
        pricing: { prompt: 0.0000005, completion: 0.0000008 }
      };
      
      const pricing = adapter.extractPricingData(model);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_1m_input_tokens).toBeCloseTo(0.5, 5); // 0.0000005 * 1000000
      expect(pricing.price_1m_output_tokens).toBeCloseTo(0.8, 5); // 0.0000008 * 1000000
      expect(pricing.score_cost_per_1k_tokens).toBeCloseTo(0.0013, 6); // (0.5 + 0.8) / 1000
    });

    it('should handle zero pricing', () => {
      const model = {
        id: 'free-model',
        pricing: { prompt: 0, completion: 0 }
      };
      
      const pricing = adapter.extractPricingData(model);
      
      expect(pricing).toBeDefined();
      expect(pricing.price_1m_input_tokens).toBe(0);
      expect(pricing.price_1m_output_tokens).toBe(0);
      expect(pricing.score_cost_per_1k_tokens).toBe(0);
    });

    it('should return null when pricing is missing', () => {
      const model = {
        id: 'no-pricing-model'
      };
      
      const pricing = adapter.extractPricingData(model);
      
      expect(pricing).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'No valid pricing data available for model: no-pricing-model'
      );
    });

    it('should return null for negative pricing', () => {
      const model = {
        id: 'negative-pricing-model',
        pricing: { prompt: -0.001, completion: 0.002 }
      };
      
      const pricing = adapter.extractPricingData(model);
      
      expect(pricing).toBeNull();
    });

    it('should handle invalid pricing format', () => {
      const model = {
        id: 'invalid-pricing-model',
        pricing: { prompt: 'invalid', completion: 'also-invalid' }
      };
      
      const pricing = adapter.extractPricingData(model);
      
      expect(pricing).toBeNull();
    });

    it('should handle missing prompt or completion pricing', () => {
      const modelMissingPrompt = {
        id: 'missing-prompt',
        pricing: { completion: 0.002 }
      };
      
      const modelMissingCompletion = {
        id: 'missing-completion',
        pricing: { prompt: 0.001 }
      };
      
      const pricingMissingPrompt = adapter.extractPricingData(modelMissingPrompt);
      const pricingMissingCompletion = adapter.extractPricingData(modelMissingCompletion);
      
      expect(pricingMissingPrompt.price_1m_input_tokens).toBe(0);
      expect(pricingMissingPrompt.price_1m_output_tokens).toBe(2000);
      
      expect(pricingMissingCompletion.price_1m_input_tokens).toBe(1000);
      expect(pricingMissingCompletion.price_1m_output_tokens).toBe(0);
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
      expect(fallbackModels[0].id).toBe('openai/gpt-3.5-turbo');
      expect(fallbackModels[1].id).toBe('openai/gpt-4');
      expect(fallbackModels[2].id).toBe('anthropic/claude-3-haiku');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Using fallback model data for OpenRouter models'
      );
    });

    it('should include required properties for all models', () => {
      const fallbackModels = adapter.getFallbackModels();
      
      fallbackModels.forEach(model => {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.description).toBeDefined();
        expect(model.context_length).toBeDefined();
        expect(model.owned_by).toBeDefined();
        expect(model.pricing).toBeDefined();
        expect(model.pricing.prompt).toBeDefined();
        expect(model.pricing.completion).toBeDefined();
      });
    });

    it('should include models from different providers', () => {
      const fallbackModels = adapter.getFallbackModels();
      
      const providers = [...new Set(fallbackModels.map(m => m.owned_by))];
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('meta-llama');
      expect(providers).toContain('mistralai');
    });

    it('should have valid pricing for all fallback models', () => {
      const fallbackModels = adapter.getFallbackModels();
      
      fallbackModels.forEach(model => {
        expect(parseFloat(model.pricing.prompt)).toBeGreaterThanOrEqual(0);
        expect(parseFloat(model.pricing.completion)).toBeGreaterThanOrEqual(0);
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

    it('should track consecutive failures', async () => {
      // Mock failed validation
      jest.spyOn(adapter, 'validateApiKey').mockResolvedValue(false);
      
      // First failure
      const health1 = await adapter.healthCheck();
      expect(health1.consecutiveFailures).toBe(1);
      
      // Second failure
      const health2 = await adapter.healthCheck();
      expect(health2.consecutiveFailures).toBe(2);
      
      // Recovery
      jest.spyOn(adapter, 'validateApiKey').mockResolvedValue(true);
      const health3 = await adapter.healthCheck();
      expect(health3.consecutiveFailures).toBe(0);
    });

    it('should measure response time', async () => {
      // Mock slow validation
      jest.spyOn(adapter, 'validateApiKey').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return true;
      });
      
      const health = await adapter.healthCheck();
      
      expect(health.responseTime).toBeGreaterThanOrEqual(100);
    });
  });

  describe('createModelSlug', () => {
    it('should create proper slugs for complex model IDs', () => {
      const testCases = [
        {
          input: 'openai/gpt-3.5-turbo',
          expected: 'openai-gpt-3-5-turbo-openrouter'
        },
        {
          input: 'anthropic/claude-3-haiku',
          expected: 'anthropic-claude-3-haiku-openrouter'
        },
        {
          input: 'meta-llama/Llama-3.1-8B-Instruct',
          expected: 'meta-llama-llama-3-1-8b-instruct-openrouter'
        },
        {
          input: 'mistralai/mixtral-8x7b-instruct',
          expected: 'mistralai-mixtral-8x7b-instruct-openrouter'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const slug = adapter.createModelSlug(input);
        expect(slug).toBe(expected);
      });
    });

    it('should handle models with dots and special characters', () => {
      const testCases = [
        {
          input: 'stabilityai/stable-diffusion-xl-base-1.0',
          expected: 'stabilityai-stable-diffusion-xl-base-1-0-openrouter'
        },
        {
          input: 'google/gemma-2b-it',
          expected: 'google-gemma-2b-it-openrouter'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const slug = adapter.createModelSlug(input);
        expect(slug).toBe(expected);
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty API response', async () => {
      adapter.httpClient.get.mockResolvedValue({
        data: {
          data: []
        }
      });

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully fetched 0 valid models from OpenRouter API (0 total)')
      );
    });

    it('should handle malformed model objects', () => {
      const malformedModel = {
        // Missing required id field
        name: 'Malformed Model'
      };
      
      const formatted = adapter.formatModel(malformedModel);
      
      expect(formatted.model_slug).toContain('openrouter');
      expect(formatted.api_model_id).toBeDefined();
    });

    it('should handle network timeouts gracefully', async () => {
      const timeoutError = new Error('timeout of 30000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      
      adapter.httpClient.get.mockRejectedValue(timeoutError);

      const models = await adapter.fetchModels();
      
      expect(models).toHaveLength(8); // Should return fallback models
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch models from OpenRouter API')
      );
    });
  });
});