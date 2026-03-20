/**
 * Integration Tests for Model Management System
 * 
 * Tests the integration between the provider interface, base adapter, and utilities
 * to ensure the unified model management system works as expected.
 */

const { ProviderAdapter } = require('../../../services/model-management/interfaces/provider-adapter.interface');
const { BaseProviderAdapter } = require('../../../services/model-management/base-provider-adapter');
const { 
  validateStandardModel, 
  sanitizeModelData,
  normalizeModelSlug 
} = require('../../../services/model-management/utils/model-utils');

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Test implementation of a complete provider adapter
class IntegrationTestAdapter extends BaseProviderAdapter {
  constructor(config, logger) {
    super(config, logger);
    this.testModels = [
      {
        id: 'test-model-1',
        name: 'Test Model 1',
        description: 'First test model',
        max_tokens: 16000,
        owned_by: 'test-provider'
      },
      {
        id: 'test-model-2',
        name: 'Test Model 2',
        description: 'Second test model',
        max_tokens: 32000,
        owned_by: 'test-provider'
      }
    ];
  }

  async fetchModels() {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 10));
    return this.testModels;
  }

  formatModel(rawModel) {
    const commonProps = this.extractCommonModelProperties(rawModel, {
      is_active: false
    });

    return {
      model_slug: normalizeModelSlug(this.createModelSlug(rawModel.id)),
      api_model_id: commonProps.api_model_id,
      id_provider: 1, // Test provider ID
      name: commonProps.name,
      description: commonProps.description,
      max_tokens: commonProps.max_tokens,
      is_active: commonProps.is_active,
      metadata: commonProps.metadata
    };
  }

  getApiKey() {
    return this.config.apiKey || 'test-api-key';
  }

  async validateApiKey() {
    const apiKey = this.getApiKey();
    return apiKey && apiKey.length > 0;
  }

  getFallbackModels() {
    return [
      {
        model_slug: 'fallback-model-test',
        api_model_id: 'fallback-model',
        id_provider: 1,
        name: 'Fallback Model',
        description: 'Fallback model for testing',
        max_tokens: 8000,
        is_active: false
      }
    ];
  }
}

