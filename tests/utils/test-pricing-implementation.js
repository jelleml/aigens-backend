#!/usr/bin/env node

/**
 * Test script to verify pricing data implementation
 */

const db = require('../../database');

async function testPricingImplementation() {
  try {
    console.log('🔍 Testing Pricing Data Implementation...\n');
    
    // Initialize database
    await db.initialize();
    console.log('✅ Database initialized');
    
    const { ModelPriceScore, Model, Provider } = db.models;
    
    // Find Ideogram provider
    const provider = await Provider.findOne({ where: { name: 'ideogram' } });
    if (!provider) {
      console.log('❌ Ideogram provider not found');
      return;
    }
    console.log(`✅ Found Ideogram provider (ID: ${provider.id})`);
    
    // Find Ideogram models
    const models = await Model.findAll({ 
      where: { id_provider: provider.id }
    });
    console.log(`✅ Found ${models.length} Ideogram models`);
    
    // Check pricing data for each model
    let modelsWithPricing = 0;
    let modelsWithoutPricing = 0;
    
    console.log('\n📊 Pricing Data Status:');
    console.log('========================');
    
    for (const model of models) {
      const priceScore = await ModelPriceScore.findOne({
        where: { 
          id_model: model.id,
          source: 'ideogram-manual'
        }
      });
      
      if (priceScore) {
        modelsWithPricing++;
        console.log(`✅ ${model.display_name} (${model.model_slug})`);
        console.log(`   Source: ${priceScore.source}`);
        console.log(`   Price Image: ${priceScore.price_image}`);
        console.log(`   Input Tokens: ${priceScore.price_1m_input_tokens}`);
        console.log(`   Output Tokens: ${priceScore.price_1m_output_tokens}`);
        
        // Try to parse JSON if it's a string
        if (typeof priceScore.price_image === 'string') {
          try {
            const pricingData = JSON.parse(priceScore.price_image);
            console.log('   Operations:');
            Object.entries(pricingData).forEach(([op, price]) => {
              console.log(`     - ${op}: $${price}`);
            });
          } catch (e) {
            console.log(`   ❌ JSON Parse Error: ${e.message}`);
          }
        } else {
          console.log(`   Price Image Type: ${typeof priceScore.price_image}`);
        }
        console.log('');
      } else {
        modelsWithoutPricing++;
        console.log(`❌ ${model.display_name} (${model.model_slug}) - No pricing data`);
      }
    }
    
    console.log('\n📈 Summary:');
    console.log('===========');
    console.log(`Total models: ${models.length}`);
    console.log(`Models with pricing: ${modelsWithPricing}`);
    console.log(`Models without pricing: ${modelsWithoutPricing}`);
    
    if (modelsWithPricing === models.length) {
      console.log('\n🎉 SUCCESS: All models have pricing data!');
    } else {
      console.log('\n⚠️  WARNING: Some models are missing pricing data');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    try {
      await db.close();
      console.log('\n✅ Database connection closed');
    } catch (closeError) {
      console.error('Error closing database:', closeError);
    }
  }
}

// Run the test
if (require.main === module) {
  testPricingImplementation()
    .then(() => {
      console.log('\n✅ Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testPricingImplementation };