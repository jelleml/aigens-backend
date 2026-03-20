#!/usr/bin/env node

/**
 * Manual Testing and Verification Script for Model Statistics Update
 * 
 * This script runs the model statistics update script and verifies that
 * the tables are correctly updated with the expected data.
 * 
 * Usage:
 *   node scripts/verify-model-stats.js
 */

const { updateModelStats } = require('./update-model-stats-aa-and-relations');
const db = require('../database');
const { sequelize } = db;
const { getLogger } = require('../services/logging');
const logger = getLogger('verify-model-stats', 'script');

/**
 * Verify that the models_stats_aa table has been populated
 * @returns {Promise<boolean>} True if verification passes
 */
async function verifyModelStatsTable() {
  logger.info('\n=== Verifying models_stats_aa table ===');
  
  try {
    const query = 'SELECT COUNT(*) as count FROM models_stats_aa';
    const result = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
    
    const count = result[0].count;
    logger.info(`Found ${count} records in models_stats_aa table`);
    
    if (count === 0) {
      logger.error('❌ Verification failed: No records found in models_stats_aa table');
      return false;
    }
    
    // Sample a few records to verify structure
    const sampleQuery = 'SELECT * FROM models_stats_aa LIMIT 3';
    const samples = await sequelize.query(sampleQuery, { type: sequelize.QueryTypes.SELECT });
    
    logger.info('Sample records:');
    samples.forEach((sample, index) => {
      logger.info(`\nRecord ${index + 1}:`);
      logger.info(`  ID: ${sample.id}`);
      logger.info(`  Slug: ${sample.slug}`);
      logger.info(`  Input Price: ${sample.price_1m_input_tokens}`);
      logger.info(`  Output Price: ${sample.price_1m_output_tokens}`);
    });
    
    logger.info('\n✅ models_stats_aa table verification passed');
    return true;
  } catch (error) {
    logger.error('❌ Error verifying models_stats_aa table:', error.message);
    return false;
  }
}

/**
 * Verify that the models_models_stats_aa table has been populated
 * @returns {Promise<boolean>} True if verification passes
 */
async function verifyModelRelationshipsTable() {
  logger.info('\n=== Verifying models_models_stats_aa table ===');
  
  try {
    const query = 'SELECT COUNT(*) as count FROM models_models_stats_aa';
    const result = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
    
    const count = result[0].count;
    logger.info(`Found ${count} records in models_models_stats_aa table`);
    
    if (count === 0) {
      logger.error('❌ Verification failed: No records found in models_models_stats_aa table');
      return false;
    }
    
    // Sample a few records to verify structure and join with related tables
    const sampleQuery = `
      SELECT mmsa.id, mmsa.id_model, mmsa.id_model_aa, mmsa.type,
             m.name as model_name, m.model_slug,
             msa.slug as stats_slug
      FROM models_models_stats_aa mmsa
      JOIN models m ON mmsa.id_model = m.id
      JOIN models_stats_aa msa ON mmsa.id_model_aa = msa.id
      LIMIT 3
    `;
    const samples = await sequelize.query(sampleQuery, { type: sequelize.QueryTypes.SELECT });
    
    logger.info('Sample relationships:');
    samples.forEach((sample, index) => {
      logger.info(`\nRelationship ${index + 1}:`);
      logger.info(`  ID: ${sample.id}`);
      logger.info(`  Model ID: ${sample.id_model} (${sample.model_name}, ${sample.model_slug})`);
      logger.info(`  Stats ID: ${sample.id_model_aa} (${sample.stats_slug})`);
      logger.info(`  Type: ${sample.type}`);
    });
    
    logger.info('\n✅ models_models_stats_aa table verification passed');
    return true;
  } catch (error) {
    logger.error('❌ Error verifying models_models_stats_aa table:', error.message);
    return false;
  }
}

/**
 * Verify that the models_price_score table has been updated with AA scores
 * @returns {Promise<boolean>} True if verification passes
 */
async function verifyPriceScoresTable() {
  logger.info('\n=== Verifying models_price_score table ===');
  
  try {
    const query = 'SELECT COUNT(*) as count FROM models_price_score WHERE aa_score IS NOT NULL';
    const result = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
    
    const count = result[0].count;
    logger.info(`Found ${count} records with aa_score in models_price_score table`);
    
    if (count === 0) {
      logger.error('❌ Verification failed: No records with aa_score found in models_price_score table');
      return false;
    }
    
    // Sample a few records to verify structure
    const sampleQuery = `
      SELECT mps.id, mps.id_model, mps.aa_score, mps.final_score,
             m.name as model_name, m.model_slug
      FROM models_price_score mps
      JOIN models m ON mps.id_model = m.id
      WHERE mps.aa_score IS NOT NULL
      LIMIT 3
    `;
    const samples = await sequelize.query(sampleQuery, { type: sequelize.QueryTypes.SELECT });
    
    logger.info('Sample price scores:');
    samples.forEach((sample, index) => {
      logger.info(`\nPrice Score ${index + 1}:`);
      logger.info(`  ID: ${sample.id}`);
      logger.info(`  Model: ${sample.model_name} (${sample.model_slug})`);
      logger.info(`  AA Score: ${sample.aa_score}`);
      logger.info(`  Final Score: ${sample.final_score}`);
    });
    
    logger.info('\n✅ models_price_score table verification passed');
    return true;
  } catch (error) {
    logger.error('❌ Error verifying models_price_score table:', error.message);
    return false;
  }
}

