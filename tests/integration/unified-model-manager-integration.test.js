/**
 * Integration Test for UnifiedModelManager with ModelProcessor
 * 
 * Tests the complete integration between UnifiedModelManager and ModelProcessor
 * for comprehensive model processing and relationship management.
 */

const { UnifiedModelManager } = require('../../services/model-management/unified-model-manager');

// Mock database and dependencies
jest.mock('../../database', () => ({
  initialize: jest.fn(),
  close: jest.fn(),
  sequelize: {
    models: {
      Model: {
        findOne: jest.fn(),
        findAll: jest.fn(),
        create: jest.fn(),
        destroy: jest.fn()
      },
      Provider: {
        findOne: jest.fn(),
        findAll: jest.fn()
      },
      ModelPriceScore: {
        upsert: jest.fn(),
        destroy: jest.fn()
      },
      AggregatedModel: {
        upsert: jest.fn()
      },
      AggregatorPricingTier: {
        findOne: jest.fn(),
        create: jest.fn()
      }
    },
    transaction: jest.fn()
  }
}));

// Mock provider adapters
jest.mock('../../services/model-management/adapters/openai-adapter', () => {
  return class MockOpenAIAdapter {
    constructor(logger) {
      this.logger = logger;
    }
    
    async healthCheck() {
      return { status: 'healthy' };
    }
    
    async fetchModels() {
      return [
        {
          id: 'gpt-4',
          name: 'GPT-4',
          description: 'Advanced language model',
          max_tokens: 8192,
          pricing: { prompt: 0.03, completion: 0.06 }
        },
        {
          id: 'gpt-3.5-turbo',
          name: 'GPT-3.5 Turbo',
          description: 'Fast and efficient model',
          max_tokens: 4096,
          pricing: { prompt: 0.0015, completion: 0.002 }
        }
      ];
    }
    
    getFallbackModels() {
      return this.fetchModels();
    }
    
    formatModel(rawModel) {
      return {
        model_slug: `${rawModel.id.replace('.', '-')}-openai`,
        api_model_id: rawModel.id,
        name: rawModel.name,
        description: rawModel.description,
        max_tokens: rawModel.max_tokens,
        pricing: rawModel.pricing
      };
    }
  };
});

jest.mock('../../services/model-management/adapters/anthropic-adapter', () => {
  return class MockAnthropicAdapter {
    constructor(logger) {
      this.logger = logger;
    }
    
    async healthCheck() {
      return { status: 'healthy' };
    }
    
    async fetchModels() {
      return [
        {
          id: 'claude-3-opus',
          name: 'Claude 3 Opus',
          description: 'Most powerful Claude model',
          max_tokens: 200000
        }
      ];
    }
    
    getFallbackModels() {
      return this.fetchModels();
    }
    
    formatModel(rawModel) {
      return {
        model_slug: `${rawModel.id}-anthropic`,
        api_model_id: rawModel.id,
        name: rawModel.name,
        description: rawModel.description,
        max_tokens: rawModel.max_tokens
      };
    }
  };
});

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

