/**
 * Database fixtures and cleanup utilities for testing
 * 
 * This module provides utilities for setting up and tearing down
 * test database fixtures for model management system tests.
 * 
 * @module database-fixtures
 */

const { mockDatabaseRecords, MockResponseFactory } = require('./mock-provider-responses');
const { getLogger } = require('../../services/logging');
const logger = getLogger('database-fixtures', 'test');

class DatabaseFixtures {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.models = sequelize.models;
    this.createdRecords = {
      providers: [],
      models: [],
      modelPriceScores: [],
      syncLogs: [],
      healthStatus: []
    };
  }

  /**
   * Setup test database with fixtures
   */
  async setup() {
    try {
      // Create providers
      for (const providerData of mockDatabaseRecords.providers) {
        const provider = await this.models.Provider.create(providerData);
        this.createdRecords.providers.push(provider);
      }

      // Create models
      for (const modelData of mockDatabaseRecords.models) {
        const model = await this.models.Model.create(modelData);
        this.createdRecords.models.push(model);
      }

      // Create model price scores
      for (const priceData of mockDatabaseRecords.modelPriceScores) {
        const priceScore = await this.models.ModelPriceScore.create(priceData);
        this.createdRecords.modelPriceScores.push(priceScore);
      }

      // Create sync logs if table exists
      if (this.models.ModelSyncLog) {
        for (const logData of mockDatabaseRecords.syncLogs) {
          const syncLog = await this.models.ModelSyncLog.create(logData);
          this.createdRecords.syncLogs.push(syncLog);
        }
      }

      // Create health status if table exists
      if (this.models.ProviderHealthStatus) {
        for (const healthData of mockDatabaseRecords.healthStatus) {
          const healthStatus = await this.models.ProviderHealthStatus.create(healthData);
          this.createdRecords.healthStatus.push(healthStatus);
        }
      }

      return this.createdRecords;
    } catch (error) {
      logger.error('Failed to setup database fixtures:', error);
      throw error;
    }
  }

  /**
   * Create specific test data
   */
  async createProvider(data = {}) {
    const defaultData = {
      name: 'test-provider',
      display_name: 'Test Provider',
      api_url: 'https://api.test.com/v1',
      is_active: true,
      ...data
    };

    const provider = await this.models.Provider.create(defaultData);
    this.createdRecords.providers.push(provider);
    return provider;
  }

  async createModel(data = {}) {
    const defaultData = {
      model_slug: 'test-model',
      api_model_id: 'test-model-id',
      id_provider: 1,
      name: 'Test Model',
      description: 'Test model description',
      max_tokens: 4096,
      is_active: true,
      last_updated_at: new Date(),
      sync_status: 'synced',
      ...data
    };

    const model = await this.models.Model.create(defaultData);
    this.createdRecords.models.push(model);
    return model;
  }

  async createModelPriceScore(data = {}) {
    const defaultData = {
      id_model: 1,
      price_1m_input_tokens: 10,
      price_1m_output_tokens: 30,
      created_at: new Date(),
      ...data
    };

    const priceScore = await this.models.ModelPriceScore.create(defaultData);
    this.createdRecords.modelPriceScores.push(priceScore);
    return priceScore;
  }

  async createSyncLog(data = {}) {
    if (!this.models.ModelSyncLog) {
      return null;
    }

    const defaultData = {
      provider_name: 'test-provider',
      sync_type: 'update',
      started_at: new Date(),
      completed_at: new Date(),
      status: 'completed',
      models_processed: 5,
      models_created: 2,
      models_updated: 3,
      errors_count: 0,
      execution_time_ms: 30000,
      ...data
    };

    const syncLog = await this.models.ModelSyncLog.create(defaultData);
    this.createdRecords.syncLogs.push(syncLog);
    return syncLog;
  }

  async createHealthStatus(data = {}) {
    if (!this.models.ProviderHealthStatus) {
      return null;
    }

    const defaultData = {
      provider_name: 'test-provider',
      last_check_at: new Date(),
      status: 'healthy',
      response_time_ms: 500,
      consecutive_failures: 0,
      ...data
    };

    const healthStatus = await this.models.ProviderHealthStatus.create(defaultData);
    this.createdRecords.healthStatus.push(healthStatus);
    return healthStatus;
  }

  /**
   * Create large datasets for performance testing
   */
  async createLargeDataset(options = {}) {
    const {
      providerCount = 10,
      modelsPerProvider = 100,
      withPricing = true,
      withLogs = true
    } = options;

    const providers = [];
    const models = [];
    const priceScores = [];

    // Create providers
    for (let i = 0; i < providerCount; i++) {
      const provider = await this.createProvider({
        name: `perf-provider-${i}`,
        display_name: `Performance Test Provider ${i}`,
        api_url: `https://api.perftest${i}.com/v1`
      });
      providers.push(provider);

      // Create models for each provider
      for (let j = 0; j < modelsPerProvider; j++) {
        const model = await this.createModel({
          model_slug: `perf-model-${i}-${j}`,
          api_model_id: `perf-model-${i}-${j}`,
          id_provider: provider.id,
          name: `Performance Test Model ${i}-${j}`,
          description: `Performance test model ${j} for provider ${i}`
        });
        models.push(model);

        // Create pricing data
        if (withPricing) {
          const priceScore = await this.createModelPriceScore({
            id_model: model.id,
            price_1m_input_tokens: Math.floor(Math.random() * 100) + 1,
            price_1m_output_tokens: Math.floor(Math.random() * 200) + 10
          });
          priceScores.push(priceScore);
        }
      }

      // Create sync logs
      if (withLogs) {
        await this.createSyncLog({
          provider_name: provider.name,
          models_processed: modelsPerProvider,
          models_created: modelsPerProvider,
          models_updated: 0,
          execution_time_ms: Math.floor(Math.random() * 60000) + 10000
        });
      }
    }

    return {
      providers,
      models,
      priceScores,
      totalRecords: providers.length + models.length + priceScores.length
    };
  }

  /**
   * Clean up all created test data
   */
  async cleanup() {
    try {
      // Clean up in reverse order to handle foreign key constraints
      if (this.createdRecords.healthStatus.length > 0 && this.models.ProviderHealthStatus) {
        const healthIds = this.createdRecords.healthStatus.map(h => h.id);
        await this.models.ProviderHealthStatus.destroy({
          where: { id: healthIds },
          force: true
        });
      }

      if (this.createdRecords.syncLogs.length > 0 && this.models.ModelSyncLog) {
        const logIds = this.createdRecords.syncLogs.map(l => l.id);
        await this.models.ModelSyncLog.destroy({
          where: { id: logIds },
          force: true
        });
      }

      if (this.createdRecords.modelPriceScores.length > 0) {
        const priceIds = this.createdRecords.modelPriceScores.map(p => p.id);
        await this.models.ModelPriceScore.destroy({
          where: { id: priceIds },
          force: true
        });
      }

      if (this.createdRecords.models.length > 0) {
        const modelIds = this.createdRecords.models.map(m => m.id);
        await this.models.Model.destroy({
          where: { id: modelIds },
          force: true
        });
      }

      if (this.createdRecords.providers.length > 0) {
        const providerIds = this.createdRecords.providers.map(p => p.id);
        await this.models.Provider.destroy({
          where: { id: providerIds },
          force: true
        });
      }

      // Reset tracking
      this.createdRecords = {
        providers: [],
        models: [],
        modelPriceScores: [],
        syncLogs: [],
        healthStatus: []
      };

    } catch (error) {
      logger.error('Failed to cleanup database fixtures:', error);
      throw error;
    }
  }

  /**
   * Clean up specific record types
   */
  async cleanupProviders() {
    if (this.createdRecords.providers.length > 0) {
      const providerIds = this.createdRecords.providers.map(p => p.id);
      await this.models.Provider.destroy({
        where: { id: providerIds },
        force: true
      });
      this.createdRecords.providers = [];
    }
  }

  async cleanupModels() {
    if (this.createdRecords.models.length > 0) {
      const modelIds = this.createdRecords.models.map(m => m.id);
      await this.models.Model.destroy({
        where: { id: modelIds },
        force: true
      });
      this.createdRecords.models = [];
    }
  }

  /**
   * Get created records for assertions
   */
  getCreatedRecords() {
    return { ...this.createdRecords };
  }

  /**
   * Reset database to clean state
   */
  async resetDatabase() {
    const tableNames = [
      'ProviderHealthStatus',
      'ModelSyncLog', 
      'ModelPriceScore',
      'Model',
      'Provider'
    ];

    for (const tableName of tableNames) {
      if (this.models[tableName]) {
        await this.models[tableName].destroy({
          where: {},
          force: true,
          truncate: true
        });
      }
    }
  }

  /**
   * Verify database state
   */
  async verifyDatabaseState() {
    const counts = {};
    
    counts.providers = await this.models.Provider.count();
    counts.models = await this.models.Model.count();
    counts.modelPriceScores = await this.models.ModelPriceScore.count();
    
    if (this.models.ModelSyncLog) {
      counts.syncLogs = await this.models.ModelSyncLog.count();
    }
    
    if (this.models.ProviderHealthStatus) {
      counts.healthStatus = await this.models.ProviderHealthStatus.count();
    }

    return counts;
  }
}

