/**
 * Centralized Logging System - Main Export
 * 
 * Provides unified logging capabilities across the entire AIGens backend application.
 * Builds upon the existing model-management logging infrastructure and extends it
 * to support multiple verbosity levels, correlation tracking, and application-wide usage.
 */

const LoggerFactory = require('./core/logger-factory');
const StructuredLogger = require('./core/structured-logger');
const CorrelationManager = require('./core/correlation-manager');
const MetricsCollector = require('./core/metrics-collector');
const ConsoleAdapter = require('./adapters/console-adapter');
const correlationMiddleware = require('./middleware/correlation-middleware');
const requestLoggerMiddleware = require('./middleware/request-logger');
const loggingConfig = require('./config/logging-config');

// Create default instances
const defaultCorrelationManager = new CorrelationManager();
const defaultMetricsCollector = new MetricsCollector();
const defaultFactory = new LoggerFactory({
  ...loggingConfig.getDefaultConfig(),
  correlationManager: defaultCorrelationManager,
  metricsCollector: defaultMetricsCollector
});

/**
 * Get logger instance for a service/component
 * @param {string} service - Service name
 * @param {string} component - Component name (optional)
 * @param {Object} context - Additional context (optional)
 * @returns {StructuredLogger} Logger instance
 */
function getLogger(service, component = null, context = {}) {
  return defaultFactory.getLogger(service, component, context);
}

/**
 * Get logger with automatic service/component detection
 * @param {Object} context - Additional context (optional)
 * @returns {StructuredLogger} Logger instance
 */
function getAutoLogger(context = {}) {
  return defaultFactory.getAutoLogger(context);
}

/**
 * Create child logger with additional context
 * @param {StructuredLogger} parentLogger - Parent logger instance
 * @param {Object} context - Additional context
 * @returns {StructuredLogger} Child logger instance
 */
function createChildLogger(parentLogger, context = {}) {
  return defaultFactory.createChildLogger(parentLogger, context);
}

/**
 * Replace global console with structured logging
 * @param {StructuredLogger} logger - Logger to use for console replacement
 */
function replaceConsole(logger = null) {
  if (!logger) {
    logger = getLogger('console', 'global');
  }
  const adapter = new ConsoleAdapter(logger);
  global.console = adapter;
}

/**
 * Get correlation ID for current context
 * @returns {string|null} Current correlation ID
 */
function getCurrentCorrelationId() {
  return defaultCorrelationManager.getCurrentCorrelationId();
}

/**
 * Set correlation ID for current context
 * @param {string} correlationId - Correlation ID to set
 * @param {Object} context - Additional context
 * @returns {boolean} Whether the correlation ID was set successfully
 */
function setCorrelationId(correlationId, context = {}) {
  return defaultCorrelationManager.setCorrelationId(correlationId, context);
}

/**
 * Create a new correlation ID
 * @param {Object} context - Additional context
 * @param {Object} options - Generation options
 * @returns {string} Generated correlation ID
 */
function createCorrelation(context = {}, options = {}) {
  return defaultCorrelationManager.createCorrelation(context, options);
}

/**
 * Run a function with a specific correlation context
 * @param {string} correlationId - Correlation ID to use
 * @param {Object} context - Additional context
 * @param {Function} fn - Function to run
 * @returns {*} Result of the function
 */
function withCorrelation(correlationId, context, fn) {
  return defaultCorrelationManager.withCorrelation(correlationId, context, fn);
}

/**
 * Initialize logging system for application startup
 * @param {Object} config - Configuration overrides
 * @returns {Object} Initialized logging components
 */
function initializeLogging(config = {}) {
  // Create new instances for this initialization
  const correlationManager = new CorrelationManager(config.correlation);
  const metricsCollector = new MetricsCollector(config.metrics);
  
  const factory = new LoggerFactory({
    ...loggingConfig.getDefaultConfig(),
    ...config,
    correlationManager,
    metricsCollector
  });
  
  const appLogger = factory.getLogger('app', 'startup');
  
  appLogger.info('Logging system initialized', {
    verbosity: factory.config.verbosityLevel,
    environment: process.env.NODE_ENV || 'development',
    logDirectory: factory.config.logDirectory
  });

  // Create middleware with the new instances
  const middleware = {
    correlation: correlationMiddleware({
      correlationManager,
      loggerFactory: factory
    }),
    correlationContext: correlationMiddleware.correlationContextMiddleware({
      correlationManager
    }),
    asyncCorrelation: correlationMiddleware.asyncCorrelationMiddleware({
      correlationManager
    }),
    correlationLocals: correlationMiddleware.correlationLocalsMiddleware({
      correlationManager
    }),
    requestLogger: requestLoggerMiddleware({
      loggerFactory: factory
    })
  };

  return {
    factory,
    logger: appLogger,
    correlationManager,
    metricsCollector,
    middleware,
    getLogger: factory.getLogger.bind(factory),
    withCorrelation: correlationManager.withCorrelation.bind(correlationManager)
  };
}

module.exports = {
  // Core exports
  LoggerFactory,
  StructuredLogger,
  CorrelationManager,
  MetricsCollector,
  
  // Factory functions
  getLogger,
  getAutoLogger,
  createChildLogger,
  
  // Correlation functions
  getCurrentCorrelationId,
  setCorrelationId,
  createCorrelation,
  withCorrelation,
  
  // Utilities
  replaceConsole,
  initializeLogging,
  
  // Middleware
  correlationMiddleware,
  requestLoggerMiddleware,
  errorLoggerMiddleware: requestLoggerMiddleware.errorLoggerMiddleware,
  correlationContextMiddleware: correlationMiddleware.correlationContextMiddleware,
  asyncCorrelationMiddleware: correlationMiddleware.asyncCorrelationMiddleware,
  correlationLocalsMiddleware: correlationMiddleware.correlationLocalsMiddleware,
  
  // Configuration
  config: loggingConfig,
  
  // Default instances
  defaultFactory,
  defaultLogger: getLogger('default', 'system'),
  defaultCorrelationManager
};