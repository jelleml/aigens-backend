/**
 * Metrics Collector
 * 
 * Collects and aggregates logging metrics for monitoring and analysis.
 * Tracks log counts, error rates, timing statistics, and service performance.
 */

/**
 * Metrics Collector class
 */
class MetricsCollector {
  constructor() {
    // Initialize metrics storage
    this.metrics = {
      logs: {
        total: 0,
        byLevel: {
          error: 0,
          warn: 0,
          info: 0,
          http: 0,
          verbose: 0,
          debug: 0,
          silly: 0
        },
        byService: new Map(),
        byComponent: new Map()
      },
      performance: {
        operations: new Map(),
        totalOperations: 0,
        totalDuration: 0,
        averageDuration: 0
      },
      errors: {
        total: 0,
        byService: new Map(),
        byType: new Map(),
        recent: []
      },
      correlations: {
        active: 0,
        total: 0,
        averageLifetime: 0
      }
    };
    
    // Metrics collection start time
    this.startTime = new Date();
    
    // Recent errors buffer size
    this.maxRecentErrors = 100;
  }

  /**
   * Record a log entry
   * @param {string} service - Service name
   * @param {string} component - Component name
   * @param {string} level - Log level
   * @param {Object} context - Log context
   */
  recordLog(service, component, level, context = {}) {
    // Update total log count
    this.metrics.logs.total++;
    
    // Update log count by level
    if (this.metrics.logs.byLevel[level] !== undefined) {
      this.metrics.logs.byLevel[level]++;
    }
    
    // Update log count by service
    if (!this.metrics.logs.byService.has(service)) {
      this.metrics.logs.byService.set(service, {
        total: 0,
        byLevel: { error: 0, warn: 0, info: 0, http: 0, verbose: 0, debug: 0, silly: 0 }
      });
    }
    
    const serviceMetrics = this.metrics.logs.byService.get(service);
    serviceMetrics.total++;
    if (serviceMetrics.byLevel[level] !== undefined) {
      serviceMetrics.byLevel[level]++;
    }
    
    // Update log count by component
    if (component) {
      const componentKey = `${service}:${component}`;
      if (!this.metrics.logs.byComponent.has(componentKey)) {
        this.metrics.logs.byComponent.set(componentKey, {
          service,
          component,
          total: 0,
          byLevel: { error: 0, warn: 0, info: 0, http: 0, verbose: 0, debug: 0, silly: 0 }
        });
      }
      
      const componentMetrics = this.metrics.logs.byComponent.get(componentKey);
      componentMetrics.total++;
      if (componentMetrics.byLevel[level] !== undefined) {
        componentMetrics.byLevel[level]++;
      }
    }
    
    // Record error details if this is an error log
    if (level === 'error') {
      this.recordError(service, component, context);
    }
  }

  /**
   * Record an error
   * @param {string} service - Service name
   * @param {string} component - Component name
   * @param {Object} context - Error context
   */
  recordError(service, component, context = {}) {
    this.metrics.errors.total++;
    
    // Update errors by service
    if (!this.metrics.errors.byService.has(service)) {
      this.metrics.errors.byService.set(service, 0);
    }
    this.metrics.errors.byService.set(service, this.metrics.errors.byService.get(service) + 1);
    
    // Update errors by type
    const errorType = context.error?.name || 'Unknown';
    if (!this.metrics.errors.byType.has(errorType)) {
      this.metrics.errors.byType.set(errorType, 0);
    }
    this.metrics.errors.byType.set(errorType, this.metrics.errors.byType.get(errorType) + 1);
    
    // Add to recent errors
    this.metrics.errors.recent.push({
      timestamp: new Date(),
      service,
      component,
      type: errorType,
      message: context.error?.message || 'Unknown error',
      context
    });
    
    // Trim recent errors to max size
    if (this.metrics.errors.recent.length > this.maxRecentErrors) {
      this.metrics.errors.recent = this.metrics.errors.recent.slice(-this.maxRecentErrors);
    }
  }

  /**
   * Record a performance operation
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {string} service - Service name
   * @param {Object} context - Additional context
   */
  recordPerformance(operation, duration, service, context = {}) {
    this.metrics.performance.totalOperations++;
    this.metrics.performance.totalDuration += duration;
    this.metrics.performance.averageDuration = 
      this.metrics.performance.totalDuration / this.metrics.performance.totalOperations;
    
    // Update operation-specific metrics
    if (!this.metrics.performance.operations.has(operation)) {
      this.metrics.performance.operations.set(operation, {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        byService: new Map()
      });
    }
    
    const opMetrics = this.metrics.performance.operations.get(operation);
    opMetrics.count++;
    opMetrics.totalDuration += duration;
    opMetrics.averageDuration = opMetrics.totalDuration / opMetrics.count;
    opMetrics.minDuration = Math.min(opMetrics.minDuration, duration);
    opMetrics.maxDuration = Math.max(opMetrics.maxDuration, duration);
    
    // Update service-specific performance metrics
    if (!opMetrics.byService.has(service)) {
      opMetrics.byService.set(service, {
        count: 0,
        totalDuration: 0,
        averageDuration: 0
      });
    }
    
    const serviceOpMetrics = opMetrics.byService.get(service);
    serviceOpMetrics.count++;
    serviceOpMetrics.totalDuration += duration;
    serviceOpMetrics.averageDuration = serviceOpMetrics.totalDuration / serviceOpMetrics.count;
  }

