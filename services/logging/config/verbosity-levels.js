/**
 * Verbosity Level Configuration
 * 
 * Defines the three main verbosity modes for the centralized logging system:
 * - very-verbose: Maximum logging for development and debugging
 * - verbose: Standard operational logging
 * - only-important-info: Production logging - errors and warnings only
 */

/**
 * Winston log levels with their numeric priorities
 */
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

/**
 * Verbosity level definitions
 */
const VERBOSITY_LEVELS = {
  'very-verbose': {
    levels: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'],
    description: 'Maximum logging for development and debugging',
    fileLevel: 'debug',
    consoleLevel: 'debug',
    enablePerformanceLogging: true,
    enableAuditLogging: true,
    enableMetrics: true
  },
  'verbose': {
    levels: ['error', 'warn', 'info', 'http'],
    description: 'Standard operational logging',
    fileLevel: 'info',
    consoleLevel: 'info',
    enablePerformanceLogging: true,
    enableAuditLogging: true,
    enableMetrics: true
  },
  'only-important-info': {
    levels: ['error', 'warn'],
    description: 'Production logging - errors and warnings only',
    fileLevel: 'warn',
    consoleLevel: 'error',
    enablePerformanceLogging: false,
    enableAuditLogging: true,
    enableMetrics: false
  }
};

/**
 * Get verbosity configuration by level name
 * @param {string} level - Verbosity level name
 * @returns {Object} Verbosity configuration
 */
function getVerbosityConfig(level = 'verbose') {
  const config = VERBOSITY_LEVELS[level];
  if (!config) {
    console.warn(`Unknown verbosity level: ${level}, defaulting to 'verbose'`);
    return VERBOSITY_LEVELS.verbose;
  }
  return config;
}

/**
 * Get default verbosity level based on environment
 * @returns {string} Default verbosity level
 */
function getDefaultVerbosityLevel() {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return 'only-important-info';
    case 'test':
      return 'only-important-info';
    case 'development':
    default:
      return 'very-verbose';
  }
}

/**
 * Check if a log level is enabled for the given verbosity
 * @param {string} verbosityLevel - Current verbosity level
 * @param {string} logLevel - Log level to check
 * @returns {boolean} Whether the log level is enabled
 */
function isLevelEnabled(verbosityLevel, logLevel) {
  const config = getVerbosityConfig(verbosityLevel);
  return config.levels.includes(logLevel);
}

/**
 * Get Winston log level for file transport based on verbosity
 * @param {string} verbosityLevel - Current verbosity level
 * @returns {string} Winston log level
 */
function getFileLogLevel(verbosityLevel) {
  const config = getVerbosityConfig(verbosityLevel);
  return config.fileLevel;
}

/**
 * Get Winston log level for console transport based on verbosity
 * @param {string} verbosityLevel - Current verbosity level
 * @returns {string} Winston log level
 */
function getConsoleLogLevel(verbosityLevel) {
  const config = getVerbosityConfig(verbosityLevel);
  return config.consoleLevel;
}

/**
 * Check if performance logging is enabled for verbosity level
 * @param {string} verbosityLevel - Current verbosity level
 * @returns {boolean} Whether performance logging is enabled
 */
function isPerformanceLoggingEnabled(verbosityLevel) {
  const config = getVerbosityConfig(verbosityLevel);
  return config.enablePerformanceLogging;
}

/**
 * Check if audit logging is enabled for verbosity level
 * @param {string} verbosityLevel - Current verbosity level
 * @returns {boolean} Whether audit logging is enabled
 */
function isAuditLoggingEnabled(verbosityLevel) {
  const config = getVerbosityConfig(verbosityLevel);
  return config.enableAuditLogging;
}

/**
 * Check if metrics collection is enabled for verbosity level
 * @param {string} verbosityLevel - Current verbosity level
 * @returns {boolean} Whether metrics collection is enabled
 */
function isMetricsEnabled(verbosityLevel) {
  const config = getVerbosityConfig(verbosityLevel);
  return config.enableMetrics;
}

module.exports = {
  LOG_LEVELS,
  VERBOSITY_LEVELS,
  getVerbosityConfig,
  getDefaultVerbosityLevel,
  isLevelEnabled,
  getFileLogLevel,
  getConsoleLogLevel,
  isPerformanceLoggingEnabled,
  isAuditLoggingEnabled,
  isMetricsEnabled
};