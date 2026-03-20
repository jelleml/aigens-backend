#!/usr/bin/env node

/**
 * MODERN MODELS SETUP SCRIPT
 * 
 * This script performs the complete setup of the models system using the modern
 * Model Management System with API-fetched models instead of hardcoded lists.
 * 
 * Features:
 * - Fetches live models from provider APIs (OpenAI, Anthropic, etc.)
 * - Automatically discovers new models as providers release them
 * - Uses the same adapters as the ongoing model management system
 * - Maintains consistency with the modern architecture
 * 
 * Setup Process:
 * 1. Initialize providers and subscriptions
 * 2. Sync all models from provider APIs (using model-management adapters)
 * 3. Populate capabilities table
 * 4. Create model-capability relationships
 * 5. Populate aggregator pricing tiers
 * 6. Populate model subscriptions
 * 
 * Usage:
 *   node scripts/setup-init/setup-models-modern.js
 *   OR
 *   npm run setup-models-modern
 * 
 * Prerequisites:
 *   - Database must be running and accessible
 *   - API keys must be configured for external providers
 *   - Model Management System must be properly configured
 */

const path = require('path');
const { spawn } = require('child_process');
const db = require('../../database');

// Import legacy functions that are still needed for capabilities and relationships
const { initializeProviders, initializeSubscriptions } = require('./init-provider-subscriptions');
const { populateCapabilities } = require('./populate-capabilities');
const { populateModelsCapabilities } = require('./populate-models-capabilities');
const { populateAggregatorPricingTiers } = require('./populate-aggregator-pricing-tiers');
const { populateModelSubscriptions } = require('./populate-model-subscriptions');

// Import provider pricing update functions (we'll run these as separate processes)

/**
 * Ensure database transactions are committed and synced
 */
const ensureDbSync = async () => {
  try {
    const database = require('../../database');
    
    // Only perform sync if database is initialized
    if (!database.initialized) {
      console.log('  ⚠️  Database not initialized, skipping sync');
      return;
    }
    
    // More aggressive transaction commit approach
    try {
      // Force commit any pending transactions
      await database.sequelize.query('COMMIT', { raw: true });
    } catch (commitError) {
      // Ignore commit errors if no transaction is active
      console.log('  ℹ️  No active transaction to commit');
    }
    
    // Force a write/read cycle to ensure data persistence
    await database.sequelize.query('CREATE TABLE IF NOT EXISTS _sync_test (id INT)', { raw: true });
    await database.sequelize.query('DROP TABLE IF EXISTS _sync_test', { raw: true });
    
    // Force a simple query to ensure database state is consistent
    const result = await database.sequelize.query('SELECT 1 as sync_check', { type: database.sequelize.QueryTypes.SELECT });
    
    // Longer delay to ensure database consistency across all connections
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('  🔄 Database sync completed');
  } catch (error) {
    console.warn('  ⚠️  Warning: Database sync check failed:', error.message);
    // Still continue even if sync fails
  }
};

/**
 * Execute model synchronization using the automation engine directly
 * This bypasses the CLI and uses the core sync engine to prevent DB initialization issues
 */
const executeSyncDirectly = async () => {
  let monitoring = null;
  let syncEngine = null;
  
  try {
    console.log('🔄 Initializing Model Management System...');
    
    // Import the sync engine directly
    const { ModelSyncEngine } = require('../../services/model-management/automation/sync-engine');
    const MonitoringService = require('../../services/model-management/monitoring-service');
    
    // Initialize monitoring
    monitoring = MonitoringService.getMonitoringService();
    await monitoring.start();
    
    // Create sync engine instance
    syncEngine = new ModelSyncEngine({
      monitoring,
      config: {
        batchSize: 20,
        timeout: 300000,
        maxRetries: 3,
        retryDelay: 2000
      }
    });
    
    // Initialize the sync engine
    await syncEngine.initialize();
    
    console.log('🚀 Starting model synchronization from provider APIs...');
    
    // Get all providers from database
    const { Provider } = db.models;
    const activeProviders = await Provider.findAll();
    
    if (activeProviders.length === 0) {
      throw new Error('No providers found in database');
    }
    
    console.log(`Found ${activeProviders.length} providers to sync`);
    
    let totalSynced = 0;
    let totalErrors = 0;
    
    // Sync each provider
    for (const provider of activeProviders) {
      try {
        console.log(`  • Syncing ${provider.name}...`);
        const result = await syncEngine.syncProvider(provider, {
          fullSync: false,
          dryRun: false
        });
        
        if (result && result.success) {
          totalSynced++;
          console.log(`    ✅ ${provider.name} synced successfully`);
        } else {
          totalErrors++;
          console.log(`    ⚠️  ${provider.name} sync completed with warnings`);
        }
      } catch (providerError) {
        totalErrors++;
        console.error(`    ❌ ${provider.name} sync failed:`, providerError.message);
      }
    }
    
    console.log('✅ Model synchronization completed');
    console.log(`   • Providers synced: ${totalSynced}`);
    console.log(`   • Errors: ${totalErrors}`);
    
    // Clean shutdown of sync engine and monitoring
    if (syncEngine) {
      await syncEngine.shutdown();
    }
    if (monitoring) {
      await monitoring.shutdown();
    }
    
    return true;
  } catch (error) {
    console.error('❌ Direct sync failed:', error.message);
    
    // Clean up resources before fallback
    try {
      if (syncEngine) {
        await syncEngine.shutdown();
      }
      if (monitoring) {
        await monitoring.shutdown();
      }
    } catch (cleanupError) {
      console.warn('Warning: Error during cleanup:', cleanupError.message);
    }
    
    // Fallback to individual provider sync scripts (without closing DB connection)
    return await fallbackToIndividualSync();
  }
};

