#!/usr/bin/env node

// Simple test script for source provider detection
function detectSourceProvider(modelId) {
  if (!modelId) return null;
  
  const id = modelId.toLowerCase();
  
  // Check for common provider patterns
  if (id.includes('gpt-') || id.includes('dall-e') || id.includes('whisper') || id.includes('tts-')) {
    return 'openai';
  }
  if (id.includes('claude')) {
    return 'anthropic';
  }
  if (id.includes('gemini') || id.includes('palm') || id.includes('bard')) {
    return 'google';
  }
  if (id.includes('llama') || id.includes('meta')) {
    return 'meta';
  }
  if (id.includes('mistral') || id.includes('mixtral')) {
    return 'mistral';
  }
  if (id.includes('command') || id.includes('cohere')) {
    return 'cohere';
  }
  
  // If no specific provider detected, try to extract from common patterns
  // Many aggregators use format like "vendor/model-name"
  const parts = modelId.split('/');
  if (parts.length > 1) {
    const vendor = parts[0].toLowerCase();
    // Map common vendor names to our provider names
    const vendorMap = {
      'meta-llama': 'meta',
      'mistralai': 'mistral',
      'anthropic': 'anthropic',
      'openai': 'openai',
      'google': 'google',
      'cohere': 'cohere'
    };
    
    if (vendorMap[vendor]) {
      return vendorMap[vendor];
    }
  }
  
  // Default to 'community' if no specific provider detected
  return 'community';
}

console.log('Testing source provider detection:');
console.log('gpt-4o-mini:', detectSourceProvider('gpt-4o-mini'));
console.log('claude-3-sonnet:', detectSourceProvider('claude-3-sonnet'));
console.log('meta-llama/Llama-2-7b-chat-hf:', detectSourceProvider('meta-llama/Llama-2-7b-chat-hf'));
console.log('mistralai/Mixtral-8x7B-Instruct-v0.1:', detectSourceProvider('mistralai/Mixtral-8x7B-Instruct-v0.1'));
console.log('qwen/Qwen-7B-Chat:', detectSourceProvider('qwen/Qwen-7B-Chat'));
console.log('command-r-plus:', detectSourceProvider('command-r-plus'));