/**
 * Structured Logger for Model Management System
 * 
 * Provides comprehensive logging capabilities with structured output,
 * multiple log levels, context preservation, and performance tracking.
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Log levels with their numeric priorities
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
 * Default configuration for the logger
 */
const DEFAULT_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  maxFiles: 5,
  maxSize: '20m',
  dirname: path.join(process.cwd(), 'logs', 'model-management'),
  enableConsole: process.env.NODE_ENV !== 'production',
  enableFile: true,
  enableMetrics: true,
  correlationIdHeader: 'x-correlation-id'
};

/**
 * Structured Logger class
 */
class StructuredLogger {
  /**
   * @param {Object} options - Logger configuration options
   * @param {string} options.service - Service name for the logger
   * @param {string} options.component - Component name (optional)
   * @param {Object} options.config - Logger configuration overrides
   * @param {Object} options.context - Default context to include in all logs
   */
  constructor(options = {}) {
    const {
      service = 'model-management',
      component = null,
      config = {},
      context = {}
    } = options;

    this.service = service;
    this.component = component;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.defaultContext = context;
    
    // Performance tracking
    this.metrics = {
      logsWritten: 0,
      errorCount: 0,
      warnCount: 0,
      timings: new Map()
    };

    // Initialize Winston logger
    this.logger = this.createWinstonLogger();
    
    // Correlation ID for request tracing
    this.correlationId = null;
    
    this.debug('[StructuredLogger] Initialized', {
      service: this.service,
      component: this.component,
      level: this.config.level
    });
  }

  /**
   * Create Winston logger instance with configured transports
   * @returns {winston.Logger} Configured Winston logger
   */
  createWinstonLogger() {
    const transports = [];

    // Console transport for development/debugging
    if (this.config.enableConsole) {
      transports.push(new winston.transports.Console({
        level: this.config.level,
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.printf(this.consoleFormatter.bind(this))
        )
      }));
    }