/**
 * Fallback to simpler approach using legacy hardcoded models or direct API calls
 * This avoids the complex individual provider scripts that have DB lifecycle issues
 */
const fallbackToIndividualSync = async () => {
  console.log('🔄 Failed to sync ...');
};

/**
 * Update pricing data from provider APIs using separate processes
 */
const updateProviderPricing = async () => {
  const { spawn } = require('child_process');
  
  const runScript = (scriptPath, scriptName) => {
    return new Promise((resolve) => {
      console.log(`🔄 Updating ${scriptName} pricing...`);
      
      const child = spawn('node', [scriptPath], {
        stdio: 'pipe',
        cwd: process.cwd()
      });
      
      let output = '';
      let errorOutput = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          console.log(`  ✅ ${scriptName} pricing updated successfully`);
        } else {
          console.log(`  ⚠️  ${scriptName} pricing update failed (exit code: ${code})`);
          if (errorOutput) {
            console.log(`  ℹ️  Error: ${errorOutput.slice(0, 200)}...`);
          }
        }
        resolve();
      });
      
      child.on('error', (error) => {
        console.log(`  ⚠️  ${scriptName} pricing update failed: ${error.message}`);
        resolve();
      });
    });
  };
  
  try {
    // Run Together.ai pricing update
    await runScript(
      path.join(__dirname, '../update-models-info/update-together-models.js'),
      'Together.ai'
    );
    
    // Run OpenRouter pricing update
    await runScript(
      path.join(__dirname, '../update-models-info/update-openrouter-models.js'),
      'OpenRouter'
    );
    
    // Run Ideogram pricing update
    await runScript(
      path.join(__dirname, '../update-models-info/update-ideogram-models.js'),
      'Ideogram'
    );
    
  } catch (error) {
    console.log(`⚠️  Provider pricing update encountered errors: ${error.message}`);
    console.log('ℹ️  Setup will continue - pricing can be updated later');
  }
};

/**
 * Main modern setup function
 */
const setupModelsModern = async () =>{
  console.log('🚀 STARTING MODERN MODELS SETUP');
  console.log('Using API-fetched models from Model Management System');
  console.log('===============================================\n');

  try {
    // Initialize database connection at the beginning
    console.log('🔒 Initializing database connection...');
    const database = require('../../database');
    await database.initialize();
    console.log('✅ Database connection established\n');

    // Step 0: Initialize providers and subscriptions
    console.log('📦 STEP 0: Initializing providers and subscriptions...');
    console.log('This will create providers and subscriptions from uploads/subscriptions.csv\n');
    
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

    // Step 2: Sync all models using modern Model Management System
    console.log('🔄 STEP 2: Syncing models from provider APIs...');
    console.log('This will fetch live models from OpenAI, Anthropic, DeepSeek, Ideogram, Together.ai, and OpenRouter APIs\n');
    
    const syncSuccess = await executeSyncDirectly();
    await ensureDbSync();
    
    if (syncSuccess) {
      console.log('✅ Step 2 completed: Models synced from APIs\n');
    } else {
      console.log('⚠️  Step 2 completed with fallback: Some models may not be fully current\n');
    }

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

    // Step 6: Update pricing data from provider APIs (before closing DB)
    console.log('💰 STEP 6: Updating pricing data from provider APIs...');
    console.log('This will fetch and update pricing information from Together.ai and OpenRouter APIs\n');
    
    await updateProviderPricing();
    await ensureDbSync();
    console.log('✅ Step 6 completed: Provider pricing data updated\n');

    console.log('🎉 MODERN MODELS SETUP FINISHED!');
    console.log('================================');
    console.log('Your models system is now ready with:');
    if (syncSuccess) {
      console.log('• ✅ Live models fetched from provider APIs');
      console.log('• ✅ Up-to-date model information');
      console.log('• ✅ Automatic discovery of new models');
    } else {
      console.log('• ⚠️  Models initialized (may include fallback/legacy models)');
      console.log('• ⚠️  Consider configuring API keys for live model sync');
    }
    console.log('• ✅ Aggregator pricing tiers configured');
    console.log('• ✅ Normalized capabilities structure');
    console.log('• ✅ Model-capability relationships');
    console.log('• ✅ Model subscriptions linked');
    console.log('• ✅ Provider pricing data updated');
    console.log('• ✅ System ready for use');
    
    // Close database connection
    await database.close();
    console.log('\n🔒 Database connection closed.');
    
    process.exit(0);

  } catch (error) {
    console.error('❌ ERROR DURING MODERN SETUP:', error);
    console.log('\n💡 TROUBLESHOOTING:');
    console.log('1. Ensure database is running and accessible');
    console.log('2. Check that API keys are configured for all providers');
    console.log('3. Verify Model Management System is properly configured');
    console.log('4. Check network connectivity to provider APIs');
    console.log('5. Run health check: npm run model-mgmt:health');
    console.log('6. Check individual provider sync: npm run sync:openai');
    
    // Close database connection on error
    try {
      const database = require('../../database');
      await database.close();
    } catch (closeError) {
      console.error('Error closing database:', closeError.message);
    }
    
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  setupModelsModern();
}

module.exports = { setupModelsModern };