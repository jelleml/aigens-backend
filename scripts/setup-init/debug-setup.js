#!/usr/bin/env node

/**
 * DEBUG SETUP SCRIPT
 * 
 * This script runs the setup step by step and shows database state after each step
 * to help debug commit/persistence issues.
 */

const db = require('../../database');

const checkDatabaseState = async (stepName) => {
  console.log(`\n🔍 DATABASE STATE AFTER: ${stepName}`);
  console.log('=' .repeat(50));
  
  try {
    const { Provider, Model, ModelsCapability, AggregatorPricingTier, ProviderSubscription } = db.models;
    
    const providerCount = await Provider.count();
    const modelCount = await Model.count();
    const capabilityCount = await ModelsCapability.count();
    const tierCount = await AggregatorPricingTier.count();
    const subscriptionCount = await ProviderSubscription.count();
    
    console.log(`📋 Providers: ${providerCount}`);
    console.log(`🤖 Models: ${modelCount}`);
    console.log(`🎯 Capabilities: ${capabilityCount}`);
    console.log(`💰 Pricing tiers: ${tierCount}`);
    console.log(`💳 Subscriptions: ${subscriptionCount}`);
    
    if (subscriptionCount > 0) {
      const subscriptions = await ProviderSubscription.findAll({
        include: [{ model: Provider, attributes: ['name'] }],
        attributes: ['name', 'cost']
      });
      console.log(`\n💳 Subscription details:`);
      subscriptions.forEach(s => console.log(`  - ${s.Provider.name}: ${s.name} ($${s.cost})`));
    }
    
    if (providerCount > 0) {
      const providers = await Provider.findAll({ attributes: ['name', 'provider_type'] });
      console.log(`\n📋 Provider details:`);
      providers.forEach(p => console.log(`  - ${p.name} (${p.provider_type})`));
    }
    
    if (tierCount > 0) {
      const tiers = await AggregatorPricingTier.findAll({
        include: [{ model: Provider, as: 'aggregatorProvider', attributes: ['name'] }],
        attributes: ['tier_name']
      });
      console.log(`\n💰 Pricing tier details:`);
      tiers.forEach(t => console.log(`  - ${t.aggregatorProvider.name}: ${t.tier_name}`));
    }
    
  } catch (error) {
    console.error(`❌ Error checking database state: ${error.message}`);
  }
  
  console.log('=' .repeat(50));
};

const runDebugSetup = async () => {
  try {
    console.log('🐛 STARTING DEBUG SETUP');
    console.log('======================\n');
    
    // Initialize database
    console.log('🔒 Initializing database...');
    await db.initialize();
    
    await checkDatabaseState('DATABASE INITIALIZATION');
    
    // Step 0: Providers and subscriptions
    console.log('\n📦 STEP 0A: Running initializeProviders...');
    const { initializeProviders, initializeSubscriptions } = require('./init-provider-subscriptions');
    await initializeProviders();
    await checkDatabaseState('STEP 0A - PROVIDERS');
    
    console.log('\n💳 STEP 0B: Running initializeSubscriptions...');
    await initializeSubscriptions();
    await checkDatabaseState('STEP 0B - SUBSCRIPTIONS');
    
    // Step 1: Aggregator pricing tiers
    console.log('\n💰 STEP 1: Running populateAggregatorPricingTiers...');
    const { populateAggregatorPricingTiers } = require('./populate-aggregator-pricing-tiers');
    await populateAggregatorPricingTiers();
    await checkDatabaseState('STEP 1 - PRICING TIERS');
    
    // Step 2: Models
    console.log('\n🤖 STEP 2: Running initializeAllModels...');
    const { initializeAllModels } = require('./init-all-models-unified');
    await initializeAllModels();
    await checkDatabaseState('STEP 2 - MODELS');
    
    console.log('\n🎉 DEBUG SETUP COMPLETED!');
    
    await db.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Debug setup failed:', error);
    try {
      await db.close();
    } catch (closeError) {
      console.error('Error closing database:', closeError.message);
    }
    process.exit(1);
  }
};

if (require.main === module) {
  runDebugSetup();
}

module.exports = { runDebugSetup };