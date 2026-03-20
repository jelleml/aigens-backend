/**
 * Enhanced Structured Logger for Centralized Logging System
 * 
 * Extends the existing model-management StructuredLogger with verbosity awareness,
 * new convenience methods for request/response and audit logging, context enrichment,
 * correlation ID integration, and performance monitoring capabilities.
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { 
  getVerbosityConfig, 
  getDefaultVerbosityLevel,
  isLevelEnabled,
  getFileLogLevel,
  getConsoleLogLevel,
  isPerformanceLoggingEnabled,
  isAuditLoggingEnabled,
  isMetricsEnabled
} = require('../config/verbosity-levels');
const loggingConfig = require('../config/logging-config');
const LoggingErrorHandler = require('./logging-error-handler');

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
 * Default configuration for the enhanced logger
 */
const DEFAULT_CONFIG = {
  verbosityLevel: process.env.LOGGING_VERBOSITY || getDefaultVerbosityLevel(),
  maxFiles: 5,
  maxSize: '20m',
  dirname: path.join(process.cwd(), 'logs', 'default'),
  enableConsole: process.env.NODE_ENV !== 'production',
  enableFile: true,
  enableMetrics: true,
  correlationIdHeader: 'x-correlation-id'
};

/**
 * Enhanced Structured Logger class
 */
class StructuredLogger {
  /**
   * @param {Object} options - Logger configuration options
   * @param {string} options.service - Service name for the logger
   * @param {string} options.component - Component name (optional)
   * @param {Object} options.config - Logger configuration overrides
   * @param {Object} options.context - Default context to include in all logs
   * @param {Object} options.correlationManager - Correlation manager instance
   * @param {Object} options.metricsCollector - Metrics collector instance
   */
  constructor(options = {}) {
    const {
      service = 'default',
      component = null,
      config = {},
      context = {},
      correlationManager = null,
      metricsCollector = null
    } = options;

    this.service = service;
    this.component = component;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.defaultContext = context;
    this.correlationManager = correlationManager;
    this.metricsCollector = metricsCollector;
    
    // Get verbosity configuration
    this.verbosityConfig = getVerbosityConfig(this.config.verbosityLevel);
    
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
    
    this.errorHandler = new LoggingErrorHandler();

    this.debug('[StructuredLogger] Enhanced logger initialized', {
      service: this.service,
      component: this.component,
      verbosityLevel: this.config.verbosityLevel,
      enabledLevels: this.verbosityConfig.levels
    });
  }

