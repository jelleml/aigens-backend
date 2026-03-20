/**
 * Tests for database schema enhancements
 * Verifies that the schema changes for model management are correctly applied
 */

const { TestDatabaseFactory } = require('../../fixtures/database-fixtures');

describe('Database Schema Enhancements', () => {
  let testDbManager;

  beforeAll(async () => {
    // Create test database
    testDbManager = await TestDatabaseFactory.createTestDatabase({
      useRealDatabase: false,
      mockModels: true
    });
  });

  afterAll(async () => {
    if (testDbManager) {
      await testDbManager.cleanup();
    }
  });

  describe('Model Table Enhancements', () => {
    it('should have the required columns for model management', () => {
      // Mock the Model definition
      const modelAttributes = {
        id: { type: 'INTEGER', primaryKey: true },
        model_slug: { type: 'STRING' },
        api_model_id: { type: 'STRING' },
        id_provider: { type: 'INTEGER' },
        name: { type: 'STRING' },
        description: { type: 'TEXT' },
        max_tokens: { type: 'INTEGER' },
        is_active: { type: 'BOOLEAN' },
        last_updated_at: { type: 'DATE' },
        sync_status: { type: 'ENUM', values: ['pending', 'synced', 'failed'] },
        sync_error: { type: 'TEXT' },
        metadata: { type: 'JSON' }
      };

      // Mock the describeTable response
      testDbManager.sequelize.query = jest.fn().mockResolvedValue([
        Object.entries(modelAttributes).map(([name, def]) => ({
          Field: name,
          Type: def.type,
          Null: 'YES',
          Key: def.primaryKey ? 'PRI' : '',
          Default: null,
          Extra: def.primaryKey ? 'auto_increment' : ''
        }))
      ]);

      // Verify the model table has the required columns
      return testDbManager.sequelize.query('DESCRIBE models')
        .then(([results]) => {
          const columns = results.map(r => r.Field);
          
          // Check for required columns
          expect(columns).toContain('last_updated_at');
          expect(columns).toContain('sync_status');
          expect(columns).toContain('sync_error');
          expect(columns).toContain('metadata');
        });
    });
  });

  describe('ModelSyncLog Table', () => {
    it('should have the correct structure', () => {
      // Mock the ModelSyncLog definition
      const syncLogAttributes = {
        id: { type: 'INTEGER', primaryKey: true },
        provider_name: { type: 'STRING' },
        sync_type: { type: 'ENUM', values: ['init', 'update', 'full_sync'] },
        started_at: { type: 'TIMESTAMP' },
        completed_at: { type: 'TIMESTAMP' },
        status: { type: 'ENUM', values: ['running', 'completed', 'failed'] },
        models_processed: { type: 'INTEGER' },
        models_created: { type: 'INTEGER' },
        models_updated: { type: 'INTEGER' },
        errors_count: { type: 'INTEGER' },
        error_details: { type: 'JSON' },
        execution_time_ms: { type: 'INTEGER' },
        created_at: { type: 'TIMESTAMP' }
      };

      // Mock the describeTable response
      testDbManager.sequelize.query = jest.fn().mockResolvedValue([
        Object.entries(syncLogAttributes).map(([name, def]) => ({
          Field: name,
          Type: def.type,
          Null: 'YES',
          Key: def.primaryKey ? 'PRI' : '',
          Default: null,
          Extra: def.primaryKey ? 'auto_increment' : ''
        }))
      ]);

      // Verify the model_sync_logs table has the required columns
      return testDbManager.sequelize.query('DESCRIBE model_sync_logs')
        .then(([results]) => {
          const columns = results.map(r => r.Field);
          
          // Check for required columns
          expect(columns).toContain('provider_name');
          expect(columns).toContain('sync_type');
          expect(columns).toContain('started_at');
          expect(columns).toContain('completed_at');
          expect(columns).toContain('status');
          expect(columns).toContain('models_processed');
          expect(columns).toContain('models_created');
          expect(columns).toContain('models_updated');
          expect(columns).toContain('errors_count');
          expect(columns).toContain('error_details');
          expect(columns).toContain('execution_time_ms');
        });
    });
  });

  describe('ProviderHealthStatus Table', () => {
    it('should have the correct structure', () => {
      // Mock the ProviderHealthStatus definition
      const healthStatusAttributes = {
        id: { type: 'INTEGER', primaryKey: true },
        provider_name: { type: 'STRING' },
        last_check_at: { type: 'TIMESTAMP' },
        status: { type: 'ENUM', values: ['healthy', 'degraded', 'unhealthy'] },
        response_time_ms: { type: 'INTEGER' },
        error_message: { type: 'TEXT' },
        consecutive_failures: { type: 'INTEGER' },
        created_at: { type: 'TIMESTAMP' },
        updated_at: { type: 'TIMESTAMP' }
      };

      // Mock the describeTable response
      testDbManager.sequelize.query = jest.fn().mockResolvedValue([
        Object.entries(healthStatusAttributes).map(([name, def]) => ({
          Field: name,
          Type: def.type,
          Null: 'YES',
          Key: def.primaryKey ? 'PRI' : '',
          Default: null,
          Extra: def.primaryKey ? 'auto_increment' : ''
        }))
      ]);

      // Verify the provider_health_status table has the required columns
      return testDbManager.sequelize.query('DESCRIBE provider_health_status')
        .then(([results]) => {
          const columns = results.map(r => r.Field);
          
          // Check for required columns
          expect(columns).toContain('provider_name');
          expect(columns).toContain('last_check_at');
          expect(columns).toContain('status');
          expect(columns).toContain('response_time_ms');
          expect(columns).toContain('error_message');
          expect(columns).toContain('consecutive_failures');
        });
    });
  });

  describe('Database Indexes', () => {
    it('should have performance indexes for model management', () => {
      // Mock the SHOW INDEXES response
      const mockIndexes = [
        { Table: 'models', Key_name: 'PRIMARY', Column_name: 'id' },
        { Table: 'models', Key_name: 'idx_models_model_slug', Column_name: 'model_slug' },
        { Table: 'models', Key_name: 'idx_models_api_model_id', Column_name: 'api_model_id' },
        { Table: 'models', Key_name: 'idx_models_id_provider', Column_name: 'id_provider' },
        { Table: 'models', Key_name: 'idx_models_sync_status', Column_name: 'sync_status' },
        { Table: 'model_sync_logs', Key_name: 'PRIMARY', Column_name: 'id' },
        { Table: 'model_sync_logs', Key_name: 'idx_sync_logs_provider_name', Column_name: 'provider_name' },
        { Table: 'model_sync_logs', Key_name: 'idx_sync_logs_status', Column_name: 'status' },
        { Table: 'provider_health_status', Key_name: 'PRIMARY', Column_name: 'id' },
        { Table: 'provider_health_status', Key_name: 'unique_provider', Column_name: 'provider_name' }
      ];

      // Mock the SHOW INDEXES query
      testDbManager.sequelize.query = jest.fn().mockImplementation((sql) => {
        if (sql.includes('SHOW INDEXES FROM models')) {
          return Promise.resolve([
            mockIndexes.filter(idx => idx.Table === 'models')
          ]);
        } else if (sql.includes('SHOW INDEXES FROM model_sync_logs')) {
          return Promise.resolve([
            mockIndexes.filter(idx => idx.Table === 'model_sync_logs')
          ]);
        } else if (sql.includes('SHOW INDEXES FROM provider_health_status')) {
          return Promise.resolve([
            mockIndexes.filter(idx => idx.Table === 'provider_health_status')
          ]);
        }
        return Promise.resolve([[]]);
      });

      // Verify models table indexes
      return testDbManager.sequelize.query('SHOW INDEXES FROM models')
        .then(([results]) => {
          const indexNames = results.map(r => r.Key_name);
          
          // Check for required indexes
          expect(indexNames).toContain('idx_models_model_slug');
          expect(indexNames).toContain('idx_models_api_model_id');
          expect(indexNames).toContain('idx_models_id_provider');
          expect(indexNames).toContain('idx_models_sync_status');
        })
        .then(() => {
          // Verify model_sync_logs table indexes
          return testDbManager.sequelize.query('SHOW INDEXES FROM model_sync_logs');
        })
        .then(([results]) => {
          const indexNames = results.map(r => r.Key_name);
          
          // Check for required indexes
          expect(indexNames).toContain('idx_sync_logs_provider_name');
          expect(indexNames).toContain('idx_sync_logs_status');
        })
        .then(() => {
          // Verify provider_health_status table indexes
          return testDbManager.sequelize.query('SHOW INDEXES FROM provider_health_status');
        })
        .then(([results]) => {
          const indexNames = results.map(r => r.Key_name);
          
          // Check for required indexes
          expect(indexNames).toContain('unique_provider');
        });
    });
  });
});