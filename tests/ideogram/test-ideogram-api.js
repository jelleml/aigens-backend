#!/usr/bin/env node

/**
 * Test Ideogram API Integration
 * 
 * This script tests the complete API flow for Ideogram image generation
 * by making an HTTP request to the messages endpoint.
 */

const axios = require('axios');
const fs = require('fs');

const API_BASE_URL = 'http://localhost:5555'; // Adjust if different
const TEST_USER_TOKEN = 'test-token'; // You'll need a valid JWT token

async function testIdeogramAPI() {
  console.log('🎨 Testing Ideogram API integration...\n');
  
  try {
    // Test data
    const testPayload = {
      content: 'Un gatto con cappello da pirata, stile cartone animato',
      id_model: '497', // ideogram-v2-turbo-ideogram from the diagnostic
      chat_id: 2, // From the logs
      agent_type: 'image'
    };
    
    console.log('📝 Test payload:');
    console.log(JSON.stringify(testPayload, null, 2));
    console.log();
    
    console.log('🚀 Sending request to messages API...');
    
    const response = await axios.post(`${API_BASE_URL}/api/v1/messages`, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_USER_TOKEN}`, // If auth is required
      },
      timeout: 60000, // 60 second timeout for image generation
    });
    
    console.log('✅ API Response received!');
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    
    if (response.data) {
      console.log('\n📋 Response data:');
      console.log(JSON.stringify(response.data, null, 2));
    }
    
    // Check for success indicators
    if (response.data?.success) {
      console.log('\n🎉 SUCCESS: Ideogram API integration working!');
      
      if (response.data.images && response.data.images.length > 0) {
        console.log(`📸 Generated ${response.data.images.length} image(s):`);
        response.data.images.forEach((img, idx) => {
          console.log(`  ${idx + 1}. ${img.file_name} - ${img.file_path}`);
        });
      }
      
      if (response.data.cost) {
        console.log(`💰 Cost: $${response.data.cost.totalCost}`);
      }
    } else {
      console.log('\n❌ API returned success: false');
      if (response.data?.error) {
        console.log('Error:', response.data.error);
      }
    }
    
  } catch (error) {
    console.error('❌ API request failed:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      console.error('No response received');
      console.error('Request:', error.request);
    } else {
      console.error('Error:', error.message);
    }
    
    console.error('\n🔍 Troubleshooting tips:');
    console.error('1. Make sure the server is running on', API_BASE_URL);
    console.error('2. Check if authentication is required and token is valid');
    console.error('3. Verify the model ID 497 exists and is active');
    console.error('4. Check server logs for detailed error information');
  }
}

// Helper function to test without auth (if the endpoint allows it)
async function testWithoutAuth() {
  console.log('🔓 Testing without authentication...');
  
  try {
    const testPayload = {
      content: 'Un semplice gatto, stile realistico',
      id_model: '497',
      chat_id: 2,
      agent_type: 'image'
    };
    
    const response = await axios.post(`${API_BASE_URL}/api/v1/messages`, testPayload, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
    
    console.log('✅ Request successful without auth!');
    return response.data;
    
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('🔒 Authentication required');
      return null;
    }
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testIdeogramAPI()
    .then(() => {
      console.log('\n🏁 Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = { testIdeogramAPI };