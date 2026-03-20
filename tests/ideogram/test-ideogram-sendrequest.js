#!/usr/bin/env node

/**
 * Test Ideogram sendRequest Method
 * 
 * This script tests the updated sendRequest method to ensure it works
 * with the messages API parameter signature.
 */

const db = require('../../database');
const { sendRequest } = require('../../services/ideogram.service');

async function testIdeogramSendRequest() {
  console.log('🎨 Testing Ideogram sendRequest method...\n');
  
  try {
    // Initialize database connection
    if (!db.initialized) {
      console.log('Initializing database connection...');
      await db.initialize();
    }
    console.log('✅ Database connection established\n');
    
    // Find test user and chat
    const { User, Chat } = db.models;
    const testUser = await User.findOne({ limit: 1 });
    const testChat = await Chat.findOne({ limit: 1 });
    
    if (!testUser || !testChat) {
      console.log('❌ No test user or chat found');
      return;
    }
    
    console.log(`✅ Using user: ${testUser.email} (${testUser.id})`);
    console.log(`✅ Using chat: ${testChat.id}\n`);
    
    // Test parameters matching messages API signature
    const prompt = 'Un bellissimo tramonto sulle montagne, stile artistico digitale';
    const model = 'ideogram-v2-ideogram'; // Use model slug
    const userId = testUser.id;
    const chatId = testChat.id;
    const agentType = 'image';
    const attachmentIds = []; // Empty for image generation
    
    // Streaming callback to capture responses
    let receivedText = '';
    let receivedUsage = null;
    const onStream = (text, usage) => {
      if (text) {
        console.log('📝 Received text:', text);
        receivedText += text;
      }
      if (usage) {
        console.log('📊 Received usage:', usage);
        receivedUsage = usage;
      }
    };
    
    console.log('🚀 Calling sendRequest with messages API signature...');
    console.log(`   - Prompt: "${prompt}"`);
    console.log(`   - Model: ${model}`);
    console.log(`   - User ID: ${userId}`);
    console.log(`   - Chat ID: ${chatId}`);
    console.log(`   - Agent Type: ${agentType}`);
    console.log();
    
    // Call sendRequest with the new signature
    const result = await sendRequest(
      prompt,      // content
      model,       // model_id  
      userId,      // userId
      chatId,      // chat_id
      agentType,   // agent_type
      attachmentIds, // savedAttachmentIds
      onStream     // streaming callback
    );
    
    console.log('✅ sendRequest completed!\n');
    
    // Check results
    console.log('📋 RESULTS:');
    console.log('===========');
    console.log(`Success: ${result.success}`);
    
    if (result.success) {
      console.log(`Message: ${result.message}`);
      console.log(`Images: ${result.images?.length || 0}`);
      console.log(`Cost: $${result.cost?.totalCost || 'N/A'}`);
      console.log(`Message ID: ${result.messageId}`);
      console.log(`User Message ID: ${result.userMessageId}`);
      
      if (result.images && result.images.length > 0) {
        console.log('\n📸 Image details:');
        result.images.forEach((img, idx) => {
          console.log(`  ${idx + 1}. ${img.file_name}`);
          console.log(`     Path: ${img.file_path}`);
          console.log(`     Type: ${img.file_type}`);
        });
      }
      
      console.log('\n📊 Streaming data received:');
      console.log(`  Text: "${receivedText}"`);
      console.log(`  Usage:`, receivedUsage);
      
    } else {
      console.log(`❌ Error: ${result.error}`);
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
  testIdeogramSendRequest()
    .then(() => {
      console.log('\n🏁 Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testIdeogramSendRequest };