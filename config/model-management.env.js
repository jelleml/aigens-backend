/**
 * Environment-specific configuration overrides for Model Management System
 * 
 * This file defines configuration overrides for different environments:
 * - development: Used during local development
 * - test: Used during automated testing
 * - staging: Used in staging/pre-production environment
 * - production: Used in production environment
 * 
 * These configurations are merged with the default configuration in model-management.js
 * based on the current NODE_ENV value.
 */

// Development environment configuration
const development = {
  execution: {
    maxConcurrency: 1,
    batchSize: 10,
    dryRun: false,
    autoConfirm: true
  },
  logging: {
    level: 'debug',
    enableConsole: true,
    enableFile: false,
    structured: false
  },
  timeouts: {
    provider: 60000, // 1 minute
    total: 300000, // 5 minutes
    api: 15000 // 15 seconds
  },
  retry: {
    maxAttempts: 2,
    initialDelay: 5000 // 5 seconds
  },
  sync: {
    schedules: {
      full: '0 0 * * *', // Daily at midnight for development
      incremental: '0 */2 * * *', // Every 2 hours
      health: '*/5 * * * *' // Every 5 minutes
    },
    validateBeforeSync: true
  },
  metrics: {
    enabled: true,
    collectInterval: 30000 // 30 seconds
  },
  cli: {
    theme: 'default',
    colors: true,
    progressBar: true,
    timestamps: true,
    confirmPrompts: false
  },
  alerting: {
    enabled: false
  },
  database: {
    batchSize: 20,
    cleanup: {
      enabled: false
    }
  },
  development: {
    enabled: true,
    mockProviders: false,
    verboseLogging: true
  }
};

// Test environment configuration
const test = {
  execution: {
    maxConcurrency: 1,
    batchSize: 5,
    dryRun: true,
    autoConfirm: true
  },
  logging: {
    level: 'error',
    enableConsole: false,
    enableFile: false,
    structured: false
  },
  timeouts: {
    provider: 30000, // 30 seconds
    total: 120000, // 2 minutes
    api: 10000 // 10 seconds
  },
  retry: {
    maxAttempts: 1,
    initialDelay: 1000 // 1 second
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
  sync: {
    validateBeforeSync: false,
    skipOnErrors: true
  },
  database: {
    batchSize: 10,
    cleanup: {
      enabled: false
    }
  },
  development: {
    mockProviders: true,
    skipValidation: true
  }
};

// Staging environment configuration
const staging = {
  execution: {
    maxConcurrency: 2,
    batchSize: 25
  },
  logging: {
    level: 'info',
    enableConsole: true,
    enableFile: true,
    structured: true
  },
  sync: {
    schedules: {
      full: '0 1 * * 0', // Weekly on Sunday at 1 AM
      incremental: '0 */4 * * *', // Every 4 hours
      health: '*/10 * * * *' // Every 10 minutes
    }
  },
  alerting: {
    enabled: true,
    channels: {
      email: { enabled: false },
      slack: { enabled: true },
      webhook: { enabled: false }
    }
  },
  security: {
    apiKeyRotation: { enabled: true },
    encryptionAtRest: false,
    auditLogging: true
  }
};

// Production environment configuration
const production = {
  execution: {
    maxConcurrency: 3,
    batchSize: 50,
    dryRun: false,
    autoConfirm: false
  },
  logging: {
    level: 'info',
    enableConsole: false,
    enableFile: true,
    enableRotation: true,
    structured: true
  },
  timeouts: {
    provider: 300000, // 5 minutes
    total: 1800000, // 30 minutes
    api: 30000 // 30 seconds
  },
  retry: {
    maxAttempts: 3,
    initialDelay: 30000 // 30 seconds
  },
  alerting: {
    enabled: true,
    channels: {
      email: { enabled: true },
      slack: { enabled: true },
      webhook: { enabled: true }
    }
  },
  security: {
    apiKeyRotation: { enabled: true },
    encryptionAtRest: true,
    auditLogging: true,
    accessControl: { enabled: true }
  },
  development: {
    enabled: false,
    mockProviders: false,
    skipValidation: false
  }
};

module.exports = {
  development,
  test,
  staging,
  production
};