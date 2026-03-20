const path = require('path');
const fs = require('fs');
const envConfigs = require('./model-management.env');
const customEnvConfigs = require('./model-management.env.custom');

// Default configuration for the Model Management System
const defaultConfig = {
  // Execution settings
  execution: {
    strategy: process.env.MODEL_MGMT_STRATEGY || 'mixed', // sequential | parallel | mixed
    maxConcurrency: parseInt(process.env.MODEL_MGMT_CONCURRENCY) || 3,
    batchSize: parseInt(process.env.MODEL_MGMT_BATCH_SIZE) || 50,
    dryRun: process.env.MODEL_MGMT_DRY_RUN === 'true' || false,
    autoConfirm: process.env.MODEL_MGMT_AUTO_CONFIRM === 'true' || false,
  },

  // Timeout settings (in milliseconds)
  timeouts: {
    provider: parseInt(process.env.MODEL_MGMT_PROVIDER_TIMEOUT) || 300000, // 5 minutes
    total: parseInt(process.env.MODEL_MGMT_TOTAL_TIMEOUT) || 1800000, // 30 minutes
    healthCheck: parseInt(process.env.MODEL_MGMT_HEALTH_TIMEOUT) || 30000, // 30 seconds
    transaction: parseInt(process.env.MODEL_MGMT_TRANSACTION_TIMEOUT) || 120000, // 2 minutes
    api: parseInt(process.env.MODEL_MGMT_API_TIMEOUT) || 30000, // 30 seconds
  },

  // Retry settings
  retry: {
    maxAttempts: parseInt(process.env.MODEL_MGMT_MAX_RETRIES) || 3,
    initialDelay: parseInt(process.env.MODEL_MGMT_RETRY_DELAY) || 30000, // 30 seconds
    backoffMultiplier: parseFloat(process.env.MODEL_MGMT_BACKOFF_MULTIPLIER) || 2,
    maxDelay: parseInt(process.env.MODEL_MGMT_MAX_RETRY_DELAY) || 300000, // 5 minutes
    jitter: process.env.MODEL_MGMT_RETRY_JITTER !== 'false', // true by default
  },

  // Circuit breaker settings
  circuitBreaker: {
    failureThreshold: parseInt(process.env.MODEL_MGMT_FAILURE_THRESHOLD) || 5,
    recoveryTimeout: parseInt(process.env.MODEL_MGMT_RECOVERY_TIMEOUT) || 60000, // 1 minute
    halfOpenRequests: parseInt(process.env.MODEL_MGMT_HALF_OPEN_REQUESTS) || 3,
    enabled: process.env.MODEL_MGMT_CIRCUIT_BREAKER !== 'false', // true by default
  },

  // Health check settings
  health: {
    enabled: process.env.MODEL_MGMT_HEALTH_CHECK !== 'false', // true by default
    skipUnhealthy: process.env.MODEL_MGMT_SKIP_UNHEALTHY === 'true' || true,
    healthScoreThreshold: parseFloat(process.env.MODEL_MGMT_HEALTH_THRESHOLD) || 70.0,
    errorRateThreshold: parseFloat(process.env.MODEL_MGMT_ERROR_RATE_THRESHOLD) || 10.0,
    interval: parseInt(process.env.MODEL_MGMT_HEALTH_INTERVAL) || 300000, // 5 minutes
    timeout: parseInt(process.env.MODEL_MGMT_HEALTH_TIMEOUT) || 30000, // 30 seconds
  },

  // Logging configuration
  logging: {
    level: process.env.MODEL_MGMT_LOG_LEVEL || 'info', // debug | info | warn | error
    directory: process.env.MODEL_MGMT_LOG_DIR || path.join(process.cwd(), 'logs', 'model-management'),
    filename: process.env.MODEL_MGMT_LOG_FILE || 'model-management.log',
    maxSize: process.env.MODEL_MGMT_LOG_MAX_SIZE || '50MB',
    maxFiles: parseInt(process.env.MODEL_MGMT_LOG_MAX_FILES) || 10,
    datePattern: process.env.MODEL_MGMT_LOG_DATE_PATTERN || 'YYYY-MM-DD',
    enableConsole: process.env.MODEL_MGMT_LOG_CONSOLE !== 'false', // true by default
    enableFile: process.env.MODEL_MGMT_LOG_FILE_ENABLED !== 'false', // true by default
    enableRotation: process.env.MODEL_MGMT_LOG_ROTATION !== 'false', // true by default
    structured: process.env.MODEL_MGMT_LOG_STRUCTURED === 'true' || true,
  },

  // Metrics collection
  metrics: {
    enabled: process.env.MODEL_MGMT_METRICS !== 'false', // true by default
    collectInterval: parseInt(process.env.MODEL_MGMT_METRICS_INTERVAL) || 60000, // 1 minute
    retentionPeriod: parseInt(process.env.MODEL_MGMT_METRICS_RETENTION) || 7 * 24 * 60 * 60 * 1000, // 7 days
    exportInterval: parseInt(process.env.MODEL_MGMT_METRICS_EXPORT_INTERVAL) || 300000, // 5 minutes
    aggregationWindow: parseInt(process.env.MODEL_MGMT_METRICS_WINDOW) || 300000, // 5 minutes
  },

  // Synchronization settings
  sync: {
    schedules: {
      full: process.env.MODEL_MGMT_FULL_SYNC_CRON || '0 2 * * 0', // Weekly on Sunday at 2 AM
      incremental: process.env.MODEL_MGMT_INCREMENTAL_SYNC_CRON || '0 */6 * * *', // Every 6 hours
      health: process.env.MODEL_MGMT_HEALTH_CRON || '*/15 * * * *', // Every 15 minutes
      cleanup: process.env.MODEL_MGMT_CLEANUP_CRON || '0 3 * * *', // Daily at 3 AM
    },
    cooldownPeriod: parseInt(process.env.MODEL_MGMT_COOLDOWN) || 3600000, // 1 hour
    batchProcessing: process.env.MODEL_MGMT_BATCH_PROCESSING !== 'false', // true by default
    validateBeforeSync: process.env.MODEL_MGMT_VALIDATE_SYNC !== 'false', // true by default
    skipOnErrors: process.env.MODEL_MGMT_SKIP_ON_ERRORS === 'true' || false,
  },

  // Provider-specific configurations
  providers: {
    openai: {
      priority: parseInt(process.env.MODEL_MGMT_OPENAI_PRIORITY) || 1,
      timeout: parseInt(process.env.MODEL_MGMT_OPENAI_TIMEOUT) || 120000,
      syncInterval: process.env.MODEL_MGMT_OPENAI_SYNC_CRON || '0 */4 * * *', // Every 4 hours
      healthInterval: process.env.MODEL_MGMT_OPENAI_HEALTH_CRON || '*/10 * * * *', // Every 10 minutes
      type: 'direct',
      dependsOn: [],
      enabled: process.env.MODEL_MGMT_OPENAI_ENABLED !== 'false', // true by default
      rateLimit: {
        requests: parseInt(process.env.MODEL_MGMT_OPENAI_RATE_LIMIT) || 100,
        window: parseInt(process.env.MODEL_MGMT_OPENAI_RATE_WINDOW) || 60000, // 1 minute
      },
      maintenanceWindow: {
        enabled: process.env.MODEL_MGMT_OPENAI_MAINTENANCE === 'true' || false,
        start: parseInt(process.env.MODEL_MGMT_OPENAI_MAINTENANCE_START) || 2, // 2 AM UTC
        end: parseInt(process.env.MODEL_MGMT_OPENAI_MAINTENANCE_END) || 4, // 4 AM UTC
      },
    },
    anthropic: {
      priority: parseInt(process.env.MODEL_MGMT_ANTHROPIC_PRIORITY) || 2,
      timeout: parseInt(process.env.MODEL_MGMT_ANTHROPIC_TIMEOUT) || 180000,
      syncInterval: process.env.MODEL_MGMT_ANTHROPIC_SYNC_CRON || '0 */6 * * *', // Every 6 hours
      healthInterval: process.env.MODEL_MGMT_ANTHROPIC_HEALTH_CRON || '*/15 * * * *', // Every 15 minutes
      type: 'direct',
      dependsOn: [],
      enabled: process.env.MODEL_MGMT_ANTHROPIC_ENABLED !== 'false', // true by default
      rateLimit: {
        requests: parseInt(process.env.MODEL_MGMT_ANTHROPIC_RATE_LIMIT) || 50,
        window: parseInt(process.env.MODEL_MGMT_ANTHROPIC_RATE_WINDOW) || 60000, // 1 minute
      },
      maintenanceWindow: {
        enabled: process.env.MODEL_MGMT_ANTHROPIC_MAINTENANCE === 'true' || false,
        start: parseInt(process.env.MODEL_MGMT_ANTHROPIC_MAINTENANCE_START) || 3, // 3 AM UTC
        end: parseInt(process.env.MODEL_MGMT_ANTHROPIC_MAINTENANCE_END) || 5, // 5 AM UTC
      },
    },
    deepseek: {
      priority: parseInt(process.env.MODEL_MGMT_DEEPSEEK_PRIORITY) || 4,
      timeout: parseInt(process.env.MODEL_MGMT_DEEPSEEK_TIMEOUT) || 150000,
      syncInterval: process.env.MODEL_MGMT_DEEPSEEK_SYNC_CRON || '0 */8 * * *', // Every 8 hours
      healthInterval: process.env.MODEL_MGMT_DEEPSEEK_HEALTH_CRON || '*/20 * * * *', // Every 20 minutes
      type: 'direct',
      dependsOn: [],
      enabled: process.env.MODEL_MGMT_DEEPSEEK_ENABLED !== 'false', // true by default
      rateLimit: {
        requests: parseInt(process.env.MODEL_MGMT_DEEPSEEK_RATE_LIMIT) || 30,
        window: parseInt(process.env.MODEL_MGMT_DEEPSEEK_RATE_WINDOW) || 60000, // 1 minute
      },
    },
    ideogram: {
      priority: parseInt(process.env.MODEL_MGMT_IDEOGRAM_PRIORITY) || 5,
      timeout: parseInt(process.env.MODEL_MGMT_IDEOGRAM_TIMEOUT) || 120000,
      syncInterval: process.env.MODEL_MGMT_IDEOGRAM_SYNC_CRON || '0 */12 * * *', // Every 12 hours
      healthInterval: process.env.MODEL_MGMT_IDEOGRAM_HEALTH_CRON || '*/30 * * * *', // Every 30 minutes
      type: 'direct',
      dependsOn: [],
      enabled: process.env.MODEL_MGMT_IDEOGRAM_ENABLED !== 'false', // true by default
      rateLimit: {
        requests: parseInt(process.env.MODEL_MGMT_IDEOGRAM_RATE_LIMIT) || 20,
        window: parseInt(process.env.MODEL_MGMT_IDEOGRAM_RATE_WINDOW) || 60000, // 1 minute
      },
    },
    together: {
      priority: parseInt(process.env.MODEL_MGMT_TOGETHER_PRIORITY) || 6,
      timeout: parseInt(process.env.MODEL_MGMT_TOGETHER_TIMEOUT) || 180000,
      syncInterval: process.env.MODEL_MGMT_TOGETHER_SYNC_CRON || '0 */8 * * *', // Every 8 hours
      healthInterval: process.env.MODEL_MGMT_TOGETHER_HEALTH_CRON || '*/20 * * * *', // Every 20 minutes
      type: 'direct',
      dependsOn: [],
      enabled: process.env.MODEL_MGMT_TOGETHER_ENABLED !== 'false', // true by default
      rateLimit: {
        requests: parseInt(process.env.MODEL_MGMT_TOGETHER_RATE_LIMIT) || 40,
        window: parseInt(process.env.MODEL_MGMT_TOGETHER_RATE_WINDOW) || 60000, // 1 minute
      },
    },
    openrouter: {
      priority: parseInt(process.env.MODEL_MGMT_OPENROUTER_PRIORITY) || 3,
      timeout: parseInt(process.env.MODEL_MGMT_OPENROUTER_TIMEOUT) || 300000,
      syncInterval: process.env.MODEL_MGMT_OPENROUTER_SYNC_CRON || '0 */4 * * *', // Every 4 hours
      healthInterval: process.env.MODEL_MGMT_OPENROUTER_HEALTH_CRON || '*/15 * * * *', // Every 15 minutes
      type: 'aggregator',
      dependsOn: ['openai', 'anthropic'],
      enabled: process.env.MODEL_MGMT_OPENROUTER_ENABLED !== 'false', // true by default
      rateLimit: {
        requests: parseInt(process.env.MODEL_MGMT_OPENROUTER_RATE_LIMIT) || 200,
        window: parseInt(process.env.MODEL_MGMT_OPENROUTER_RATE_WINDOW) || 60000, // 1 minute
      },
      maintenanceWindow: {
        enabled: process.env.MODEL_MGMT_OPENROUTER_MAINTENANCE === 'true' || false,
        start: parseInt(process.env.MODEL_MGMT_OPENROUTER_MAINTENANCE_START) || 1, // 1 AM UTC
        end: parseInt(process.env.MODEL_MGMT_OPENROUTER_MAINTENANCE_END) || 3, // 3 AM UTC
      },
    },
  },

  // CLI configuration
  cli: {
    theme: process.env.MODEL_MGMT_CLI_THEME || 'default', // default | minimal | verbose
    colors: process.env.MODEL_MGMT_CLI_COLORS !== 'false', // true by default
    progressBar: process.env.MODEL_MGMT_CLI_PROGRESS !== 'false', // true by default
    timestamps: process.env.MODEL_MGMT_CLI_TIMESTAMPS === 'true' || false,
    confirmPrompts: process.env.MODEL_MGMT_CLI_CONFIRM !== 'false', // true by default
    outputFormat: process.env.MODEL_MGMT_CLI_FORMAT || 'table', // table | json | minimal
    pageSize: parseInt(process.env.MODEL_MGMT_CLI_PAGE_SIZE) || 20,
    configPath: process.env.MODEL_MGMT_CLI_CONFIG || path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.model-management', 'config.json'),
  },

  // API configuration
  api: {
    baseUrl: process.env.MODEL_MGMT_API_URL || 'http://localhost:3000',
    timeout: parseInt(process.env.MODEL_MGMT_API_TIMEOUT) || 30000,
    retries: parseInt(process.env.MODEL_MGMT_API_RETRIES) || 3,
    rateLimiting: {
      enabled: process.env.MODEL_MGMT_API_RATE_LIMIT !== 'false', // true by default
      windowMs: parseInt(process.env.MODEL_MGMT_API_RATE_WINDOW) || 60000, // 1 minute
      maxRequests: parseInt(process.env.MODEL_MGMT_API_MAX_REQUESTS) || 100,
    },
  },

  // Alerting configuration
  alerting: {
    enabled: process.env.MODEL_MGMT_ALERTING === 'true' || false,
    channels: {
      email: {
        enabled: process.env.MODEL_MGMT_EMAIL_ALERTS === 'true' || false,
        smtp: {
          host: process.env.MODEL_MGMT_SMTP_HOST,
          port: parseInt(process.env.MODEL_MGMT_SMTP_PORT) || 587,
          secure: process.env.MODEL_MGMT_SMTP_SECURE === 'true' || false,
          auth: {
            user: process.env.MODEL_MGMT_SMTP_USER,
            pass: process.env.MODEL_MGMT_SMTP_PASS,
          },
        },
        from: process.env.MODEL_MGMT_EMAIL_FROM || 'model-management@aigens.com',
        to: process.env.MODEL_MGMT_EMAIL_TO ? process.env.MODEL_MGMT_EMAIL_TO.split(',') : [],
      },
      slack: {
        enabled: process.env.MODEL_MGMT_SLACK_ALERTS === 'true' || false,
        webhook: process.env.MODEL_MGMT_SLACK_WEBHOOK,
        channel: process.env.MODEL_MGMT_SLACK_CHANNEL || '#model-management',
        username: process.env.MODEL_MGMT_SLACK_USERNAME || 'Model Management Bot',
      },
      webhook: {
        enabled: process.env.MODEL_MGMT_WEBHOOK_ALERTS === 'true' || false,
        url: process.env.MODEL_MGMT_WEBHOOK_URL,
        headers: process.env.MODEL_MGMT_WEBHOOK_HEADERS ? JSON.parse(process.env.MODEL_MGMT_WEBHOOK_HEADERS) : {},
      },
    },
    thresholds: {
      providerHealthScore: parseFloat(process.env.MODEL_MGMT_ALERT_HEALTH_THRESHOLD) || 70.0,
      errorRate: parseFloat(process.env.MODEL_MGMT_ALERT_ERROR_THRESHOLD) || 10.0,
      responseTime: parseInt(process.env.MODEL_MGMT_ALERT_RESPONSE_THRESHOLD) || 30000, // 30 seconds
      consecutiveFailures: parseInt(process.env.MODEL_MGMT_ALERT_FAILURE_THRESHOLD) || 3,
      memoryUsage: parseFloat(process.env.MODEL_MGMT_ALERT_MEMORY_THRESHOLD) || 85.0, // 85%
      diskUsage: parseFloat(process.env.MODEL_MGMT_ALERT_DISK_THRESHOLD) || 90.0, // 90%
    },
    cooldown: {
      email: parseInt(process.env.MODEL_MGMT_EMAIL_COOLDOWN) || 3600000, // 1 hour
      slack: parseInt(process.env.MODEL_MGMT_SLACK_COOLDOWN) || 1800000, // 30 minutes
      webhook: parseInt(process.env.MODEL_MGMT_WEBHOOK_COOLDOWN) || 900000, // 15 minutes
    },
  },

  // Database configuration
  database: {
    batchSize: parseInt(process.env.MODEL_MGMT_DB_BATCH_SIZE) || 100,
    transactionTimeout: parseInt(process.env.MODEL_MGMT_DB_TRANSACTION_TIMEOUT) || 120000, // 2 minutes
    pooling: {
      min: parseInt(process.env.MODEL_MGMT_DB_POOL_MIN) || 2,
      max: parseInt(process.env.MODEL_MGMT_DB_POOL_MAX) || 10,
      acquireTimeout: parseInt(process.env.MODEL_MGMT_DB_ACQUIRE_TIMEOUT) || 60000, // 1 minute
      idleTimeout: parseInt(process.env.MODEL_MGMT_DB_IDLE_TIMEOUT) || 300000, // 5 minutes
    },
    retentionPeriod: {
      syncLogs: parseInt(process.env.MODEL_MGMT_SYNC_LOGS_RETENTION) || 30 * 24 * 60 * 60 * 1000, // 30 days
      healthStatus: parseInt(process.env.MODEL_MGMT_HEALTH_RETENTION) || 7 * 24 * 60 * 60 * 1000, // 7 days
      metrics: parseInt(process.env.MODEL_MGMT_METRICS_RETENTION) || 30 * 24 * 60 * 60 * 1000, // 30 days
    },
    cleanup: {
      enabled: process.env.MODEL_MGMT_DB_CLEANUP !== 'false', // true by default
      schedule: process.env.MODEL_MGMT_DB_CLEANUP_CRON || '0 4 * * *', // Daily at 4 AM
      batchSize: parseInt(process.env.MODEL_MGMT_DB_CLEANUP_BATCH) || 1000,
    },
  },

  // Security configuration
  security: {
    apiKeyRotation: {
      enabled: process.env.MODEL_MGMT_API_KEY_ROTATION === 'true' || false,
      checkInterval: parseInt(process.env.MODEL_MGMT_API_KEY_CHECK_INTERVAL) || 24 * 60 * 60 * 1000, // Daily
      warningThreshold: parseInt(process.env.MODEL_MGMT_API_KEY_WARNING) || 7 * 24 * 60 * 60 * 1000, // 7 days
    },
    encryptionAtRest: process.env.MODEL_MGMT_ENCRYPTION === 'true' || false,
    auditLogging: process.env.MODEL_MGMT_AUDIT_LOGGING !== 'false', // true by default
    accessControl: {
      enabled: process.env.MODEL_MGMT_ACCESS_CONTROL === 'true' || false,
      roles: process.env.MODEL_MGMT_ROLES ? process.env.MODEL_MGMT_ROLES.split(',') : ['admin', 'operator', 'readonly'],
    },
  },

  // Development and testing
  development: {
    enabled: process.env.NODE_ENV === 'development',
    mockProviders: process.env.MODEL_MGMT_MOCK_PROVIDERS === 'true' || false,
    verboseLogging: process.env.MODEL_MGMT_VERBOSE === 'true' || false,
    skipValidation: process.env.MODEL_MGMT_SKIP_VALIDATION === 'true' || false,
    testDatabase: process.env.MODEL_MGMT_TEST_DB || 'model_management_test',
  },
};

