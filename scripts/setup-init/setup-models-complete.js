#!/usr/bin/env node

/**
 * ⚠️  LEGACY SCRIPT - DEPRECATED ⚠️
 * 
 * This script uses hardcoded model lists and is no longer recommended.
 * 
 * 🔄 RECOMMENDED ALTERNATIVE:
 *   Use the modern Model Management System instead:
 *   npm run model-mgmt sync
 *   
 * Or use the new unified setup:
 *   npm run setup-models-modern
 * 
 * LEGACY FUNCTIONALITY:
 * This script performs the complete setup of the models system in the correct order:
 * 1. Initializes all models from all providers (HARDCODED LISTS - OUTDATED)
 * 2. populateAggregatorPricingTiers 
 * 3. Populates the capabilities table
 * 4. Creates model-capability relationships
 * 5. Populates model subscriptions
 * 6. Assign Capabilities 
 * 
 * ⚠️  WARNING: This script uses outdated hardcoded model lists
 * ⚠️  Use model-mgmt system for up-to-date models from APIs
 * 
 * Usage (LEGACY):
 *   node scripts/setup-init/setup-models-complete.js
 * 
 * Prerequisites:
 *   - Database must be running and accessible
 *   - All providers must be configured in the database
 *   - API keys must be configured for external providers (Together.ai, OpenRouter)
 */

const { initializeProviders, initializeSubscriptions } = require('./init-provider-subscriptions');
const { initializeAllModels } = require('./init-all-models-unified');
const { populateCapabilities } = require('./populate-capabilities');
const { populateModelsCapabilities } = require('./populate-models-capabilities');
const { populateAggregatorPricingTiers } = require('./populate-aggregator-pricing-tiers');
const { populateModelSubscriptions } = require('./populate-model-subscriptions');

/**
 * Ensure database transactions are committed and synced
 */
const ensureDbSync = async () => {
  try {
    const db = require('../../database');
    
    // Only perform sync if database is initialized
    if (!db.initialized) {
      console.log('  ⚠️  Database not initialized, skipping sync');
      return;
    }
    
    // More aggressive transaction commit approach
    try {
      // Force commit any pending transactions
      await db.sequelize.query('COMMIT', { raw: true });
    } catch (commitError) {
      // Ignore commit errors if no transaction is active
      console.log('  ℹ️  No active transaction to commit');
    }
    
    // Force a write/read cycle to ensure data persistence
    await db.sequelize.query('CREATE TABLE IF NOT EXISTS _sync_test (id INT)', { raw: true });
    await db.sequelize.query('DROP TABLE IF EXISTS _sync_test', { raw: true });
    
    // Force a simple query to ensure database state is consistent
    const result = await db.sequelize.query('SELECT 1 as sync_check', { type: db.sequelize.QueryTypes.SELECT });
    
    // Longer delay to ensure database consistency across all connections
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('  🔄 Database sync completed');
  } catch (error) {
    console.warn('  ⚠️  Warning: Database sync check failed:', error.message);
    // Still continue even if sync fails
  }
};

/**
 * Main setup function
 */
const setupModelsComplete = async () => {
  console.log('🚀 STARTING COMPLETE MODELS SETUP');
  console.log('=====================================\n');

  try {
    // Initialize database connection at the beginning
    console.log('🔒 Initializing database connection...');
    const db = require('../../database');
    await db.initialize();
    console.log('✅ Database connection established\n');

    // Step 0: Initialize providers and subscriptions
    console.log('📦 STEP 0: Initializing providers and subscriptions...');
    console.log('This will create providers and subscriptions from subscription in uploads/subscriptions.csv\n');
    
    await initializeProviders();
    await ensureDbSync();
    console.log('  ✅ Providers initialized');
    
    await initializeSubscriptions();
    await ensureDbSync();
    console.log('✅ Step 0 completed: Providers and subscriptions initialized\n');

    // Step 1: Populate aggregator pricing tiers (MUST be before model initialization)
    console.log('💰 STEP 1: Populating aggregator pricing tiers...');
    console.log('This will create pricing tiers for aggregator providers (required for model relationships)\n');
    
    await populateAggregatorPricingTiers();
    await ensureDbSync();
    console.log('✅ Step 1 completed: Aggregator pricing tiers populated\n');

    // Step 2: Initialize all models
    console.log('📦 STEP 2: Initializing all models from providers...');
    console.log('This will create/update models from OpenAI, Anthropic, DeepSeek, Ideogram, Together.ai, and OpenRouter\n');
    
    await initializeAllModels();
    await ensureDbSync();
    console.log('✅ Step 2 completed: Models initialized\n');

    // Step 3: Populate capabilities table
    console.log('🎯 STEP 3: Populating capabilities table...');
    console.log('This will create/update the 41 standard model capabilities\n');
    
    await populateCapabilities();
    await ensureDbSync();
    console.log('✅ Step 3 completed: Capabilities populated\n');

    // Step 4: Create model-capability relationships
    console.log('🔗 STEP 4: Creating model-capability relationships...');
    console.log('This will link each model to its appropriate capabilities\n');
    
    await populateModelsCapabilities();
    await ensureDbSync();
    console.log('✅ Step 4 completed: Model-capability relationships created\n');

    // Step 5: Populate model subscriptions
    console.log('📝 STEP 5: Populating model subscriptions...');
    console.log('This will link models to their provider subscriptions\n');
    
    await populateModelSubscriptions();
    await ensureDbSync();
    console.log('✅ Step 5 completed: Model subscriptions populated\n');

  
    console.log('🎉 COMPLETE MODELS SETUP FINISHED SUCCESSFULLY!');
    console.log('===============================================');
    console.log('Your models system is now ready to use with:');
    console.log('• All models from all providers');
    console.log('• Aggregator pricing tiers configured');
    console.log('• Normalized capabilities structure');
    console.log('• Model-capability relationships');
    console.log('• Model subscriptions linked');
    console.log('• Updated API endpoints ready for frontend');
    
    // Close database connection
    await db.close();
    console.log('\n🔒 Database connection closed.');
    
    process.exit(0);

  } catch (error) {
    console.error('❌ ERROR DURING COMPLETE SETUP:', error);
    console.log('\n💡 TROUBLESHOOTING:');
    console.log('1. Ensure database is running and accessible');
    console.log('2. Check that all providers exist in the database');
    console.log('3. Verify API keys are configured for external providers');
    console.log('4. Run individual scripts to isolate the issue:');
    console.log('   - node scripts/setup-init/init-all-models-unified.js');
    console.log('   - node scripts/setup-init/populate-capabilities.js');
    console.log('   - node scripts/setup-init/populate-models-capabilities.js');
    console.log('   - node scripts/setup-init/populate-aggregator-pricing-tiers.js');
    console.log('   - node scripts/setup-init/populate-model-subscriptions.js');
    
    // Close database connection on error
    try {
      const db = require('../../database');
      await db.close();
    } catch (closeError) {
      console.error('Error closing database:', closeError.message);
    }
    
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  setupModelsComplete();
}

module.exports = { setupModelsComplete };