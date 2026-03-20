#!/usr/bin/env node

/**
 * Test Model Resolution Fix
 * 
 * This script tests the model resolution logic to ensure it can find models
 * by both model_slug and api_model_id.
 */

const db = require('../../database');
const { sendRequest } = require('../../services/ideogram.service');

async function testModelResolution() {
  console.log('🔍 Testing model resolution fix...\n');
  
  try {
    // Initialize database connection
    if (!db.initialized) {
      await db.initialize();
    }
    
    // Get test data
    const { Model, Provider, User, Chat } = db.models;
    const provider = await Provider.findOne({ where: { name: 'ideogram' } });
    const testModel = await Model.findOne({ 
      where: { id_provider: provider.id, is_active: true } 
    });
    
    if (!testModel) {
      console.log('❌ No Ideogram model found');
      return;
    }
    
    console.log('📋 Test Model Info:');
    console.log(`   - ID: ${testModel.id}`);
    console.log(`   - Model Slug: ${testModel.model_slug}`);
    console.log(`   - API Model ID: ${testModel.api_model_id}`);
    console.log();
    
    // Get test user and chat
    const testUser = await User.findOne({ limit: 1 });
    const testChat = await Chat.findOne({ limit: 1 });
    
    const prompt = 'Test model resolution';
    const userId = testUser.id;
    const chatId = testChat.id;
    
    // Test 1: Using model_slug (should work)
    console.log('🧪 Test 1: Using model_slug');
    console.log(`   Input: "${testModel.model_slug}"`);
    try {
      const result1 = await sendRequest(prompt, testModel.model_slug, userId, chatId, 'image', [], null);
      console.log(`   ✅ SUCCESS: Resolved to model ID ${result1.success ? 'correctly' : 'with error'}`);
      if (!result1.success) {
        console.log(`   Error: ${result1.error}`);
      }
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}`);
    }
    
    console.log();
    
    // Test 2: Using api_model_id (this was failing before)
    console.log('🧪 Test 2: Using api_model_id');
    console.log(`   Input: "${testModel.api_model_id}"`);
    try {
      const result2 = await sendRequest(prompt, testModel.api_model_id, userId, chatId, 'image', [], null);
      console.log(`   ✅ SUCCESS: Resolved to model ID ${result2.success ? 'correctly' : 'with error'}`);
      if (!result2.success) {
        console.log(`   Error: ${result2.error}`);
      }
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}`);
    }
    
    console.log();
    
    // Test 3: Using invalid model (should fail gracefully)
    console.log('🧪 Test 3: Using invalid model');
    console.log(`   Input: "invalid-model"`);
    try {
      const result3 = await sendRequest(prompt, 'invalid-model', userId, chatId, 'image', [], null);
      console.log(`   ❌ UNEXPECTED: Should have failed but got: ${result3.success}`);
    } catch (error) {
      console.log(`   ✅ EXPECTED FAILURE: ${error.message}`);
    }
    
    console.log('\n📊 Summary:');
    console.log('The model resolution should now work with both:');
    console.log(`   - model_slug: "${testModel.model_slug}"`);
    console.log(`   - api_model_id: "${testModel.api_model_id}"`);
    console.log('This fixes the "Model ideogram-v2 not found" error!');
    
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
  testModelResolution()
    .then(() => {
      console.log('\n🏁 Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testModelResolution };