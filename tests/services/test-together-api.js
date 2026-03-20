#!/usr/bin/env node

const config = require('../../config/config');

async function testTogetherAPI() {
  console.log('Testing Together API key from config:', config.together.apiKey ? 'Present' : 'Missing');
  
  try {
    const response = await fetch('https://api.together.xyz/v1/models', {
      headers: {
        'Authorization': `Bearer ${config.together.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Models found:', Array.isArray(data) ? data.length : 'Invalid format');
      if (Array.isArray(data) && data.length > 0) {
        console.log('First model:', data[0].id || data[0].name);
      }
    } else {
      console.log('Error response:', await response.text());
    }
  } catch (error) {
    console.error('Fetch error:', error.message);
  }
}

testTogetherAPI();