/**
 * Test database manager for handling test database lifecycle
 */
class TestDatabaseManager {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.fixtures = new DatabaseFixtures(sequelize);
    this.originalAutoIncrement = {};
  }

  /**
   * Setup test database
   */
  async setup() {
    // Ensure database is connected
    await this.sequelize.authenticate();
    
    // Sync database schema (create tables if they don't exist)
    await this.sequelize.sync({ force: false });
    
    return this.fixtures;
  }

  /**
   * Cleanup test database
   */
  async cleanup() {
    await this.fixtures.cleanup();
  }

  /**
   * Reset auto-increment values for consistent testing
   */
  async resetAutoIncrement() {
    const tables = ['providers', 'models', 'model_price_scores'];
    
    for (const table of tables) {
      try {
        await this.sequelize.query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
      } catch (error) {
        // Ignore errors for tables that don't exist
        logger.warn(`Could not reset auto-increment for table ${table}:`, error.message);
      }
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    return await this.fixtures.verifyDatabaseState();
  }
}

/**
 * Test database factory for creating test database instances
 */
class TestDatabaseFactory {
  /**
   * Create a test database instance with specific configuration
   * @param {Object} options - Database configuration options
   * @returns {TestDatabaseManager} Configured test database manager
   */
  static async createTestDatabase(options = {}) {
    const { 
      useRealDatabase = false,
      mockModels = true,
      preloadFixtures = false
    } = options;
    
    let sequelize;
    
    if (useRealDatabase) {
      // Use real database with test configuration
      const db = require('../../database');
      await db.initialize({ test: true });
      sequelize = db.sequelize;
    } else {
      // Use mock database
      sequelize = this.createMockSequelize(mockModels);
    }
    
    const dbManager = new TestDatabaseManager(sequelize);
    await dbManager.setup();
    
    if (preloadFixtures) {
      await dbManager.fixtures.setup();
    }
    
    return dbManager;
  }
  
