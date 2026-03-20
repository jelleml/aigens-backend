/**
 * Custom environment-specific configuration overrides for Model Management System
 * 
 * This file allows for custom environment configurations beyond the standard
 * development, test, staging, and production environments.
 * 
 * To use a custom environment:
 * 1. Define your environment configuration in this file
 * 2. Set NODE_ENV to your custom environment name
 * 3. Set MODEL_MGMT_USE_CUSTOM_ENV=true
 * 
 * Example usage:
 * NODE_ENV=demo MODEL_MGMT_USE_CUSTOM_ENV=true node scripts/model-management/unified-sync.js
 */

// Demo environment (for demonstration purposes)
const demo = {
  execution: {
    maxConcurrency: 1,
    batchSize: 5,
    dryRun: true,
    autoConfirm: true
  },
  logging: {
    level: 'debug',
    enableConsole: true,
    enableFile: true,
    structured: false
  },
  providers: {
    // Only enable a subset of providers in demo environment
    openai: { enabled: true },
    anthropic: { enabled: true },
    deepseek: { enabled: false },
    ideogram: { enabled: false },
    together: { enabled: false },
    openrouter: { enabled: false }
  },
  development: {
    enabled: true,
    mockProviders: false,
    verboseLogging: true
  }
};

// Local environment (for local development with specific settings)
const local = {
  execution: {
    maxConcurrency: 1,
    batchSize: 10,
    dryRun: false,
    autoConfirm: true
  },
  logging: {
    level: 'debug',
    enableConsole: true,
    enableFile: true,
    directory: './logs/local-model-management',
    structured: false
  },
  timeouts: {
    provider: 60000, // 1 minute
    total: 300000, // 5 minutes
    api: 15000 // 15 seconds
  },
  development: {
    enabled: true,
    verboseLogging: true
  }
};

// CI environment (for continuous integration)
const ci = {
  execution: {
    maxConcurrency: 1,
    batchSize: 5,
    dryRun: true,
    autoConfirm: true
  },
  logging: {
    level: 'error',
    enableConsole: true,
    enableFile: false,
    structured: true
  },
  metrics: {
    enabled: false
  },
  alerting: {
    enabled: false
  },
  health: {
    enabled: false
  },
  development: {
    mockProviders: true,
    skipValidation: true
  }
};

// Add your custom environments here
const customEnvironments = {
  demo,
  local,
  ci
  // Add more custom environments as needed
};

module.exports = customEnvironments;