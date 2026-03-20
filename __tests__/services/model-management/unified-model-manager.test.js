/**
 * Integration tests for UnifiedModelManager
 */

const { UnifiedModelManager, EXECUTION_MODES, EXECUTION_STRATEGIES, PROVIDER_CONFIGS } = require('../../../services/model-management/unified-model-manager');

// Mock dependencies
jest.mock('../../../database');
jest.mock('../../../config/config');
jest.mock('../../../scripts/utils/error-handler');

// Mock provider adapters
jest.mock('../../../services/model-management/adapters/openai-adapter');
jest.mock('../../../services/model-management/adapters/anthropic-adapter');
jest.mock('../../../services/model-management/adapters/openrouter-adapter');

const mockDb = require('../../../database');
const mockConfig = require('../../../config/config');
const { createLogger } = require('../../../scripts/utils/error-handler');

describe('UnifiedModelManager', () => {
  let manager;
  let mockLogger;
  let mockMetrics;
  let mockTransaction;
  let mockSequelize;

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
      recordOperationFailure: jest.fn()
    };

    // Mock transaction
    mockTransaction = {
      commit: jest.fn(),
      rollback: jest.fn()
    };

    // Mock database models
    const mockProvider = {
      findOne: jest.fn()
    };

    const mockModel = {
      findOne: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      destroy: jest.fn()
    };

    const mockModelPriceScore = {
      create: jest.fn(),
      destroy: jest.fn()
    };

    mockSequelize = {
      models: {
        Provider: mockProvider,
        Model: mockModel,
        ModelPriceScore: mockModelPriceScore
      },
      transaction: jest.fn().mockImplementation((callback) => {
        return callback(mockTransaction);
      })
    };

    mockDb.initialize = jest.fn().mockResolvedValue();
    mockDb.close = jest.fn().mockResolvedValue();
    mockDb.sequelize = mockSequelize;

    // Mock config
    mockConfig.openai = { apiKey: 'test-openai-key' };
    mockConfig.anthropic = { apiKey: 'test-anthropic-key' };

    // Mock environment variables
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    // Mock createLogger
    createLogger.mockReturnValue(mockLogger);

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      manager = new UnifiedModelManager();

      expect(manager.config.strategy).toBe(EXECUTION_STRATEGIES.MIXED);
      expect(manager.config.maxConcurrency).toBe(3);
      expect(manager.dryRun).toBe(false);
      expect(manager.providers).toBeInstanceOf(Map);
    });

    it('should initialize with custom configuration', () => {
      const customConfig = {
        strategy: EXECUTION_STRATEGIES.PARALLEL,
        maxConcurrency: 5,
        batchSize: 25
      };

      manager = new UnifiedModelManager({
        config: customConfig,
        logger: mockLogger,
        metrics: mockMetrics,
        dryRun: true
      });

      expect(manager.config.strategy).toBe(EXECUTION_STRATEGIES.PARALLEL);
      expect(manager.config.maxConcurrency).toBe(5);
      expect(manager.config.batchSize).toBe(25);
      expect(manager.dryRun).toBe(true);
      expect(manager.logger).toBe(mockLogger);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      manager = new UnifiedModelManager({
        logger: mockLogger,
        metrics: mockMetrics
      });
    });

    it('should initialize successfully', async () => {
      // Mock provider adapters
      const mockOpenAIAdapter = {
        healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
      };

      const mockAnthropicAdapter = {
        healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
      };

      // Mock adapter classes
      const OpenAIAdapter = require('../../../services/model-management/adapters/openai-adapter');
      const AnthropicAdapter = require('../../../services/model-management/adapters/anthropic-adapter');

      OpenAIAdapter.mockImplementation(() => mockOpenAIAdapter);
      AnthropicAdapter.mockImplementation(() => mockAnthropicAdapter);

      await manager.initialize();

      expect(mockDb.initialize).toHaveBeenCalledTimes(1);
      expect(manager.providers.size).toBeGreaterThan(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Initialization complete'),
        expect.any(Object)
      );
    });

    it('should handle provider initialization failures gracefully', async () => {
      // Mock adapter that throws during initialization
      const OpenAIAdapter = require('../../../services/model-management/adapters/openai-adapter');
      OpenAIAdapter.mockImplementation(() => {
        throw new Error('Initialization failed');
      });

      await manager.initialize();

      // Should still initialize other providers
      expect(manager.providers.has('openai')).toBe(true);
      expect(manager.providers.get('openai').initialized).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize provider: openai'),
        expect.any(Error)
      );
    });

    it('should skip providers without API keys', async () => {
      // Remove API keys
      delete process.env.OPENAI_API_KEY;
      delete mockConfig.openai;

      await manager.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No API key found for provider: openai')
      );
    });
  });

  describe('performHealthCheck', () => {
    beforeEach(async () => {
      manager = new UnifiedModelManager({
        logger: mockLogger,
        metrics: mockMetrics
      });

      // Mock provider adapters
      const mockHealthyAdapter = {
        healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
      };

      const mockUnhealthyAdapter = {
        healthCheck: jest.fn().mockRejectedValue(new Error('Health check failed'))
      };

      manager.providers.set('openai', {
        adapter: mockHealthyAdapter,
        config: PROVIDER_CONFIGS.openai,
        initialized: true,
        consecutiveFailures: 0
      });

      manager.providers.set('anthropic', {
        adapter: mockUnhealthyAdapter,
        config: PROVIDER_CONFIGS.anthropic,
        initialized: true,
        consecutiveFailures: 0
      });
    });

    it('should perform health check on all providers', async () => {
      const results = await manager.performHealthCheck();

      expect(results.total).toBe(2);
      expect(results.healthy).toHaveLength(1);
      expect(results.unhealthy).toHaveLength(1);
      expect(results.healthy[0].name).toBe('openai');
      expect(results.unhealthy[0].name).toBe('anthropic');
    });

    it('should update consecutive failures count', async () => {
      await manager.performHealthCheck();

      expect(manager.providers.get('openai').consecutiveFailures).toBe(0);
      expect(manager.providers.get('anthropic').consecutiveFailures).toBe(1);
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      manager = new UnifiedModelManager({
        logger: mockLogger,
        metrics: mockMetrics
      });

      // Setup mock providers
      const mockAdapter = {
        healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
        fetchModels: jest.fn().mockResolvedValue([
          { id: 'model1', name: 'Test Model 1' },
          { id: 'model2', name: 'Test Model 2' }
        ]),
        formatModel: jest.fn().mockImplementation((model) => ({
          model_slug: `${model.id}-test`,
          api_model_id: model.id,
          name: model.name,
          description: 'Test model',
          max_tokens: 4096
        })),
        getFallbackModels: jest.fn().mockReturnValue([])
      };

      manager.providers.set('test-provider', {
        adapter: mockAdapter,
        config: { ...PROVIDER_CONFIGS.openai, timeout: 30000 },
        initialized: true,
        consecutiveFailures: 0
      });

      // Mock database responses
      mockSequelize.models.Provider.findOne.mockResolvedValue({
        id: 1,
        name: 'test-provider'
      });

      mockSequelize.models.Model.findOne.mockResolvedValue(null); // No existing models
      mockSequelize.models.Model.create.mockResolvedValue({ id: 1 });
    });

    it('should validate execution mode', async () => {
      await expect(manager.execute('invalid-mode')).rejects.toThrow(
        'Invalid execution mode: invalid-mode'
      );
    });

    it('should execute update mode successfully', async () => {
      const result = await manager.execute(EXECUTION_MODES.UPDATE, {
        providers: ['test-provider'],
        skipHealthCheck: true
      });

      expect(result.mode).toBe(EXECUTION_MODES.UPDATE);
      expect(result.summary.totalProviders).toBe(1);
      expect(result.summary.successfulProviders).toBe(1);
      expect(result.summary.failedProviders).toBe(0);
    });

    it('should execute init mode successfully', async () => {
      const result = await manager.execute(EXECUTION_MODES.INIT, {
        providers: ['test-provider'],
        skipHealthCheck: true
      });

      expect(result.mode).toBe(EXECUTION_MODES.INIT);
      expect(result.summary.totalProviders).toBe(1);
    });

    it('should execute sync mode successfully', async () => {
      // Mock existing models for sync mode
      mockSequelize.models.Model.findAll.mockResolvedValue([
        { id: 1, model_slug: 'old-model' }
      ]);

      const result = await manager.execute(EXECUTION_MODES.SYNC, {
        providers: ['test-provider'],
        skipHealthCheck: true
      });

      expect(result.mode).toBe(EXECUTION_MODES.SYNC);
      expect(result.summary.totalProviders).toBe(1);
    });

    it('should handle dry-run mode', async () => {
      manager.dryRun = true;

      const result = await manager.execute(EXECUTION_MODES.UPDATE, {
        providers: ['test-provider'],
        skipHealthCheck: true
      });

      expect(result.dryRun).toBe(true);
      expect(result.summary.providers['test-provider'].modelsProcessed).toBeGreaterThan(0);

      // Verify no database operations were called
      expect(mockSequelize.models.Model.create).not.toHaveBeenCalled();
    });

    it('should handle provider failures gracefully', async () => {
      // Make adapter throw error
      const failingAdapter = {
        healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
        fetchModels: jest.fn().mockRejectedValue(new Error('Fetch failed'))
      };

      manager.providers.set('failing-provider', {
        adapter: failingAdapter,
        config: { ...PROVIDER_CONFIGS.openai, timeout: 30000 },
        initialized: true,
        consecutiveFailures: 0
      });

      const result = await manager.execute(EXECUTION_MODES.UPDATE, {
        providers: ['failing-provider'],
        skipHealthCheck: true
      });

      expect(result.summary.failedProviders).toBe(1);
      expect(result.summary.providers['failing-provider'].success).toBe(false);
    });

    it('should filter unhealthy providers unless forced', async () => {
      // Setup unhealthy provider
      manager.providers.get('test-provider').consecutiveFailures = 5;

      const result = await manager.execute(EXECUTION_MODES.UPDATE, {
        force: false
      });

      // Should process no providers due to health filtering
      expect(result.summary.totalProviders).toBe(0);
    });

    it('should process unhealthy providers when forced', async () => {
      // Setup unhealthy provider
      manager.providers.get('test-provider').consecutiveFailures = 5;

      const result = await manager.execute(EXECUTION_MODES.UPDATE, {
        force: true,
        skipHealthCheck: true
      });

      // Should process the unhealthy provider
      expect(result.summary.totalProviders).toBe(1);
    });
  });

  describe('execution strategies', () => {
    beforeEach(() => {
      manager = new UnifiedModelManager({
        logger: mockLogger,
        metrics: mockMetrics
      });

      // Mock multiple providers
      ['openai', 'anthropic', 'openrouter'].forEach(name => {
        const mockAdapter = {
          fetchModels: jest.fn().mockResolvedValue([]),
          formatModel: jest.fn().mockReturnValue({}),
          getFallbackModels: jest.fn().mockReturnValue([])
        };

        manager.providers.set(name, {
          adapter: mockAdapter,
          config: PROVIDER_CONFIGS[name],
          initialized: true,
          consecutiveFailures: 0
        });
      });

      // Mock database
      mockSequelize.models.Provider.findOne.mockResolvedValue({ id: 1, name: 'test' });
    });

    it('should execute providers sequentially', async () => {
      const executeSpy = jest.spyOn(manager, 'executeProvider')
        .mockResolvedValue({ success: true, modelsProcessed: 0 });

      await manager.executeSequentially(EXECUTION_MODES.UPDATE, ['openai', 'anthropic']);

      expect(executeSpy).toHaveBeenCalledTimes(2);
      expect(executeSpy).toHaveBeenNthCalledWith(1, EXECUTION_MODES.UPDATE, 'openai');
      expect(executeSpy).toHaveBeenNthCalledWith(2, EXECUTION_MODES.UPDATE, 'anthropic');

      executeSpy.mockRestore();
    });

    it('should execute providers in parallel', async () => {
      const executeSpy = jest.spyOn(manager, 'executeProvider')
        .mockResolvedValue({ success: true, modelsProcessed: 0 });

      await manager.executeInParallel(EXECUTION_MODES.UPDATE, ['openai', 'anthropic'], 2);

      expect(executeSpy).toHaveBeenCalledTimes(2);

      executeSpy.mockRestore();
    });

    it('should execute mixed strategy correctly', async () => {
      const executeSpy = jest.spyOn(manager, 'executeProvider')
        .mockResolvedValue({ success: true, modelsProcessed: 0 });

      await manager.executeMixed(EXECUTION_MODES.UPDATE, ['openai', 'anthropic', 'openrouter'], 2);

      expect(executeSpy).toHaveBeenCalledTimes(3);
      // Direct providers (openai, anthropic) should be called first
      expect(executeSpy).toHaveBeenNthCalledWith(1, EXECUTION_MODES.UPDATE, 'openai');
      expect(executeSpy).toHaveBeenNthCalledWith(2, EXECUTION_MODES.UPDATE, 'anthropic');
      expect(executeSpy).toHaveBeenNthCalledWith(3, EXECUTION_MODES.UPDATE, 'openrouter');

      executeSpy.mockRestore();
    });
  });

  describe('provider processing', () => {
    beforeEach(() => {
      manager = new UnifiedModelManager({
        logger: mockLogger,
        metrics: mockMetrics,
        config: { batchSize: 2 }
      });

      const mockAdapter = {
        fetchModels: jest.fn().mockResolvedValue([
          { id: 'model1', name: 'Test Model 1' },
          { id: 'model2', name: 'Test Model 2' },
          { id: 'model3', name: 'Test Model 3' }
        ]),
        formatModel: jest.fn().mockImplementation((model) => ({
          model_slug: `${model.id}-test`,
          api_model_id: model.id,
          name: model.name,
          description: 'Test model',
          max_tokens: 4096,
          pricing: {
            price_1m_input_tokens: 10,
            price_1m_output_tokens: 30
          }
        })),
        getFallbackModels: jest.fn().mockReturnValue([])
      };

      manager.providers.set('test-provider', {
        adapter: mockAdapter,
        config: PROVIDER_CONFIGS.openai,
        initialized: true
      });

      // Mock database responses
      mockSequelize.models.Provider.findOne.mockResolvedValue({
        id: 1,
        name: 'test-provider'
      });

      mockSequelize.models.Model.findOne.mockResolvedValue(null);
      mockSequelize.models.Model.create.mockResolvedValue({ id: 1 });
      mockSequelize.models.ModelPriceScore.create.mockResolvedValue({});
    });

    it('should process models in batches', async () => {
      const result = await manager.processProviderModels('test-provider', manager.providers.get('test-provider'), 'update');

      expect(result.modelsProcessed).toBe(3);
      expect(result.modelsCreated).toBe(3);
      expect(result.modelsUpdated).toBe(0);

      // Should create models and pricing data
      expect(mockSequelize.models.Model.create).toHaveBeenCalledTimes(3);
      expect(mockSequelize.models.ModelPriceScore.create).toHaveBeenCalledTimes(3);
    });

    it('should update existing models in update mode', async () => {
      const mockExistingModel = {
        update: jest.fn().mockResolvedValue()
      };

      mockSequelize.models.Model.findOne.mockResolvedValue(mockExistingModel);

      const result = await manager.processProviderModels('test-provider', manager.providers.get('test-provider'), 'update');

      expect(result.modelsProcessed).toBe(3);
      expect(result.modelsCreated).toBe(0);
      expect(result.modelsUpdated).toBe(3);
      expect(mockExistingModel.update).toHaveBeenCalledTimes(3);
    });

    it('should handle sync mode with stale model removal', async () => {
      // Mock existing models that should be removed
      mockSequelize.models.Model.findAll.mockResolvedValue([
        { id: 99, model_slug: 'stale-model' }
      ]);

      mockSequelize.models.Model.destroy.mockResolvedValue(1);
      mockSequelize.models.ModelPriceScore.destroy.mockResolvedValue(1);

      const result = await manager.processProviderModels('test-provider', manager.providers.get('test-provider'), 'sync');

      expect(result.modelsProcessed).toBe(3);
      expect(result.modelsRemoved).toBe(1);
      expect(mockSequelize.models.ModelPriceScore.destroy).toHaveBeenCalledWith({
        where: { id_model: [99] },
        transaction: mockTransaction
      });
      expect(mockSequelize.models.Model.destroy).toHaveBeenCalledWith({
        where: { id: [99] },
        transaction: mockTransaction
      });
    });

    it('should handle processing errors gracefully', async () => {
      // Make model creation fail for one model
      mockSequelize.models.Model.create
        .mockResolvedValueOnce({ id: 1 })
        .mockRejectedValueOnce(new Error('Creation failed'))
        .mockResolvedValueOnce({ id: 3 });

      const result = await manager.processProviderModels('test-provider', manager.providers.get('test-provider'), 'update');

      // Should continue processing other models despite one failure
      expect(result.modelsProcessed).toBe(3);
      expect(result.modelsCreated).toBe(2); // One failed
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process model'),
        expect.any(Object)
      );
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      manager = new UnifiedModelManager({
        logger: mockLogger,
        metrics: mockMetrics
      });
    });

    it('should sort providers by priority', () => {
      const providers = ['openrouter', 'openai', 'together', 'anthropic'];
      const sorted = manager.sortProvidersByPriority(providers);

      // Direct providers (priority 1) should come before aggregators (priority 3)
      expect(sorted.indexOf('openai')).toBeLessThan(sorted.indexOf('openrouter'));
      expect(sorted.indexOf('anthropic')).toBeLessThan(sorted.indexOf('openrouter'));
    });

    it('should generate execution summary correctly', () => {
      const results = new Map([
        ['openai', { success: true, modelsProcessed: 10, modelsCreated: 5, modelsUpdated: 5, duration: 1000 }],
        ['anthropic', { success: false, error: 'Test error', modelsProcessed: 0, duration: 500 }]
      ]);

      const summary = manager.generateExecutionSummary(EXECUTION_MODES.UPDATE, results);

      expect(summary.mode).toBe(EXECUTION_MODES.UPDATE);
      expect(summary.totalProviders).toBe(2);
      expect(summary.successfulProviders).toBe(1);
      expect(summary.failedProviders).toBe(1);
      expect(summary.totalModelsProcessed).toBe(10);
      expect(summary.totalModelsCreated).toBe(5);
      expect(summary.totalModelsUpdated).toBe(5);
      expect(summary.providers.openai.success).toBe(true);
      expect(summary.providers.anthropic.success).toBe(false);
    });

    it('should get status information', () => {
      manager.providers.set('test-provider', {
        initialized: true,
        config: { type: 'direct', priority: 1 },
        consecutiveFailures: 0,
        lastHealthCheck: Date.now()
      });

      const status = manager.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.totalProviders).toBe(1);
      expect(status.healthyProviders).toBe(1);
      expect(status.providers['test-provider']).toBeDefined();
      expect(status.providers['test-provider'].initialized).toBe(true);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      manager = new UnifiedModelManager({
        logger: mockLogger,
        metrics: mockMetrics
      });
    });

    it('should handle database initialization failure', async () => {
      mockDb.initialize.mockRejectedValue(new Error('Database connection failed'));

      await expect(manager.initialize()).rejects.toThrow('Database connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Initialization failed'),
        expect.any(Error)
      );
    });

    it('should handle missing provider in database', async () => {
      const mockAdapter = {
        fetchModels: jest.fn().mockResolvedValue([])
      };

      manager.providers.set('test-provider', {
        adapter: mockAdapter,
        config: PROVIDER_CONFIGS.openai,
        initialized: true
      });

      mockSequelize.models.Provider.findOne.mockResolvedValue(null);

      await expect(
        manager.processProviderModels('test-provider', manager.providers.get('test-provider'), 'update')
      ).rejects.toThrow('Provider test-provider not found in database');
    });

    it('should cleanup resources properly', async () => {
      await manager.cleanup();

      expect(mockDb.close).toHaveBeenCalledTimes(1);
      expect(manager.providers.size).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup completed')
      );
    });

    it('should handle cleanup failures gracefully', async () => {
      mockDb.close.mockRejectedValue(new Error('Close failed'));

      await manager.cleanup();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup failed'),
        expect.any(Error)
      );
    });
  });
});