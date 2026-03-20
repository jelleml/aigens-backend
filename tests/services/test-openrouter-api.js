#!/usr/bin/env node

const config = require('../../config/config');

async function testOpenRouterAPI() {
  console.log('Testing OpenRouter API key from config:', config.openrouter.apiKey ? 'Present' : 'Missing');
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${config.openrouter.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Models found:', data.data ? data.data.length : 'Invalid format');
      if (data.data && data.data.length > 0) {
        console.log('First model:', data.data[0].id);
      }
    } else {
      console.log('Error response:', await response.text());
    }
  } catch (error) {
    console.error('Fetch error:', error.message);
  }
}

testOpenRouterAPI();