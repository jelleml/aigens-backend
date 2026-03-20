/**
 * Tests for Base Provider Adapter
 * 
 * Comprehensive test suite for the base provider adapter functionality
 * including retry logic, error handling, metrics, and utility functions.
 */

const { BaseProviderAdapter } = require('../../../services/model-management/base-provider-adapter');
const axios = require('axios');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Test provider adapter implementation
class TestProviderAdapter extends BaseProviderAdapter {
  constructor(config, logger) {
    super(config, logger);
    this.testApiKey = config.apiKey || 'test-api-key';
  }

  async fetchModels() {
    const response = await this.httpClient.get('/test/models');
    return response.data.models || [];
  }

  formatModel(rawModel) {
    return {
      model_slug: this.createModelSlug(rawModel.id),
      api_model_id: rawModel.id,
      id_provider: 1,
      name: rawModel.name || rawModel.id,
      description: rawModel.description || `Test model ${rawModel.id}`,
      max_tokens: rawModel.max_tokens || 16000,
      is_active: false
    };
  }

  getApiKey() {
    return this.testApiKey;
  }

  async validateApiKey() {
    if (!this.getApiKey()) {
      return false;
    }
    
    try {
      await this.httpClient.get('/test/validate');
      return true;
    } catch (error) {
      return false;
    }
  }

  getFallbackModels() {
    return [
      {
        model_slug: 'test-model-1-test',
        api_model_id: 'test-model-1',
        id_provider: 1,
        name: 'Test Model 1',
        description: 'Fallback test model 1',
        max_tokens: 16000,
        is_active: false
      }
    ];
  }
}

