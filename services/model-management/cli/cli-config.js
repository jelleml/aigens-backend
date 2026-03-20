/**
 * CLI Configuration Management
 * 
 * Manages CLI settings, user preferences, and configuration persistence
 * with support for environment variables and configuration files.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

/**
 * Default CLI configuration
 */
const DEFAULT_CONFIG = {
  // Display preferences
  display: {
    theme: 'default',
    showTimestamps: true,
    showColors: true,
    progressBarStyle: 'standard',
    tableStyle: 'grid'
  },
  
  // Logging preferences
  logging: {
    level: 'info',
    enableFileLogging: true,
    logDirectory: path.join(os.homedir(), '.model-management', 'logs'),
    maxLogFiles: 10,
    maxLogSize: '10MB'
  },
  
  // Operation defaults
  operations: {
    defaultParallelism: 3,
    defaultTimeout: 300000, // 5 minutes
    autoConfirm: false,
    enableDryRun: false,
    retryAttempts: 3,
    retryDelay: 1000
  },
  
  // Provider settings
  providers: {
    defaultSyncMode: 'incremental',
    healthCheckInterval: 300000, // 5 minutes
    enableAutoRetry: true,
    maxConcurrentSyncs: 5
  },
  
  // Interactive mode settings
  interactive: {
    enableAutoComplete: true,
    historySize: 100,
    showHints: true,
    confirmDestructiveActions: true
  },
  
  // Output formatting
  output: {
    dateFormat: 'YYYY-MM-DD HH:mm:ss',
    numberFormat: 'en-US',
    truncateWidth: 100,
    enablePaging: true,
    pageSize: 20
  },
  
  // API settings
  api: {
    baseUrl: 'http://localhost:3000',
    timeout: 30000,
    retryCount: 3,
    rateLimitBackoff: true
  }
};

/**
 * CLIConfig class
 */
class CLIConfig {
  constructor(options = {}) {
    this.configDir = options.configDir || path.join(os.homedir(), '.model-management');
    this.configFile = path.join(this.configDir, 'config.json');
    this.historyFile = path.join(this.configDir, 'history.json');
    
    this.config = { ...DEFAULT_CONFIG };
    this.history = [];
    
    this.ensureConfigDirectory();
    this.loadConfig();
    this.loadHistory();
  }

