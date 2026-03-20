#!/usr/bin/env node

/**
 * Ideogram Image Generation Test
 * 
 * This script tests the actual image generation flow:
 * - Tests API connectivity with a real generation request
 * - Tests the ideogram service end-to-end functionality
 * - Checks cost calculation and token deduction
 */

const db = require('../../database');
const { processIdeogramRequest, calculateCost, isModelAvailable } = require('../../services/ideogram.service');

async function testIdeogramGeneration() {
  console.log('🎨 Testing Ideogram image generation...\n');
  
  try {
    // Initialize database connection
    if (!db.initialized) {
      console.log('Initializing database connection...');
      await db.initialize();
    }
    console.log('✅ Database connection established\n');
    
    const { User, Chat, Wallet } = db.models;
    
    // Find a test user and chat
    console.log('1. Finding test user and chat...');
    let testUser = await User.findOne({ limit: 1 });
    let testChat = await Chat.findOne({ limit: 1 });
    
    if (!testUser) {
      console.log('❌ No users found in database. Creating test user...');
      testUser = await User.create({
        email: 'test@ideogram.test',
        username: 'ideogram-test',
        is_verified: true
      });
      console.log(`✅ Created test user (ID: ${testUser.id})`);
    } else {
      console.log(`✅ Using existing user (ID: ${testUser.id}, email: ${testUser.email})`);
    }
    
    if (!testChat) {
      console.log('❌ No chats found in database. Creating test chat...');
      testChat = await Chat.create({
        user_id: testUser.id,
        title: 'Ideogram Test Chat'
      });
      console.log(`✅ Created test chat (ID: ${testChat.id})`);
    } else {
      console.log(`✅ Using existing chat (ID: ${testChat.id})`);
    }
    
    // Ensure user has wallet with funds
    console.log('\n2. Checking user wallet...');
    let wallet = await Wallet.findOne({ where: { user_id: testUser.id } });
    
    if (!wallet) {
      console.log('❌ No wallet found. Creating test wallet...');
      wallet = await Wallet.create({
        user_id: testUser.id,
        balance: 10.00, // $10 for testing
        currency: 'USD'
      });
      console.log(`✅ Created wallet with $${wallet.balance} balance`);
    } else {
      console.log(`✅ Wallet found with $${wallet.balance} balance`);
      
      // Add funds if balance is too low
      if (parseFloat(wallet.balance) < 1.0) {
        wallet.balance = 10.00;
        await wallet.save();
        console.log(`✅ Added funds. New balance: $${wallet.balance}`);
      }
    }
    
    // Test model availability and find a model to use
    console.log('\n3. Finding available Ideogram model...');
    const { Model, Provider } = db.models;
    const provider = await Provider.findOne({ where: { name: 'ideogram' } });
    
    if (!provider) {
      console.log('❌ Ideogram provider not found');
      return;
    }
    
    const availableModels = await Model.findAll({
      where: {
        id_provider: provider.id,
        is_active: true
      },
      order: [['model_slug', 'ASC']],
      limit: 5
    });
    
    if (availableModels.length === 0) {
      console.log('❌ No Ideogram models found in database');
      return;
    }
    
    console.log(`Found ${availableModels.length} available models:`);
    availableModels.forEach(model => {
      console.log(`   - ${model.model_slug} (API: ${model.api_model_id})`);
    });
    
    // Use the first available model
    const selectedModel = availableModels[0];
    console.log(`✅ Using model: ${selectedModel.model_slug} (ID: ${selectedModel.id})`);
    
    // Test cost calculation
    console.log('\n4. Testing cost calculation...');
    try {
      const costEstimate = await calculateCost(selectedModel.id, 1, 'Generate');
      console.log('✅ Cost calculation successful:');
      console.log(`   - Base cost: $${costEstimate.baseCost}`);
      console.log(`   - Total cost: $${costEstimate.totalCost}`);
      console.log(`   - Price per image: $${costEstimate.pricePerImage}`);
      console.log(`   - Operation: ${costEstimate.operation}`);
      
    } catch (costError) {
      console.log(`❌ Cost calculation failed: ${costError.message}`);
      return;
    }
    
    // Test image generation
    console.log('\n5. Testing image generation...');
    try {
      const requestData = {
        model: selectedModel.model_slug,  // Use model slug for the service
        prompt: 'A beautiful sunset over mountains, digital art style',
        chatId: testChat.id,
        userId: testUser.id,
        agent_type: 'image',
        count: 1,
        style: 'natural',
        aspect_ratio: '1:1'
      };
      
      console.log('   Sending generation request...');
      console.log(`   - Model: ${requestData.model}`);
      console.log(`   - Prompt: ${requestData.prompt}`);
      console.log(`   - Count: ${requestData.count}`);
      
      const result = await processIdeogramRequest(requestData);
      
      console.log('✅ Image generation successful!');
      console.log(`   - Message ID: ${result.messageId}`);
      console.log(`   - User Message ID: ${result.userMessageId}`);
      console.log(`   - Attachments: ${result.attachments.length}`);
      console.log(`   - Total cost: $${result.cost.totalCost}`);
      
      // Show attachment details
      result.attachments.forEach((attachment, index) => {
        console.log(`   - Attachment ${index + 1}: ${attachment.file_name} (${attachment.file_type})`);
        console.log(`     Path: ${attachment.file_path}`);
      });
      
    } catch (genError) {
      console.log(`❌ Image generation failed: ${genError.message}`);
      console.log(`   Full error:`, genError);
      
      // Check if it's a specific error we can diagnose
      if (genError.message.includes('timeout')) {
        console.log('   💡 This appears to be a timeout error. The API might be slow.');
      } else if (genError.message.includes('401') || genError.message.includes('403')) {
        console.log('   💡 This appears to be an authentication error. Check API key.');
      } else if (genError.message.includes('rate limit')) {
        console.log('   💡 This appears to be a rate limiting error. Wait and try again.');
      }
    }
    
    // Final wallet check
    console.log('\n6. Checking final wallet balance...');
    const finalWallet = await Wallet.findOne({ where: { user_id: testUser.id } });
    console.log(`   Final balance: $${finalWallet.balance}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
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
  testIdeogramGeneration()
    .then(() => {
      console.log('\n🏁 Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testIdeogramGeneration };