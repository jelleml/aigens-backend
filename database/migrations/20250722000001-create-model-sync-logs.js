/**
 * Migration: Create model_sync_logs table
 * 
 * This table tracks all model synchronization operations across providers,
 * providing audit trail and monitoring capabilities for the model management system.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('model_sync_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      execution_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Unique identifier for the sync execution batch'
      },
      id_provider: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Provider ID (null for system-wide operations)',
        references: {
          model: 'providers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      sync_type: {
        type: Sequelize.ENUM('init', 'update', 'sync', 'health_check'),
        allowNull: false,
        comment: 'Type of synchronization operation'
      },
      sync_mode: {
        type: Sequelize.ENUM('manual', 'scheduled', 'api', 'system'),
        allowNull: false,
        defaultValue: 'manual',
        comment: 'How the sync was triggered'
      },
      status: {
        type: Sequelize.ENUM('started', 'running', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'started',
        comment: 'Current status of the sync operation'
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: 'When the sync operation started'
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the sync operation completed (success or failure)'
      },
      duration_ms: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Duration of the operation in milliseconds'
      },
      models_processed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of models processed in this operation'
      },
      models_created: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of new models created'
      },
      models_updated: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of existing models updated'
      },
      models_removed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of models removed (sync mode only)'
      },
      relationships_created: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of aggregated model relationships created'
      },
      errors_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of errors encountered during sync'
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Primary error message if sync failed'
      },
      error_details: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Detailed error information and stack traces'
      },
      configuration: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Sync configuration parameters used'
      },
      statistics: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Detailed processing statistics and metrics'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional metadata about the sync operation'
      },
      triggered_by: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'User or system that triggered the sync'
      },
      dry_run: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether this was a dry-run execution'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Create indexes for performance
    await queryInterface.addIndex('model_sync_logs', ['execution_id'], {
      name: 'idx_model_sync_logs_execution_id'
    });

    await queryInterface.addIndex('model_sync_logs', ['id_provider'], {
      name: 'idx_model_sync_logs_provider_id'
    });

    await queryInterface.addIndex('model_sync_logs', ['sync_type'], {
      name: 'idx_model_sync_logs_sync_type'
    });

    await queryInterface.addIndex('model_sync_logs', ['status'], {
      name: 'idx_model_sync_logs_status'
    });

    await queryInterface.addIndex('model_sync_logs', ['started_at'], {
      name: 'idx_model_sync_logs_started_at'
    });

    await queryInterface.addIndex('model_sync_logs', ['sync_type', 'status'], {
      name: 'idx_model_sync_logs_type_status'
    });

    await queryInterface.addIndex('model_sync_logs', ['id_provider', 'started_at'], {
      name: 'idx_model_sync_logs_provider_date'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('model_sync_logs');
  }
};