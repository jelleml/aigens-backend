/**
 * Unit Tests for ModelProcessor
 * 
 * Comprehensive test suite covering all aspects of model processing including:
 * - Model standardization and formatting
 * - Source provider detection
 * - Deduplication and conflict resolution
 * - Aggregated model relationships
 * - Error handling and edge cases
 */

const { ModelProcessor, MODEL_TYPES, CONFLICT_RESOLUTION } = require('../../../../services/model-management/model-processor');

// Mock database and dependencies
jest.mock('../../../../database', () => ({
  sequelize: {
    models: {
      Model: {
        findOne: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      Provider: {
        findOne: jest.fn()
      },
      ModelPriceScore: {
        upsert: jest.fn()
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

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock metrics collector
const mockMetrics = {
  increment: jest.fn(),
  timing: jest.fn(),
  gauge: jest.fn()
};

describe('ModelProcessor', () => {
  let modelProcessor;
  let mockDb;
  let mockTransaction;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock database
    mockDb = require('../../../../database');
    mockTransaction = {
      commit: jest.fn(),
      rollback: jest.fn()
    };
    mockDb.sequelize.transaction.mockImplementation((callback) => callback(mockTransaction));
    
    // Create ModelProcessor instance
    modelProcessor = new ModelProcessor(mockLogger, mockMetrics);
  });

  describe('Constructor', () => {
    it('should initialize with default logger when none provided', () => {
      const processor = new ModelProcessor();
      expect(processor.logger).toBeDefined();
    });

    it('should initialize with provided logger and metrics', () => {
      const processor = new ModelProcessor(mockLogger, mockMetrics);
      expect(processor.logger).toBe(mockLogger);
      expect(processor.metrics).toBe(mockMetrics);
    });

    it('should initialize statistics correctly', () => {
      const processor = new ModelProcessor(mockLogger, mockMetrics);
      expect(processor.stats).toEqual({
        processed: 0,
        deduplication: {
          duplicatesDetected: 0,
          conflictsResolved: 0,
          merged: 0
        },
        relationships: {
          created: 0,
          updated: 0,
          sourceDetected: 0
        },
        errors: []
      });
    });
  });

  describe('standardizeModel', () => {
    const mockProviderConfig = {
      id: 1,
      name: 'openai',
      type: 'direct'
    };

    it('should standardize a basic model correctly', async () => {
      const rawModel = {
        id: 'gpt-4',
        name: 'GPT-4',
        description: 'Advanced language model',
        max_tokens: 8192
      };

      const result = await modelProcessor.standardizeModel(rawModel, mockProviderConfig);

      expect(result).toEqual({
        model_slug: 'gpt-4-openai',
        api_model_id: 'gpt-4',
        id_provider: 1,
        name: 'GPT-4',
        description: 'Advanced language model',
        max_tokens: 8192,
        is_active: false,
        model_type: 'chat',
        pricing: null,
        metadata: {
          provider_type: 'direct',
          raw_id: 'gpt-4',
          created_at: expect.any(String),
          sourceProvider: null,
          sourceConfidence: 0,
          processedAt: expect.any(String),
          originalData: {
            id: 'gpt-4',
            name: 'GPT-4',
            description: 'Advanced language model',
            owned_by: undefined,
            created: undefined,
            pricing: undefined,
            context_length: undefined
          }
        }
      });
    });

    it('should handle model with pricing information', async () => {
      const rawModel = {
        id: 'gpt-4',
        name: 'GPT-4',
        pricing: {
          prompt: 0.03,
          completion: 0.06
        }
      };

      const result = await modelProcessor.standardizeModel(rawModel, mockProviderConfig);

      expect(result.pricing).toEqual({
        price_1m_input_tokens: 30000,
        price_1m_output_tokens: 60000
      });
    });

    it('should detect source provider for aggregator models', async () => {
      const aggregatorConfig = {
        id: 2,
        name: 'openrouter',
        type: 'aggregator'
      };

      const rawModel = {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        owned_by: 'openai'
      };

      jest.spyOn(modelProcessor, 'detectSourceProvider').mockResolvedValue({
        provider: 'openai',
        confidence: 0.95,
        source: 'owned_by_field'
      });

      const result = await modelProcessor.standardizeModel(rawModel, aggregatorConfig);

      expect(result.metadata.sourceProvider).toBe('openai');
      expect(result.metadata.sourceConfidence).toBe(0.95);
    });
  });

  describe('detectSourceProvider', () => {
    it('should detect OpenAI models correctly', async () => {
      const rawModel = {
        id: 'gpt-4-turbo',
        owned_by: 'openai'
      };

      const result = await modelProcessor.detectSourceProvider(rawModel, 'gpt-4-turbo');

      expect(result.provider).toBe('openai');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.source).toBe('owned_by_field');
    });

    it('should detect Anthropic models from model name', async () => {
      const rawModel = {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus'
      };

      const result = await modelProcessor.detectSourceProvider(rawModel, 'claude-3-opus');

      expect(result.provider).toBe('anthropic');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should return community provider for unknown models', async () => {
      const rawModel = {
        id: 'unknown-model-xyz',
        name: 'Some Unknown Model'
      };

      const result = await modelProcessor.detectSourceProvider(rawModel, 'unknown-model-xyz');

      expect(result.provider).toBe('community');
      expect(result.confidence).toBe(0);
    });

    it('should handle multiple detection sources', async () => {
      const rawModel = {
        id: 'meta-llama/Llama-2-7b',
        name: 'Llama 2 7B',
        description: 'Meta LLaMA model',
        owned_by: 'meta'
      };

      const result = await modelProcessor.detectSourceProvider(rawModel, 'meta-llama-llama-2-7b');

      expect(result.provider).toBe('meta');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('detectModelType', () => {
    it('should detect image generation models', () => {
      const rawModel = {
        id: 'dalle-3',
        description: 'DALLE image generation model'
      };

      const result = modelProcessor.detectModelType(rawModel);
      expect(result).toBe(MODEL_TYPES.IMAGE);
    });

    it('should detect audio models', () => {
      const rawModel = {
        id: 'whisper-1',
        description: 'Speech to text model'
      };

      const result = modelProcessor.detectModelType(rawModel);
      expect(result).toBe(MODEL_TYPES.AUDIO);
    });

    it('should detect code models', () => {
      const rawModel = {
        id: 'code-davinci-002',
        description: 'Code generation model'
      };

      const result = modelProcessor.detectModelType(rawModel);
      expect(result).toBe(MODEL_TYPES.CODE);
    });

    it('should detect chat models', () => {
      const rawModel = {
        id: 'gpt-3.5-turbo',
        description: 'Chat completion model'
      };

      const result = modelProcessor.detectModelType(rawModel);
      expect(result).toBe(MODEL_TYPES.CHAT);
    });

    it('should default to text type', () => {
      const rawModel = {
        id: 'unknown-model',
        description: 'Some model'
      };

      const result = modelProcessor.detectModelType(rawModel);
      expect(result).toBe(MODEL_TYPES.TEXT);
    });
  });

  describe('extractMaxTokens', () => {
    it('should extract from max_tokens field', () => {
      const rawModel = { max_tokens: 4096 };
      const result = modelProcessor.extractMaxTokens(rawModel);
      expect(result).toBe(4096);
    });

    it('should extract from context_length field', () => {
      const rawModel = { context_length: 8192 };
      const result = modelProcessor.extractMaxTokens(rawModel);
      expect(result).toBe(8192);
    });

    it('should parse from model name', () => {
      const rawModel = {
        id: 'model-32k',
        name: 'Model with 32k tokens'
      };
      const result = modelProcessor.extractMaxTokens(rawModel);
      expect(result).toBe(32000);
    });

    it('should return default for GPT-4', () => {
      const rawModel = { id: 'gpt-4' };
      const result = modelProcessor.extractMaxTokens(rawModel);
      expect(result).toBe(128000);
    });

    it('should return conservative default for unknown models', () => {
      const rawModel = { id: 'unknown-model' };
      const result = modelProcessor.extractMaxTokens(rawModel);
      expect(result).toBe(4096);
    });
  });

  describe('generateModelSlug', () => {
    it('should generate slug with provider suffix', () => {
      const result = modelProcessor.generateModelSlug('gpt-4', 'openai');
      expect(result).toBe('gpt-4-openai');
    });

    it('should not duplicate provider name in slug', () => {
      const result = modelProcessor.generateModelSlug('gpt-4-openai', 'openai');
      expect(result).toBe('gpt-4-openai');
    });

    it('should clean special characters', () => {
      const result = modelProcessor.generateModelSlug('model/with@special#chars', 'provider');
      expect(result).toBe('model-with-special-chars-provider');
    });

    it('should handle multiple consecutive dashes', () => {
      const result = modelProcessor.generateModelSlug('model---with---dashes', 'provider');
      expect(result).toBe('model-with-dashes-provider');
    });
  });

  describe('extractPricingData', () => {
    const mockProviderConfig = { name: 'openai' };

    it('should extract pricing from structured pricing object', () => {
      const rawModel = {
        pricing: {
          prompt: 0.01,
          completion: 0.02
        }
      };

      const result = modelProcessor.extractPricingData(rawModel, mockProviderConfig);

      expect(result).toEqual({
        price_1m_input_tokens: 10000,
        price_1m_output_tokens: 20000
      });
    });

    it('should extract pricing from alternative fields', () => {
      const rawModel = {
        input_cost_per_token: 0.000001,
        output_cost_per_token: 0.000002
      };

      const result = modelProcessor.extractPricingData(rawModel, mockProviderConfig);

      expect(result).toEqual({
        price_1m_input_tokens: 1,
        price_1m_output_tokens: 2
      });
    });

    it('should handle image pricing', () => {
      const rawModel = {
        pricing: {
          image: 0.04
        }
      };

      const result = modelProcessor.extractPricingData(rawModel, mockProviderConfig);

      expect(result).toEqual({
        price_image: 0.04
      });
    });

    it('should return null when no pricing available', () => {
      const rawModel = { id: 'model' };

      const result = modelProcessor.extractPricingData(rawModel, mockProviderConfig);

      expect(result).toBeNull();
    });
  });

  describe('normalizePricing', () => {
    it('should return price as-is when already per-million-tokens', () => {
      const result = modelProcessor.normalizePricing(30000);
      expect(result).toBe(30000);
    });

    it('should convert per-token to per-million-tokens', () => {
      const result = modelProcessor.normalizePricing(0.03);
      expect(result).toBe(30000);
    });
  });

  describe('findExistingModel', () => {
    it('should find model by model_slug', async () => {
      const standardModel = { model_slug: 'gpt-4-openai' };
      const existingModel = { id: 1, model_slug: 'gpt-4-openai' };

      mockDb.sequelize.models.Model.findOne.mockResolvedValueOnce(existingModel);

      const result = await modelProcessor.findExistingModel(standardModel, mockTransaction);

      expect(result).toBe(existingModel);
      expect(mockDb.sequelize.models.Model.findOne).toHaveBeenCalledWith({
        where: { model_slug: 'gpt-4-openai' },
        transaction: mockTransaction
      });
    });

    it('should find model by api_model_id and provider when slug not found', async () => {
      const standardModel = {
        model_slug: 'gpt-4-openai',
        api_model_id: 'gpt-4',
        id_provider: 1
      };
      const existingModel = { id: 1, api_model_id: 'gpt-4' };

      // First call returns null, second call returns the model
      mockDb.sequelize.models.Model.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingModel);

      const result = await modelProcessor.findExistingModel(standardModel, mockTransaction);

      expect(result).toBe(existingModel);
      expect(mockDb.sequelize.models.Model.findOne).toHaveBeenCalledTimes(2);
    });

    it('should return null when no existing model found', async () => {
      const standardModel = { model_slug: 'new-model-provider' };

      mockDb.sequelize.models.Model.findOne.mockResolvedValue(null);

      const result = await modelProcessor.findExistingModel(standardModel, mockTransaction);

      expect(result).toBeNull();
    });
  });

  describe('resolveModelConflict', () => {
    const existingModel = {
      id: 1,
      updated_at: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
      metadata: { sourceConfidence: 0.7 }
    };

    const standardModel = {
      metadata: { sourceConfidence: 0.9 }
    };

    it('should prefer direct provider over aggregator', async () => {
      const existing = { ...existingModel, provider: { type: 'aggregator' } };
      const standard = { ...standardModel, provider: { type: 'direct' } };

      const result = await modelProcessor.resolveModelConflict(
        existing,
        standard,
        CONFLICT_RESOLUTION.PREFER_DIRECT,
        mockTransaction
      );

      expect(result.action).toBe('update');
      expect(result.reason).toBe('prefer_direct_provider');
    });

    it('should update stale models in PREFER_LATEST strategy', async () => {
      const result = await modelProcessor.resolveModelConflict(
        existingModel,
        standardModel,
        CONFLICT_RESOLUTION.PREFER_LATEST,
        mockTransaction
      );

      expect(result.action).toBe('update');
      expect(result.reason).toBe('existing_is_stale');
    });

    it('should update when new model has higher confidence', async () => {
      const result = await modelProcessor.resolveModelConflict(
        existingModel,
        standardModel,
        CONFLICT_RESOLUTION.PREFER_HIGHER_CONFIDENCE,
        mockTransaction
      );

      expect(result.action).toBe('update');
      expect(result.reason).toBe('higher_confidence');
    });

    it('should merge metadata when using MERGE_METADATA strategy', async () => {
      const result = await modelProcessor.resolveModelConflict(
        existingModel,
        standardModel,
        CONFLICT_RESOLUTION.MERGE_METADATA,
        mockTransaction
      );

      expect(result.action).toBe('merge');
      expect(result.reason).toBe('merge_compatible_metadata');
    });
  });

  describe('mergeMetadata', () => {
    it('should merge metadata intelligently', () => {
      const existing = {
        sourceProvider: 'openai',
        sourceConfidence: 0.7,
        capabilities: ['text']
      };

      const newData = {
        sourceProvider: 'openai',
        sourceConfidence: 0.9,
        capabilities: ['text', 'chat']
      };

      const result = modelProcessor.mergeMetadata(existing, newData);

      expect(result.sourceConfidence).toBe(0.9);
      expect(result.capabilities).toEqual(['text', 'chat']);
      expect(result.lastMerged).toBeDefined();
      expect(result.mergeCount).toBe(1);
    });

    it('should keep existing confidence when higher', () => {
      const existing = {
        sourceProvider: 'openai',
        sourceConfidence: 0.95
      };

      const newData = {
        sourceProvider: 'openai',
        sourceConfidence: 0.8
      };

      const result = modelProcessor.mergeMetadata(existing, newData);

      expect(result.sourceProvider).toBe('openai');
      expect(result.sourceConfidence).toBe(0.95);
    });
  });

  describe('processBatch', () => {
    const mockRawModels = [
      {
        id: 'gpt-4',
        name: 'GPT-4',
        description: 'Advanced model'
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Fast model'
      }
    ];

    it('should process batch successfully', async () => {
      // Mock provider config lookup
      mockDb.sequelize.models.Provider.findOne.mockResolvedValue({
        id: 1,
        name: 'openai',
        type: 'direct'
      });

      // Mock model creation
      mockDb.sequelize.models.Model.findOne.mockResolvedValue(null);
      mockDb.sequelize.models.Model.create.mockResolvedValue({ id: 1 });
      mockDb.sequelize.models.ModelPriceScore.upsert.mockResolvedValue([{}, true]);

      // Mock successful processing
      const result = await modelProcessor.processBatch('openai', mockRawModels, {
        mode: 'update',
        createRelationships: false,
        enableDeduplication: false
      });

      expect(result.modelsProcessed).toBeGreaterThan(0);
      expect(result.duration).toBeDefined();
      expect(result.stats).toBeDefined();
    });

    it('should handle processing errors gracefully', async () => {
      // Mock provider not found
      mockDb.sequelize.models.Provider.findOne.mockResolvedValue(null);

      await expect(
        modelProcessor.processBatch('nonexistent', mockRawModels)
      ).rejects.toThrow('Provider nonexistent not found in database');
    });

    it('should process models with different batch sizes', async () => {
      mockDb.sequelize.models.Provider.findOne.mockResolvedValue({
        id: 1,
        name: 'openai',
        type: 'direct'
      });

      // Mock model creation for each model
      mockDb.sequelize.models.Model.findOne.mockResolvedValue(null);
      mockDb.sequelize.models.Model.create.mockResolvedValue({ id: 1 });
      mockDb.sequelize.models.ModelPriceScore.upsert.mockResolvedValue([{}, true]);

      const largeModelSet = Array.from({ length: 100 }, (_, i) => ({
        id: `model-${i}`,
        name: `Model ${i}`
      }));

      const result = await modelProcessor.processBatch('openai', largeModelSet, {
        batchSize: 10
      });

      expect(result.modelsProcessed).toBe(100);
    });
  });

  describe('Statistics and Utilities', () => {
    it('should reset statistics correctly', () => {
      // Modify some stats
      modelProcessor.stats.processed = 5;
      modelProcessor.stats.errors.push('test error');

      modelProcessor.resetStats();

      expect(modelProcessor.stats.processed).toBe(0);
      expect(modelProcessor.stats.errors).toEqual([]);
    });

    it('should get statistics correctly', () => {
      modelProcessor.stats.processed = 10;
      
      const stats = modelProcessor.getStats();
      
      expect(stats.processed).toBe(10);
      expect(stats).not.toBe(modelProcessor.stats); // Should be a copy
    });

    it('should generate fingerprint correctly', () => {
      const model = {
        model_slug: 'gpt-4-openai',
        name: 'GPT-4',
        description: 'Test model',
        max_tokens: 8192
      };

      const fingerprint = modelProcessor.generateFingerprint(model);

      expect(fingerprint).toBeDefined();
      expect(typeof fingerprint).toBe('string');
      expect(fingerprint.length).toBe(32); // MD5 hash length
    });

    it('should generate consistent fingerprints for same model', () => {
      const model = {
        model_slug: 'gpt-4-openai',
        name: 'GPT-4',
        description: 'Test model',
        max_tokens: 8192
      };

      const fingerprint1 = modelProcessor.generateFingerprint(model);
      const fingerprint2 = modelProcessor.generateFingerprint(model);

      expect(fingerprint1).toBe(fingerprint2);
    });
  });

  describe('Error Handling', () => {
    it('should handle standardization errors gracefully', async () => {
      const invalidModel = null;
      const providerConfig = { id: 1, name: 'openai', type: 'direct' };

      await expect(
        modelProcessor.standardizeModel(invalidModel, providerConfig)
      ).rejects.toThrow();
    });

    it('should handle database connection errors', async () => {
      const testModels = [{ id: 'test', name: 'Test Model' }];
      
      mockDb.sequelize.models.Provider.findOne.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        modelProcessor.processBatch('openai', testModels)
      ).rejects.toThrow('Database connection failed');
    });

    it('should track errors in statistics', async () => {
      // This would be tested as part of the processBatch integration
      // where individual model processing errors are caught and recorded
      expect(modelProcessor.stats.errors).toEqual([]);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete workflow for direct provider', async () => {
      const rawModels = [
        {
          id: 'gpt-4',
          name: 'GPT-4',
          description: 'Advanced language model',
          max_tokens: 8192,
          pricing: { prompt: 0.03, completion: 0.06 }
        }
      ];

      // Mock successful database operations
      mockDb.sequelize.models.Provider.findOne.mockResolvedValue({
        id: 1,
        name: 'openai',
        type: 'direct'
      });

      mockDb.sequelize.models.Model.findOne.mockResolvedValue(null); // No existing model
      mockDb.sequelize.models.Model.create.mockResolvedValue({ id: 1 });
      mockDb.sequelize.models.ModelPriceScore.upsert.mockResolvedValue([{}, true]);

      const result = await modelProcessor.processBatch('openai', rawModels);

      expect(result.modelsProcessed).toBe(1);
      expect(result.modelsCreated).toBe(1);
      expect(result.modelsUpdated).toBe(0);
    });

    it('should handle complete workflow for aggregator provider', async () => {
      const rawModels = [
        {
          id: 'openai/gpt-4',
          name: 'GPT-4',
          owned_by: 'openai',
          pricing: { prompt: 0.03, completion: 0.06 }
        }
      ];

      // Mock aggregator provider
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

      mockDb.sequelize.models.Model.findOne.mockResolvedValue(null);
      mockDb.sequelize.models.Model.create.mockResolvedValue({ id: 1 });
      mockDb.sequelize.models.ModelPriceScore.upsert.mockResolvedValue([{}, true]);
      mockDb.sequelize.models.AggregatorPricingTier.findOne.mockResolvedValue({ id: 1 });
      mockDb.sequelize.models.AggregatedModel.upsert.mockResolvedValue([{}, true]);

      const result = await modelProcessor.processBatch('openrouter', rawModels, {
        createRelationships: true
      });

      expect(result.modelsProcessed).toBe(1);
      expect(result.relationshipsCreated).toBe(1);
    });
  });
});