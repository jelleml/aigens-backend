const fs = require('fs');
const path = require('path');
const os = require('os');
const { config, createConfigForEnvironment } = require('../../../config/model-management');
const ConfigurationValidator = require('./config-validator');

class ConfigurationManager {
  constructor(environment = process.env.NODE_ENV || 'development') {
    this.validator = new ConfigurationValidator();
    this.cliConfigPath = this._getCliConfigPath();
    this.cliConfig = this._loadCliConfig();
    this.environment = environment;
    this.configInstance = environment === (process.env.NODE_ENV || 'development') ? 
      config : createConfigForEnvironment(environment);
  }

  /**
   * Get configuration value with environment override support
   * @param {string} path - Configuration path (dot notation)
   * @param {any} defaultValue - Default value if not found
   * @returns {any} Configuration value
   */
  get(path, defaultValue = undefined) {
    // First check environment variables
    const envValue = this._getEnvironmentValue(path);
    if (envValue !== undefined) {
      return envValue;
    }

    // Then check CLI config
    const cliValue = this._getCliConfigValue(path);
    if (cliValue !== undefined) {
      return cliValue;
    }

    // Finally, use environment-specific config
    return this.configInstance.get(path, defaultValue);
  }

  /**
   * Set configuration value (persists to CLI config file)
   * @param {string} path - Configuration path
   * @param {any} value - Value to set
   */
  set(path, value) {
    this._setCliConfigValue(path, value);
    this._saveCliConfig();
  }

  /**
   * Update multiple configuration values
   * @param {object} updates - Object with path-value pairs
   */
  update(updates) {
    Object.entries(updates).forEach(([path, value]) => {
      this._setCliConfigValue(path, value);
    });
    this._saveCliConfig();
  }

  /**
   * Reset configuration to defaults
   * @param {string|null} path - Specific path to reset, or null for all
   */
  reset(path = null) {
    if (path) {
      this._deleteCliConfigValue(path);
    } else {
      this.cliConfig = {};
    }
    this._saveCliConfig();
  }

  /**
   * Get provider configuration with overrides applied
   * @param {string} providerName - Provider name
   * @returns {object} Provider configuration
   */
  getProviderConfig(providerName) {
    const baseConfig = this.configInstance.getProviderConfig(providerName);
    const overrides = this._getProviderOverrides(providerName);
    return { ...baseConfig, ...overrides };
  }

  /**
   * Get all enabled providers with configuration
   * @returns {Array} Array of enabled provider configurations
   */
  getEnabledProviders() {
    return this.configInstance.getEnabledProviders().map(provider => ({
      ...provider,
      ...this._getProviderOverrides(provider.name),
    }));
  }

  /**
   * Validate current configuration
   * @returns {object} Validation result
   */
  validate() {
    const currentConfig = this._getMergedConfig();
    const configValidation = this.validator.validate(currentConfig);
    const envValidation = this.validator.validateEnvironment();
    const depValidation = this.validator.validateDependencies();

    return {
      valid: configValidation.valid && envValidation.valid && depValidation.valid,
      config: configValidation,
      environment: envValidation,
      dependencies: depValidation,
    };
  }

  /**
   * Export configuration as JSON
   * @param {boolean} includeSecrets - Include sensitive values
   * @param {boolean} includeOverrides - Include CLI overrides
   * @returns {string} JSON configuration
   */
  export(includeSecrets = false, includeOverrides = true) {
    let exportConfig;
    
    if (includeOverrides) {
      exportConfig = this._getMergedConfig();
    } else {
      exportConfig = config.getAll();
    }

    return this._sanitizeForExport(exportConfig, includeSecrets);
  }