  /**
   * Update correlation metrics
   * @param {number} activeCount - Number of active correlations
   * @param {number} totalCount - Total correlations created
   * @param {number} averageLifetime - Average correlation lifetime in ms
   */
  updateCorrelationMetrics(activeCount, totalCount, averageLifetime) {
    this.metrics.correlations.active = activeCount;
    this.metrics.correlations.total = totalCount;
    this.metrics.correlations.averageLifetime = averageLifetime;
  }

  /**
   * Get current metrics snapshot
   * @returns {Object} Current metrics
   */
  getMetrics() {
    const now = new Date();
    const uptime = now - this.startTime;
    
    return {
      timestamp: now.toISOString(),
      uptime,
      uptimeHuman: this.formatDuration(uptime),
      logs: {
        ...this.metrics.logs,
        byService: Object.fromEntries(this.metrics.logs.byService),
        byComponent: Object.fromEntries(this.metrics.logs.byComponent),
        rate: this.metrics.logs.total / (uptime / 1000) // logs per second
      },
      performance: {
        ...this.metrics.performance,
        operations: Object.fromEntries(
          Array.from(this.metrics.performance.operations.entries()).map(([key, value]) => [
            key,
            {
              ...value,
              byService: Object.fromEntries(value.byService)
            }
          ])
        )
      },
      errors: {
        ...this.metrics.errors,
        byService: Object.fromEntries(this.metrics.errors.byService),
        byType: Object.fromEntries(this.metrics.errors.byType),
        rate: this.metrics.errors.total / (uptime / 1000), // errors per second
        errorRate: this.metrics.logs.total > 0 ? 
          (this.metrics.errors.total / this.metrics.logs.total) * 100 : 0 // percentage
      },
      correlations: this.metrics.correlations
    };
  }

  /**
   * Get metrics summary
   * @returns {Object} Metrics summary
   */
  getSummary() {
    const metrics = this.getMetrics();
    
    return {
      timestamp: metrics.timestamp,
      uptime: metrics.uptimeHuman,
      totalLogs: metrics.logs.total,
      logRate: `${metrics.logs.rate.toFixed(2)}/sec`,
      totalErrors: metrics.errors.total,
      errorRate: `${metrics.errors.errorRate.toFixed(2)}%`,
      totalOperations: metrics.performance.totalOperations,
      averageOperationTime: `${metrics.performance.averageDuration.toFixed(2)}ms`,
      activeCorrelations: metrics.correlations.active,
      topServices: this.getTopServices(5),
      topErrors: this.getTopErrors(5)
    };
  }

  /**
   * Get top services by log count
   * @param {number} limit - Number of services to return
   * @returns {Array} Top services
   */
  getTopServices(limit = 10) {
    return Array.from(this.metrics.logs.byService.entries())
      .map(([service, metrics]) => ({ service, count: metrics.total }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get top error types
   * @param {number} limit - Number of error types to return
   * @returns {Array} Top error types
   */
  getTopErrors(limit = 10) {
    return Array.from(this.metrics.errors.byType.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get recent errors
   * @param {number} limit - Number of recent errors to return
   * @returns {Array} Recent errors
   */
  getRecentErrors(limit = 10) {
    return this.metrics.errors.recent
      .slice(-limit)
      .reverse(); // Most recent first
  }

  /**
   * Get performance metrics for a specific operation
   * @param {string} operation - Operation name
   * @returns {Object|null} Operation performance metrics
   */
  getOperationMetrics(operation) {
    const opMetrics = this.metrics.performance.operations.get(operation);
    
    if (!opMetrics) {
      return null;
    }
    
    return {
      ...opMetrics,
      byService: Object.fromEntries(opMetrics.byService)
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      logs: {
        total: 0,
        byLevel: {
          error: 0,
          warn: 0,
          info: 0,
          http: 0,
          verbose: 0,
          debug: 0,
          silly: 0
        },
        byService: new Map(),
        byComponent: new Map()
      },
      performance: {
        operations: new Map(),
        totalOperations: 0,
        totalDuration: 0,
        averageDuration: 0
      },
      errors: {
        total: 0,
        byService: new Map(),
        byType: new Map(),
        recent: []
      },
      correlations: {
        active: 0,
        total: 0,
        averageLifetime: 0
      }
    };
    
    this.startTime = new Date();
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
}

module.exports = MetricsCollector;