  /**
   * Create a mock Sequelize instance
   * @param {boolean} mockModels - Whether to mock model methods
   * @returns {Object} Mock Sequelize instance
   */
  static createMockSequelize(mockModels = true) {
    const mockSequelize = {
      models: {},
      transaction: jest.fn().mockImplementation((callback) => {
        const mockTransaction = {
          commit: jest.fn(),
          rollback: jest.fn()
        };
        return callback(mockTransaction);
      }),
      authenticate: jest.fn().mockResolvedValue(),
      sync: jest.fn().mockResolvedValue(),
      close: jest.fn().mockResolvedValue(),
      query: jest.fn().mockResolvedValue([[], []])
    };
    
    if (mockModels) {
      const modelNames = [
        'Provider',
        'Model',
        'ModelPriceScore',
        'ModelSyncLog',
        'ProviderHealthStatus',
        'ModelStatsAA',
        'ModelModelStatsAA',
        'ModelsCapability',
        'ModelsModelsCapability'
      ];
      
      for (const modelName of modelNames) {
        mockSequelize.models[modelName] = {
          findOne: jest.fn().mockResolvedValue(null),
          findAll: jest.fn().mockResolvedValue([]),
          findByPk: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((data) => Promise.resolve({ id: Math.floor(Math.random() * 1000), ...data })),
          update: jest.fn().mockResolvedValue([1]),
          destroy: jest.fn().mockResolvedValue(1),
          count: jest.fn().mockResolvedValue(0),
          bulkCreate: jest.fn().mockResolvedValue([]),
          upsert: jest.fn().mockResolvedValue([{}, true])
        };
      }
    }
    
    return mockSequelize;
  }
}

module.exports = {
  DatabaseFixtures,
  TestDatabaseManager,
  TestDatabaseFactory
};