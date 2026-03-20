/**
 * Migration: Add sync tracking columns to models table
 * 
 * Adds columns to track model synchronization status, last update times,
 * sync errors, and metadata for enhanced model management.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add new columns to models table
    await queryInterface.addColumn('models', 'last_updated_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Timestamp when model data was last updated from provider',
      after: 'updated_at'
    });

    await queryInterface.addColumn('models', 'last_synced_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Timestamp of last successful synchronization',
      after: 'last_updated_at'
    });

    await queryInterface.addColumn('models', 'sync_status', {
      type: Sequelize.ENUM('pending', 'syncing', 'synced', 'error', 'stale', 'disabled'),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'Current synchronization status of the model',
      after: 'last_synced_at'
    });

    await queryInterface.addColumn('models', 'sync_error', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Last synchronization error message',
      after: 'sync_status'
    });

    await queryInterface.addColumn('models', 'sync_attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of sync attempts since last success',
      after: 'sync_error'
    });

    await queryInterface.addColumn('models', 'model_type', {
      type: Sequelize.ENUM('text', 'chat', 'code', 'image', 'audio', 'video', 'embedding', 'moderation'),
      allowNull: false,
      defaultValue: 'text',
      comment: 'Type of AI model (text, chat, code, image, etc.)',
      after: 'sync_attempts'
    });

    await queryInterface.addColumn('models', 'metadata', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Additional metadata about the model (capabilities, versions, etc.)',
      after: 'model_type'
    });

    await queryInterface.addColumn('models', 'source_provider_confidence', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Confidence score for detected source provider (for aggregated models)',
      after: 'metadata'
    });

    await queryInterface.addColumn('models', 'fingerprint', {
      type: Sequelize.STRING(32),
      allowNull: true,
      comment: 'MD5 hash of model characteristics for change detection',
      after: 'source_provider_confidence'
    });

    await queryInterface.addColumn('models', 'is_deprecated', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether the model is deprecated by the provider',
      after: 'fingerprint'
    });

    await queryInterface.addColumn('models', 'deprecation_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Date when the model was or will be deprecated',
      after: 'is_deprecated'
    });

    await queryInterface.addColumn('models', 'replacement_model_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'ID of the model that replaces this deprecated model',
      references: {
        model: 'models',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'deprecation_date'
    });

    // Create indexes for new columns
    await queryInterface.addIndex('models', ['sync_status'], {
      name: 'idx_models_sync_status'
    });

    await queryInterface.addIndex('models', ['last_synced_at'], {
      name: 'idx_models_last_synced_at'
    });

    await queryInterface.addIndex('models', ['model_type'], {
      name: 'idx_models_model_type'
    });

    await queryInterface.addIndex('models', ['is_deprecated'], {
      name: 'idx_models_is_deprecated'
    });

    await queryInterface.addIndex('models', ['fingerprint'], {
      name: 'idx_models_fingerprint'
    });

    await queryInterface.addIndex('models', ['id_provider', 'sync_status'], {
      name: 'idx_models_provider_sync_status'
    });

    await queryInterface.addIndex('models', ['sync_status', 'last_synced_at'], {
      name: 'idx_models_sync_status_date'
    });

    await queryInterface.addIndex('models', ['replacement_model_id'], {
      name: 'idx_models_replacement_model_id'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes first
    await queryInterface.removeIndex('models', 'idx_models_sync_status');
    await queryInterface.removeIndex('models', 'idx_models_last_synced_at');
    await queryInterface.removeIndex('models', 'idx_models_model_type');
    await queryInterface.removeIndex('models', 'idx_models_is_deprecated');
    await queryInterface.removeIndex('models', 'idx_models_fingerprint');
    await queryInterface.removeIndex('models', 'idx_models_provider_sync_status');
    await queryInterface.removeIndex('models', 'idx_models_sync_status_date');
    await queryInterface.removeIndex('models', 'idx_models_replacement_model_id');

    // Remove columns
    await queryInterface.removeColumn('models', 'replacement_model_id');
    await queryInterface.removeColumn('models', 'deprecation_date');
    await queryInterface.removeColumn('models', 'is_deprecated');
    await queryInterface.removeColumn('models', 'fingerprint');
    await queryInterface.removeColumn('models', 'source_provider_confidence');
    await queryInterface.removeColumn('models', 'metadata');
    await queryInterface.removeColumn('models', 'model_type');
    await queryInterface.removeColumn('models', 'sync_attempts');
    await queryInterface.removeColumn('models', 'sync_error');
    await queryInterface.removeColumn('models', 'sync_status');
    await queryInterface.removeColumn('models', 'last_synced_at');
    await queryInterface.removeColumn('models', 'last_updated_at');
  }
};