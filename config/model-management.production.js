/**
 * Production-specific configuration overrides for Model Management System
 * 
 * This file provides additional production environment configuration that
 * can be specific to a particular deployment or instance.
 * 
 * It will be automatically loaded when NODE_ENV=production
 */

module.exports = {
  // Override specific production settings
  execution: {
    // Use different concurrency based on server capacity
    maxConcurrency: 5,
    batchSize: 100
  },
  
  // Custom logging configuration
  logging: {
    // Use a specific log directory for this deployment
    directory: '/var/log/aigens/model-management',
    // Increase log retention
    maxFiles: 30
  },
  
  // Provider-specific settings
  providers: {
    // Adjust OpenAI settings
    openai: {
      // Increase rate limits for production
      rateLimit: {
        requests: 200,
        window: 60000 // 1 minute
      },
      // Custom sync schedule
      syncInterval: '0 */3 * * *' // Every 3 hours
    },
    
    // Adjust Anthropic settings
    anthropic: {
      // Increase timeout for production
      timeout: 240000, // 4 minutes
      // Custom sync schedule
      syncInterval: '0 */4 * * *' // Every 4 hours
    }
  },
  
  // Custom alerting configuration
  alerting: {
    channels: {
      // Production-specific email settings
      email: {
        from: 'model-alerts@production.aigens.com',
        to: ['ops@aigens.com', 'alerts@aigens.com']
      },
      
      // Production-specific Slack settings
      slack: {
        channel: '#prod-model-alerts'
      }
    },
    
    // Adjust alert thresholds for production
    thresholds: {
      providerHealthScore: 80.0, // More strict in production
      errorRate: 5.0, // Lower error tolerance in production
      responseTime: 20000 // 20 seconds
    }
  },
  
  // Database settings
  database: {
    // Production-specific database settings
    pooling: {
      min: 5,
      max: 20
    },
    
    // Longer retention periods for production data
    retentionPeriod: {
      syncLogs: 60 * 24 * 60 * 60 * 1000, // 60 days
      healthStatus: 14 * 24 * 60 * 60 * 1000 // 14 days
    }
  },
  
  // Security settings
  security: {
    // Enable all security features in production
    apiKeyRotation: {
      enabled: true,
      // Check more frequently in production
      checkInterval: 12 * 60 * 60 * 1000 // 12 hours
    },
    encryptionAtRest: true,
    auditLogging: true,
    accessControl: {
      enabled: true,
      // Define production-specific roles
      roles: ['admin', 'operator', 'readonly', 'security-auditor']
    }
  }
};