// Combine standard and custom environment configurations
const environmentConfigs = {
  ...envConfigs,
  ...customEnvConfigs
};

class ModelManagementConfig {
  constructor(environment = process.env.NODE_ENV || 'development') {
    this.environment = environment;
    
    // Load environment-specific configuration
    let envConfig = {};
    
    // First check if we should use a custom environment
    if (process.env.MODEL_MGMT_USE_CUSTOM_ENV === 'true' && customEnvConfigs[environment]) {
      envConfig = customEnvConfigs[environment] || {};
      console.log(`Using custom environment configuration: ${environment}`);
    } else {
      // Otherwise use standard environments
      envConfig = envConfigs[environment] || {};
      
      // If environment not found in standard configs, check custom configs as fallback
      if (Object.keys(envConfig).length === 0 && customEnvConfigs[environment]) {
        envConfig = customEnvConfigs[environment];
        console.log(`Using custom environment configuration as fallback: ${environment}`);
      }
    }
    
    // Load custom environment config file if specified
    const customEnvConfigPath = process.env.MODEL_MGMT_CONFIG_PATH;
    let fileEnvConfig = {};
    
    if (customEnvConfigPath) {
      try {
        const resolvedPath = path.resolve(customEnvConfigPath);
        if (fs.existsSync(resolvedPath)) {
          fileEnvConfig = require(resolvedPath);
          console.log(`Loaded custom environment config from file: ${resolvedPath}`);
        }
      } catch (error) {
        console.warn(`Warning: Failed to load custom environment config from ${customEnvConfigPath}: ${error.message}`);
      }
    }
    
    // Load environment-specific file if it exists
    const envSpecificConfigPath = process.env.MODEL_MGMT_ENV_CONFIG_PATH || 
      path.join(process.cwd(), 'config', `model-management.${environment}.js`);
    
    let envSpecificConfig = {};
    if (fs.existsSync(envSpecificConfigPath)) {
      try {
        envSpecificConfig = require(envSpecificConfigPath);
        console.log(`Loaded environment-specific config from: ${envSpecificConfigPath}`);
      } catch (error) {
        console.warn(`Warning: Failed to load environment-specific config from ${envSpecificConfigPath}: ${error.message}`);
      }
    }
    
    // Merge configurations with priority: 
    // fileEnvConfig > envSpecificConfig > envConfig > defaultConfig
    this.config = this._mergeConfigs(
      defaultConfig,
      this._mergeConfigs(
        envConfig,
        this._mergeConfigs(envSpecificConfig, fileEnvConfig)
      )
    );
    
    this._validateConfig();
  }

