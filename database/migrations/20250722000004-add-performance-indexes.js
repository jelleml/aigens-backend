/**
 * Migration: Add performance optimization indexes
 * 
 * Creates additional indexes for improved query performance across
 * the model management system tables.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Composite indexes for models table
    await queryInterface.addIndex('models', ['is_active', 'id_provider'], {
      name: 'idx_models_active_provider'
    });

    await queryInterface.addIndex('models', ['is_active', 'model_type'], {
      name: 'idx_models_active_type'
    });

    await queryInterface.addIndex('models', ['api_model_id', 'id_provider'], {
      name: 'idx_models_api_id_provider'
    });

    await queryInterface.addIndex('models', ['created_at'], {
      name: 'idx_models_created_at'
    });

    // Indexes for aggregated_models table
    await queryInterface.addIndex('aggregated_models', ['id_aggregator_provider', 'is_available'], {
      name: 'idx_aggregated_models_aggregator_available'
    });

    await queryInterface.addIndex('aggregated_models', ['id_source_provider', 'is_available'], {
      name: 'idx_aggregated_models_source_available'
    });

    await queryInterface.addIndex('aggregated_models', ['source_model_id'], {
      name: 'idx_aggregated_models_source_model_id'
    });

    await queryInterface.addIndex('aggregated_models', ['confidence_score'], {
      name: 'idx_aggregated_models_confidence_score'
    });

    // Indexes for model_price_score table
    await queryInterface.addIndex('models_price_score', ['id_model', 'source'], {
      name: 'idx_models_price_score_model_source'
    });

    await queryInterface.addIndex('models_price_score', ['price_1m_input_tokens'], {
      name: 'idx_models_price_score_input_price'
    });

    await queryInterface.addIndex('models_price_score', ['price_1m_output_tokens'], {
      name: 'idx_models_price_score_output_price'
    });

    // Indexes for providers table
    await queryInterface.addIndex('providers', ['provider_type', 'created_at'], {
      name: 'idx_providers_type_created'
    });

    // Indexes for message_cost table for better analytics
    await queryInterface.addIndex('message_cost', ['model_id', 'created_at'], {
      name: 'idx_message_cost_model_date'
    });

    await queryInterface.addIndex('message_cost', ['created_at'], {
      name: 'idx_message_cost_created_at'
    });

    // Indexes for aggregator_pricing_tiers table
    await queryInterface.addIndex('aggregator_pricing_tiers', ['id_aggregator_provider', 'is_active'], {
      name: 'idx_aggregator_pricing_tiers_provider_active'
    });

    await queryInterface.addIndex('aggregator_pricing_tiers', ['tier_name'], {
      name: 'idx_aggregator_pricing_tiers_tier_name'
    });

    await queryInterface.addIndex('aggregator_pricing_tiers', ['effective_from', 'effective_until'], {
      name: 'idx_aggregator_pricing_tiers_effective_period'
    });

    // Partial indexes for frequently queried subsets
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_models_active_sync_synced 
      ON models (id_provider, last_synced_at) 
      WHERE is_active = true AND sync_status = 'synced'
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX idx_models_stale_for_sync 
      ON models (last_synced_at, sync_attempts) 
      WHERE sync_status IN ('stale', 'error', 'pending')
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove custom partial indexes
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_models_stale_for_sync`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_models_active_sync_synced`);

    // Remove standard indexes
    await queryInterface.removeIndex('aggregator_pricing_tiers', 'idx_aggregator_pricing_tiers_effective_period');
    await queryInterface.removeIndex('aggregator_pricing_tiers', 'idx_aggregator_pricing_tiers_tier_name');
    await queryInterface.removeIndex('aggregator_pricing_tiers', 'idx_aggregator_pricing_tiers_provider_active');
    await queryInterface.removeIndex('message_cost', 'idx_message_cost_created_at');
    await queryInterface.removeIndex('message_cost', 'idx_message_cost_model_date');
    await queryInterface.removeIndex('providers', 'idx_providers_type_created');
    await queryInterface.removeIndex('models_price_score', 'idx_models_price_score_output_price');
    await queryInterface.removeIndex('models_price_score', 'idx_models_price_score_input_price');
    await queryInterface.removeIndex('models_price_score', 'idx_models_price_score_model_source');
    await queryInterface.removeIndex('aggregated_models', 'idx_aggregated_models_confidence_score');
    await queryInterface.removeIndex('aggregated_models', 'idx_aggregated_models_source_model_id');
    await queryInterface.removeIndex('aggregated_models', 'idx_aggregated_models_source_available');
    await queryInterface.removeIndex('aggregated_models', 'idx_aggregated_models_aggregator_available');
    await queryInterface.removeIndex('models', 'idx_models_created_at');
    await queryInterface.removeIndex('models', 'idx_models_api_id_provider');
    await queryInterface.removeIndex('models', 'idx_models_active_type');
    await queryInterface.removeIndex('models', 'idx_models_active_provider');
  }
};