/**
 * Centralized Logging Configuration
 * 
 * Provides configuration management for the centralized logging system,
 * including verbosity levels, file organization, and transport settings.
 */

const path = require('path');
const { 
  getDefaultVerbosityLevel,
  getVerbosityConfig,
  getFileLogLevel,
  getConsoleLogLevel
} = require('./verbosity-levels');

/**
 * Environment-based configuration defaults
 */
const ENVIRONMENT_DEFAULTS = {
  development: {
    enableConsole: true,
    enableFile: true,
    enableMetrics: true,
    verbosityLevel: 'very-verbose'
  },
  test: {
    enableConsole: false,
    enableFile: false,
    enableMetrics: false,
    verbosityLevel: 'only-important-info'
  },
  production: {
    enableConsole: false,
    enableFile: true,
    enableMetrics: true,
    verbosityLevel: 'only-important-info'
  }
};

/**
 * Get environment-specific defaults
 * @returns {Object} Environment defaults
 */
function getEnvironmentDefaults() {
  const env = process.env.NODE_ENV || 'development';
  return ENVIRONMENT_DEFAULTS[env] || ENVIRONMENT_DEFAULTS.development;
}

/**
 * Get default logging configuration
 * @returns {Object} Default configuration object
 */
function getDefaultConfig() {
  const envDefaults = getEnvironmentDefaults();
  const verbosityLevel = process.env.LOG_VERBOSITY || envDefaults.verbosityLevel;
  const verbosityConfig = getVerbosityConfig(verbosityLevel);

  return {
    // Verbosity settings
    verbosityLevel,
    
    // Transport enablement
    enableConsole: process.env.LOG_ENABLE_CONSOLE === 'true' || envDefaults.enableConsole,
    enableFile: process.env.LOG_ENABLE_FILE === 'true' || envDefaults.enableFile,
    enableMetrics: process.env.LOG_ENABLE_METRICS === 'true' || envDefaults.enableMetrics,
    
    // Log levels for transports
    fileLevel: getFileLogLevel(verbosityLevel),
    consoleLevel: getConsoleLogLevel(verbosityLevel),
    
    // File configuration
    logDirectory: process.env.LOG_DIRECTORY || path.join(process.cwd(), 'logs'),
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    
    // File naming and organization
    datePattern: 'YYYY-MM-DD',
    auditFile: 'audit.log',
    errorFile: 'error.log',
    combinedFile: 'combined.log',
    performanceFile: 'performance.log',
    exceptionsFile: 'exceptions.log',
    rejectionsFile: 'rejections.log',
    
    // Correlation settings
    correlationIdHeader: process.env.CORRELATION_ID_HEADER || 'x-correlation-id',
    generateCorrelationId: true,
    
    // Performance settings
    enablePerformanceLogging: verbosityConfig.enablePerformanceLogging,
    enableAuditLogging: verbosityConfig.enableAuditLogging,
    
    // Application metadata
    appName: process.env.APP_NAME || 'aigens-backend',
    appVersion: process.env.APP_VERSION || '1.0.0',
    hostname: require('os').hostname(),
    
    // Error handling
    exitOnError: false,
    handleExceptions: true,
    handleRejections: true
  };
}

/**
 * Get service-specific log directory
 * @param {string} service - Service name
 * @param {Object} baseConfig - Base configuration
 * @returns {string} Service log directory path
 */
function getServiceLogDirectory(service, baseConfig = getDefaultConfig()) {
  // Ensure service is a valid string
  const serviceName = service && typeof service === 'string' ? service : 'default';
  
  // Ensure baseConfig and logDirectory are valid
  const config = baseConfig || getDefaultConfig();
  const logDir = config.logDirectory && typeof config.logDirectory === 'string' 
    ? config.logDirectory 
    : path.join(process.cwd() || '.', 'logs');
  
  return path.join(logDir, serviceName);
}

/**
 * Get date-based log directory
 * @param {string} service - Service name
 * @param {Date} date - Date for directory (defaults to today)
 * @param {Object} baseConfig - Base configuration
 * @returns {string} Date-based log directory path
 */
function getDateLogDirectory(service, date = new Date(), baseConfig = getDefaultConfig()) {
  // Ensure service is a valid string
  const serviceName = service && typeof service === 'string' ? service : 'default';
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
  return path.join(getServiceLogDirectory(serviceName, baseConfig), dateStr);
}

/**
 * Get log file path for a specific service and type
 * @param {string} service - Service name
 * @param {string} fileType - Log file type (combined, error, performance, etc.)
 * @param {Object} baseConfig - Base configuration
 * @returns {string} Full log file path
 */
function getLogFilePath(service, fileType, baseConfig = getDefaultConfig()) {
  // Ensure service is a valid string
  const serviceName = service && typeof service === 'string' ? service : 'default';
  const directory = getServiceLogDirectory(serviceName, baseConfig);
  
  const fileNames = {
    combined: baseConfig.combinedFile,
    error: baseConfig.errorFile,
    performance: baseConfig.performanceFile,
    audit: baseConfig.auditFile,
    exceptions: baseConfig.exceptionsFile,
    rejections: baseConfig.rejectionsFile
  };
  
  const fileName = fileNames[fileType] || `${fileType}.log`;
  return path.join(directory, fileName);
}

/**
 * Validate configuration object
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result with isValid and errors
 */
function validateConfig(config) {
  const errors = [];
  
  // Check required fields
  if (!config.verbosityLevel) {
    errors.push('verbosityLevel is required');
  }
  
  if (!config.logDirectory) {
    errors.push('logDirectory is required');
  }
  
  // Validate verbosity level
  const validVerbosityLevels = ['very-verbose', 'verbose', 'only-important-info'];
  if (!validVerbosityLevels.includes(config.verbosityLevel)) {
    errors.push(`Invalid verbosityLevel: ${config.verbosityLevel}. Must be one of: ${validVerbosityLevels.join(', ')}`);
  }
  
  // Validate numeric values
  if (config.maxFiles && (isNaN(config.maxFiles) || config.maxFiles < 1)) {
    errors.push('maxFiles must be a positive number');
  }
  
  // Validate boolean values
  const booleanFields = ['enableConsole', 'enableFile', 'enableMetrics', 'exitOnError', 'handleExceptions', 'handleRejections'];
  booleanFields.forEach(field => {
    if (config[field] !== undefined && typeof config[field] !== 'boolean') {
      errors.push(`${field} must be a boolean value`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Merge configuration with defaults
 * @param {Object} userConfig - User-provided configuration
 * @param {Object} defaults - Default configuration
 * @returns {Object} Merged configuration
 */
function mergeConfig(userConfig = {}, defaults = getDefaultConfig()) {
  const merged = { ...defaults, ...userConfig };
  
  // Re-calculate verbosity-dependent settings if verbosity changed
  if (userConfig.verbosityLevel && userConfig.verbosityLevel !== defaults.verbosityLevel) {
    const verbosityConfig = getVerbosityConfig(userConfig.verbosityLevel);
    merged.fileLevel = getFileLogLevel(userConfig.verbosityLevel);
    merged.consoleLevel = getConsoleLogLevel(userConfig.verbosityLevel);
    merged.enablePerformanceLogging = verbosityConfig.enablePerformanceLogging;
    merged.enableAuditLogging = verbosityConfig.enableAuditLogging;
  }
  
  return merged;
}

module.exports = {
  getDefaultConfig,
  getEnvironmentDefaults,
  getServiceLogDirectory,
  getDateLogDirectory,
  getLogFilePath,
  validateConfig,
  mergeConfig,
  ENVIRONMENT_DEFAULTS
};