/**
 * Global setup for Jest tests
 * Runs once before all tests
 */

const { getLogger } = require('../../services/logging');
const logger = getLogger('global-setup', 'test');

module.exports = async () => {
  logger.info('\n🚀 Setting up test environment...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.TEST_MODE = 'true';
  
  // Mock API keys for testing
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key';
  process.env.TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || 'test-together-key';
  process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-openrouter-key';
  process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'test-deepseek-key';
  process.env.IDEOGRAM_API_KEY = process.env.IDEOGRAM_API_KEY || 'test-ideogram-key';
  
  // Set performance test thresholds
  global.__PERFORMANCE_THRESHOLDS__ = {
    SMALL_DATASET: {
      models: 100,
      maxProcessingTime: 5000, // 5 seconds
      maxMemoryIncrease: 50 * 1024 * 1024 // 50MB
    },
    MEDIUM_DATASET: {
      models: 500,
      maxProcessingTime: 15000, // 15 seconds
      maxMemoryIncrease: 100 * 1024 * 1024 // 100MB
    },
    LARGE_DATASET: {
      models: 1000,
      maxProcessingTime: 30000, // 30 seconds
      maxMemoryIncrease: 200 * 1024 * 1024 // 200MB
    }
  };
  
  // Create test directories if needed
  const fs = require('fs').promises;
  const path = require('path');
  
  const testDirs = [
    path.join(__dirname, '../../coverage'),
    path.join(__dirname, '../../logs/test')
  ];
  
  for (const dir of testDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Ignore errors if directory already exists
    }
  }
  
  logger.info('✅ Test environment setup complete');
};