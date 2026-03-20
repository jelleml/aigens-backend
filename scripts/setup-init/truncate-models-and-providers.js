#!/usr/bin/env node

/**
 * TRUNCATE MODELS AND PROVIDERS SCRIPT
 * 
 * ⚠️  DANGER: This script will DELETE ALL DATA from the following tables:
 * - models
 * - aggregated_models  
 * - aggregator_pricing_tiers
 * - models_models_capabilities
 * - models_stats_aa
 * - models_models_stats_aa
 * - providers
 * - provider_subscriptions
 * - models_subscriptions
 * - models_price_history
 * - models_price_score
 * 
 * This script is useful for:
 * - Resetting the models system from scratch
 * - Testing the complete setup process
 * - Cleaning up corrupted data
 * 
 * Usage:
 *   node scripts/truncate-models-and-providers.js
 * 
 * IMPORTANT: This action is IRREVERSIBLE. Make sure you have a backup!
 */

const readline = require('readline');
const db = require('../../database');

// Configure readline for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Ask user for confirmation
 */
const askConfirmation = (question, preserveCase = false) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      // Clean the answer more thoroughly
      const cleaned = answer.replace(/\r?\n/g, '').trim();
      resolve(preserveCase ? cleaned : cleaned.toLowerCase());
    });
  });
};

/**
 * Display warning and table information
 */
const displayWarning = () => {
  console.log('\n🚨 DANGER ZONE - DATA DELETION WARNING 🚨');
  console.log('===========================================\n');
  
  console.log('This script will PERMANENTLY DELETE ALL DATA from the following tables:');
  console.log('');
  console.log('📊 Model Tables:');
  console.log('  • models                    - All AI models');
  console.log('  • aggregated_models         - Model aggregation relationships');
  console.log('  • models_models_capabilities - Model-capability links');
  console.log('  • models_price_history      - Historical pricing data');
  console.log('  • models_price_score        - Model scoring data');
  console.log('  • models_price_score        - Model Subscriptions data');
  console.log('');
  console.log('🏢 Provider Tables:');
  console.log('  • providers                 - All AI providers');
  console.log('  • provider_subscriptions    - Provider subscription data');
  console.log('  • aggregator_pricing_tiers  - Aggregator pricing configurations');
  console.log('');
  console.log('📈 Statistics Tables:');
  console.log('  • models_stats_aa           - Artificial Analysis statistics');
  console.log('  • models_models_stats_aa    - Model-statistics relationships');
  console.log('');
  console.log('⚠️  THIS ACTION IS IRREVERSIBLE!');
  console.log('⚠️  Make sure you have a backup before proceeding!');
  console.log('');
};

/**
 * Tables to truncate in dependency order (children first, then parents)
 */
const TABLES_TO_TRUNCATE = [
  // Junction/relationship tables first (they have foreign keys)
  'models_models_capabilities',
  'models_models_stats_aa',
  'aggregated_models',
  'models_price_history',
  'models_price_score',
  'models_subscriptions',
  
  // Parent tables second
  'models',
  'aggregator_pricing_tiers',
  'provider_subscriptions',
  'models_stats_aa',
  'providers'
];

/**
 * Truncate a single table
 */
const truncateTable = async (tableName) => {
  try {
    console.log(`  🗑️  Truncating table: ${tableName}`);
    
    // Use raw query for better control and to handle foreign key constraints
    await db.sequelize.query(`SET FOREIGN_KEY_CHECKS = 0;`);
    await db.sequelize.query(`TRUNCATE TABLE \`${tableName}\`;`);
    await db.sequelize.query(`SET FOREIGN_KEY_CHECKS = 1;`);
    
    console.log(`  ✅ Successfully truncated: ${tableName}`);
    return true;
  } catch (error) {
    if (error.original && error.original.code === 'ER_NO_SUCH_TABLE') {
      console.log(`  ⚠️  Table does not exist: ${tableName} (skipping)`);
      return true;
    } else {
      console.error(`  ❌ Error truncating ${tableName}:`, error.message);
      return false;
    }
  }
};

/**
 * Truncate all tables
 */
const truncateAllTables = async () => {
  console.log('\n🔄 Starting truncation process...\n');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const tableName of TABLES_TO_TRUNCATE) {
    const success = await truncateTable(tableName);
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }
    
    // Small delay between operations
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n📊 Truncation Summary:');
  console.log(`  ✅ Successfully truncated: ${successCount} tables`);
  console.log(`  ❌ Errors encountered: ${errorCount} tables`);
  
  if (errorCount === 0) {
    console.log('\n🎉 All model and provider data has been successfully deleted!');
    console.log('\n📝 Next steps:');
    console.log('  1. Run: node scripts/init-provider-subscription-pricing-tier.js');
    console.log('  2. Run: node scripts/setup-models-complete.js');
    console.log('  3. Or run: npm run setup-models');
  } else {
    console.log('\n⚠️  Some errors occurred during truncation.');
    console.log('Please check the error messages above and resolve any issues.');
  }
};

/**
 * Main function
 */
const main = async () => {
  try {
    // Display warning
    displayWarning();
    
    // First confirmation
    const firstConfirm = await askConfirmation(
      '❓ Are you sure you want to delete ALL data from the models and providers tables? (yes/no): '
    );
    
    if (firstConfirm !== 'yes') {
      console.log('\n✅ Operation cancelled. No data was deleted.');
      rl.close();
      process.exit(0);
    }
    
    // Second confirmation with more specific warning
    console.log('\n⚠️  FINAL WARNING: This will delete:');
    console.log('   • All AI models and their relationships');
    console.log('   • All provider information and subscriptions');
    console.log('   • All pricing and statistics data');
    console.log('   • All capability mappings');
    console.log('');
    
    const finalConfirm = await askConfirmation(
      '❓ Type "DELETE ALL DATA" to confirm (case sensitive): ',
      true // preserve case
    );
    
    if (finalConfirm !== 'DELETE ALL DATA') {
      console.log('\n✅ Operation cancelled. Confirmation text did not match exactly.');
      rl.close();
      process.exit(0);
    }
    
    console.log('\n🔒 Initializing database connection...');
    
    // Initialize database
    await db.initialize();
    console.log('✅ Database connection established.');
    
    // Perform truncation
    await truncateAllTables();
    
    // Close database connection
    await db.close();
    console.log('\n🔒 Database connection closed.');
    
    rl.close();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Fatal error during truncation:', error.message);
    console.error('Stack trace:', error.stack);
    
    try {
      await db.close();
    } catch (closeError) {
      console.error('Error closing database:', closeError.message);
    }
    
    rl.close();
    process.exit(1);
  }
};

// Handle process interruption
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Operation interrupted by user.');
  console.log('✅ No data was deleted.');
  rl.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Process terminated.');
  console.log('✅ No data was deleted.');
  rl.close();
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { truncateAllTables };