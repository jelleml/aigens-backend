const path = require('path');
const fs = require('fs');

class ConfigurationValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate complete configuration object
   * @param {object} config - Configuration object to validate
   * @returns {object} Validation result with errors and warnings
   */
  validate(config) {
    this.errors = [];
    this.warnings = [];

    this._validateExecution(config.execution);
    this._validateTimeouts(config.timeouts);
    this._validateRetry(config.retry);
    this._validateCircuitBreaker(config.circuitBreaker);
    this._validateHealth(config.health);
    this._validateLogging(config.logging);
    this._validateMetrics(config.metrics);
    this._validateSync(config.sync);
    this._validateProviders(config.providers);
    this._validateCli(config.cli);
    this._validateApi(config.api);
    this._validateAlerting(config.alerting);
    this._validateDatabase(config.database);
    this._validateSecurity(config.security);

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Validate environment variables
   * @returns {object} Validation result
   */
  validateEnvironment() {
    this.errors = [];
    this.warnings = [];

    // Check required environment variables for each enabled provider
    const providers = ['openai', 'anthropic', 'deepseek', 'ideogram', 'together', 'openrouter'];
    
    providers.forEach(provider => {
      const enabled = process.env[`MODEL_MGMT_${provider.toUpperCase()}_ENABLED`] !== 'false';
      if (enabled) {
        const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];
        if (!apiKey) {
          this.warnings.push(`Missing API key for enabled provider: ${provider.toUpperCase()}_API_KEY`);
        }
      }
    });

    // Check database connection
    if (!process.env.DB_HOST && !process.env.DATABASE_URL) {
      this.errors.push('Database configuration missing: DB_HOST or DATABASE_URL required');
    }

    // Check alerting configuration if enabled
    if (process.env.MODEL_MGMT_ALERTING === 'true') {
      if (process.env.MODEL_MGMT_EMAIL_ALERTS === 'true') {
        this._validateEmailConfig();
      }
      if (process.env.MODEL_MGMT_SLACK_ALERTS === 'true') {
        this._validateSlackConfig();
      }
      if (process.env.MODEL_MGMT_WEBHOOK_ALERTS === 'true') {
        this._validateWebhookConfig();
      }
    }

    // Check log directory permissions
    const logDir = process.env.MODEL_MGMT_LOG_DIR || path.join(process.cwd(), 'logs', 'model-management');
    this._validateDirectoryAccess(logDir, 'Log directory');

    // Check CLI config directory
    const cliConfigPath = process.env.MODEL_MGMT_CLI_CONFIG;
    if (cliConfigPath) {
      const cliConfigDir = path.dirname(cliConfigPath);
      this._validateDirectoryAccess(cliConfigDir, 'CLI configuration directory');
    }

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Validate runtime dependencies
   * @returns {object} Validation result
   */
  validateDependencies() {
    this.errors = [];
    this.warnings = [];

    const requiredModules = [
      'winston',
      'cron',
      'inquirer',
      'cli-table3',
      'colors',
      'progress',
    ];

    const optionalModules = [
      'nodemailer', // For email alerts
      '@slack/webhook', // For Slack alerts
      'axios', // For webhook alerts
    ];

    // Check required modules
    requiredModules.forEach(moduleName => {
      try {
        require.resolve(moduleName);
      } catch (error) {
        this.errors.push(`Required module not found: ${moduleName}`);
      }
    });

    // Check optional modules
    optionalModules.forEach(moduleName => {
      try {
        require.resolve(moduleName);
      } catch (error) {
        this.warnings.push(`Optional module not found: ${moduleName} (may limit functionality)`);
      }
    });

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Validate cron expressions
   * @param {string} cronExpression - Cron expression to validate
   * @returns {boolean} Is valid cron expression
   */
  validateCronExpression(cronExpression) {
    // Basic cron validation (5 or 6 parts)
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5 && parts.length !== 6) {
      return false;
    }

    // Validate each part
    const patterns = [
      /^(\*|[0-5]?\d)$/, // minute
      /^(\*|[01]?\d|2[0-3])$/, // hour
      /^(\*|[01]?\d|2\d|3[01])$/, // day of month
      /^(\*|[01]?\d)$/, // month
      /^(\*|[0-6])$/, // day of week
    ];

    if (parts.length === 6) {
      patterns.unshift(/^(\*|\d{4})$/); // year (optional)
    }

    return parts.every((part, index) => {
      // Handle ranges, lists, and step values
      const cleanPart = part.replace(/\/\d+$/, '').replace(/-\d+$/, '').split(',')[0];
      return patterns[index].test(cleanPart);
    });
  }

  // Private validation methods

  _validateExecution(execution) {
    if (!execution) {
      this.errors.push('Missing execution configuration');
      return;
    }

    if (!['sequential', 'parallel', 'mixed'].includes(execution.strategy)) {
      this.errors.push('Invalid execution strategy. Must be: sequential, parallel, or mixed');
    }

    if (typeof execution.maxConcurrency !== 'number' || execution.maxConcurrency < 1) {
      this.errors.push('maxConcurrency must be a positive number');
    }

    if (typeof execution.batchSize !== 'number' || execution.batchSize < 1) {
      this.errors.push('batchSize must be a positive number');
    }

    if (execution.maxConcurrency > 10) {
      this.warnings.push('High concurrency may impact performance or hit rate limits');
    }
  }

  _validateTimeouts(timeouts) {
    if (!timeouts) {
      this.errors.push('Missing timeouts configuration');
      return;
    }

    const timeoutFields = ['provider', 'total', 'healthCheck', 'transaction', 'api'];
    timeoutFields.forEach(field => {
      if (typeof timeouts[field] !== 'number' || timeouts[field] <= 0) {
        this.errors.push(`timeout.${field} must be a positive number`);
      }
    });

    if (timeouts.provider >= timeouts.total) {
      this.warnings.push('Provider timeout should be less than total timeout');
    }

    if (timeouts.api > timeouts.provider) {
      this.warnings.push('API timeout should be less than provider timeout');
    }
  }

  _validateRetry(retry) {
    if (!retry) {
      this.errors.push('Missing retry configuration');
      return;
    }

    if (typeof retry.maxAttempts !== 'number' || retry.maxAttempts < 0) {
      this.errors.push('retry.maxAttempts must be a non-negative number');
    }

    if (typeof retry.initialDelay !== 'number' || retry.initialDelay <= 0) {
      this.errors.push('retry.initialDelay must be a positive number');
    }

    if (typeof retry.backoffMultiplier !== 'number' || retry.backoffMultiplier <= 0) {
      this.errors.push('retry.backoffMultiplier must be a positive number');
    }

    if (retry.maxAttempts > 5) {
      this.warnings.push('High retry attempts may cause long delays');
    }
  }

  _validateCircuitBreaker(circuitBreaker) {
    if (!circuitBreaker) {
      this.errors.push('Missing circuit breaker configuration');
      return;
    }

    if (typeof circuitBreaker.failureThreshold !== 'number' || circuitBreaker.failureThreshold < 1) {
      this.errors.push('circuitBreaker.failureThreshold must be a positive number');
    }

    if (typeof circuitBreaker.recoveryTimeout !== 'number' || circuitBreaker.recoveryTimeout <= 0) {
      this.errors.push('circuitBreaker.recoveryTimeout must be a positive number');
    }
  }

  _validateHealth(health) {
    if (!health) {
      this.errors.push('Missing health configuration');
      return;
    }

    if (typeof health.healthScoreThreshold !== 'number' || 
        health.healthScoreThreshold < 0 || health.healthScoreThreshold > 100) {
      this.errors.push('health.healthScoreThreshold must be between 0 and 100');
    }

    if (typeof health.errorRateThreshold !== 'number' || 
        health.errorRateThreshold < 0 || health.errorRateThreshold > 100) {
      this.errors.push('health.errorRateThreshold must be between 0 and 100');
    }
  }

  _validateLogging(logging) {
    if (!logging) {
      this.errors.push('Missing logging configuration');
      return;
    }

    if (!['debug', 'info', 'warn', 'error'].includes(logging.level)) {
      this.errors.push('logging.level must be: debug, info, warn, or error');
    }

    if (logging.directory && !path.isAbsolute(logging.directory)) {
      this.warnings.push('Logging directory should be an absolute path');
    }

    if (typeof logging.maxFiles !== 'number' || logging.maxFiles < 1) {
      this.errors.push('logging.maxFiles must be a positive number');
    }
  }

  _validateMetrics(metrics) {
    if (!metrics) {
      this.errors.push('Missing metrics configuration');
      return;
    }

    if (typeof metrics.collectInterval !== 'number' || metrics.collectInterval <= 0) {
      this.errors.push('metrics.collectInterval must be a positive number');
    }

    if (typeof metrics.retentionPeriod !== 'number' || metrics.retentionPeriod <= 0) {
      this.errors.push('metrics.retentionPeriod must be a positive number');
    }
  }

  _validateSync(sync) {
    if (!sync || !sync.schedules) {
      this.errors.push('Missing sync schedules configuration');
      return;
    }

    const scheduleFields = ['full', 'incremental', 'health', 'cleanup'];
    scheduleFields.forEach(field => {
      if (!sync.schedules[field]) {
        this.errors.push(`Missing sync schedule: ${field}`);
      } else if (!this.validateCronExpression(sync.schedules[field])) {
        this.errors.push(`Invalid cron expression for sync.schedules.${field}: ${sync.schedules[field]}`);
      }
    });
  }

  _validateProviders(providers) {
    if (!providers || typeof providers !== 'object') {
      this.errors.push('Missing providers configuration');
      return;
    }

    const requiredProviders = ['openai', 'anthropic', 'deepseek', 'ideogram', 'together', 'openrouter'];
    
    requiredProviders.forEach(providerName => {
      const provider = providers[providerName];
      if (!provider) {
        this.errors.push(`Missing provider configuration: ${providerName}`);
        return;
      }

      if (typeof provider.priority !== 'number' || provider.priority < 1) {
        this.errors.push(`providers.${providerName}.priority must be a positive number`);
      }

      if (!['direct', 'aggregator'].includes(provider.type)) {
        this.errors.push(`providers.${providerName}.type must be 'direct' or 'aggregator'`);
      }

      if (typeof provider.timeout !== 'number' || provider.timeout <= 0) {
        this.errors.push(`providers.${providerName}.timeout must be a positive number`);
      }

      if (provider.syncInterval && !this.validateCronExpression(provider.syncInterval)) {
        this.errors.push(`Invalid cron expression for providers.${providerName}.syncInterval`);
      }

      if (provider.healthInterval && !this.validateCronExpression(provider.healthInterval)) {
        this.errors.push(`Invalid cron expression for providers.${providerName}.healthInterval`);
      }
    });

    // Check for duplicate priorities
    const priorities = Object.values(providers)
      .filter(p => p && typeof p.priority === 'number')
      .map(p => p.priority);
    const duplicatePriorities = priorities.filter((p, i) => priorities.indexOf(p) !== i);
    if (duplicatePriorities.length > 0) {
      this.warnings.push(`Duplicate provider priorities found: ${duplicatePriorities.join(', ')}`);
    }
  }

  _validateCli(cli) {
    if (!cli) {
      this.errors.push('Missing CLI configuration');
      return;
    }

    if (!['table', 'json', 'minimal'].includes(cli.outputFormat)) {
      this.errors.push('cli.outputFormat must be: table, json, or minimal');
    }

    if (typeof cli.pageSize !== 'number' || cli.pageSize < 1) {
      this.errors.push('cli.pageSize must be a positive number');
    }
  }

  _validateApi(api) {
    if (!api) {
      this.errors.push('Missing API configuration');
      return;
    }

    if (!api.baseUrl || !this._isValidUrl(api.baseUrl)) {
      this.errors.push('api.baseUrl must be a valid URL');
    }

    if (typeof api.timeout !== 'number' || api.timeout <= 0) {
      this.errors.push('api.timeout must be a positive number');
    }
  }

  _validateAlerting(alerting) {
    if (!alerting || !alerting.enabled) {
      return; // Alerting is optional
    }

    if (alerting.channels) {
      if (alerting.channels.email?.enabled) {
        this._validateEmailAlerting(alerting.channels.email);
      }
      if (alerting.channels.slack?.enabled) {
        this._validateSlackAlerting(alerting.channels.slack);
      }
      if (alerting.channels.webhook?.enabled) {
        this._validateWebhookAlerting(alerting.channels.webhook);
      }
    }

    if (alerting.thresholds) {
      Object.entries(alerting.thresholds).forEach(([key, value]) => {
        if (typeof value !== 'number' || value < 0) {
          this.errors.push(`alerting.thresholds.${key} must be a non-negative number`);
        }
      });
    }
  }

  _validateDatabase(database) {
    if (!database) {
      this.errors.push('Missing database configuration');
      return;
    }

    if (typeof database.batchSize !== 'number' || database.batchSize < 1) {
      this.errors.push('database.batchSize must be a positive number');
    }

    if (database.pooling) {
      if (typeof database.pooling.min !== 'number' || database.pooling.min < 0) {
        this.errors.push('database.pooling.min must be a non-negative number');
      }
      if (typeof database.pooling.max !== 'number' || database.pooling.max < 1) {
        this.errors.push('database.pooling.max must be a positive number');
      }
      if (database.pooling.min >= database.pooling.max) {
        this.errors.push('database.pooling.min must be less than max');
      }
    }
  }

  _validateSecurity(security) {
    if (!security) {
      return; // Security configuration is optional
    }

    if (security.accessControl?.enabled && security.accessControl.roles) {
      if (!Array.isArray(security.accessControl.roles) || security.accessControl.roles.length === 0) {
        this.errors.push('security.accessControl.roles must be a non-empty array');
      }
    }
  }

  _validateEmailConfig() {
    if (!process.env.MODEL_MGMT_SMTP_HOST) {
      this.errors.push('Email alerts enabled but MODEL_MGMT_SMTP_HOST not configured');
    }
    if (!process.env.MODEL_MGMT_SMTP_USER) {
      this.errors.push('Email alerts enabled but MODEL_MGMT_SMTP_USER not configured');
    }
    if (!process.env.MODEL_MGMT_SMTP_PASS) {
      this.errors.push('Email alerts enabled but MODEL_MGMT_SMTP_PASS not configured');
    }
    if (!process.env.MODEL_MGMT_EMAIL_TO) {
      this.warnings.push('Email alerts enabled but no recipients configured (MODEL_MGMT_EMAIL_TO)');
    }
  }

  _validateSlackConfig() {
    if (!process.env.MODEL_MGMT_SLACK_WEBHOOK) {
      this.errors.push('Slack alerts enabled but MODEL_MGMT_SLACK_WEBHOOK not configured');
    } else if (!this._isValidUrl(process.env.MODEL_MGMT_SLACK_WEBHOOK)) {
      this.errors.push('MODEL_MGMT_SLACK_WEBHOOK must be a valid URL');
    }
  }

  _validateWebhookConfig() {
    if (!process.env.MODEL_MGMT_WEBHOOK_URL) {
      this.errors.push('Webhook alerts enabled but MODEL_MGMT_WEBHOOK_URL not configured');
    } else if (!this._isValidUrl(process.env.MODEL_MGMT_WEBHOOK_URL)) {
      this.errors.push('MODEL_MGMT_WEBHOOK_URL must be a valid URL');
    }
  }

  _validateEmailAlerting(emailConfig) {
    if (!emailConfig.smtp?.host) {
      this.errors.push('Email alerting enabled but SMTP host not configured');
    }
    if (!emailConfig.smtp?.auth?.user) {
      this.errors.push('Email alerting enabled but SMTP user not configured');
    }
    if (!emailConfig.smtp?.auth?.pass) {
      this.errors.push('Email alerting enabled but SMTP password not configured');
    }
    if (!emailConfig.to || emailConfig.to.length === 0) {
      this.warnings.push('Email alerting enabled but no recipients configured');
    }
  }

  _validateSlackAlerting(slackConfig) {
    if (!slackConfig.webhook) {
      this.errors.push('Slack alerting enabled but webhook URL not configured');
    } else if (!this._isValidUrl(slackConfig.webhook)) {
      this.errors.push('Slack webhook URL is not valid');
    }
  }

  _validateWebhookAlerting(webhookConfig) {
    if (!webhookConfig.url) {
      this.errors.push('Webhook alerting enabled but URL not configured');
    } else if (!this._isValidUrl(webhookConfig.url)) {
      this.errors.push('Webhook URL is not valid');
    }
  }

  _validateDirectoryAccess(dirPath, description) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      // Test write access
      const testFile = path.join(dirPath, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (error) {
      this.errors.push(`${description} not accessible: ${dirPath} (${error.message})`);
    }
  }

  _isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }
}

module.exports = ConfigurationValidator;