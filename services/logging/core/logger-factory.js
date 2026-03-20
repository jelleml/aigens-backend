/**
 * Logger Factory
 * 
 * Centralized factory for creating and managing logger instances across
 * the application. Provides logger caching, automatic service/component
 * detection, and child logger functionality.
 */

const StructuredLogger = require('./structured-logger');
const CorrelationManager = require('./correlation-manager');
const MetricsCollector = require('./metrics-collector');
const path = require('path');

/**
 * Logger Factory class
 */
class LoggerFactory {
  /**
   * @param {Object} config - Factory configuration
   */
  constructor(config = {}) {
    this.config = config;
    this.loggers = new Map();
    this.correlationManager = new CorrelationManager();
    this.metricsCollector = new MetricsCollector();
  }

  /**
   * Create or retrieve logger for a service/component
   * @param {string} service - Service name
   * @param {string} component - Component name (optional)
   * @param {Object} context - Additional context (optional)
   * @returns {StructuredLogger} Logger instance
   */
  getLogger(service, component = null, context = {}) {
    const key = this.createLoggerKey(service, component);
    
    if (!this.loggers.has(key)) {
      const logger = new StructuredLogger({
        service,
        component,
        config: this.config,
        context,
        correlationManager: this.correlationManager,
        metricsCollector: this.metricsCollector
      });
      this.loggers.set(key, logger);
    }
    
    const logger = this.loggers.get(key);
    
    // If additional context is provided, create a child logger
    if (Object.keys(context).length > 0) {
      return logger.child(context);
    }
    
    return logger;
  }

  /**
   * Create child logger with additional context
   * @param {StructuredLogger} parentLogger - Parent logger instance
   * @param {Object} context - Additional context
   * @returns {StructuredLogger} Child logger instance
   */
  createChildLogger(parentLogger, context = {}) {
    return parentLogger.child(context);
  }

  /**
   * Get logger with automatic service/component detection
   * @param {Object} context - Additional context (optional)
   * @returns {StructuredLogger} Logger instance
   */
  getAutoLogger(context = {}) {
    const caller = this.detectCaller();
    return this.getLogger(caller.service, caller.component, context);
  }

  /**
   * Detect calling service and component from stack trace
   * @returns {Object} Object with service and component names
   */
  detectCaller() {
    const stack = new Error().stack;
    const stackLines = stack.split('\n');
    
    // Skip the first few lines (Error, detectCaller, getAutoLogger)
    for (let i = 3; i < stackLines.length; i++) {
      const line = stackLines[i];
      const match = line.match(/at .* \((.+):(\d+):(\d+)\)/);
      
      if (match) {
        const filePath = match[1];
        const relativePath = path.relative(process.cwd(), filePath);
        
        // Skip internal logging files
        if (relativePath.includes('services/logging/')) {
          continue;
        }
        
        const pathParts = relativePath.split(path.sep);
        let service = 'unknown';
        let component = null;
        
        // Detect service from path structure
        if (pathParts.includes('api')) {
          service = 'api';
          const apiIndex = pathParts.indexOf('api');
          if (pathParts[apiIndex + 1] === 'v1' && pathParts[apiIndex + 2]) {
            component = pathParts[apiIndex + 2].replace('.js', '');
          }
        } else if (pathParts.includes('services')) {
          service = 'services';
          const servicesIndex = pathParts.indexOf('services');
          if (pathParts[servicesIndex + 1]) {
            component = pathParts[servicesIndex + 1].replace('.js', '');
          }
        } else if (pathParts.includes('controllers')) {
          service = 'controllers';
          const controllersIndex = pathParts.indexOf('controllers');
          if (pathParts[controllersIndex + 1]) {
            component = pathParts[controllersIndex + 1].replace('.js', '');
          }
        } else if (pathParts.includes('middlewares')) {
          service = 'middlewares';
          const middlewaresIndex = pathParts.indexOf('middlewares');
          if (pathParts[middlewaresIndex + 1]) {
            component = pathParts[middlewaresIndex + 1].replace('.js', '');
          }
        } else if (pathParts.includes('scripts')) {
          service = 'scripts';
          const scriptsIndex = pathParts.indexOf('scripts');
          if (pathParts[scriptsIndex + 1]) {
            component = pathParts[scriptsIndex + 1].replace('.js', '');
          }
        } else {
          // Try to extract service from first directory
          if (pathParts.length > 0) {
            service = pathParts[0];
            if (pathParts.length > 1) {
              component = pathParts[pathParts.length - 1].replace('.js', '');
            }
          }
        }
        
        return { service, component };
      }
    }
    
    return { service: 'unknown', component: 'unknown' };
  }

  /**
   * Create logger key for caching
   * @param {string} service - Service name
   * @param {string} component - Component name
   * @returns {string} Logger cache key
   */
  createLoggerKey(service, component) {
    return `${service}:${component || 'default'}`;
  }

  /**
   * Get all cached loggers
   * @returns {Map} Map of all cached loggers
   */
  getAllLoggers() {
    return new Map(this.loggers);
  }

  /**
   * Get logger statistics
   * @returns {Object} Factory statistics
   */
  getStatistics() {
    const stats = {
      totalLoggers: this.loggers.size,
      loggersByService: {},
      totalLogs: 0,
      totalErrors: 0,
      totalWarnings: 0
    };
    
    for (const [key, logger] of this.loggers) {
      const metrics = logger.getMetrics();
      const service = metrics.service;
      
      if (!stats.loggersByService[service]) {
        stats.loggersByService[service] = {
          count: 0,
          logs: 0,
          errors: 0,
          warnings: 0
        };
      }
      
      stats.loggersByService[service].count++;
      stats.loggersByService[service].logs += metrics.logsWritten;
      stats.loggersByService[service].errors += metrics.errorCount;
      stats.loggersByService[service].warnings += metrics.warnCount;
      
      stats.totalLogs += metrics.logsWritten;
      stats.totalErrors += metrics.errorCount;
      stats.totalWarnings += metrics.warnCount;
    }
    
    return stats;
  }

  /**
   * Reset all logger metrics
   */
  resetAllMetrics() {
    for (const logger of this.loggers.values()) {
      logger.resetMetrics();
    }
    
    if (this.metricsCollector) {
      this.metricsCollector.reset();
    }
  }

  /**
   * Flush all loggers
   * @returns {Promise<void>}
   */
  async flushAll() {
    const flushPromises = [];
    
    for (const logger of this.loggers.values()) {
      flushPromises.push(logger.flush());
    }
    
    await Promise.all(flushPromises);
  }

  /**
   * Clear logger cache
   */
  clearCache() {
    this.loggers.clear();
  }

  /**
   * Get correlation manager instance
   * @returns {CorrelationManager} Correlation manager
   */
  getCorrelationManager() {
    return this.correlationManager;
  }

  /**
   * Get metrics collector instance
   * @returns {MetricsCollector} Metrics collector
   */
  getMetricsCollector() {
    return this.metricsCollector;
  }

  /**
   * Update factory configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Clear cache to force recreation with new config
    this.clearCache();
  }
}

module.exports = LoggerFactory;