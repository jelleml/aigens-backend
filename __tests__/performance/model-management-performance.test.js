/**
 * Performance tests for model management system
 * Tests system behavior with large datasets and concurrent operations
 */

const { UnifiedModelManager } = require('../../services/model-management/unified-model-manager');
const { TestDatabaseManager } = require('../fixtures/database-fixtures');
const { generateLargeDataset } = require('../fixtures/mock-provider-responses');

// Mock dependencies
jest.mock('../../database');
jest.mock('../../config/config');
jest.mock('../../scripts/utils/error-handler');

const mockDb = require('../../database');
const mockConfig = require('../../config/config');
const { createLogger } = require('../../scripts/utils/error-handler');

describe('Model Management Performance Tests', () => {
  let manager;
  let mockLogger;
  let mockMetrics;
  let mockSequelize;
  let testDbManager;

  // Performance test configuration
  const PERFORMANCE_THRESHOLDS = {
    SMALL_DATASET: {
      models: 100,
      maxProcessingTime: 5000, // 5 seconds
      maxMemoryIncrease: 50 * 1024 * 1024 // 50MB
    },
    MEDIUM_DATASET: {
      models: 500,
      maxProcessingTime: 15000, // 15 seconds
      maxMemoryIncrease: 100 * 1024 * 1024 // 100MB
    },
    LARGE_DATASET: {
      models: 1000,
      maxProcessingTime: 30000, // 30 seconds
      maxMemoryIncrease: 200 * 1024 * 1024 // 200MB
    }
  };

  beforeAll(async () => {
    // Setup test database
    mockSequelize = {
      models: {
        Provider: {
          findOne: jest.fn(),
          create: jest.fn(),
          destroy: jest.fn()
        },
        Model: {
          findOne: jest.fn(),
          findAll: jest.fn(),
          create: jest.fn(),
          destroy: jest.fn(),
          count: jest.fn()
        },
        ModelPriceScore: {
          create: jest.fn(),
          destroy: jest.fn()
        }
      },
      transaction: jest.fn(),
      authenticate: jest.fn().mockResolvedValue(),
      sync: jest.fn().mockResolvedValue()
    };

    mockDb.initialize = jest.fn().mockResolvedValue();
    mockDb.close = jest.fn().mockResolvedValue();
    mockDb.sequelize = mockSequelize;

    testDbManager = new TestDatabaseManager(mockSequelize);
  });

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn()
    };

    // Mock metrics
    mockMetrics = {
      recordOperationSuccess: jest.fn(),
      recordOperationFailure: jest.fn(),
      recordProcessingTime: jest.fn(),
      recordMemoryUsage: jest.fn()
    };

    // Mock config
    mockConfig.openai = { apiKey: 'test-key' };
    process.env.OPENAI_API_KEY = 'test-key';

    createLogger.mockReturnValue(mockLogger);

    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (manager) {
      await manager.cleanup();
    }
  });

  describe('Large Dataset Processing', () => {
    it('should process small dataset within performance threshold', async () => {
      const threshold = PERFORMANCE_THRESHOLDS.SMALL_DATASET;
      const testData = generateLargeDataset.models(threshold.models);
      
      // Setup mock provider
      const mockAdapter = createMockAdapter(testData);
      manager = createManagerWithMockProvider('test-provider', mockAdapter);

      // Setup database mocks
      setupDatabaseMocks(testData.length);

      // Measure performance
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      const result = await manager.execute('update', {
        providers: ['test-provider'],
        skipHealthCheck: true
      });

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      const processingTime = endTime - startTime;
      const memoryIncrease = endMemory - startMemory;

      // Verify performance
      expect(processingTime).toBeLessThan(threshold.maxProcessingTime);
      expect(memoryIncrease).toBeLessThan(threshold.maxMemoryIncrease);
      expect(result.summary.totalModelsProcessed).toBe(threshold.models);
      expect(result.summary.successfulProviders).toBe(1);

      // Log performance metrics
      console.log(`Small dataset (${threshold.models} models):`);
      console.log(`  Processing time: ${processingTime}ms (threshold: ${threshold.maxProcessingTime}ms)`);
      console.log(`  Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB (threshold: ${Math.round(threshold.maxMemoryIncrease / 1024 / 1024)}MB)`);
    });

    it('should process medium dataset within performance threshold', async () => {
      const threshold = PERFORMANCE_THRESHOLDS.MEDIUM_DATASET;
      const testData = generateLargeDataset.models(threshold.models);
      
      const mockAdapter = createMockAdapter(testData);
      manager = createManagerWithMockProvider('test-provider', mockAdapter);
      setupDatabaseMocks(testData.length);

      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      const result = await manager.execute('update', {
        providers: ['test-provider'],
        skipHealthCheck: true
      });

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      const processingTime = endTime - startTime;
      const memoryIncrease = endMemory - startMemory;

      expect(processingTime).toBeLessThan(threshold.maxProcessingTime);
      expect(memoryIncrease).toBeLessThan(threshold.maxMemoryIncrease);
      expect(result.summary.totalModelsProcessed).toBe(threshold.models);

      console.log(`Medium dataset (${threshold.models} models):`);
      console.log(`  Processing time: ${processingTime}ms (threshold: ${threshold.maxProcessingTime}ms)`);
      console.log(`  Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB (threshold: ${Math.round(threshold.maxMemoryIncrease / 1024 / 1024)}MB)`);
    });

    it('should process large dataset within performance threshold', async () => {
      const threshold = PERFORMANCE_THRESHOLDS.LARGE_DATASET;
      const testData = generateLargeDataset.models(threshold.models);
      
      const mockAdapter = createMockAdapter(testData);
      manager = createManagerWithMockProvider('test-provider', mockAdapter);
      setupDatabaseMocks(testData.length);

      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      const result = await manager.execute('update', {
        providers: ['test-provider'],
        skipHealthCheck: true
      });

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      const processingTime = endTime - startTime;
      const memoryIncrease = endMemory - startMemory;

      expect(processingTime).toBeLessThan(threshold.maxProcessingTime);
      expect(memoryIncrease).toBeLessThan(threshold.maxMemoryIncrease);
      expect(result.summary.totalModelsProcessed).toBe(threshold.models);

      console.log(`Large dataset (${threshold.models} models):`);
      console.log(`  Processing time: ${processingTime}ms (threshold: ${threshold.maxProcessingTime}ms)`);
      console.log(`  Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB (threshold: ${Math.round(threshold.maxMemoryIncrease / 1024 / 1024)}MB)`);
    });
  });

  describe('Concurrent Processing', () => {
    it('should handle multiple providers concurrently', async () => {
      const providerCount = 5;
      const modelsPerProvider = 100;
      const providers = [];

      // Create multiple mock providers
      for (let i = 0; i < providerCount; i++) {
        const testData = generateLargeDataset.models(modelsPerProvider);
        const mockAdapter = createMockAdapter(testData);
        const providerName = `test-provider-${i}`;
        
        providers.push(providerName);
        
        if (!manager) {
          manager = createManagerWithMockProvider(providerName, mockAdapter);
        } else {
          manager.providers.set(providerName, {
            adapter: mockAdapter,
            config: { timeout: 30000, priority: 1, type: 'direct' },
            initialized: true,
            consecutiveFailures: 0
          });
        }
      }

      // Setup database mocks for all providers
      setupDatabaseMocks(modelsPerProvider * providerCount);

      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      const result = await manager.execute('update', {
        providers: providers,
        skipHealthCheck: true
      });

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      const processingTime = endTime - startTime;
      const memoryIncrease = endMemory - startMemory;

      expect(result.summary.totalProviders).toBe(providerCount);
      expect(result.summary.successfulProviders).toBe(providerCount);
      expect(result.summary.totalModelsProcessed).toBe(modelsPerProvider * providerCount);

      // Concurrent processing should be faster than sequential
      const sequentialEstimate = providerCount * 5000; // Rough estimate
      expect(processingTime).toBeLessThan(sequentialEstimate);

      console.log(`Concurrent processing (${providerCount} providers, ${modelsPerProvider} models each):`);
      console.log(`  Processing time: ${processingTime}ms`);
      console.log(`  Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
      console.log(`  Average time per provider: ${Math.round(processingTime / providerCount)}ms`);
    });

    it('should handle batch processing efficiently', async () => {
      const totalModels = 1000;
      const batchSizes = [10, 50, 100, 200];
      const results = [];

      for (const batchSize of batchSizes) {
        const testData = generateLargeDataset.models(totalModels);
        const mockAdapter = createMockAdapter(testData);
        
        manager = new UnifiedModelManager({
          config: { batchSize: batchSize },
          logger: mockLogger,
          metrics: mockMetrics
        });

        manager.providers.set('test-provider', {
          adapter: mockAdapter,
          config: { timeout: 30000, priority: 1, type: 'direct' },
          initialized: true,
          consecutiveFailures: 0
        });

        setupDatabaseMocks(totalModels);

        const startTime = Date.now();
        
        const result = await manager.execute('update', {
          providers: ['test-provider'],
          skipHealthCheck: true
        });

        const endTime = Date.now();
        const processingTime = endTime - startTime;

        results.push({
          batchSize,
          processingTime,
          modelsProcessed: result.summary.totalModelsProcessed
        });

        await manager.cleanup();
        manager = null;
      }

      // Log batch processing results
      console.log('Batch processing performance:');
      results.forEach(result => {
        console.log(`  Batch size ${result.batchSize}: ${result.processingTime}ms for ${result.modelsProcessed} models`);
      });

      // Verify all batch sizes processed all models
      results.forEach(result => {
        expect(result.modelsProcessed).toBe(totalModels);
      });

      // Find optimal batch size (should be somewhere in the middle)
      const sortedByTime = results.sort((a, b) => a.processingTime - b.processingTime);
      const fastestBatchSize = sortedByTime[0].batchSize;
      
      console.log(`  Fastest batch size: ${fastestBatchSize}`);
      
      // Optimal batch size should not be the smallest or largest
      expect([10, 200]).not.toContain(fastestBatchSize);
    });
  });

  describe('Memory Management', () => {
    it('should not have memory leaks during large processing', async () => {
      const iterations = 5;
      const modelsPerIteration = 200;
      const memoryReadings = [];

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage().heapUsed;
      memoryReadings.push(initialMemory);

      for (let i = 0; i < iterations; i++) {
        const testData = generateLargeDataset.models(modelsPerIteration);
        const mockAdapter = createMockAdapter(testData);
        
        manager = createManagerWithMockProvider('test-provider', mockAdapter);
        setupDatabaseMocks(testData.length);

        await manager.execute('update', {
          providers: ['test-provider'],
          skipHealthCheck: true
        });

        await manager.cleanup();
        manager = null;

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        const currentMemory = process.memoryUsage().heapUsed;
        memoryReadings.push(currentMemory);
      }

      // Calculate memory trend
      const finalMemory = memoryReadings[memoryReadings.length - 1];
      const memoryIncrease = finalMemory - initialMemory;
      const maxAcceptableIncrease = 100 * 1024 * 1024; // 100MB

      console.log('Memory usage over iterations:');
      memoryReadings.forEach((memory, index) => {
        console.log(`  Iteration ${index}: ${Math.round(memory / 1024 / 1024)}MB`);
      });
      console.log(`  Total increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);

      // Memory should not increase significantly over iterations
      expect(memoryIncrease).toBeLessThan(maxAcceptableIncrease);
    });

    it('should handle memory pressure gracefully', async () => {
      // Create a very large dataset to test memory pressure
      const largeDataset = generateLargeDataset.models(5000);
      const mockAdapter = createMockAdapter(largeDataset);
      
      manager = createManagerWithMockProvider('test-provider', mockAdapter);
      setupDatabaseMocks(largeDataset.length);

      const startMemory = process.memoryUsage().heapUsed;

      // Process in smaller batches to manage memory
      const result = await manager.execute('update', {
        providers: ['test-provider'],
        skipHealthCheck: true
      });

      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = endMemory - startMemory;

      expect(result.summary.totalModelsProcessed).toBe(5000);
      expect(result.summary.successfulProviders).toBe(1);

      // Memory increase should be reasonable even for large datasets
      const maxMemoryIncrease = 500 * 1024 * 1024; // 500MB
      expect(memoryIncrease).toBeLessThan(maxMemoryIncrease);

      console.log(`Memory pressure test (5000 models):`);
      console.log(`  Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
    });
  });

  describe('Database Performance', () => {
    it('should handle bulk database operations efficiently', async () => {
      const modelCount = 1000;
      const testData = generateLargeDataset.models(modelCount);
      const mockAdapter = createMockAdapter(testData);
      
      manager = createManagerWithMockProvider('test-provider', mockAdapter);

      // Track database operation calls
      let createCalls = 0;
      let updateCalls = 0;
      
      mockSequelize.models.Model.create = jest.fn().mockImplementation(() => {
        createCalls++;
        return Promise.resolve({ id: createCalls });
      });

      mockSequelize.models.Model.findOne = jest.fn().mockResolvedValue(null);
      mockSequelize.models.Provider.findOne = jest.fn().mockResolvedValue({ id: 1, name: 'test-provider' });
      mockSequelize.models.ModelPriceScore.create = jest.fn().mockResolvedValue({});

      const startTime = Date.now();
      
      const result = await manager.execute('update', {
        providers: ['test-provider'],
        skipHealthCheck: true
      });

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(result.summary.totalModelsProcessed).toBe(modelCount);
      expect(createCalls).toBe(modelCount);

      // Database operations should be reasonably fast
      const maxTimePerModel = 10; // 10ms per model max
      const maxTotalTime = modelCount * maxTimePerModel;
      expect(processingTime).toBeLessThan(maxTotalTime);

      console.log(`Database performance (${modelCount} models):`);
      console.log(`  Total time: ${processingTime}ms`);
      console.log(`  Time per model: ${Math.round(processingTime / modelCount)}ms`);
      console.log(`  Database creates: ${createCalls}`);
    });
  });

  // Helper functions
  function createMockAdapter(testData) {
    return {
      healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
      fetchModels: jest.fn().mockResolvedValue(testData),
      formatModel: jest.fn().mockImplementation((model) => ({
        model_slug: `${model.id}-test`,
        api_model_id: model.id,
        name: model.name,
        description: model.description || 'Test model',
        max_tokens: 4096,
        pricing: model.pricing || {
          price_1m_input_tokens: 10,
          price_1m_output_tokens: 30
        }
      })),
      getFallbackModels: jest.fn().mockReturnValue([])
    };
  }

  function createManagerWithMockProvider(providerName, mockAdapter) {
    const mgr = new UnifiedModelManager({
      logger: mockLogger,
      metrics: mockMetrics
    });

    mgr.providers.set(providerName, {
      adapter: mockAdapter,
      config: { timeout: 30000, priority: 1, type: 'direct' },
      initialized: true,
      consecutiveFailures: 0
    });

    return mgr;
  }

  function setupDatabaseMocks(modelCount) {
    mockSequelize.models.Provider.findOne = jest.fn().mockResolvedValue({
      id: 1,
      name: 'test-provider'
    });

    mockSequelize.models.Model.findOne = jest.fn().mockResolvedValue(null);
    mockSequelize.models.Model.create = jest.fn().mockImplementation(() => 
      Promise.resolve({ id: Math.floor(Math.random() * 10000) })
    );
    mockSequelize.models.ModelPriceScore.create = jest.fn().mockResolvedValue({});

    mockSequelize.transaction = jest.fn().mockImplementation((callback) => {
      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn()
      };
      return callback(mockTransaction);
    });
  }
});

// Performance test utilities
const PerformanceUtils = {
  measureExecutionTime: async (fn) => {
    const start = Date.now();
    const result = await fn();
    const end = Date.now();
    return {
      result,
      executionTime: end - start
    };
  },

  measureMemoryUsage: async (fn) => {
    const startMemory = process.memoryUsage();
    const result = await fn();
    const endMemory = process.memoryUsage();
    
    return {
      result,
      memoryDelta: {
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        external: endMemory.external - startMemory.external
      }
    };
  },

  formatBytes: (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
};

module.exports = {
  PerformanceUtils
};