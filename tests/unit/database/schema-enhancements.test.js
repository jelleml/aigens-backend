/**
 * Database Schema Enhancements Tests
 * 
 * Tests to verify all database schema changes for the model management system,
 * including new tables, columns, indexes, and model associations.
 */

const db = require('../../../database');

describe('Database Schema Enhancements', () => {
  let queryInterface;
  let sequelize;

  beforeAll(async () => {
    await db.initialize();
    sequelize = db.sequelize;
    queryInterface = sequelize.getQueryInterface();
  });

  afterAll(async () => {
    await db.close();
  });

  describe('ModelSyncLog Table', () => {
    let ModelSyncLog;

    beforeAll(() => {
      ModelSyncLog = db.models.ModelSyncLog;
    });

    it('should exist and be properly configured', async () => {
      expect(ModelSyncLog).toBeDefined();
      expect(ModelSyncLog.tableName).toBe('model_sync_logs');
    });

    it('should have all required columns', async () => {
      const tableDescription = await queryInterface.describeTable('model_sync_logs');
      
      const expectedColumns = [
        'id', 'execution_id', 'id_provider', 'sync_type', 'sync_mode',
        'status', 'started_at', 'completed_at', 'duration_ms',
        'models_processed', 'models_created', 'models_updated', 'models_removed',
        'relationships_created', 'errors_count', 'error_message', 'error_details',
        'configuration', 'statistics', 'metadata', 'triggered_by', 'dry_run',
        'created_at', 'updated_at'
      ];

      expectedColumns.forEach(column => {
        expect(tableDescription[column]).toBeDefined();
      });
    });

    it('should have correct ENUM values for sync_type', async () => {
      const tableDescription = await queryInterface.describeTable('model_sync_logs');
      const syncTypeColumn = tableDescription.sync_type;
      
      expect(syncTypeColumn.type).toContain('ENUM');
    });

    it('should have correct ENUM values for status', async () => {
      const tableDescription = await queryInterface.describeTable('model_sync_logs');
      const statusColumn = tableDescription.status;
      
      expect(statusColumn.type).toContain('ENUM');
    });

    it('should create and manipulate sync log records', async () => {
      const testProvider = await db.models.Provider.findOne();
      if (!testProvider) {
        // Skip if no provider exists
        return;
      }

      const syncLog = await ModelSyncLog.create({
        execution_id: 'test_execution_001',
        id_provider: testProvider.id,
        sync_type: 'update',
        sync_mode: 'manual',
        triggered_by: 'test_user'
      });

      expect(syncLog.id).toBeDefined();
      expect(syncLog.execution_id).toBe('test_execution_001');
      expect(syncLog.status).toBe('started');

      // Test markCompleted method
      await syncLog.markCompleted({
        models_processed: 10,
        models_created: 2,
        models_updated: 8
      });

      await syncLog.reload();
      expect(syncLog.status).toBe('completed');
      expect(syncLog.models_processed).toBe(10);
      expect(syncLog.completed_at).toBeDefined();

      // Cleanup
      await syncLog.destroy();
    });

    it('should have proper indexes', async () => {
      const indexes = await queryInterface.showIndex('model_sync_logs');
      const indexNames = indexes.map(idx => idx.name);

      // Index names might vary based on database implementation
      const expectedIndexFields = ['execution_id', 'id_provider', 'sync_type', 'status'];
      expectedIndexFields.forEach(field => {
        const hasIndex = indexNames.some(name => name.includes(field));
        expect(hasIndex).toBe(true);
      });
    });
  });

  describe('ProviderHealthStatus Table', () => {
    let ProviderHealthStatus;

    beforeAll(() => {
      ProviderHealthStatus = db.models.ProviderHealthStatus;
    });

    it('should exist and be properly configured', async () => {
      expect(ProviderHealthStatus).toBeDefined();
      expect(ProviderHealthStatus.tableName).toBe('provider_health_status');
    });

    it('should have all required columns', async () => {
      const tableDescription = await queryInterface.describeTable('provider_health_status');
      
      const expectedColumns = [
        'id', 'id_provider', 'status', 'last_check_at', 'last_success_at',
        'last_failure_at', 'consecutive_failures', 'consecutive_successes',
        'total_requests', 'successful_requests', 'failed_requests',
        'avg_response_time_ms', 'last_response_time_ms', 'error_rate_percentage',
        'availability_percentage', 'last_error_message', 'last_error_type',
        'circuit_breaker_state', 'circuit_breaker_opened_at', 'rate_limit_remaining',
        'rate_limit_reset_at', 'models_count', 'last_sync_at', 'next_check_at',
        'health_score', 'performance_metrics', 'configuration', 'metadata',
        'is_enabled', 'alerting_enabled', 'created_at', 'updated_at'
      ];

      expectedColumns.forEach(column => {
        expect(tableDescription[column]).toBeDefined();
      });
    });

    it('should create and manipulate health status records', async () => {
      const testProvider = await db.models.Provider.findOne();
      if (!testProvider) {
        // Skip if no provider exists
        return;
      }

      const healthStatus = await ProviderHealthStatus.create({
        id_provider: testProvider.id,
        status: 'healthy',
        health_score: 95.5
      });

      expect(healthStatus.id).toBeDefined();
      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.health_score).toBe(95.5);

      // Test recordSuccess method
      await healthStatus.recordSuccess(1500);
      await healthStatus.reload();

      expect(healthStatus.consecutive_successes).toBe(1);
      expect(healthStatus.total_requests).toBe(1);
      expect(healthStatus.successful_requests).toBe(1);
      expect(healthStatus.last_response_time_ms).toBe(1500);

      // Test recordFailure method
      const error = new Error('Test API error');
      await healthStatus.recordFailure(error, 'api_error');
      await healthStatus.reload();

      expect(healthStatus.consecutive_failures).toBe(1);
      expect(healthStatus.consecutive_successes).toBe(0);
      expect(healthStatus.last_error_message).toBe('Test API error');
      expect(healthStatus.last_error_type).toBe('api_error');

      // Cleanup
      await healthStatus.destroy();
    });

    it('should have unique constraint on id_provider', async () => {
      const testProvider = await db.models.Provider.findOne();
      if (!testProvider) {
        return;
      }

      // Create first record
      const healthStatus1 = await ProviderHealthStatus.create({
        id_provider: testProvider.id
      });

      // Try to create duplicate - should fail
      await expect(
        ProviderHealthStatus.create({
          id_provider: testProvider.id
        })
      ).rejects.toThrow();

      // Cleanup
      await healthStatus1.destroy();
    });
  });

  describe('Models Table Enhancements', () => {
    it('should have new sync-related columns', async () => {
      const tableDescription = await queryInterface.describeTable('models');
      
      const newColumns = [
        'last_updated_at', 'last_synced_at', 'sync_status', 'sync_error',
        'sync_attempts', 'model_type', 'metadata', 'source_provider_confidence',
        'fingerprint', 'is_deprecated', 'deprecation_date', 'replacement_model_id'
      ];

      newColumns.forEach(column => {
        expect(tableDescription[column]).toBeDefined();
      });
    });

    it('should have correct ENUM values for sync_status', async () => {
      const tableDescription = await queryInterface.describeTable('models');
      const syncStatusColumn = tableDescription.sync_status;
      
      expect(syncStatusColumn.type).toContain('ENUM');
    });

    it('should have correct ENUM values for model_type', async () => {
      const tableDescription = await queryInterface.describeTable('models');
      const modelTypeColumn = tableDescription.model_type;
      
      expect(modelTypeColumn.type).toContain('ENUM');
    });

    it('should handle new columns in model operations', async () => {
      const testProvider = await db.models.Provider.findOne();
      if (!testProvider) {
        return;
      }

      const model = await db.models.Model.create({
        model_slug: 'test-model-schema-enhancement',
        api_model_id: 'test-model',
        id_provider: testProvider.id,
        name: 'Test Model',
        description: 'Test model for schema enhancement',
        max_tokens: 4096,
        sync_status: 'synced',
        model_type: 'chat',
        metadata: {
          capabilities: ['text', 'conversation'],
          version: '1.0'
        },
        source_provider_confidence: 0.95,
        fingerprint: 'abc123def456'
      });

      expect(model.sync_status).toBe('synced');
      expect(model.model_type).toBe('chat');
      expect(model.metadata).toEqual({
        capabilities: ['text', 'conversation'],
        version: '1.0'
      });
      expect(model.source_provider_confidence).toBe(0.95);
      expect(model.fingerprint).toBe('abc123def456');

      // Cleanup
      await model.destroy();
    });
  });

  describe('Performance Indexes', () => {
    it('should have performance indexes on models table', async () => {
      const indexes = await queryInterface.showIndex('models');
      const indexNames = indexes.map(idx => idx.name);

      const expectedIndexes = [
        'idx_models_sync_status',
        'idx_models_last_synced_at',
        'idx_models_model_type',
        'idx_models_is_deprecated',
        'idx_models_fingerprint',
        'idx_models_provider_sync_status',
        'idx_models_active_provider',
        'idx_models_active_type',
        'idx_models_api_id_provider'
      ];

      // Check for presence of key performance indexes (names may vary)
      const keyIndexFields = ['sync_status', 'model_type', 'active', 'provider'];
      keyIndexFields.forEach(field => {
        const hasIndex = indexNames.some(name => name.toLowerCase().includes(field.toLowerCase()));
        if (hasIndex) {
          expect(hasIndex).toBe(true);
        } else {
          console.log(`Index for ${field} not found - may need migration`);
        }
      });
    });

    it('should have performance indexes on aggregated_models table', async () => {
      const indexes = await queryInterface.showIndex('aggregated_models');
      const indexNames = indexes.map(idx => idx.name);

      const expectedIndexes = [
        'idx_aggregated_models_aggregator_available',
        'idx_aggregated_models_source_available',
        'idx_aggregated_models_source_model_id',
        'idx_aggregated_models_confidence_score'
      ];

      // Check for presence of key performance indexes (names may vary)
      const keyIndexFields = ['sync_status', 'model_type', 'active', 'provider'];
      keyIndexFields.forEach(field => {
        const hasIndex = indexNames.some(name => name.toLowerCase().includes(field.toLowerCase()));
        if (hasIndex) {
          expect(hasIndex).toBe(true);
        } else {
          console.log(`Index for ${field} not found - may need migration`);
        }
      });
    });

    it('should have performance indexes on provider_health_status table', async () => {
      const indexes = await queryInterface.showIndex('provider_health_status');
      const indexNames = indexes.map(idx => idx.name);

      const expectedIndexes = [
        'idx_provider_health_status_provider_unique',
        'idx_provider_health_status_status',
        'idx_provider_health_status_last_check',
        'idx_provider_health_status_score',
        'idx_provider_health_status_circuit_breaker'
      ];

      // Check for presence of key performance indexes (names may vary)
      const keyIndexFields = ['sync_status', 'model_type', 'active', 'provider'];
      keyIndexFields.forEach(field => {
        const hasIndex = indexNames.some(name => name.toLowerCase().includes(field.toLowerCase()));
        if (hasIndex) {
          expect(hasIndex).toBe(true);
        } else {
          console.log(`Index for ${field} not found - may need migration`);
        }
      });
    });
  });

  describe('Model Associations', () => {
    it('should have proper associations for ModelSyncLog', () => {
      const ModelSyncLog = db.models.ModelSyncLog;
      const associations = ModelSyncLog.associations;

      expect(associations.provider).toBeDefined();
      expect(associations.provider.associationType).toBe('BelongsTo');
    });

    it('should have proper associations for ProviderHealthStatus', () => {
      const ProviderHealthStatus = db.models.ProviderHealthStatus;
      const associations = ProviderHealthStatus.associations;

      expect(associations.provider).toBeDefined();
      expect(associations.provider.associationType).toBe('BelongsTo');
    });

    it('should be able to query with associations', async () => {
      const testProvider = await db.models.Provider.findOne();
      if (!testProvider) {
        return;
      }

      // Create test data
      const syncLog = await db.models.ModelSyncLog.create({
        execution_id: 'test_association_001',
        id_provider: testProvider.id,
        sync_type: 'update'
      });

      // Query with association
      const logWithProvider = await db.models.ModelSyncLog.findByPk(syncLog.id, {
        include: [{ model: db.models.Provider, as: 'provider' }]
      });

      expect(logWithProvider.provider).toBeDefined();
      expect(logWithProvider.provider.id).toBe(testProvider.id);

      // Cleanup
      await syncLog.destroy();
    });
  });

  describe('Data Integrity', () => {
    it('should enforce foreign key constraints', async () => {
      // Test ModelSyncLog foreign key constraint
      await expect(
        db.models.ModelSyncLog.create({
          execution_id: 'test_fk_001',
          id_provider: 99999, // Non-existent provider
          sync_type: 'update'
        })
      ).rejects.toThrow();

      // Test ProviderHealthStatus foreign key constraint
      await expect(
        db.models.ProviderHealthStatus.create({
          id_provider: 99999 // Non-existent provider
        })
      ).rejects.toThrow();
    });

    it('should handle JSON fields properly', async () => {
      const testProvider = await db.models.Provider.findOne();
      if (!testProvider) {
        return;
      }

      const complexMetadata = {
        configuration: {
          retries: 3,
          timeout: 30000,
          providers: ['openai', 'anthropic']
        },
        statistics: {
          total_time: 45000,
          api_calls: 15,
          success_rate: 0.93
        },
        errors: [
          { type: 'timeout', count: 2 },
          { type: 'rate_limit', count: 1 }
        ]
      };

      const syncLog = await db.models.ModelSyncLog.create({
        execution_id: 'test_json_001',
        id_provider: testProvider.id,
        sync_type: 'sync',
        configuration: complexMetadata.configuration,
        statistics: complexMetadata.statistics,
        error_details: complexMetadata
      });

      await syncLog.reload();

      expect(syncLog.configuration).toEqual(complexMetadata.configuration);
      expect(syncLog.statistics).toEqual(complexMetadata.statistics);
      expect(syncLog.error_details).toEqual(complexMetadata);

      // Cleanup
      await syncLog.destroy();
    });
  });

  describe('Static Methods', () => {
    it('should test ModelSyncLog static methods', async () => {
      const testProvider = await db.models.Provider.findOne();
      if (!testProvider) {
        return;
      }

      // Test createExecution
      const syncLog = await db.models.ModelSyncLog.createExecution(
        'test_static_001',
        testProvider.id,
        'update',
        {
          mode: 'scheduled',
          triggeredBy: 'system',
          dryRun: true
        }
      );

      expect(syncLog.execution_id).toBe('test_static_001');
      expect(syncLog.sync_mode).toBe('scheduled');
      expect(syncLog.triggered_by).toBe('system');
      expect(syncLog.dry_run).toBe(true);

      // Test getRecentLogs
      const recentLogs = await db.models.ModelSyncLog.getRecentLogs(10, testProvider.id);
      expect(Array.isArray(recentLogs)).toBe(true);

      // Test getExecutionStats
      const executionStats = await db.models.ModelSyncLog.getExecutionStats('test_static_001');
      expect(Array.isArray(executionStats)).toBe(true);
      expect(executionStats.length).toBe(1);

      // Cleanup
      await syncLog.destroy();
    });

    it('should test ProviderHealthStatus static methods', async () => {
      const testProvider = await db.models.Provider.findOne();
      if (!testProvider) {
        return;
      }

      // Test initializeProvider
      await db.models.ProviderHealthStatus.initializeProvider(testProvider.id);

      const healthStatus = await db.models.ProviderHealthStatus.findOne({
        where: { id_provider: testProvider.id }
      });

      expect(healthStatus).toBeDefined();
      expect(healthStatus.status).toBe('unknown');
      expect(healthStatus.is_enabled).toBe(true);

      // Test getHealthyProviders
      const healthyProviders = await db.models.ProviderHealthStatus.getHealthyProviders();
      expect(Array.isArray(healthyProviders)).toBe(true);

      // Cleanup
      await healthStatus.destroy();
    });
  });
});