  /**
   * Get configuration value by path (dot notation)
   * @param {string} path - Configuration path (e.g., 'execution.strategy')
   * @param {any} defaultValue - Default value if path not found
   * @returns {any} Configuration value
   */
  get(path, defaultValue = undefined) {
    return this._getNestedValue(this.config, path, defaultValue);
  }

  /**
   * Set configuration value by path (dot notation)
   * @param {string} path - Configuration path
   * @param {any} value - Value to set
   */
  set(path, value) {
    this._setNestedValue(this.config, path, value);
    this._validateConfig();
  }

  /**
   * Get provider-specific configuration
   * @param {string} providerName - Provider name
   * @returns {object} Provider configuration
   */
  getProviderConfig(providerName) {
    return this.config.providers[providerName] || {};
  }

  /**
   * Get all enabled providers sorted by priority
   * @returns {Array} Array of enabled provider configurations
   */
  getEnabledProviders() {
    return Object.entries(this.config.providers)
      .filter(([, config]) => config.enabled)
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([name, config]) => ({ name, ...config }));
  }

  /**
   * Get providers by type
   * @param {string} type - Provider type ('direct' or 'aggregator')
   * @returns {Array} Array of providers of specified type
   */
  getProvidersByType(type) {
    return this.getEnabledProviders().filter(provider => provider.type === type);
  }

  /**
   * Get the complete configuration object
   * @returns {object} Complete configuration
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Update configuration from environment variables
   */
  refreshFromEnvironment() {
    // Load environment-specific configuration
    let envConfig = {};
    
    // First check if we should use a custom environment
    if (process.env.MODEL_MGMT_USE_CUSTOM_ENV === 'true' && customEnvConfigs[this.environment]) {
      envConfig = customEnvConfigs[this.environment] || {};
    } else {
      // Otherwise use standard environments
      envConfig = envConfigs[this.environment] || {};
      
      // If environment not found in standard configs, check custom configs as fallback
      if (Object.keys(envConfig).length === 0 && customEnvConfigs[this.environment]) {
        envConfig = customEnvConfigs[this.environment];
      }
    }
    
    // Load custom environment config file if specified
    const customEnvConfigPath = process.env.MODEL_MGMT_CONFIG_PATH;
    let fileEnvConfig = {};
    
    if (customEnvConfigPath) {
      try {
        const resolvedPath = path.resolve(customEnvConfigPath);
        // Clear require cache to ensure fresh load
        if (require.cache[require.resolve(resolvedPath)]) {
          delete require.cache[require.resolve(resolvedPath)];
        }
        if (fs.existsSync(resolvedPath)) {
          fileEnvConfig = require(resolvedPath);
        }
      } catch (error) {
        console.warn(`Warning: Failed to load custom environment config from ${customEnvConfigPath}: ${error.message}`);
      }
    }
    
    // Load environment-specific file if it exists
    const envSpecificConfigPath = process.env.MODEL_MGMT_ENV_CONFIG_PATH || 
      path.join(process.cwd(), 'config', `model-management.${this.environment}.js`);
    
    let envSpecificConfig = {};
    if (fs.existsSync(envSpecificConfigPath)) {
      try {
        // Clear require cache to ensure fresh load
        if (require.cache[require.resolve(envSpecificConfigPath)]) {
          delete require.cache[require.resolve(envSpecificConfigPath)];
        }
        envSpecificConfig = require(envSpecificConfigPath);
      } catch (error) {
        console.warn(`Warning: Failed to load environment-specific config from ${envSpecificConfigPath}: ${error.message}`);
      }
    }
    
    // Merge configurations with priority: 
    // fileEnvConfig > envSpecificConfig > envConfig > defaultConfig
    this.config = this._mergeConfigs(
      defaultConfig,
      this._mergeConfigs(
        envConfig,
        this._mergeConfigs(envSpecificConfig, fileEnvConfig)
      )
    );
    
    this._validateConfig();
  }

  /**
   * Export configuration to JSON
   * @param {boolean} includeSecrets - Include sensitive values
   * @returns {string} JSON string
   */
  toJSON(includeSecrets = false) {
    let exportConfig = { ...this.config };
    
    if (!includeSecrets) {
      // Remove sensitive information
      if (exportConfig.alerting?.channels?.email?.smtp?.auth) {
        exportConfig.alerting.channels.email.smtp.auth = { user: '[REDACTED]', pass: '[REDACTED]' };
      }
      if (exportConfig.alerting?.channels?.slack?.webhook) {
        exportConfig.alerting.channels.slack.webhook = '[REDACTED]';
      }
      if (exportConfig.alerting?.channels?.webhook?.url) {
        exportConfig.alerting.channels.webhook.url = '[REDACTED]';
      }
    }

    return JSON.stringify(exportConfig, null, 2);
  }

  /**
   * Validate the current configuration
   * @private
   */
  _validateConfig() {
    const errors = [];

    // Validate execution settings
    if (this.config.execution.maxConcurrency < 1) {
      errors.push('execution.maxConcurrency must be at least 1');
    }
    if (this.config.execution.batchSize < 1) {
      errors.push('execution.batchSize must be at least 1');
    }
    if (!['sequential', 'parallel', 'mixed'].includes(this.config.execution.strategy)) {
      errors.push('execution.strategy must be one of: sequential, parallel, mixed');
    }

    // Validate timeout settings
    Object.entries(this.config.timeouts).forEach(([key, value]) => {
      if (typeof value !== 'number' || value <= 0) {
        errors.push(`timeouts.${key} must be a positive number`);
      }
    });

    // Validate retry settings
    if (this.config.retry.maxAttempts < 0) {
      errors.push('retry.maxAttempts must be non-negative');
    }
    if (this.config.retry.backoffMultiplier <= 0) {
      errors.push('retry.backoffMultiplier must be positive');
    }

    // Validate provider configurations
    Object.entries(this.config.providers).forEach(([name, config]) => {
      if (typeof config.priority !== 'number' || config.priority < 1) {
        errors.push(`providers.${name}.priority must be a positive number`);
      }
      if (!['direct', 'aggregator'].includes(config.type)) {
        errors.push(`providers.${name}.type must be 'direct' or 'aggregator'`);
      }
    });

    // Validate logging configuration
    if (!['debug', 'info', 'warn', 'error'].includes(this.config.logging.level)) {
      errors.push('logging.level must be one of: debug, info, warn, error');
    }

    // Validate CLI configuration
    if (!['table', 'json', 'minimal'].includes(this.config.cli.outputFormat)) {
      errors.push('cli.outputFormat must be one of: table, json, minimal');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Deep merge configuration objects
   * @private
   */
  _mergeConfigs(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._mergeConfigs(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Get nested value from object using dot notation
   * @private
   */
  _getNestedValue(obj, path, defaultValue) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : defaultValue;
    }, obj);
  }

  /**
   * Set nested value in object using dot notation
   * @private
   */
  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }
}

/**
 * Get available environment names
 * @param {boolean} includeCustom - Whether to include custom environments
 * @returns {string[]} Array of available environment names
 */
function getAvailableEnvironments(includeCustom = true) {
  const standardEnvs = Object.keys(envConfigs);
  
  if (includeCustom) {
    const customEnvs = Object.keys(customEnvConfigs);
    return [...new Set([...standardEnvs, ...customEnvs])]; // Remove duplicates
  }
  
  return standardEnvs;
}

/**
 * Create a configuration instance for a specific environment
 * @param {string} environment - Environment name
 * @returns {ModelManagementConfig} Configuration instance
 */
function createConfigForEnvironment(environment) {
  return new ModelManagementConfig(environment);
}

// Export singleton instance and class
const config = new ModelManagementConfig();

module.exports = {
  ModelManagementConfig,
  config,
  defaultConfig,
  environmentConfigs,
  getAvailableEnvironments,
  createConfigForEnvironment
};