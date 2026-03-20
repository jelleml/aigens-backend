#!/usr/bin/env node

/**
 * CLEAN MODERN MODELS SETUP SCRIPT
 * 
 * This script provides a clean slate approach:
 * 1. Truncates old models and related data
 * 2. Runs the modern setup with API-fetched models
 * 
 * This ensures you ONLY have current models from APIs, no old hardcoded ones.
 * 
 * Usage:
 *   node scripts/setup-init/setup-models-clean.js
 *   OR
 *   npm run setup-models-clean
 * 
 * Prerequisites:
 *   - Database must be running and accessible
 *   - API keys must be configured for external providers
 */

const { truncateAllTables } = require('./truncate-models-and-providers');
const { setupModelsModern } = require('./setup-models-modern');

/**
 * Clean setup function
 */
const setupModelsClean = async () => {
  console.log('🧹 STARTING CLEAN MODELS SETUP');
  console.log('This will remove ALL existing models and set up fresh ones from APIs');
  console.log('================================================================\n');

  try {
    // Step 1: Clean up existing data
    console.log('🗑️  STEP 1: Cleaning up existing models and providers...');
    console.log('This will remove all old hardcoded models and start fresh\n');
    
    await truncateAllTables();
    console.log('✅ Step 1 completed: Old data cleaned up\n');

    // Step 2: Run modern setup
    console.log('🚀 STEP 2: Setting up models with API-fetched data...');
    console.log('This will create fresh models from provider APIs\n');
    
    await setupModelsModern();
    console.log('✅ Step 2 completed: Modern setup finished\n');

    console.log('🎉 CLEAN MODELS SETUP COMPLETED SUCCESSFULLY!');
    console.log('============================================');
    console.log('Your database now contains ONLY current models from APIs:');
    console.log('• ✅ No old hardcoded models');
    console.log('• ✅ Live models from provider APIs');
    console.log('• ✅ Up-to-date model information');
    console.log('• ✅ Clean, consistent data structure');
    
    process.exit(0);

  } catch (error) {
    console.error('❌ ERROR DURING CLEAN SETUP:', error);
    console.log('\n💡 TROUBLESHOOTING:');
    console.log('1. Ensure database is running and accessible');
    console.log('2. Check that API keys are configured for all providers');
    console.log('3. Verify database permissions allow truncation');
    console.log('4. Try running individual steps:');
    console.log('   - npm run truncate-models');
    console.log('   - npm run setup-models-modern');
    
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  setupModelsClean();
}

module.exports = { setupModelsClean };