describe('BaseProviderAdapter', () => {
  let adapter;
  let config;

  beforeEach(() => {
    config = {
      name: 'test',
      type: 'direct',
      apiUrl: 'https://api.test.com',
      timeout: 30000,
      apiKey: 'test-api-key',
      retry: {
        maxRetries: 3,
        initialDelay: 100,
        maxDelay: 1000,
        factor: 2,
        jitter: 0.1
      }
    };

    // Reset mocks
    jest.clearAllMocks();
    
    // Mock axios.create to return a mock HTTP client
    const mockHttpClient = {
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      },
      get: jest.fn(),
      post: jest.fn()
    };
    
    mockedAxios.create.mockReturnValue(mockHttpClient);
    
    adapter = new TestProviderAdapter(config, mockLogger);
  });

  describe('Constructor', () => {
    test('should initialize with correct configuration', () => {
      expect(adapter.config).toEqual(config);
      expect(adapter.logger).toBe(mockLogger);
      expect(adapter.name).toBe('test');
      expect(adapter.type).toBe('direct');
    });

    test('should initialize metrics with default values', () => {
      const metrics = adapter.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.averageResponseTime).toBe(0);
      expect(metrics.lastRequestTime).toBeNull();
      expect(metrics.errorCounts).toEqual({});
    });

    test('should initialize health status', () => {
      expect(adapter.healthStatus.status).toBe('healthy');
      expect(adapter.healthStatus.consecutiveFailures).toBe(0);
    });
  });

  describe('Error Classification', () => {
    test('should classify network errors correctly', () => {
      const networkError = new Error('Network error');
      networkError.code = 'ECONNRESET';
      
      expect(adapter.classifyError(networkError)).toBe('network_error');
    });

    test('should classify authentication errors correctly', () => {
      const authError = new Error('Unauthorized');
      authError.response = { status: 401 };
      
      expect(adapter.classifyError(authError)).toBe('auth_error');
    });

    test('should classify rate limit errors correctly', () => {
      const rateLimitError = new Error('Too many requests');
      rateLimitError.response = { status: 429 };
      
      expect(adapter.classifyError(rateLimitError)).toBe('rate_limit_error');
    });

    test('should classify server errors correctly', () => {
      const serverError = new Error('Internal server error');
      serverError.response = { status: 500 };
      
      expect(adapter.classifyError(serverError)).toBe('server_error');
    });
  });

  describe('Retry Logic', () => {
    test('should retry on retryable errors', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockRejectedValueOnce(new Error('Another temporary error'))
        .mockResolvedValueOnce('success');

      const result = await adapter.withRetry(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    test('should not retry on non-retryable errors', async () => {
      const authError = new Error('Unauthorized');
      authError.response = { status: 401 };
      
      const mockFn = jest.fn().mockRejectedValue(authError);

      await expect(adapter.withRetry(mockFn)).rejects.toThrow('Unauthorized');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should respect max retries', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Always fails'));

      await expect(adapter.withRetry(mockFn)).rejects.toThrow('Always fails');
      expect(mockFn).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });

  describe('Metrics Tracking', () => {
    test('should update metrics on successful request', () => {
      adapter.updateMetrics(true, 500);
      
      const metrics = adapter.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.averageResponseTime).toBe(500);
    });

    test('should update metrics on failed request', () => {
      adapter.updateMetrics(false, 1000, 'network_error');
      
      const metrics = adapter.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.errorCounts.network_error).toBe(1);
    });

    test('should calculate average response time correctly', () => {
      adapter.updateMetrics(true, 400);
      adapter.updateMetrics(true, 600);
      
      const metrics = adapter.getMetrics();
      expect(metrics.averageResponseTime).toBe(500);
    });

    test('should reset metrics', () => {
      adapter.updateMetrics(true, 500);
      adapter.resetMetrics();
      
      const metrics = adapter.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.errorCounts).toEqual({});
    });
  });

  describe('Health Check', () => {
    test('should return healthy status on successful validation', async () => {
      adapter.httpClient.get = jest.fn().mockResolvedValue({ data: { valid: true } });
      
      const health = await adapter.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.consecutiveFailures).toBe(0);
      expect(health.responseTime).toBeGreaterThanOrEqual(0);
    });

    test('should return unhealthy status on failed validation', async () => {
      adapter.httpClient.get = jest.fn().mockRejectedValue(new Error('API error'));
      
      const health = await adapter.healthCheck();
      
      expect(health.status).toBe('unhealthy');
      expect(health.consecutiveFailures).toBe(1);
      expect(health.error).toBe('API key validation failed');
    });
  });

  describe('Utility Functions', () => {
    test('should create model slug correctly', () => {
      const slug = adapter.createModelSlug('GPT-4.0-Turbo');
      expect(slug).toBe('gpt-4-0-turbo-test');
    });

    test('should create model slug with custom suffix', () => {
      const slug = adapter.createModelSlug('model-name', 'custom');
      expect(slug).toBe('model-name-custom');
    });

    test('should extract common model properties', () => {
      const rawModel = {
        id: 'test-model',
        name: 'Test Model',
        description: 'A test model',
        max_tokens: 8000,
        owned_by: 'test-org'
      };

      const properties = adapter.extractCommonModelProperties(rawModel);
      
      expect(properties.api_model_id).toBe('test-model');
      expect(properties.name).toBe('Test Model');
      expect(properties.description).toBe('A test model');
      expect(properties.max_tokens).toBe(8000);
      expect(properties.metadata.owned_by).toBe('test-org');
    });

    test('should use defaults for missing properties', () => {
      const rawModel = { id: 'minimal-model' };
      const defaults = { max_tokens: 32000, is_active: true };

      const properties = adapter.extractCommonModelProperties(rawModel, defaults);
      
      expect(properties.max_tokens).toBe(32000);
      expect(properties.is_active).toBe(true);
      expect(properties.name).toBe('minimal-model');
    });
  });

  describe('Batch Processing', () => {
    test('should process items in batches', async () => {
      const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const processor = jest.fn().mockResolvedValue({
        processed: 10,
        updated: 5,
        created: 3,
        skipped: 2,
        errors: 0
      });

      const results = await adapter.processBatches(items, processor, 10);
      
      expect(processor).toHaveBeenCalledTimes(3); // 25 items / 10 batch size = 3 batches
      expect(results.processed).toBe(30); // 3 batches * 10 processed each
      expect(results.updated).toBe(15); // 3 batches * 5 updated each
    });

    test('should handle batch processing errors', async () => {
      const items = Array.from({ length: 15 }, (_, i) => ({ id: i }));
      const processor = jest.fn()
        .mockResolvedValueOnce({ processed: 10, updated: 5, created: 3, skipped: 2, errors: 0 })
        .mockRejectedValueOnce(new Error('Batch failed'));

      const results = await adapter.processBatches(items, processor, 10);
      
      expect(results.processed).toBe(15); // First batch (10) + failed batch items (5)
      expect(results.errors).toBe(5); // All items in failed batch counted as errors
    });
  });

  describe('Response Validation', () => {
    test('should validate response data successfully', () => {
      const data = {
        models: ['model1', 'model2'],
        count: 2
      };
      
      const schema = {
        required: ['models'],
        fields: {
          models: 'array',
          count: 'number'
        }
      };

      expect(() => adapter.validateResponseData(data, schema)).not.toThrow();
    });

    test('should throw error for missing required fields', () => {
      const data = { count: 2 };
      const schema = { required: ['models'] };

      expect(() => adapter.validateResponseData(data, schema))
        .toThrow("Required field 'models' is missing from response");
    });

    test('should throw error for incorrect field types', () => {
      const data = { models: 'not-an-array' };
      const schema = { fields: { models: 'array' } };

      expect(() => adapter.validateResponseData(data, schema))
        .toThrow("Field 'models' should be array, got string");
    });
  });

  describe('Provider ID Management', () => {
    test('should get provider ID from database', async () => {
      const mockDb = {
        models: {
          Provider: {
            findOne: jest.fn().mockResolvedValue({ id: 123, name: 'test' })
          }
        }
      };

      const providerId = await adapter.getProviderId(mockDb);
      
      expect(providerId).toBe(123);
      expect(mockDb.models.Provider.findOne).toHaveBeenCalledWith({
        where: { name: 'test' }
      });
    });

    test('should cache provider ID', async () => {
      const mockDb = {
        models: {
          Provider: {
            findOne: jest.fn().mockResolvedValue({ id: 123, name: 'test' })
          }
        }
      };

      // First call
      await adapter.getProviderId(mockDb);
      // Second call
      const providerId = await adapter.getProviderId(mockDb);
      
      expect(providerId).toBe(123);
      expect(mockDb.models.Provider.findOne).toHaveBeenCalledTimes(1);
    });

    test('should throw error if provider not found', async () => {
      const mockDb = {
        models: {
          Provider: {
            findOne: jest.fn().mockResolvedValue(null)
          }
        }
      };

      await expect(adapter.getProviderId(mockDb)).rejects.toThrow("Provider 'test' not found in database");
    });
  });
});