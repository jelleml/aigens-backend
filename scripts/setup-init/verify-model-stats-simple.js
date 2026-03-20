#!/usr/bin/env node

/**
 * Simple Verification Script for Model Statistics Update
 * 
 * This script checks that the database tables have been correctly updated
 * by the model statistics update script.
 */

const db = require('../../database');
const { sequelize } = db;

/**
 * Verify that the models_stats_aa table has been populated
 * @returns {Promise<boolean>} True if verification passes
 */
async function verifyModelStatsTable() {
  console.log('\n=== Verifying models_stats_aa table ===');
  
  try {
    const query = 'SELECT COUNT(*) as count FROM models_stats_aa';
    const result = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
    
    const count = result[0].count;
    console.log(`Found ${count} records in models_stats_aa table`);
    
    if (count === 0) {
      console.error('❌ Verification failed: No records found in models_stats_aa table');
      return false;
    }
    
    // Sample a few records to verify structure
    const sampleQuery = 'SELECT * FROM models_stats_aa LIMIT 3';
    const samples = await sequelize.query(sampleQuery, { type: sequelize.QueryTypes.SELECT });
    
    console.log('Sample records:');
    samples.forEach((sample, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log(`  ID: ${sample.id}`);
      console.log(`  Slug: ${sample.slug}`);
      console.log(`  Input Price: ${sample.price_1m_input_tokens}`);
      console.log(`  Output Price: ${sample.price_1m_output_tokens}`);
    });
    
    console.log('\n✅ models_stats_aa table verification passed');
    return true;
  } catch (error) {
    console.error('❌ Error verifying models_stats_aa table:', error.message);
    return false;
  }
}

/**
 * Verify that the models_models_stats_aa table has been populated
 * @returns {Promise<boolean>} True if verification passes
 */
async function verifyModelRelationshipsTable() {
  console.log('\n=== Verifying models_models_stats_aa table ===');
  
  try {
    const query = 'SELECT COUNT(*) as count FROM models_models_stats_aa';
    const result = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
    
    const count = result[0].count;
    console.log(`Found ${count} records in models_models_stats_aa table`);
    
    if (count === 0) {
      console.error('❌ Verification failed: No records found in models_models_stats_aa table');
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
    
    console.log('Sample relationships:');
    samples.forEach((sample, index) => {
      console.log(`\nRelationship ${index + 1}:`);
      console.log(`  ID: ${sample.id}`);
      console.log(`  Model ID: ${sample.id_model} (${sample.model_name}, ${sample.model_slug})`);
      console.log(`  Stats ID: ${sample.id_model_aa} (${sample.stats_slug})`);
      console.log(`  Type: ${sample.type}`);
    });
    
    console.log('\n✅ models_models_stats_aa table verification passed');
    return true;
  } catch (error) {
    console.error('❌ Error verifying models_models_stats_aa table:', error.message);
    return false;
  }
}

/**
 * Verify that the models_price_score table has been updated with AA scores
 * @returns {Promise<boolean>} True if verification passes
 */
async function verifyPriceScoresTable() {
  console.log('\n=== Verifying models_price_score table ===');
  
  try {
    const query = 'SELECT COUNT(*) as count FROM models_price_score WHERE score_overall IS NOT NULL';
    const result = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
    
    const count = result[0].count;
    console.log(`Found ${count} records with score_overall in models_price_score table`);
    
    if (count === 0) {
      console.error('❌ Verification failed: No records with score_overall found in models_price_score table');
      return false;
    }
    
    // Sample a few records to verify structure
    const sampleQuery = `
      SELECT mps.id_model, 
             mps.price_1m_input_tokens, 
             mps.price_1m_output_tokens,
             mps.score_cost_per_1k_tokens,
             mps.score_intelligence,
             mps.score_speed,
             mps.score_overall,
             mps.source,
             m.name as model_name, 
             m.model_slug
      FROM models_price_score mps
      JOIN models m ON mps.id_model = m.id
      WHERE mps.score_overall IS NOT NULL
      LIMIT 3
    `;
    const samples = await sequelize.query(sampleQuery, { type: sequelize.QueryTypes.SELECT });
    
    console.log('Sample price scores:');
    samples.forEach((sample, index) => {
      console.log(`\nPrice Score ${index + 1}:`);
      console.log(`  Model: ${sample.model_name} (${sample.model_slug})`);
      console.log(`  Input Price: ${sample.price_1m_input_tokens}`);
      console.log(`  Output Price: ${sample.price_1m_output_tokens}`);
      console.log(`  Cost Score: ${sample.score_cost_per_1k_tokens}`);
      console.log(`  Intelligence Score: ${sample.score_intelligence}`);
      console.log(`  Speed Score: ${sample.score_speed}`);
      console.log(`  Overall Score: ${sample.score_overall}`);
      console.log(`  Source: ${sample.source}`);
    });
    
    console.log('\n✅ models_price_score table verification passed');
    return true;
  } catch (error) {
    console.error('❌ Error verifying models_price_score table:', error.message);
    return false;
  }
}

/**
 * Main function to run the verification
 */
async function runVerification() {
  console.log('=== Starting Model Statistics Verification ===');
  console.log('Date:', new Date().toISOString());
  
  try {
    // Connect to database
    console.log('\nConnecting to database...');
    await sequelize.authenticate();
    console.log('Database connection established');
    
    // Verify the tables
    const statsVerified = await verifyModelStatsTable();
    const relationshipsVerified = await verifyModelRelationshipsTable();
    const priceScoresVerified = await verifyPriceScoresTable();
    
    // Overall verification result
    const allVerified = statsVerified && relationshipsVerified && priceScoresVerified;
    
    console.log('\n=== Verification Summary ===');
    console.log(`Models Stats Table: ${statsVerified ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Model Relationships Table: ${relationshipsVerified ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Price Scores Table: ${priceScoresVerified ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`\nOverall Verification: ${allVerified ? '✅ PASSED' : '❌ FAILED'}`);
    
    // Close database connection
    await sequelize.close();
    console.log('\nDatabase connection closed');
    
    // Exit with appropriate code
    process.exit(allVerified ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Verification failed with error:', error);
    
    // Try to close database connection
    try {
      await sequelize.close();
      console.log('Database connection closed');
    } catch (dbError) {
      console.error('Error closing database connection:', dbError);
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
    runVerification
  };
}