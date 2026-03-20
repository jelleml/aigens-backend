/**
 * Performance tests for model processor component
 * Tests processing performance with various dataset sizes and configurations
 */

const { ModelProcessor } = require('../../services/model-management/model-processor');
const { TestDatabaseFactory } = require('../fixtures/database-fixtures');
const { MockResponseFactory } = require('../fixtures/mock-provider-responses');

describe('Model Processor Performance Tests', () => {
  let processor;
  let testDbManager;
  let mockLogger;
  let mockMetrics;

  beforeAll(async () => {
    // Create test database
    testDbManager = await TestDatabaseFactory.createTestDatabase({
      useRealDatabase: false,
      mockModels: true,
      preloadFixtures: false
    });
  });

  afterAll(async () => {
    if (testDbManager) {
      await testDbManager.cleanup();
    }
  });

  beforeEach(() => {
    // Mock logger and metrics
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn()
    };

    mockMetrics = {
      recordOperationSuccess: jest.fn(),
      recordOperationFailure: jest.fn(),
      recordProcessingTime: jest.fn(),
      recordMemoryUsage: jest.fn()
    };

    // Create processor instance
    processor = new ModelProcessor({
      logger: mockLogger,
      metrics: mockMetrics,
      sequelize: testDbManager.sequelize
    });
  });

  describe('Batch Processing Performance', () => {
    const batchSizes = [10, 50, 100, 200, 500];
    
    test.each(batchSizes)('should process %i models efficiently', async (batchSize) => {
      // Generate test data
      const models = MockResponseFactory.generateLargeDataset('models', batchSize);
      const provider = { id: 1, name: 'test-provider' };
      
      // Setup database mocks
      testDbManager.sequelize.models.Model.findOne.mockResolvedValue(null);
      testDbManager.sequelize.models.Model.create.mockImplementation((data) => 
        Promise.resolve({ id: Math.floor(Math.random() * 10000), ...data })
      );
      
      // Measure performance
      const { metrics } = await global.measurePerformance(async () => {
        return await processor.processModels(models, provider, { dryRun: false });
      }, `Batch size ${batchSize}`);
      
      // Calculate metrics
      const timePerModel = metrics.executionTime / batchSize;
      const memoryPerModel = metrics.memoryDelta.heapUsed / batchSize;
      
      // Log detailed metrics
      console.log(`  Time per model: ${timePerModel.toFixed(2)}ms`);
      console.log(`  Memory per model: ${(memoryPerModel / 1024).toFixed(2)}KB`);
      
      // Verify performance is within acceptable range
      expect(timePerModel).toBeLessThan(50); // Max 50ms per model
      expect(memoryPerModel).toBeLessThan(50 * 1024); // Max 50KB per model
    });
  });

  describe('Memory Efficiency', () => {
    it('should handle large datasets without excessive memory usage', async () => {
      // Generate large dataset
      const largeDataset = MockResponseFactory.generateLargeDataset('models', 1000);
      const provider = { id: 1, name: 'test-provider' };
      
      // Setup database mocks
      testDbManager.sequelize.models.Model.findOne.mockResolvedValue(null);
      testDbManager.sequelize.models.Model.create.mockImplementation((data) => 
        Promise.resolve({ id: Math.floor(Math.random() * 10000), ...data })
      );
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Process in batches to manage memory
      const batchSize = 100;
      const batches = [];
      
      for (let i = 0; i < largeDataset.length; i += batchSize) {
        batches.push(largeDataset.slice(i, i + batchSize));
      }
      
      for (const batch of batches) {
        await processor.processModels(batch, provider, { dryRun: false });
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const maxAcceptableIncrease = 100 * 1024 * 1024; // 100MB
      
      console.log(`Memory increase after processing 1000 models: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      
      // Memory should not increase excessively
      expect(memoryIncrease).toBeLessThan(maxAcceptableIncrease);
    });
  });

  describe('Concurrency Performance', () => {
    it('should process multiple providers concurrently with optimal performance', async () => {
      const providerCount = 5;
      const modelsPerProvider = 100;
      const providers = [];
      const allModels = [];
      
      // Create test data for multiple providers
      for (let i = 0; i < providerCount; i++) {
        const provider = { id: i + 1, name: `test-provider-${i}` };
        const models = MockResponseFactory.generateLargeDataset('models', modelsPerProvider);
        
        providers.push(provider);
        allModels.push({ provider, models });
      }
      
      // Setup database mocks
      testDbManager.sequelize.models.Model.findOne.mockResolvedValue(null);
      testDbManager.sequelize.models.Model.create.mockImplementation((data) => 
        Promise.resolve({ id: Math.floor(Math.random() * 10000), ...data })
      );
      
      // Measure sequential processing time
      const sequentialStart = Date.now();
      
      for (const { provider, models } of allModels) {
        await processor.processModels(models, provider, { dryRun: false });
      }
      
      const sequentialTime = Date.now() - sequentialStart;
      
      // Measure concurrent processing time
      const concurrentStart = Date.now();
      
      await Promise.all(
        allModels.map(({ provider, models }) => 
          processor.processModels(models, provider, { dryRun: false })
        )
      );
      
      const concurrentTime = Date.now() - concurrentStart;
      
      console.log(`Sequential processing time: ${sequentialTime}ms`);
      console.log(`Concurrent processing time: ${concurrentTime}ms`);
      console.log(`Performance improvement: ${((sequentialTime - concurrentTime) / sequentialTime * 100).toFixed(2)}%`);
      
      // Concurrent should be faster than sequential
      expect(concurrentTime).toBeLessThan(sequentialTime);
      
      // Concurrent should be at least 30% faster for this test case
      const improvementFactor = sequentialTime / concurrentTime;
      expect(improvementFactor).toBeGreaterThan(1.3);
    });
  });

  describe('Database Operation Performance', () => {
    it('should perform database operations efficiently', async () => {
      const modelCount = 100;
      const models = MockResponseFactory.generateLargeDataset('models', modelCount);
      const provider = { id: 1, name: 'test-provider' };
      
      // Track database operation calls
      let createCalls = 0;
      let findCalls = 0;
      
      testDbManager.sequelize.models.Model.create = jest.fn().mockImplementation(() => {
        createCalls++;
        return Promise.resolve({ id: createCalls });
      });
      
      testDbManager.sequelize.models.Model.findOne = jest.fn().mockImplementation(() => {
        findCalls++;
        return Promise.resolve(null);
      });
      
      const { metrics } = await global.measurePerformance(async () => {
        return await processor.processModels(models, provider, { dryRun: false });
      }, 'Database operations');
      
      // Calculate database operation metrics
      const timePerOperation = metrics.executionTime / (createCalls + findCalls);
      
      console.log(`Database operations: ${createCalls + findCalls}`);
      console.log(`Time per database operation: ${timePerOperation.toFixed(2)}ms`);
      
      // Database operations should be reasonably fast
      expect(timePerOperation).toBeLessThan(10); // Max 10ms per operation
      
      // Verify correct number of operations
      expect(createCalls).toBe(modelCount);
      expect(findCalls).toBe(modelCount);
    });
  });
});