#!/usr/bin/env node

/**
 * Test User's Exact Request
 * 
 * This script tests the exact request the user was making:
 * - gattino con cappello di peter pan
 * - model ID 497
 */

const db = require('../../database');
const { sendRequest } = require('../../services/ideogram.service');

async function testUserRequest() {
  console.log('🐱 Testing user\'s exact request: "gattino con cappello di peter pan"...\n');
  
  try {
    // Initialize database connection
    if (!db.initialized) {
      console.log('Initializing database connection...');
      await db.initialize();
    }
    console.log('✅ Database connection established\n');
    
    // Find the model with ID 497 (ideogram-v2-turbo-ideogram)
    const { Model, User, Chat } = db.models;
    const model497 = await Model.findByPk(497);
    
    if (!model497) {
      console.log('❌ Model 497 not found');
      return;
    }
    
    console.log(`✅ Found model 497: ${model497.model_slug} (${model497.name})`);
    
    // Find user and chat (using same as logs: chat 2, user a254430b...)
    const userId = 'a254430b-c19e-4c8e-9367-51633acfedae';
    const chatId = 2;
    
    // Verify user and chat exist
    const user = await User.findByPk(userId);
    const chat = await Chat.findByPk(chatId);
    
    if (!user) {
      console.log(`❌ User ${userId} not found`);
      return;
    }
    
    if (!chat) {
      console.log(`❌ Chat ${chatId} not found`);
      return;
    }
    
    console.log(`✅ User found: ${user.email}`);
    console.log(`✅ Chat found: ${chatId}\n`);
    
    // Test parameters from the user's logs
    const prompt = 'gattino con cappello di peter pan';
    const modelSlug = model497.model_slug; // Use the actual model slug
    const agentType = 'image';
    const attachmentIds = []; // Empty for image generation
    
    // Streaming callback
    let receivedText = '';
    let receivedUsage = null;
    const onStream = (text, usage) => {
      if (text) {
        console.log('📝 Streaming text:', text);
        receivedText += text;
      }
      if (usage) {
        console.log('📊 Usage data:', usage);
        receivedUsage = usage;
      }
    };
    
    console.log('🚀 Making the exact request...');
    console.log(`   - Prompt: "${prompt}"`);
    console.log(`   - Model: ${modelSlug} (ID: 497)`);
    console.log(`   - User: ${userId}`);
    console.log(`   - Chat: ${chatId}`);
    console.log();
    
    // Call sendRequest
    const result = await sendRequest(
      prompt,      // content
      modelSlug,   // model_id  
      userId,      // userId
      chatId,      // chat_id
      agentType,   // agent_type
      attachmentIds, // savedAttachmentIds
      onStream     // streaming callback
    );
    
    console.log('✅ Request completed!\n');
    
    // Check results
    console.log('📋 RESULTS:');
    console.log('===========');
    console.log(`Success: ${result.success}`);
    
    if (result.success) {
      console.log(`Message: "${result.message}"`);
      console.log(`Images generated: ${result.images?.length || 0}`);
      console.log(`Total cost: $${result.cost?.totalCost || 'N/A'}`);
      console.log(`Message ID: ${result.messageId}`);
      
      if (result.images && result.images.length > 0) {
        console.log('\n🎨 Generated image:');
        const img = result.images[0];
        console.log(`  File: ${img.file_name}`);
        console.log(`  Path: ${img.file_path}`);
        console.log(`  Size: ${img.file_size || 'N/A'} bytes`);
        console.log(`  Type: ${img.mime_type}`);
      }
      
      console.log('\n📊 Stream data:');
      console.log(`  Text received: "${receivedText}"`);
      console.log(`  Usage:`, receivedUsage);
      
      console.log('\n🎉 SUCCESS! User should now see the generated kitten image! 🐱⚓');
      
    } else {
      console.log(`❌ Generation failed: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
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
  testUserRequest()
    .then(() => {
      console.log('\n🏁 Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testUserRequest };