#!/usr/bin/env node

/**
 * Ideogram Diagnostic Script
 * 
 * This script checks the current state of Ideogram models in the system:
 * - Verifies Ideogram provider exists
 * - Lists all Ideogram models in database
 * - Checks pricing data in models_price_score table
 * - Tests API key configuration
 */

const db = require('../../database');
const config = require('../../config/config');
const axios = require('axios');

async function diagnosticIdeogram() {
  console.log('🔍 Starting Ideogram diagnostic...\n');
  
  try {
    // Initialize database connection
    if (!db.initialized) {
      console.log('Initializing database connection...');
      await db.initialize();
    }
    console.log('✅ Database connection established\n');
    
    const { Model, Provider, ModelPriceScore } = db.models;
    
    // 1. Check Ideogram provider
    console.log('1. Checking Ideogram provider...');
    const ideogramProvider = await Provider.findOne({
      where: { name: 'ideogram' }
    });
    
    if (!ideogramProvider) {
      console.log('❌ Ideogram provider NOT found in database');
      return;
    }
    
    console.log(`✅ Ideogram provider found (ID: ${ideogramProvider.id})`);
    console.log(`   - Name: ${ideogramProvider.name}`);
    console.log(`   - Type: ${ideogramProvider.type || 'N/A'}`);
    console.log(`   - Active: ${ideogramProvider.is_active || 'N/A'}\n`);
    
    // 2. Check Ideogram models
    console.log('2. Checking Ideogram models in database...');
    const ideogramModels = await Model.findAll({
      where: { id_provider: ideogramProvider.id },
      order: [['model_slug', 'ASC']]
    });
    
    console.log(`Found ${ideogramModels.length} Ideogram models:`);
    if (ideogramModels.length === 0) {
      console.log('❌ No Ideogram models found in database');
    } else {
      ideogramModels.forEach((model, index) => {
        console.log(`   ${index + 1}. ${model.model_slug} (ID: ${model.id})`);
        console.log(`      - API Model ID: ${model.api_model_id}`);
        console.log(`      - Name: ${model.name}`);
        console.log(`      - Active: ${model.is_active}`);
        console.log(`      - Max Tokens: ${model.max_tokens}`);
      });
    }
    console.log();
    
    // 3. Check pricing data
    console.log('3. Checking pricing data...');
    let totalWithPricing = 0;
    let totalPricingRecords = 0;
    
    for (const model of ideogramModels) {
      const priceScores = await ModelPriceScore.findAll({
        where: { id_model: model.id }
      });
      
      totalPricingRecords += priceScores.length;
      
      if (priceScores.length > 0) {
        totalWithPricing++;
        console.log(`   ✅ Model ${model.model_slug}:`);
        priceScores.forEach(score => {
          console.log(`      - Source: ${score.source}`);
          console.log(`      - Input tokens: $${score.price_1m_input_tokens}/1M`);
          console.log(`      - Output tokens: $${score.price_1m_output_tokens}/1M`);
          if (score.price_image) {
            try {
              const imagePrice = JSON.parse(score.price_image);
              console.log(`      - Image pricing: ${JSON.stringify(imagePrice)}`);
            } catch (e) {
              console.log(`      - Image pricing (raw): ${score.price_image}`);
            }
          } else {
            console.log(`      - Image pricing: NOT SET`);
          }
        });
      } else {
        console.log(`   ❌ Model ${model.model_slug}: NO pricing data`);
      }
    }
    
    console.log(`\nPricing Summary:`);
    console.log(`   - Models with pricing: ${totalWithPricing}/${ideogramModels.length}`);
    console.log(`   - Total pricing records: ${totalPricingRecords}\n`);
    
    // 4. Check API key configuration
    console.log('4. Checking API configuration...');
    if (config.ideogram && config.ideogram.apiKey) {
      console.log(`✅ Ideogram API key configured (${config.ideogram.apiKey.substring(0, 8)}...)`);
      
      // Test API connectivity
      console.log('   Testing API connectivity...');
      try {
        const testPayload = {
          image_request: {
            prompt: "test",
            aspect_ratio: "ASPECT_1_1", 
            count: 1,
            model: "V_2"
          }
        };
        
        const response = await axios.post('https://api.ideogram.ai/generate', testPayload, {
          headers: {
            'Api-Key': config.ideogram.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        console.log(`   ✅ API test successful (status: ${response.status})`);
      } catch (error) {
        if (error.response) {
          console.log(`   ⚠️  API test got response (status: ${error.response.status})`);
          if (error.response.status === 401 || error.response.status === 403) {
            console.log(`   ❌ API key authentication failed`);
          } else {
            console.log(`   ✅ API key valid (got non-auth error)`);
          }
        } else {
          console.log(`   ❌ API test failed: ${error.message}`);
        }
      }
    } else {
      console.log('❌ Ideogram API key NOT configured');
    }
    console.log();
    
    // 5. Summary and recommendations
    console.log('📋 DIAGNOSTIC SUMMARY:');
    console.log('========================');
    
    if (!ideogramProvider) {
      console.log('❌ CRITICAL: Ideogram provider missing from database');
      console.log('   → Run provider setup/sync first');
    } else if (ideogramModels.length === 0) {
      console.log('❌ CRITICAL: No Ideogram models in database');
      console.log('   → Run model sync via sync engine');
    } else if (totalWithPricing === 0) {
      console.log('❌ CRITICAL: No pricing data for Ideogram models');
      console.log('   → Run update-ideogram-models.js script');
    } else if (totalWithPricing < ideogramModels.length) {
      console.log('⚠️  WARNING: Some models missing pricing data');
      console.log('   → Run update-ideogram-models.js script');
    } else {
      console.log('✅ Database setup appears complete');
      console.log('   → Test image generation flow');
    }
    
    if (!config.ideogram?.apiKey) {
      console.log('❌ CRITICAL: API key not configured');
      console.log('   → Set IDEOGRAM_API_KEY environment variable');
    }
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
    process.exit(1);
  } finally {
    try {
      await db.close();
      console.log('\n✅ Database connection closed');
    } catch (closeError) {
      console.error('Error closing database connection:', closeError);
    }
  }
}

// Run if called directly
if (require.main === module) {
  diagnosticIdeogram()
    .then(() => {
      console.log('\n🏁 Diagnostic completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Diagnostic execution failed:', error);
      process.exit(1);
    });
}

module.exports = { diagnosticIdeogram };