  /**
   * Import configuration from JSON
   * @param {string} jsonConfig - JSON configuration string
   * @param {boolean} merge - Merge with existing config or replace
   */
  import(jsonConfig, merge = true) {
    try {
      const importedConfig = JSON.parse(jsonConfig);
      
      if (merge) {
        this.cliConfig = this._deepMerge(this.cliConfig, importedConfig);
      } else {
        this.cliConfig = importedConfig;
      }
      
      this._saveCliConfig();
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error.message}`);
    }
  }

  /**
   * Get configuration file paths
   * @returns {object} File paths
   */
  getConfigPaths() {
    return {
      main: path.resolve(__dirname, '../../../config/model-management.js'),
      cli: this.cliConfigPath,
      env: path.resolve(process.cwd(), '.env'),
      envExample: path.resolve(__dirname, '../../../config/model-management.env.example'),
    };
  }

  /**
   * Create CLI configuration directory and file if they don't exist
   */
  initializeCliConfig() {
    const configDir = path.dirname(this.cliConfigPath);
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    if (!fs.existsSync(this.cliConfigPath)) {
      this._saveCliConfig();
    }
  }

  /**
   * Get configuration schema for validation
   * @returns {object} Configuration schema
   */
  getSchema() {
    return {
      execution: {
        strategy: { type: 'string', enum: ['sequential', 'parallel', 'mixed'] },
        maxConcurrency: { type: 'number', minimum: 1 },
        batchSize: { type: 'number', minimum: 1 },
        dryRun: { type: 'boolean' },
        autoConfirm: { type: 'boolean' },
      },
      timeouts: {
        provider: { type: 'number', minimum: 1000 },
        total: { type: 'number', minimum: 1000 },
        healthCheck: { type: 'number', minimum: 1000 },
        transaction: { type: 'number', minimum: 1000 },
        api: { type: 'number', minimum: 1000 },
      },
      retry: {
        maxAttempts: { type: 'number', minimum: 0 },
        initialDelay: { type: 'number', minimum: 100 },
        backoffMultiplier: { type: 'number', minimum: 1 },
        maxDelay: { type: 'number', minimum: 1000 },
        jitter: { type: 'boolean' },
      },
      logging: {
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
        directory: { type: 'string' },
        maxFiles: { type: 'number', minimum: 1 },
        enableConsole: { type: 'boolean' },
        enableFile: { type: 'boolean' },
      },
      cli: {
        theme: { type: 'string', enum: ['default', 'minimal', 'verbose'] },
        colors: { type: 'boolean' },
        outputFormat: { type: 'string', enum: ['table', 'json', 'minimal'] },
        pageSize: { type: 'number', minimum: 1 },
      },
    };
  }

  // Private methods

  _getCliConfigPath() {
    const configPath = config.get('cli.configPath');
    if (configPath) {
      return path.resolve(configPath.replace('~', os.homedir()));
    }
    
    const homeDir = os.homedir();
    return path.join(homeDir, '.model-management', 'config.json');
  }

  _loadCliConfig() {
    try {
      if (fs.existsSync(this.cliConfigPath)) {
        const configData = fs.readFileSync(this.cliConfigPath, 'utf8');
        return JSON.parse(configData);
      }
    } catch (error) {
      console.warn(`Failed to load CLI config: ${error.message}`);
    }
    return {};
  }

  _saveCliConfig() {
    try {
      const configDir = path.dirname(this.cliConfigPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(this.cliConfigPath, JSON.stringify(this.cliConfig, null, 2));
    } catch (error) {
      console.error(`Failed to save CLI config: ${error.message}`);
    }
  }

  _getEnvironmentValue(path) {
    // Convert path to environment variable name
    const envName = 'MODEL_MGMT_' + path
      .replace(/\./g, '_')
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toUpperCase();
    
    const value = process.env[envName];
    if (value === undefined) {
      return undefined;
    }
    
    // Type conversion
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value);
    
    return value;
  }

  _getCliConfigValue(path) {
    return this._getNestedValue(this.cliConfig, path);
  }

  _setCliConfigValue(path, value) {
    this._setNestedValue(this.cliConfig, path, value);
  }

  _deleteCliConfigValue(path) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj && obj[key], this.cliConfig);
    if (target && target.hasOwnProperty(lastKey)) {
      delete target[lastKey];
    }
  }

  _getProviderOverrides(providerName) {
    const overrides = {};
    const providerPath = `providers.${providerName}`;
    
    // Check CLI config
    const cliOverrides = this._getCliConfigValue(providerPath);
    if (cliOverrides) {
      Object.assign(overrides, cliOverrides);
    }
    
    // Check environment variables
    const envVars = [
      'priority', 'timeout', 'enabled', 'syncInterval', 'healthInterval'
    ];
    
    envVars.forEach(varName => {
      const envValue = this._getEnvironmentValue(`${providerPath}.${varName}`);
      if (envValue !== undefined) {
        overrides[varName] = envValue;
      }
    });
    
    return overrides;
  }

  _getMergedConfig() {
    const baseConfig = config.getAll();
    return this._deepMerge(baseConfig, this.cliConfig);
  }

  _deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  _getNestedValue(obj, path, defaultValue = undefined) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : defaultValue;
    }, obj);
  }

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

  _sanitizeForExport(config, includeSecrets) {
    const exportConfig = JSON.parse(JSON.stringify(config));
    
    if (!includeSecrets) {
      // Remove sensitive fields
      if (exportConfig.alerting?.channels?.email?.smtp?.auth) {
        exportConfig.alerting.channels.email.smtp.auth = {
          user: '[REDACTED]',
          pass: '[REDACTED]'
        };
      }
      
      if (exportConfig.alerting?.channels?.slack?.webhook) {
        exportConfig.alerting.channels.slack.webhook = '[REDACTED]';
      }
      
      if (exportConfig.alerting?.channels?.webhook?.url) {
        exportConfig.alerting.channels.webhook.url = '[REDACTED]';
      }
      
      if (exportConfig.alerting?.channels?.webhook?.headers) {
        exportConfig.alerting.channels.webhook.headers = '[REDACTED]';
      }
    }
    
    return JSON.stringify(exportConfig, null, 2);
  }
}

// Export singleton instance
const configManager = new ConfigurationManager();

module.exports = {
  ConfigurationManager,
  configManager,
};