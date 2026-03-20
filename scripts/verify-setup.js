#!/usr/bin/env node

/**
 * SETUP VERIFICATION SCRIPT
 * 
 * This script verifies that all the setup steps completed successfully
 * and that all data is properly committed to the database.
 * 
 * Usage:
 *   node scripts/verify-setup.js
 */

const db = require('../database');
const { getLogger } = require('../services/logging');
const logger = getLogger('verify-setup', 'script');

const verifySetup = async () => {
  try {
    logger.info('🔍 VERIFYING MODELS SETUP');
    logger.info('==========================\n');
    
    // Initialize database
    await db.initialize();
    
    const { Provider, Model, ModelsCapability, ModelsModelsCapability, AggregatorPricingTier, ProviderSubscription, ModelsSubscription, AggregatedModel } = db.models;
    
    // Check providers
    const providerCount = await Provider.count();
    logger.info(`📋 Providers: ${providerCount}`);
    
    // Check models
    const modelCount = await Model.count();
    const activeModelCount = await Model.count({ where: { is_active: true } });
    logger.info(`🤖 Models: ${modelCount} total (${activeModelCount} active)`);
    
    // Check capabilities
    const capabilityCount = await ModelsCapability.count();
    logger.info(`🎯 Capabilities: ${capabilityCount}`);
    
    // Check model-capability links
    const linkCount = await ModelsModelsCapability.count();
    logger.info(`🔗 Model-capability links: ${linkCount}`);
    
    // Check aggregator pricing tiers
    const tierCount = await AggregatorPricingTier.count();
    logger.info(`💰 Aggregator pricing tiers: ${tierCount}`);
    
    // Check aggregated models
    const aggregatedModelCount = await AggregatedModel.count();
    logger.info(`🔀 Aggregated models: ${aggregatedModelCount}`);
    
    // Check provider subscriptions
    const subscriptionCount = await ProviderSubscription.count();
    logger.info(`💳 Provider subscriptions: ${subscriptionCount}`);
    
    // Check model subscriptions
    const modelSubscriptionCount = await ModelsSubscription.count();
    logger.info(`📝 Model subscriptions: ${modelSubscriptionCount}`);
    
    // Check breakdown by provider
    logger.info('\n📊 Models by provider:');
    const providers = await Provider.findAll({
      include: [{
        model: Model,
        as: 'models',
        attributes: []
      }],
      attributes: [
        'name',
        [db.sequelize.fn('COUNT', db.sequelize.col('models.id')), 'model_count']
      ],
      group: ['Provider.id'],
      order: [['name', 'ASC']]
    });
    
    providers.forEach(provider => {
      logger.info(`  ${provider.name}: ${provider.dataValues.model_count} models`);
    });
    
    // Check aggregated models by aggregator
    if (aggregatedModelCount > 0) {
      logger.info('\n🔀 Aggregated models by aggregator:');
      const aggregatorProviders = await Provider.findAll({
        where: { provider_type: 'aggregator' },
        include: [{
          model: AggregatedModel,
          as: 'aggregatedModels',
          attributes: []
        }],
        attributes: [
          'name',
          [db.sequelize.fn('COUNT', db.sequelize.col('aggregatedModels.id')), 'aggregated_count']
        ],
        group: ['Provider.id'],
        order: [['name', 'ASC']]
      });
      
      aggregatorProviders.forEach(provider => {
        logger.info(`  ${provider.name}: ${provider.dataValues.aggregated_count} aggregated models`);
      });
    }
    
    // Check provider subscriptions by provider
    if (subscriptionCount > 0) {
      logger.info('\n💳 Provider subscriptions by provider:');
      const providersWithSubs = await Provider.findAll({
        include: [{
          model: ProviderSubscription,
          as: 'subscriptions',
          attributes: []
        }],
        attributes: [
          'name',
          [db.sequelize.fn('COUNT', db.sequelize.col('subscriptions.id')), 'subscription_count']
        ],
        group: ['Provider.id'],
        having: db.sequelize.literal('COUNT(subscriptions.id) > 0'),
        order: [['name', 'ASC']]
      });
      
      providersWithSubs.forEach(provider => {
        logger.info(`  ${provider.name}: ${provider.dataValues.subscription_count} subscriptions`);
      });
    }
    
    // Validation checks
    logger.info('\n✅ VALIDATION CHECKS:');
    
    if (providerCount === 0) {
      logger.warn('❌ No providers found - setup may have failed');
    } else {
      logger.info(`✅ Found ${providerCount} providers`);
    }
    
    if (modelCount === 0) {
      logger.warn('❌ No models found - setup may have failed');
    } else {
      logger.info(`✅ Found ${modelCount} models`);
    }
    
    if (capabilityCount === 0) {
      logger.warn('❌ No capabilities found - setup may have failed');
    } else {
      logger.info(`✅ Found ${capabilityCount} capabilities`);
    }
    
    if (linkCount === 0) {
      logger.warn('❌ No model-capability links found - setup may have failed');
    } else {
      logger.info(`✅ Found ${linkCount} model-capability links`);
    }
    
    if (tierCount === 0) {
      logger.warn('⚠️  No aggregator pricing tiers found - aggregators may not be configured');
    } else {
      logger.info(`✅ Found ${tierCount} aggregator pricing tiers`);
    }
    
    if (aggregatedModelCount === 0) {
      logger.warn('⚠️  No aggregated models found - aggregator relationships may not be configured');
    } else {
      logger.info(`✅ Found ${aggregatedModelCount} aggregated model relationships`);
    }
    
    if (subscriptionCount === 0) {
      logger.warn('⚠️  No provider subscriptions found - pricing may not be configured');
    } else {
      logger.info(`✅ Found ${subscriptionCount} provider subscriptions`);
    }
    
    if (modelSubscriptionCount === 0) {
      logger.warn('⚠️  No model subscriptions found - model pricing links may not be configured');
    } else {
      logger.info(`✅ Found ${modelSubscriptionCount} model subscription links`);
    }
    
    // Final assessment (core components are required, others are warnings)
    const coreComponentsGood = providerCount > 0 && modelCount > 0 && capabilityCount > 0 && linkCount > 0;
    const pricingConfigured = tierCount > 0 && subscriptionCount > 0;
    const allGood = coreComponentsGood && pricingConfigured;
    
    logger.info('\n' + '='.repeat(50));
    if (allGood) {
      logger.info('🎉 SETUP VERIFICATION PASSED!');
      logger.info('All core components and pricing are properly configured.');
    } else if (coreComponentsGood) {
      logger.info('✅ CORE SETUP VERIFIED!');
      logger.info('Core components (providers, models, capabilities) are set up.');
      logger.warn('⚠️  Some pricing/aggregator components may need attention.');
    } else {
      logger.error('❌ SETUP VERIFICATION FAILED!');
      logger.error('Core components are missing or incomplete.');
      logger.error('Please run the setup again: npm run setup-models');
    }
    logger.info('='.repeat(50));
    
    await db.close();
    process.exit(allGood ? 0 : 1);
    
  } catch (error) {
    logger.error('❌ Error during verification:', error);
    try {
      await db.close();
    } catch (closeError) {
      logger.error('Error closing database:', closeError.message);
    }
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  verifySetup();
}

module.exports = { verifySetup };