/**
 * Verify that the cost calculator service can use the updated data
 * @returns {Promise<boolean>} True if verification passes
 */
async function verifyCostCalculatorIntegration() {
  logger.info('\n=== Verifying cost calculator integration ===');
  
  try {
    const CostCalculator = require('../services/cost-calculator.service');
    const calculator = new CostCalculator();
    
    // Get a model from the database to test with
    const { Model } = db.sequelize.models;
    const model = await Model.findOne({
      where: {
        active: true
      },
      attributes: ['id', 'api_model_id', 'model_slug']
    });
    
    if (!model) {
      logger.error('❌ No active model found for testing cost calculator');
      return false;
    }
    
    logger.info(`Testing cost calculation with model: ${model.model_slug} (ID: ${model.id})`);
    
    // Calculate cost for a sample message
    const costParams = {
      provider: 'anthropic', // Assuming this is a valid provider
      modelId: model.id,
      apiModelId: model.api_model_id || model.model_slug,
      inputTokens: 100,
      outputTokens: 200
    };
    
    const costResult = await calculator.calculateCost(costParams);
    
    logger.info('Cost calculation result:');
    logger.info(`  Input tokens: ${costResult.input_tokens}`);
    logger.info(`  Output tokens: ${costResult.output_tokens}`);
    logger.info(`  Input price (per 1M): $${costResult.price_1m_input_tokens}`);
    logger.info(`  Output price (per 1M): $${costResult.price_1m_output_tokens}`);
    logger.info(`  Base cost: $${costResult.base_cost}`);
    logger.info(`  Total cost: $${costResult.total_cost}`);
    
    // Verify that prices are non-zero
    if (costResult.price_1m_input_tokens <= 0 || costResult.price_1m_output_tokens <= 0) {
      logger.error('❌ Verification failed: Zero or negative pricing found');
      return false;
    }
    
    logger.info('\n✅ Cost calculator integration verification passed');
    return true;
  } catch (error) {
    logger.error('❌ Error verifying cost calculator integration:', error.message);
    return false;
  }
}

/**
 * Main function to run the verification
 */
async function runVerification() {
  logger.info('=== Starting Model Statistics Update Verification ===');
  logger.info('Date:', new Date().toISOString());
  
  try {
    // Connect to database
    logger.info('\nConnecting to database...');
    await db.sequelize.authenticate();
    logger.info('Database connection established');
    
    // Run the update script with a modified version that doesn't close the connection
    logger.info('\nRunning model statistics update script...');
    
    // Create a modified version of the update function that doesn't close the connection
    const { updateModelStats: originalUpdateModelStats } = require('./update-model-stats-aa-and-relations');
    
    // Wrap the original function to prevent it from closing the database connection
    const runUpdateWithoutClosing = async () => {
      try {
        // Override the closeDatabaseConnection function temporarily
        const originalModule = require('./update-model-stats-aa-and-relations');
        const originalCloseFunction = originalModule.closeDatabaseConnection;
        originalModule.closeDatabaseConnection = async () => {
          logger.info('Skipping database close to keep connection open for verification');
        };
        
        // Run the update
        const result = await originalUpdateModelStats();
        
        // Restore the original function
        originalModule.closeDatabaseConnection = originalCloseFunction;
        
        return result;
      } catch (error) {
        logger.error('Error running update script:', error);
        throw error;
      }
    };
    
    const updateResults = await runUpdateWithoutClosing();
    logger.info('Update script completed with results:', 
      `${updateResults.summary.successfulOperations}/${updateResults.summary.totalOperations} operations successful`);
    
    // Verify the tables
    const statsVerified = await verifyModelStatsTable();
    const relationshipsVerified = await verifyModelRelationshipsTable();
    const priceScoresVerified = await verifyPriceScoresTable();
    const costCalculatorVerified = await verifyCostCalculatorIntegration();
    
    // Overall verification result
    const allVerified = statsVerified && relationshipsVerified && priceScoresVerified && costCalculatorVerified;
    
    logger.info('\n=== Verification Summary ===');
    logger.info(`Models Stats Table: ${statsVerified ? '✅ PASS' : '❌ FAIL'}`);
    logger.info(`Model Relationships Table: ${relationshipsVerified ? '✅ PASS' : '❌ FAIL'}`);
    logger.info(`Price Scores Table: ${priceScoresVerified ? '✅ PASS' : '❌ FAIL'}`);
    logger.info(`Cost Calculator Integration: ${costCalculatorVerified ? '✅ PASS' : '❌ FAIL'}`);
    logger.info(`\nOverall Verification: ${allVerified ? '✅ PASSED' : '❌ FAILED'}`);
    
    // Close database connection
    await db.sequelize.close();
    logger.info('\nDatabase connection closed');
    
    // Exit with appropriate code
    process.exit(allVerified ? 0 : 1);
  } catch (error) {
    logger.error('\n❌ Verification failed with error:', error);
    
    // Try to close database connection
    try {
      await db.sequelize.close();
      logger.info('Database connection closed');
    } catch (dbError) {
      logger.error('Error closing database connection:', dbError);
    }
    
    process.exit(1);
  }
}

// Run the verification if this script is executed directly
if (require.main === module) {
  runVerification();
} else {
  // Export for use as a module
  module.exports = {
    verifyModelStatsTable,
    verifyModelRelationshipsTable,
    verifyPriceScoresTable,
    verifyCostCalculatorIntegration,
    runVerification
  };
}