    // File transports for persistent logging
    if (this.config.enableFile) {
      // Ensure log directory exists
      this.ensureLogDirectory();

      // Combined log file
      transports.push(new winston.transports.File({
        filename: path.join(this.config.dirname, 'combined.log'),
        level: this.config.level,
        maxFiles: this.config.maxFiles,
        maxsize: this.config.maxSize,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
      }));

      // Error-only log file
      transports.push(new winston.transports.File({
        filename: path.join(this.config.dirname, 'error.log'),
        level: 'error',
        maxFiles: this.config.maxFiles,
        maxsize: this.config.maxSize,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
      }));

      // Performance log file
      transports.push(new winston.transports.File({
        filename: path.join(this.config.dirname, 'performance.log'),
        level: 'info',
        maxFiles: this.config.maxFiles,
        maxsize: this.config.maxSize,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
          winston.format((info) => {
            // Only log performance-related entries
            return info.type === 'performance' ? info : false;
          })()
        )
      }));
    }

    return winston.createLogger({
      levels: LOG_LEVELS,
      transports,
      exitOnError: false,
      // Global exception handling
      exceptionHandlers: this.config.enableFile ? [
        new winston.transports.File({
          filename: path.join(this.config.dirname, 'exceptions.log')
        })
      ] : [],
      rejectionHandlers: this.config.enableFile ? [
        new winston.transports.File({
          filename: path.join(this.config.dirname, 'rejections.log')
        })
      ] : []
    });
  }

  /**
   * Console formatter for readable development output
   * @param {Object} info - Log info object
   * @returns {string} Formatted log message
   */
  consoleFormatter(info) {
    const {
      timestamp,
      level,
      message,
      service,
      component,
      correlationId,
      ...meta
    } = info;

    let formatted = `${timestamp} [${level.toUpperCase()}]`;
    
    if (service) formatted += ` [${service}]`;
    if (component) formatted += ` [${component}]`;
    if (correlationId) formatted += ` [${correlationId}]`;
    
    formatted += `: ${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      formatted += `\n  ${JSON.stringify(meta, null, 2)}`;
    }

    return formatted;
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.config.dirname)) {
      fs.mkdirSync(this.config.dirname, { recursive: true });
    }
  }

  /**
   * Create enriched log context
   * @param {Object} context - Additional context to merge
   * @returns {Object} Enriched context object
   */
  createContext(context = {}) {
    return {
      service: this.service,
      component: this.component,
      correlationId: this.correlationId,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      ...this.defaultContext,
      ...context
    };
  }

  /**
   * Set correlation ID for request tracing
   * @param {string} correlationId - Correlation ID to set
   */
  setCorrelationId(correlationId) {
    this.correlationId = correlationId;
  }

  /**
   * Generate new correlation ID
   * @returns {string} Generated correlation ID
   */
  generateCorrelationId() {
    const correlationId = crypto.randomBytes(8).toString('hex');
    this.setCorrelationId(correlationId);
    return correlationId;
  }

  /**
   * Create child logger with additional context
   * @param {Object} context - Additional context for child logger
   * @returns {StructuredLogger} Child logger instance
   */
  child(context = {}) {
    const childLogger = new StructuredLogger({
      service: this.service,
      component: this.component,
      config: this.config,
      context: { ...this.defaultContext, ...context }
    });
    
    childLogger.correlationId = this.correlationId;
    return childLogger;
  }

  /**
   * Log error level message
   * @param {string} message - Log message
   * @param {Object|Error} context - Additional context or error object
   */
  error(message, context = {}) {
    // Check if logger is still writable
    if (this.logger.writable === false || this.logger.destroyed) {
      console.error('[StructuredLogger] Logger unavailable:', message, context);
      return;
    }

    this.metrics.errorCount++;
    this.metrics.logsWritten++;

    if (context instanceof Error) {
      context = {
        error: {
          name: context.name,
          message: context.message,
          stack: context.stack,
          code: context.code
        }
      };
    }

    try {
      this.logger.error(message, this.createContext(context));
    } catch (writeError) {
      // Fallback to console if logger fails
      console.error('[StructuredLogger] Write failed, using console:', message, context);
    }
  }

  /**
   * Log warning level message
   * @param {string} message - Log message  
   * @param {Object} context - Additional context
   */
  warn(message, context = {}) {
    this.metrics.warnCount++;
    this.metrics.logsWritten++;
    this.logger.warn(message, this.createContext(context));
  }

  /**
   * Log info level message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  info(message, context = {}) {
    this.metrics.logsWritten++;
    this.logger.info(message, this.createContext(context));
  }

  /**
   * Log HTTP request/response
   * @param {string} message - Log message
   * @param {Object} context - HTTP context (method, url, status, etc.)
   */
  http(message, context = {}) {
    this.metrics.logsWritten++;
    this.logger.http(message, this.createContext({
      type: 'http',
      ...context
    }));
  }

  /**
   * Log verbose level message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  verbose(message, context = {}) {
    this.metrics.logsWritten++;
    this.logger.verbose(message, this.createContext(context));
  }

  /**
   * Log debug level message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  debug(message, context = {}) {
    this.metrics.logsWritten++;
    this.logger.debug(message, this.createContext(context));
  }

  /**
   * Log silly level message (most verbose)
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  silly(message, context = {}) {
    this.metrics.logsWritten++;
    this.logger.silly(message, this.createContext(context));
  }

  /**
   * Log performance metrics
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {Object} context - Additional performance context
   */
  performance(operation, duration, context = {}) {
    this.metrics.logsWritten++;
    this.logger.info(`Performance: ${operation}`, this.createContext({
      type: 'performance',
      operation,
      duration,
      durationMs: duration,
      durationHuman: this.formatDuration(duration),
      ...context
    }));
  }

  /**
   * Start timing an operation
   * @param {string} operation - Operation name
   * @returns {string} Timer ID
   */
  startTimer(operation) {
    const timerId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.metrics.timings.set(timerId, {
      operation,
      startTime: Date.now(),
      startHrTime: process.hrtime()
    });
    return timerId;
  }

  /**
   * End timing an operation and log performance
   * @param {string} timerId - Timer ID from startTimer
   * @param {Object} context - Additional context for performance log
   */
  endTimer(timerId, context = {}) {
    const timing = this.metrics.timings.get(timerId);
    if (!timing) {
      this.warn('Timer not found', { timerId });
      return;
    }

    const endTime = Date.now();
    const endHrTime = process.hrtime(timing.startHrTime);
    const duration = endTime - timing.startTime;
    const preciseMs = endHrTime[0] * 1000 + endHrTime[1] / 1000000;

    this.performance(timing.operation, duration, {
      preciseMs,
      ...context
    });

    this.metrics.timings.delete(timerId);
  }

  /**
   * Log structured event
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @param {string} level - Log level (default: info)
   */
  event(event, data = {}, level = 'info') {
    this.metrics.logsWritten++;
    this.logger[level](`Event: ${event}`, this.createContext({
      type: 'event',
      event,
      ...data
    }));
  }

  /**
   * Log audit trail entry
   * @param {string} action - Action performed
   * @param {Object} context - Audit context
   */
  audit(action, context = {}) {
    this.metrics.logsWritten++;
    this.logger.info(`Audit: ${action}`, this.createContext({
      type: 'audit',
      action,
      timestamp: new Date().toISOString(),
      ...context
    }));
  }

  /**
   * Format duration in human-readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
    return `${(ms / 3600000).toFixed(2)}h`;
  }

  /**
   * Get logger metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      logsWritten: this.metrics.logsWritten,
      errorCount: this.metrics.errorCount,
      warnCount: this.metrics.warnCount,
      activeTimers: this.metrics.timings.size,
      service: this.service,
      component: this.component,
      level: this.config.level
    };
  }

  /**
   * Reset metrics counters
   */
  resetMetrics() {
    this.metrics.logsWritten = 0;
    this.metrics.errorCount = 0;
    this.metrics.warnCount = 0;
    this.metrics.timings.clear();
  }

  /**
   * Check if log level is enabled
   * @param {string} level - Log level to check
   * @returns {boolean} Whether the level is enabled
   */
  isLevelEnabled(level) {
    const currentLevel = LOG_LEVELS[this.config.level] || LOG_LEVELS.info;
    const checkLevel = LOG_LEVELS[level] || LOG_LEVELS.info;
    return checkLevel <= currentLevel;
  }

  /**
   * Flush all log transports
   * @returns {Promise<void>}
   */
  async flush() {
    return new Promise((resolve) => {
      this.logger.on('finish', resolve);
      this.logger.end();
    });
  }
}

/**
 * Create logger factory function
 * @param {Object} defaultConfig - Default configuration for all loggers
 * @returns {Function} Logger factory function
 */
function createLoggerFactory(defaultConfig = {}) {
  return (options = {}) => {
    return new StructuredLogger({
      ...defaultConfig,
      ...options,
      config: { ...defaultConfig.config, ...options.config }
    });
  };
}

/**
 * Default logger instance
 */
const defaultLogger = new StructuredLogger({
  service: 'model-management',
  component: 'default'
});

module.exports = {
  StructuredLogger,
  createLoggerFactory,
  LOG_LEVELS,
  defaultLogger
};