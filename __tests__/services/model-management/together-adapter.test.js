/**
 * Together.ai Provider Adapter Tests
 * 
 * Tests for the Together.ai provider adapter implementation.
 */

const { TogetherAdapter } = require('../../../services/model-management/adapters/together-adapter');
const axios = require('axios');

// Mock axios
jest.mock('axios');

// Mock config
jest.mock('../../../config/config', () => ({
  together: {
    apiKey: 'test-api-key'
  }
}));

describe('TogetherAdapter', () => {
  let adapter;
  let mockLogger;
  
  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn()
    };
    
    // Create adapter instance with mock logger
    adapter = new TogetherAdapter(mockLogger);
    
    // Mock axios create method
    axios.create.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('constructor', () => {
    it('should initialize with correct provider config', () => {
      expect(adapter.name).toBe('together');
      expect(adapter.type).toBe('direct');
      expect(adapter.config.apiUrl).toBe('https://api.together.xyz/v1/models');
    });
  });
  
  describe('getApiKey', () => {
    it('should return API key from config', () => {
      expect(adapter.getApiKey()).toBe('test-api-key');
    });
  });
  
  describe('validateApiKey', () => {
    it('should return true for valid API key', async () => {
      adapter.httpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: [{ id: 'model1' }]
      });
      
      const result = await adapter.validateApiKey();
      expect(result).toBe(true);
      expect(adapter.httpClient.get).toHaveBeenCalledWith(
        'https://api.together.xyz/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
    });
    
    it('should return false for invalid API key', async () => {
      adapter.httpClient.get = jest.fn().mockRejectedValue({
        response: { status: 401 },
        message: 'Unauthorized'
      });
      
      const result = await adapter.validateApiKey();
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
    
    it('should return false when API key is missing', async () => {
      jest.resetModules();
      jest.mock('../../../config/config', () => ({
        together: {}
      }));
      
      const { TogetherAdapter } = require('../../../services/model-management/adapters/together-adapter');
      const adapterWithoutKey = new TogetherAdapter(mockLogger);
      
      const result = await adapterWithoutKey.validateApiKey();
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
  
  describe('fetchModels', () => {
    it('should fetch and return models from API', async () => {
      const mockModels = [
        {
          id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
          display_name: 'Mixtral 8x7B Instruct',
          context_length: 32768,
          organization: 'mistralai',
          type: 'chat',
          pricing: { input: 0.6, output: 0.6 }
        },
        {
          id: 'meta-llama/Llama-2-70b-chat-hf',
          display_name: 'Llama 2 70B Chat',
          context_length: 4096,
          organization: 'meta-llama',
          type: 'chat',
          pricing: { input: 0.9, output: 0.9 }
        }
      ];
      
      adapter.withRetry = jest.fn().mockResolvedValue({
        data: mockModels,
        status: 200
      });
      
      const result = await adapter.fetchModels();
      expect(result).toEqual(mockModels);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully fetched 2 models'));
    });
    
    it('should return fallback models when API call fails', async () => {
      adapter.withRetry = jest.fn().mockRejectedValue(new Error('API error'));
      adapter.getFallbackModels = jest.fn().mockReturnValue([{ id: 'fallback-model' }]);
      
      const result = await adapter.fetchModels();
      expect(result).toEqual([{ id: 'fallback-model' }]);
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Falling back'));
    });
    
    it('should handle empty response from API', async () => {
      adapter.withRetry = jest.fn().mockResolvedValue({
        data: [],
        status: 200
      });
      adapter.getFallbackModels = jest.fn().mockReturnValue([{ id: 'fallback-model' }]);
      
      await expect(adapter.fetchModels()).rejects.toThrow('Response data is not an array or is empty');
    });
    
    it('should warn about models with missing ID field', async () => {
      const mockModels = [
        { id: 'model1', display_name: 'Model 1' },
        { display_name: 'Invalid Model' } // Missing ID
      ];
      
      adapter.withRetry = jest.fn().mockResolvedValue({
        data: mockModels,
        status: 200
      });
      
      await adapter.fetchModels();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Found 1 models with missing ID field'));
    });
  });
  
  describe('formatModel', () => {
    it('should format raw model data correctly', () => {
      const rawModel = {
        id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
        display_name: 'Mixtral 8x7B Instruct',
        context_length: 32768,
        organization: 'mistralai',
        type: 'chat',
        pricing: { input: 0.6, output: 0.6 }
      };
      
      adapter.createModelSlug = jest.fn().mockReturnValue('mistralai-mixtral-8x7b-instruct-v0-1-together');
      adapter.extractPricingData = jest.fn().mockReturnValue({
        price_1m_input_tokens: 0.6,
        price_1m_output_tokens: 0.6,
        score_cost_per_1k_tokens: 0.0006
      });
      
      const result = adapter.formatModel(rawModel);
      
      expect(result).toEqual({
        model_slug: 'mistralai-mixtral-8x7b-instruct-v0-1-together',
        api_model_id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
        name: 'Mixtral 8x7B Instruct',
        description: 'Together.ai model: Mixtral 8x7B Instruct',
        max_tokens: 32768,
        is_active: false,
        metadata: {
          owned_by: 'mistralai',
          context_length: 32768,
          model_type: 'chat',
          organization: 'mistralai',
          additional_info: {
            pricing: { input: 0.6, output: 0.6 }
          }
        },
        pricing: {
          price_1m_input_tokens: 0.6,
          price_1m_output_tokens: 0.6,
          score_cost_per_1k_tokens: 0.0006
        }
      });
    });
    
    it('should handle models with missing context_length', () => {
      const rawModel = {
        id: 'model-without-context',
        display_name: 'Test Model',
        organization: 'test-org'
      };
      
      adapter.createModelSlug = jest.fn().mockReturnValue('model-without-context-together');
      adapter.extractPricingData = jest.fn().mockReturnValue(null);
      
      const result = adapter.formatModel(rawModel);
      
      expect(result.max_tokens).toBe(16000); // Default value
      expect(result.metadata.context_length).toBe(16000);
    });
  });
  
  describe('extractPricingData', () => {
    it('should extract pricing data correctly', () => {
      const model = {
        id: 'test-model',
        pricing: { input: '0.5', output: '1.0' }
      };
      
      const result = adapter.extractPricingData(model);
      
      expect(result).toEqual({
        price_1m_input_tokens: 0.5,
        price_1m_output_tokens: 1.0,
        score_cost_per_1k_tokens: 0.00075,
        score_intelligence: null,
        score_speed: null,
        score_overall: null
      });
    });
    
    it('should return null for models without pricing data', () => {
      const model = { id: 'test-model' };
      const result = adapter.extractPricingData(model);
      expect(result).toBeNull();
    });
    
    it('should handle invalid pricing values', () => {
      const model = {
        id: 'test-model',
        pricing: { input: 'invalid', output: 'invalid' }
      };
      
      const result = adapter.extractPricingData(model);
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
    
    it('should handle negative pricing values', () => {
      const model = {
        id: 'test-model',
        pricing: { input: '-1', output: '1' }
      };
      
      const result = adapter.extractPricingData(model);
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
  
  describe('getFallbackModels', () => {
    it('should return an array of fallback models', () => {
      const fallbackModels = adapter.getFallbackModels();
      
      expect(Array.isArray(fallbackModels)).toBe(true);
      expect(fallbackModels.length).toBeGreaterThan(0);
      
      // Check structure of first fallback model
      const firstModel = fallbackModels[0];
      expect(firstModel).toHaveProperty('id');
      expect(firstModel).toHaveProperty('display_name');
      expect(firstModel).toHaveProperty('context_length');
      expect(firstModel).toHaveProperty('organization');
    });
  });
  
  describe('healthCheck', () => {
    it('should return healthy status when API key is valid', async () => {
      adapter.validateApiKey = jest.fn().mockResolvedValue(true);
      
      const result = await adapter.healthCheck();
      
      expect(result.status).toBe('healthy');
      expect(result.consecutiveFailures).toBe(0);
      expect(result.lastCheck).toBeInstanceOf(Date);
    });
    
    it('should return unhealthy status when API key is invalid', async () => {
      adapter.validateApiKey = jest.fn().mockResolvedValue(false);
      
      const result = await adapter.healthCheck();
      
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('API key validation failed');
      expect(result.consecutiveFailures).toBe(1);
    });
    
    it('should return unhealthy status when validation throws error', async () => {
      adapter.validateApiKey = jest.fn().mockRejectedValue(new Error('Connection error'));
      
      const result = await adapter.healthCheck();
      
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection error');
      expect(result.consecutiveFailures).toBe(1);
    });
  });
});