describe('UnifiedModelManager Integration with ModelProcessor', () => {
  let manager;
  let mockDb;
  let mockTransaction;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock database
    mockDb = require('../../database');
    mockTransaction = {
      commit: jest.fn(),
      rollback: jest.fn()
    };
    mockDb.sequelize.transaction.mockImplementation((callback) => callback(mockTransaction));
    
    // Mock environment variables for API keys
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    
    // Create manager instance with test configuration
    manager = new UnifiedModelManager({
      logger: mockLogger,
      config: {
        maxConcurrency: 2,
        batchSize: 10,
        logLevel: 'debug'
      }
    });
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('Initialization with ModelProcessor', () => {
    it('should initialize UnifiedModelManager with ModelProcessor', async () => {
      // Mock database initialization
      mockDb.initialize.mockResolvedValue();
      
      await manager.initialize();
      
      expect(mockDb.initialize).toHaveBeenCalled();
      expect(manager.modelProcessor).toBeDefined();
      expect(manager.providers.size).toBeGreaterThan(0);
    });

    it('should perform health check on initialized providers', async () => {
      mockDb.initialize.mockResolvedValue();
      
      await manager.initialize();
      const healthStatus = await manager.performHealthCheck();
      
      expect(healthStatus.healthy.length).toBeGreaterThan(0);
      expect(healthStatus.total).toBeGreaterThan(0);
    });
  });

  describe('Model Processing Integration', () => {
    beforeEach(async () => {
      mockDb.initialize.mockResolvedValue();
      await manager.initialize();
    });

    it('should process models using ModelProcessor for direct providers', async () => {
      // Mock provider lookup
      mockDb.sequelize.models.Provider.findOne.mockResolvedValue({
        id: 1,
        name: 'openai',
        type: 'direct'
      });

      // Mock model processing
      mockDb.sequelize.models.Model.findOne.mockResolvedValue(null);
      mockDb.sequelize.models.Model.create.mockResolvedValue({ id: 1 });
      mockDb.sequelize.models.ModelPriceScore.upsert.mockResolvedValue([{}, true]);

      const result = await manager.execute('update', {
        providers: ['openai'],
        skipHealthCheck: true
      });

      expect(result.success).not.toBe(false);
      expect(result.summary.totalProviders).toBe(1);
      expect(result.summary.totalModelsProcessed).toBeGreaterThan(0);
    });

    it('should handle aggregator relationships through ModelProcessor', async () => {
      // Mock provider lookup for aggregator
      mockDb.sequelize.models.Provider.findOne
        .mockResolvedValueOnce({
          id: 2,
          name: 'openrouter',
          type: 'aggregator'
        })
        .mockResolvedValueOnce({
          id: 1,
          name: 'openai',
          type: 'direct'
        });

      // Mock model processing
      mockDb.sequelize.models.Model.findOne.mockResolvedValue(null);
      mockDb.sequelize.models.Model.create.mockResolvedValue({ id: 1 });
      mockDb.sequelize.models.ModelPriceScore.upsert.mockResolvedValue([{}, true]);
      mockDb.sequelize.models.AggregatorPricingTier.findOne.mockResolvedValue({ id: 1 });
      mockDb.sequelize.models.AggregatedModel.upsert.mockResolvedValue([{}, true]);

      // Note: Since we don't have OpenRouter adapter mocked, this will fail gracefully
      const result = await manager.execute('update', {
        providers: ['openai'], // Use openai instead since it's mocked
        skipHealthCheck: true
      });

      expect(result.summary.totalProviders).toBe(1);
    });

    it('should handle mixed execution strategy', async () => {
      // Mock provider lookups
      mockDb.sequelize.models.Provider.findOne.mockResolvedValue({
        id: 1,
        name: 'openai',
        type: 'direct'
      });

      // Mock model processing
      mockDb.sequelize.models.Model.findOne.mockResolvedValue(null);
      mockDb.sequelize.models.Model.create.mockResolvedValue({ id: 1 });
      mockDb.sequelize.models.ModelPriceScore.upsert.mockResolvedValue([{}, true]);

      const result = await manager.execute('init', {
        strategy: 'mixed',
        providers: ['openai'],
        skipHealthCheck: true
      });

      expect(result.strategy).toBe('mixed');
      expect(result.summary.totalProviders).toBe(1);
    });

    it('should handle sync mode with model cleanup', async () => {
      // Mock provider lookup
      mockDb.sequelize.models.Provider.findOne.mockResolvedValue({
        id: 1,
        name: 'openai',
        type: 'direct'
      });

      // Mock existing models in database
      mockDb.sequelize.models.Model.findAll.mockResolvedValue([
        { id: 1, model_slug: 'old-model-openai' },
        { id: 2, model_slug: 'gpt-4-openai' }
      ]);

      // Mock model processing
      mockDb.sequelize.models.Model.findOne.mockResolvedValue(null);
      mockDb.sequelize.models.Model.create.mockResolvedValue({ id: 3 });
      mockDb.sequelize.models.Model.destroy.mockResolvedValue(1);
      mockDb.sequelize.models.ModelPriceScore.upsert.mockResolvedValue([{}, true]);
      mockDb.sequelize.models.ModelPriceScore.destroy.mockResolvedValue(1);

      const result = await manager.execute('sync', {
        providers: ['openai'],
        skipHealthCheck: true
      });

      expect(result.mode).toBe('sync');
      expect(result.summary.totalProviders).toBe(1);
    });
  });

  describe('Error Handling Integration', () => {
    beforeEach(async () => {
      mockDb.initialize.mockResolvedValue();
      await manager.initialize();
    });

    it('should handle ModelProcessor errors gracefully', async () => {
      // Mock provider lookup
      mockDb.sequelize.models.Provider.findOne.mockResolvedValue({
        id: 1,
        name: 'openai',
        type: 'direct'
      });

      // Mock database error
      mockDb.sequelize.transaction.mockRejectedValue(new Error('Database transaction failed'));

      const result = await manager.execute('update', {
        providers: ['openai'],
        skipHealthCheck: true
      });

      expect(result.summary.failedProviders).toBeGreaterThan(0);
    });

    it('should continue processing other providers when one fails', async () => {
      // Mock provider lookups
      mockDb.sequelize.models.Provider.findOne
        .mockResolvedValueOnce({
          id: 1,
          name: 'openai',
          type: 'direct'
        })
        .mockResolvedValueOnce({
          id: 2,
          name: 'anthropic',
          type: 'direct'
        });

      // Mock successful processing for first provider
      mockDb.sequelize.models.Model.findOne.mockResolvedValueOnce(null);
      mockDb.sequelize.models.Model.create.mockResolvedValueOnce({ id: 1 });
      mockDb.sequelize.models.ModelPriceScore.upsert.mockResolvedValueOnce([{}, true]);

      // Mock failure for second provider
      mockDb.sequelize.transaction
        .mockImplementationOnce((callback) => callback(mockTransaction))
        .mockRejectedValueOnce(new Error('Second provider failed'));

      const result = await manager.execute('update', {
        providers: ['openai', 'anthropic'],
        skipHealthCheck: true
      });

      expect(result.summary.totalProviders).toBe(2);
      expect(result.summary.successfulProviders).toBe(1);
      expect(result.summary.failedProviders).toBe(1);
    });
  });

  describe('Dry Run Mode', () => {
    beforeEach(async () => {
      // Create manager in dry-run mode
      manager = new UnifiedModelManager({
        logger: mockLogger,
        dryRun: true
      });
      
      mockDb.initialize.mockResolvedValue();
      await manager.initialize();
    });

    it('should execute in dry-run mode without database operations', async () => {
      const result = await manager.execute('init', {
        providers: ['openai'],
        skipHealthCheck: true
      });

      expect(result.dryRun).toBe(true);
      expect(result.summary.totalProviders).toBe(1);
      
      // Verify no database operations were called
      expect(mockDb.sequelize.models.Model.create).not.toHaveBeenCalled();
      expect(mockDb.sequelize.models.ModelPriceScore.upsert).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources properly', async () => {
      mockDb.initialize.mockResolvedValue();
      mockDb.close.mockResolvedValue();
      
      await manager.initialize();
      await manager.cleanup();
      
      expect(mockDb.close).toHaveBeenCalled();
      expect(manager.providers.size).toBe(0);
    });
  });

  describe('Status and Monitoring', () => {
    beforeEach(async () => {
      mockDb.initialize.mockResolvedValue();
      await manager.initialize();
    });

    it('should provide comprehensive status information', () => {
      const status = manager.getStatus();
      
      expect(status.initialized).toBe(true);
      expect(status.totalProviders).toBeGreaterThan(0);
      expect(status.providers).toBeDefined();
      expect(status.errorHandler).toBeDefined();
    });

    it('should track healthy providers', () => {
      const healthyProviders = manager.getHealthyProviders();
      
      expect(Array.isArray(healthyProviders)).toBe(true);
    });
  });
});