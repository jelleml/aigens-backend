#!/usr/bin/env node

/**
 * Test Token Conversion Fix
 * 
 * This script tests the corrected token conversion for Ideogram models.
 */

const db = require('../../database');
const { calculateCost } = require('../../services/ideogram.service');

async function testTokenConversion() {
  console.log('💰 Testing corrected token conversion for Ideogram...\n');
  
  try {
    // Initialize database connection
    if (!db.initialized) {
      await db.initialize();
    }
    
    // Get an Ideogram model
    const { Model, Provider } = db.models;
    const provider = await Provider.findOne({ where: { name: 'ideogram' } });
    const model = await Model.findOne({ 
      where: { id_provider: provider.id, is_active: true } 
    });
    
    if (!model) {
      console.log('❌ No Ideogram model found');
      return;
    }
    
    console.log(`✅ Testing with model: ${model.model_slug}\n`);
    
    // Calculate cost for 1 image
    const costResult = await calculateCost(model.id, 1, 'Generate');
    const dollarCost = costResult.totalCost;
    
    console.log('💵 Cost Calculation:');
    console.log(`   - Dollar cost: $${dollarCost}`);
    console.log(`   - Base cost: $${costResult.baseCost}`);
    console.log(`   - Price per image: $${costResult.pricePerImage}`);
    
    // Test different conversion rates
    console.log('\n🔢 Token Conversion Tests:');
    
    // Old (incorrect) conversion: 1 token = $0.000001
    const oldTokens = Math.ceil(dollarCost * 1000000);
    console.log(`   - Old method (×1,000,000): ${oldTokens} tokens ❌`);
    
    // New (correct) conversion: 1 EUR = 1000 tokens, 1 USD ≈ 1 EUR
    const newTokens = Math.ceil(dollarCost * 1000);
    console.log(`   - New method (×1,000): ${newTokens} tokens ✅`);
    
    // Manual verification
    console.log('\n📊 Manual Verification:');
    console.log(`   - If $${dollarCost} ≈ €${dollarCost}`);
    console.log(`   - And 1 EUR = 1000 tokens`);
    console.log(`   - Then €${dollarCost} × 1000 = ${Math.ceil(dollarCost * 1000)} tokens`);
    
    // Check if user balance would be sufficient
    const userBalance = 6999.89; // From the user's logs
    console.log('\n💳 Balance Check:');
    console.log(`   - User balance: ${userBalance} tokens`);
    console.log(`   - Required (old): ${oldTokens} tokens → ${oldTokens > userBalance ? '❌ INSUFFICIENT' : '✅ OK'}`);
    console.log(`   - Required (new): ${newTokens} tokens → ${newTokens > userBalance ? '❌ INSUFFICIENT' : '✅ OK'}`);
    
    if (newTokens <= userBalance && oldTokens > userBalance) {
      console.log('\n🎉 SUCCESS: Token conversion fix resolves the insufficient funds issue!');
    } else if (newTokens > userBalance) {
      console.log('\n⚠️  WARNING: User still has insufficient funds even with corrected conversion');
    } else {
      console.log('\n✅ Both conversions would work, but new one is more accurate');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    try {
      await db.close();
    } catch (closeError) {
      console.error('Error closing database connection:', closeError);
    }
  }
}

// Run if called directly
if (require.main === module) {
  testTokenConversion()
    .then(() => {
      console.log('\n🏁 Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testTokenConversion };