  /**
   * Ensure configuration directory exists
   */
  ensureConfigDirectory() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // Create logs directory if logging is enabled
    const logsDir = this.config.logging.logDirectory;
    if (this.config.logging.enableFileLogging && !fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  /**
   * Load configuration from file
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const fileConfig = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        this.config = this.mergeConfig(DEFAULT_CONFIG, fileConfig);
      }
    } catch (error) {
      console.warn('Warning: Failed to load configuration file, using defaults');
    }
    
    // Override with environment variables
    this.applyEnvironmentVariables();
  }

  /**
   * Save configuration to file
   */
  saveConfig() {
    try {
      this.ensureConfigDirectory();
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
      return true;
    } catch (error) {
      console.error('Failed to save configuration:', error.message);
      return false;
    }
  }

  /**
   * Load command history
   */
  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const historyData = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        this.history = historyData.commands || [];
      }
    } catch (error) {
      console.warn('Warning: Failed to load command history');
      this.history = [];
    }
  }

  /**
   * Save command history
   */
  saveHistory() {
    try {
      const historyData = {
        commands: this.history.slice(-this.config.interactive.historySize),
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(this.historyFile, JSON.stringify(historyData, null, 2));
    } catch (error) {
      console.warn('Warning: Failed to save command history');
    }
  }

  /**
   * Apply environment variable overrides
   */
  applyEnvironmentVariables() {
    const envMappings = {
      'MODEL_MGMT_LOG_LEVEL': 'logging.level',
      'MODEL_MGMT_PARALLEL': 'operations.defaultParallelism',
      'MODEL_MGMT_TIMEOUT': 'operations.defaultTimeout',
      'MODEL_MGMT_API_URL': 'api.baseUrl',
      'MODEL_MGMT_AUTO_CONFIRM': 'operations.autoConfirm',
      'MODEL_MGMT_DRY_RUN': 'operations.enableDryRun',
      'MODEL_MGMT_THEME': 'display.theme',
      'MODEL_MGMT_COLORS': 'display.showColors'
    };

    Object.entries(envMappings).forEach(([envVar, configPath]) => {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        this.setNestedValue(this.config, configPath, this.parseEnvValue(envValue));
      }
    });
  }

  /**
   * Parse environment variable value to appropriate type
   * @param {string} value - Environment variable value
   * @returns {*} Parsed value
   */
  parseEnvValue(value) {
    // Boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Numeric values
    if (/^\d+$/.test(value)) return parseInt(value);
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value);
    
    // String values
    return value;
  }

  /**
   * Deep merge configuration objects
   * @param {Object} target - Target configuration
   * @param {Object} source - Source configuration
   * @returns {Object} Merged configuration
   */
  mergeConfig(target, source) {
    const result = { ...target };
    
    Object.keys(source).forEach(key => {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeConfig(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    });
    
    return result;
  }

  /**
   * Set nested configuration value
   * @param {Object} obj - Configuration object
   * @param {string} path - Dot-separated path
   * @param {*} value - Value to set
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    let current = obj;
    for (const key of keys) {
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[lastKey] = value;
  }

  /**
   * Get nested configuration value
   * @param {string} path - Dot-separated path
   * @param {*} defaultValue - Default value if not found
   * @returns {*} Configuration value
   */
  get(path, defaultValue = undefined) {
    const keys = path.split('.');
    let current = this.config;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }
    
    return current;
  }

  /**
   * Set configuration value
   * @param {string} path - Dot-separated path
   * @param {*} value - Value to set
   * @param {boolean} persist - Whether to save to file
   */
  set(path, value, persist = true) {
    this.setNestedValue(this.config, path, value);
    
    if (persist) {
      this.saveConfig();
    }
  }

  /**
   * Get entire configuration
   * @returns {Object} Configuration object
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration with object
   * @param {Object} updates - Configuration updates
   * @param {boolean} persist - Whether to save to file
   */
  update(updates, persist = true) {
    this.config = this.mergeConfig(this.config, updates);
    
    if (persist) {
      this.saveConfig();
    }
  }

  /**
   * Reset configuration to defaults
   * @param {boolean} persist - Whether to save to file
   */
  reset(persist = true) {
    this.config = { ...DEFAULT_CONFIG };
    
    if (persist) {
      this.saveConfig();
    }
  }

  /**
   * Add command to history
   * @param {string} command - Command to add
   * @param {Object} metadata - Command metadata
   */
  addToHistory(command, metadata = {}) {
    const historyEntry = {
      command,
      timestamp: new Date().toISOString(),
      success: metadata.success !== false,
      duration: metadata.duration,
      args: metadata.args,
      flags: metadata.flags
    };
    
    this.history.push(historyEntry);
    
    // Keep only recent history
    if (this.history.length > this.config.interactive.historySize) {
      this.history = this.history.slice(-this.config.interactive.historySize);
    }
    
    this.saveHistory();
  }

  /**
   * Get command history
   * @param {number} limit - Number of entries to return
   * @returns {Array} Command history
   */
  getHistory(limit = null) {
    if (limit) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  /**
   * Clear command history
   */
  clearHistory() {
    this.history = [];
    this.saveHistory();
  }

  /**
   * Get frequently used commands
   * @param {number} limit - Number of commands to return
   * @returns {Array} Most used commands
   */
  getFrequentCommands(limit = 10) {
    const commandCounts = {};
    
    this.history.forEach(entry => {
      const baseCommand = entry.command.split(' ')[0];
      commandCounts[baseCommand] = (commandCounts[baseCommand] || 0) + 1;
    });
    
    return Object.entries(commandCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([command, count]) => ({ command, count }));
  }

  /**
   * Validate configuration
   * @returns {Object} Validation result
   */
  validate() {
    const errors = [];
    const warnings = [];
    
    // Validate logging configuration
    if (this.config.logging.enableFileLogging) {
      const logDir = this.config.logging.logDirectory;
      if (!fs.existsSync(logDir)) {
        try {
          fs.mkdirSync(logDir, { recursive: true });
        } catch (error) {
          errors.push(`Cannot create log directory: ${logDir}`);
        }
      }
    }
    
    // Validate operation settings
    if (this.config.operations.defaultParallelism < 1 || this.config.operations.defaultParallelism > 20) {
      warnings.push('Default parallelism should be between 1 and 20');
    }
    
    if (this.config.operations.defaultTimeout < 1000) {
      warnings.push('Default timeout should be at least 1000ms');
    }
    
    // Validate API settings
    if (this.config.api.baseUrl && !this.config.api.baseUrl.startsWith('http')) {
      errors.push('API base URL must start with http:// or https://');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Open configuration in default editor
   * @returns {Promise<void>}
   */
  async openEditor() {
    return new Promise((resolve, reject) => {
      const editor = process.env.EDITOR || 'nano';
      
      const editorProcess = spawn(editor, [this.configFile], {
        stdio: 'inherit'
      });
      
      editorProcess.on('close', (code) => {
        if (code === 0) {
          // Reload configuration after editing
          this.loadConfig();
          resolve();
        } else {
          reject(new Error(`Editor exited with code ${code}`));
        }
      });
      
      editorProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Export configuration to file
   * @param {string} filePath - Export file path
   * @param {string} format - Export format (json, yaml)
   */
  export(filePath, format = 'json') {
    try {
      let content;
      
      if (format === 'json') {
        content = JSON.stringify(this.config, null, 2);
      } else if (format === 'yaml') {
        const yaml = require('js-yaml');
        content = yaml.dump(this.config);
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }
      
      fs.writeFileSync(filePath, content);
      return true;
    } catch (error) {
      console.error('Failed to export configuration:', error.message);
      return false;
    }
  }

  /**
   * Import configuration from file
   * @param {string} filePath - Import file path
   * @param {string} format - Import format (json, yaml)
   * @param {boolean} merge - Whether to merge with existing config
   */
  import(filePath, format = 'json', merge = true) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let importedConfig;
      
      if (format === 'json') {
        importedConfig = JSON.parse(content);
      } else if (format === 'yaml') {
        const yaml = require('js-yaml');
        importedConfig = yaml.load(content);
      } else {
        throw new Error(`Unsupported import format: ${format}`);
      }
      
      if (merge) {
        this.config = this.mergeConfig(this.config, importedConfig);
      } else {
        this.config = { ...DEFAULT_CONFIG, ...importedConfig };
      }
      
      this.saveConfig();
      return true;
    } catch (error) {
      console.error('Failed to import configuration:', error.message);
      return false;
    }
  }

  /**
   * Get configuration schema for validation
   * @returns {Object} Configuration schema
   */
  getSchema() {
    return {
      display: {
        theme: { type: 'string', enum: ['default', 'dark', 'light'] },
        showTimestamps: { type: 'boolean' },
        showColors: { type: 'boolean' },
        progressBarStyle: { type: 'string', enum: ['standard', 'compact', 'minimal'] },
        tableStyle: { type: 'string', enum: ['grid', 'simple', 'minimal'] }
      },
      logging: {
        level: { type: 'string', enum: ['error', 'warn', 'info', 'debug'] },
        enableFileLogging: { type: 'boolean' },
        logDirectory: { type: 'string' },
        maxLogFiles: { type: 'number', min: 1, max: 100 },
        maxLogSize: { type: 'string' }
      },
      operations: {
        defaultParallelism: { type: 'number', min: 1, max: 20 },
        defaultTimeout: { type: 'number', min: 1000 },
        autoConfirm: { type: 'boolean' },
        enableDryRun: { type: 'boolean' },
        retryAttempts: { type: 'number', min: 0, max: 10 },
        retryDelay: { type: 'number', min: 100 }
      }
    };
  }
}

module.exports = { CLIConfig, DEFAULT_CONFIG };