  /**
   * Create Winston logger instance with configured transports
   * @returns {winston.Logger} Configured Winston logger
   */
  createWinstonLogger() {
    const transports = [];

    // Calcola la data corrente in formato YYYY-MM-DD
    const dateStr = new Date().toISOString().split('T')[0];
    const serviceDir = loggingConfig.getServiceLogDirectory(this.service, this.config);
    const dateDir = loggingConfig.getDateLogDirectory(this.service, new Date(), this.config);

    // Console transport for development/debugging
    if (this.config.enableConsole) {
      transports.push(new winston.transports.Console({
        level: getConsoleLogLevel(this.config.verbosityLevel),
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
      this.ensureLogDirectory(dateDir);

      const fileLevel = getFileLogLevel(this.config.verbosityLevel);

      // Combined log file
      transports.push(new winston.transports.File({
        filename: path.join(dateDir, `combined-${dateStr}.log`),
        level: fileLevel,
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
        filename: path.join(dateDir, `error-${dateStr}.log`),
        level: 'error',
        maxFiles: this.config.maxFiles,
        maxsize: this.config.maxSize,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
      }));

      // Performance log file (only if performance logging is enabled)
      if (isPerformanceLoggingEnabled(this.config.verbosityLevel)) {
        transports.push(new winston.transports.File({
          filename: path.join(dateDir, `performance-${dateStr}.log`),
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

      // Audit log file (only if audit logging is enabled)
      if (isAuditLoggingEnabled(this.config.verbosityLevel)) {
        transports.push(new winston.transports.File({
          filename: path.join(dateDir, `audit-${dateStr}.log`),
          level: 'info',
          maxFiles: this.config.maxFiles,
          maxsize: this.config.maxSize,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format((info) => {
              // Only log audit-related entries
              return info.type === 'audit' ? info : false;
            })()
          )
        }));
      }
    }

    return winston.createLogger({
      levels: LOG_LEVELS,
      transports,
      exitOnError: false,
      // Global exception handling
      exceptionHandlers: this.config.enableFile ? [
        new winston.transports.File({
          filename: path.join(dateDir, `exceptions-${dateStr}.log`)
        })
      ] : [],
      rejectionHandlers: this.config.enableFile ? [
        new winston.transports.File({
          filename: path.join(dateDir, `rejections-${dateStr}.log`)
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
      type,
      ...meta
    } = info;

    let formatted = `${timestamp} [${level.toUpperCase()}]`;
    
    if (service) formatted += ` [${service}]`;
    if (component) formatted += ` [${component}]`;
    if (correlationId) formatted += ` [${correlationId}]`;
    if (type) formatted += ` [${type.toUpperCase()}]`;
    
    formatted += `: ${message}`;

    // Add metadata if present and not too verbose
    const metaKeys = Object.keys(meta);
    if (metaKeys.length > 0 && metaKeys.length <= 5) {
      formatted += ` ${JSON.stringify(meta)}`;
    } else if (metaKeys.length > 5) {
      formatted += `\n  [${metaKeys.length} additional fields]`;
    }

    return formatted;
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDirectory(dir) {
    const targetDir = dir || this.config.dirname;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  }

  /**
   * Check if a log level is enabled based on current verbosity
   * @param {string} level - Log level to check
   * @returns {boolean} Whether the level is enabled
   */
  isVerbosityEnabled(level) {
    return isLevelEnabled(this.config.verbosityLevel, level);
  }

  /**
   * Create enriched log context with correlation ID and default context
   * @param {Object} context - Additional context to merge
   * @returns {Object} Enriched context object
   */
  enrichContext(context = {}) {
    const baseContext = {
      service: this.service,
      component: this.component,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      ...this.defaultContext
    };

    // Add correlation ID from manager or local instance
    const correlationId = this.correlationManager ? 
      this.correlationManager.getCurrentCorrelationId() : 
      this.correlationId;
    
    if (correlationId) {
      baseContext.correlationId = correlationId;
    }

    return { ...baseContext, ...context };
  }

  /**
   * Record metrics if metrics collection is enabled
   * @param {string} level - Log level
   * @param {Object} context - Log context
   */
  recordMetrics(level, context = {}) {
    if (isMetricsEnabled(this.config.verbosityLevel) && this.metricsCollector) {
      this.metricsCollector.recordLog(this.service, this.component, level, context);
    }
    
    // Update local metrics
    this.metrics.logsWritten++;
    if (level === 'error') this.metrics.errorCount++;
    if (level === 'warn') this.metrics.warnCount++;
  }

  /**
   * Set correlation ID for request tracing
   * @param {string} correlationId - Correlation ID to set
   */
  setCorrelationId(correlationId) {
    this.correlationId = correlationId;
    
    if (this.correlationManager) {
      this.correlationManager.setCorrelationId(correlationId);
    }
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
      context: { ...this.defaultContext, ...context },
      correlationManager: this.correlationManager,
      metricsCollector: this.metricsCollector
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
    if (!this.isVerbosityEnabled('error')) return;

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

    const enrichedContext = this.enrichContext(context);
    this.recordMetrics('error', enrichedContext);
    try {
      this.logger.error(message, enrichedContext);
    } catch (err) {
      this.errorHandler.handle((msg, ctx) => Promise.resolve(this.logger.error(msg, ctx)), 'error', message, enrichedContext);
    }
  }

  /**
   * Log warning level message
   * @param {string} message - Log message  
   * @param {Object} context - Additional context
   */
  warn(message, context = {}) {
    if (!this.isVerbosityEnabled('warn')) return;

    const enrichedContext = this.enrichContext(context);
    this.recordMetrics('warn', enrichedContext);
    try {
      this.logger.warn(message, enrichedContext);
    } catch (err) {
      this.errorHandler.handle((msg, ctx) => Promise.resolve(this.logger.warn(msg, ctx)), 'warn', message, enrichedContext);
    }
  }

  /**
   * Log info level message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  info(message, context = {}) {
    if (!this.isVerbosityEnabled('info')) return;

    const enrichedContext = this.enrichContext(context);
    this.recordMetrics('info', enrichedContext);
    try {
      this.logger.info(message, enrichedContext);
    } catch (err) {
      this.errorHandler.handle((msg, ctx) => Promise.resolve(this.logger.info(msg, ctx)), 'info', message, enrichedContext);
    }
  }

  /**
   * Log HTTP request/response
   * @param {string} message - Log message
   * @param {Object} context - HTTP context (method, url, status, etc.)
   */
  http(message, context = {}) {
    if (!this.isVerbosityEnabled('http')) return;

    const enrichedContext = this.enrichContext({
      type: 'http',
      ...context
    });
    this.recordMetrics('http', enrichedContext);
    try {
      this.logger.http(message, enrichedContext);
    } catch (err) {
      this.errorHandler.handle((msg, ctx) => Promise.resolve(this.logger.http(msg, ctx)), 'http', message, enrichedContext);
    }
  }

  /**
   * Log verbose level message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  verbose(message, context = {}) {
    if (!this.isVerbosityEnabled('verbose')) return;

    const enrichedContext = this.enrichContext(context);
    this.recordMetrics('verbose', enrichedContext);
    try {
      this.logger.verbose(message, enrichedContext);
    } catch (err) {
      this.errorHandler.handle((msg, ctx) => Promise.resolve(this.logger.verbose(msg, ctx)), 'verbose', message, enrichedContext);
    }
  }

  /**
   * Log debug level message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  debug(message, context = {}) {
    if (!this.isVerbosityEnabled('debug')) return;

    const enrichedContext = this.enrichContext(context);
    this.recordMetrics('debug', enrichedContext);
    try {
      this.logger.debug(message, enrichedContext);
    } catch (err) {
      this.errorHandler.handle((msg, ctx) => Promise.resolve(this.logger.debug(msg, ctx)), 'debug', message, enrichedContext);
    }
  }

  /**
   * Log silly level message (most verbose)
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  silly(message, context = {}) {
    if (!this.isVerbosityEnabled('silly')) return;

    const enrichedContext = this.enrichContext(context);
    this.recordMetrics('silly', enrichedContext);
    try {
      this.logger.silly(message, enrichedContext);
    } catch (err) {
      this.errorHandler.handle((msg, ctx) => Promise.resolve(this.logger.silly(msg, ctx)), 'silly', message, enrichedContext);
    }
  }

  /**
   * Log HTTP request with standardized format
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {Object} context - Additional request context
   */
  request(method, url, context = {}) {
    this.http(`${method} ${url}`, {
      type: 'request',
      method: method.toUpperCase(),
      url,
      userAgent: context.userAgent,
      ip: context.ip,
      userId: context.userId,
      ...context
    });
  }

  /**
   * Log HTTP response with standardized format
   * @param {number} status - HTTP status code
   * @param {number} duration - Response time in milliseconds
   * @param {Object} context - Additional response context
   */
  response(status, duration, context = {}) {
    const level = status >= 400 ? 'warn' : 'http';
    
    this[level](`Response ${status}`, {
      type: 'response',
      status,
      duration,
      durationMs: duration,
      durationHuman: this.formatDuration(duration),
      ...context
    });
  }

  /**
   * Log audit trail entry
   * @param {string} action - Action performed
   * @param {Object} user - User information
   * @param {Object} context - Additional audit context
   */
  audit(action, user = {}, context = {}) {
    if (!isAuditLoggingEnabled(this.config.verbosityLevel)) return;

    this.info(`Audit: ${action}`, this.enrichContext({
      type: 'audit',
      action,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        ...user
      },
      auditTimestamp: new Date().toISOString(),
      ...context
    }));
  }

  /**
   * Log performance metrics
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {Object} context - Additional performance context
   */
  performance(operation, duration, context = {}) {
    if (!isPerformanceLoggingEnabled(this.config.verbosityLevel)) return;

    const enrichedContext = this.enrichContext({
      type: 'performance',
      operation,
      duration,
      durationMs: duration,
      durationHuman: this.formatDuration(duration),
      ...context
    });

    this.recordMetrics('info', enrichedContext);
    
    // Record in metrics collector if available
    if (this.metricsCollector) {
      this.metricsCollector.recordPerformance(operation, duration, this.service, context);
    }

    this.logger.info(`Performance: ${operation}`, enrichedContext);
  }

  /**
   * Start timing an operation
   * @param {string} operation - Operation name
   * @param {Object} context - Additional context for the timer
   * @returns {string} Timer ID
   */
  startTimer(operation, context = {}) {
    const timerId = `${operation}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.metrics.timings.set(timerId, {
      operation,
      startTime: Date.now(),
      startHrTime: process.hrtime(),
      context
    });
    
    this.debug(`Timer started: ${operation}`, { timerId, operation, ...context });
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
      timerId,
      preciseMs,
      ...timing.context,
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
    if (!this.isVerbosityEnabled(level)) return;

    const enrichedContext = this.enrichContext({
      type: 'event',
      event,
      ...data
    });

    this.recordMetrics(level, enrichedContext);
    this.logger[level](`Event: ${event}`, enrichedContext);
  }

  /**
   * Log security event (authentication, authorization, etc.)
   * @param {string} event - Security event name
   * @param {Object} context - Security context
   * @param {string} level - Log level (default: warn for security events)
   */
  security(event, context = {}, level = 'warn') {
    this[level](`Security: ${event}`, this.enrichContext({
      type: 'security',
      event,
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
      verbosityLevel: this.config.verbosityLevel,
      enabledLevels: this.verbosityConfig.levels
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
    return this.isVerbosityEnabled(level);
  }

  /**
   * Update verbosity level at runtime
   * @param {string} verbosityLevel - New verbosity level
   */
  setVerbosityLevel(verbosityLevel) {
    this.config.verbosityLevel = verbosityLevel;
    this.verbosityConfig = getVerbosityConfig(verbosityLevel);
    
    // Update Winston logger levels
    if (this.config.enableConsole) {
      const consoleTransport = this.logger.transports.find(t => t.name === 'console');
      if (consoleTransport) {
        consoleTransport.level = getConsoleLogLevel(verbosityLevel);
      }
    }
    
    if (this.config.enableFile) {
      const fileTransports = this.logger.transports.filter(t => t.filename);
      fileTransports.forEach(transport => {
        if (transport.filename.includes('combined.log')) {
          transport.level = getFileLogLevel(verbosityLevel);
        }
      });
    }
    
    this.info('Verbosity level updated', { 
      newLevel: verbosityLevel, 
      enabledLevels: this.verbosityConfig.levels 
    });
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

module.exports = StructuredLogger;