describe('Model Management Integration', () => {
  let adapter;
  let config;

  beforeEach(() => {
    config = {
      name: 'test-integration',
      type: 'direct',
      apiUrl: 'https://api.test-integration.com',
      timeout: 30000,
      apiKey: 'test-integration-key',
      retry: {
        maxRetries: 2,
        initialDelay: 50,
        maxDelay: 200,
        factor: 2,
        jitter: 0.1
      }
    };

    adapter = new IntegrationTestAdapter(config, mockLogger);
    jest.clearAllMocks();
  });

  describe('Provider Interface Implementation', () => {
    test('should implement all required interface methods', () => {
      expect(adapter).toBeInstanceOf(ProviderAdapter);
      expect(adapter).toBeInstanceOf(BaseProviderAdapter);
      
      // Check that all abstract methods are implemented
      expect(typeof adapter.fetchModels).toBe('function');
      expect(typeof adapter.formatModel).toBe('function');
      expect(typeof adapter.validateApiKey).toBe('function');
      expect(typeof adapter.getFallbackModels).toBe('function');
    });

    test('should have correct provider identification', () => {
      expect(adapter.name).toBe('test-integration');
      expect(adapter.type).toBe('direct');
      expect(adapter.getConfig()).toEqual(config);
    });
  });

  describe('End-to-End Model Processing', () => {
    test('should fetch, format, and validate models', async () => {
      // Fetch raw models
      const rawModels = await adapter.fetchModels();
      expect(rawModels).toHaveLength(2);
      expect(rawModels[0].id).toBe('test-model-1');

      // Format models
      const formattedModels = rawModels.map(model => adapter.formatModel(model));
      expect(formattedModels).toHaveLength(2);

      // Validate each formatted model
      formattedModels.forEach(model => {
        expect(() => validateStandardModel(model)).not.toThrow();
        expect(model.model_slug).toMatch(/^test-model-\d+-test-integration$/);
        expect(model.api_model_id).toMatch(/^test-model-\d+$/);
        expect(model.id_provider).toBe(1);
        expect(model.is_active).toBe(false);
      });
    });

    test('should sanitize model data correctly', async () => {
      const rawModels = await adapter.fetchModels();
      const formattedModels = rawModels.map(model => adapter.formatModel(model));
      
      // Add some problematic data to test sanitization
      const problematicModel = {
        ...formattedModels[0],
        name: '  Test Model with Extra Spaces  ',
        description: 'A'.repeat(1500), // Too long
        max_tokens: '16000' // String instead of number
      };

      const sanitized = sanitizeModelData(problematicModel);
      
      expect(sanitized.name).toBe('Test Model with Extra Spaces');
      expect(sanitized.description).toHaveLength(1000); // Truncated
      expect(sanitized.max_tokens).toBe(16000); // Converted to number
      expect(typeof sanitized.max_tokens).toBe('number');
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle API failures gracefully', async () => {
      // Mock a failing adapter
      const failingAdapter = new IntegrationTestAdapter(config, mockLogger);
      failingAdapter.fetchModels = jest.fn().mockRejectedValue(new Error('API failure'));

      // Should be able to get fallback models
      const fallbackModels = failingAdapter.getFallbackModels();
      expect(fallbackModels).toHaveLength(1);
      expect(fallbackModels[0].model_slug).toBe('fallback-model-test');
    });

    test('should perform health checks', async () => {
      const health = await adapter.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.consecutiveFailures).toBe(0);
      expect(health.responseTime).toBeGreaterThanOrEqual(0);
      expect(health.lastCheck).toBeInstanceOf(Date);
    });

    test('should track metrics correctly', async () => {
      // Simulate some operations
      adapter.updateMetrics(true, 100);
      adapter.updateMetrics(true, 200);
      adapter.updateMetrics(false, 300, 'network_error');

      const metrics = adapter.getMetrics();
      
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.successfulRequests).toBe(2);
      expect(metrics.failedRequests).toBe(1);
      // Average calculation: ((0 * 0) + 100) / 1 = 100, then ((100 * 1) + 200) / 2 = 150
      // Failed requests don't affect average response time calculation
      expect(metrics.averageResponseTime).toBe(150);
      expect(metrics.errorCounts.network_error).toBe(1);
    });
  });

  describe('Batch Processing', () => {
    test('should process models in batches', async () => {
      const rawModels = await adapter.fetchModels();
      
      const processor = jest.fn().mockImplementation(async (batch) => {
        // Simulate processing each model in the batch
        const processed = batch.map(model => adapter.formatModel(model));
        return {
          processed: processed.length,
          updated: 0,
          created: processed.length,
          skipped: 0,
          errors: 0
        };
      });

      const results = await adapter.processBatches(rawModels, processor, 1);
      
      expect(processor).toHaveBeenCalledTimes(2); // 2 models, batch size 1
      expect(results.processed).toBe(2);
      expect(results.created).toBe(2);
      expect(results.errors).toBe(0);
    });
  });

  describe('Utility Integration', () => {
    test('should create consistent model slugs', () => {
      const testCases = [
        { input: 'GPT-4.0-Turbo', expected: 'gpt-4-0-turbo-test-integration' },
        { input: 'Claude-3-Opus', expected: 'claude-3-opus-test-integration' },
        { input: 'model_with_underscores', expected: 'model_with_underscores-test-integration' }
      ];

      testCases.forEach(({ input, expected }) => {
        const slug = adapter.createModelSlug(input);
        expect(slug).toBe(expected);
      });
    });

    test('should extract common properties consistently', () => {
      const rawModel = {
        id: 'test-model',
        name: 'Test Model',
        description: 'A test model',
        max_tokens: 16000,
        owned_by: 'test-org',
        context_length: 16000
      };

      const properties = adapter.extractCommonModelProperties(rawModel);
      
      expect(properties.api_model_id).toBe('test-model');
      expect(properties.name).toBe('Test Model');
      expect(properties.max_tokens).toBe(16000);
      expect(properties.metadata.owned_by).toBe('test-org');
      expect(properties.metadata.context_length).toBe(16000);
    });
  });

  describe('Configuration and Setup', () => {
    test('should validate configuration', () => {
      expect(adapter.getConfig()).toEqual(config);
      expect(adapter.name).toBe(config.name);
      expect(adapter.type).toBe(config.type);
    });

    test('should handle missing configuration gracefully', () => {
      const minimalConfig = {
        name: 'minimal',
        type: 'direct'
      };

      const minimalAdapter = new IntegrationTestAdapter(minimalConfig, mockLogger);
      
      expect(minimalAdapter.name).toBe('minimal');
      expect(minimalAdapter.type).toBe('direct');
      expect(minimalAdapter.getConfig()).toEqual(minimalConfig);
    });
  });
});