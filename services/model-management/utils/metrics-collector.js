/**
 * MetricsCollector for Model Management System
 * 
 * Comprehensive performance tracking and metrics collection system with
 * real-time monitoring, alerting, and reporting capabilities.
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

/**
 * Metric types and their properties
 */
const METRIC_TYPES = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  TIMER: 'timer',
  SET: 'set'
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // Collection settings
  enableCollection: true,
  flushInterval: 10000, // 10 seconds
  maxMetricsInMemory: 10000,
  
  // Storage settings
  enablePersistence: true,
  metricsFile: path.join(process.cwd(), 'logs', 'model-management', 'metrics.json'),
  
  // Aggregation settings
  histogramBuckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  percentiles: [50, 75, 90, 95, 99],
  
  // Alerting settings
  enableAlerting: true,
  alertThresholds: {
    errorRate: 0.05, // 5%
    responseTime: 5000, // 5 seconds
    memoryUsage: 0.85 // 85%
  }
};

/**
 * MetricsCollector class
 */
class MetricsCollector extends EventEmitter {
  /**
   * @param {Object} options - Configuration options
   * @param {Object} options.config - Metrics configuration
   * @param {Object} options.logger - Logger instance
   */
  constructor(options = {}) {
    super();
    
    const { config = {}, logger = console } = options;
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
    
    // Metrics storage
    this.metrics = new Map();
    this.timers = new Map();
    this.samples = new Map();
    
    // System metrics
    this.systemMetrics = {
      startTime: Date.now(),
      lastFlush: Date.now(),
      metricsCount: 0,
      errorsCount: 0
    };
    
    // Flush interval
    this.flushIntervalId = null;
    
    if (this.config.enableCollection) {
      this.startCollection();
    }
    
    this.logger.debug('[MetricsCollector] Initialized', {
      enableCollection: this.config.enableCollection,
      flushInterval: this.config.flushInterval
    });
  }

  /**
   * Start metrics collection
   */
  startCollection() {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
    }
    
    this.flushIntervalId = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
    
    // Collect system metrics periodically
    this.collectSystemMetrics();
    
    this.logger.info('[MetricsCollector] Started collection');
  }

  /**
   * Stop metrics collection
   */
  stopCollection() {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }
    
    this.logger.info('[MetricsCollector] Stopped collection');
  }

  /**
   * Increment a counter metric
   * @param {string} name - Metric name
   * @param {number} value - Increment value (default: 1)
   * @param {Object} tags - Metric tags
   */
  increment(name, value = 1, tags = {}) {
    if (!this.config.enableCollection) return;
    
    const metric = this.getOrCreateMetric(name, METRIC_TYPES.COUNTER, tags);
    metric.value += value;
    metric.lastUpdated = Date.now();
    
    this.systemMetrics.metricsCount++;
    this.emit('metric', { type: 'increment', name, value, tags });
  }

  /**
   * Decrement a counter metric
   * @param {string} name - Metric name
   * @param {number} value - Decrement value (default: 1)
   * @param {Object} tags - Metric tags
   */
  decrement(name, value = 1, tags = {}) {
    this.increment(name, -value, tags);
  }

  /**
   * Set a gauge metric value
   * @param {string} name - Metric name
   * @param {number} value - Gauge value
   * @param {Object} tags - Metric tags
   */
  gauge(name, value, tags = {}) {
    if (!this.config.enableCollection) return;
    
    const metric = this.getOrCreateMetric(name, METRIC_TYPES.GAUGE, tags);
    metric.value = value;
    metric.lastUpdated = Date.now();
    
    this.systemMetrics.metricsCount++;
    this.emit('metric', { type: 'gauge', name, value, tags });
  }

  /**
   * Record a timing measurement
   * @param {string} name - Metric name
   * @param {number} value - Time in milliseconds
   * @param {Object} tags - Metric tags
   */
  timing(name, value, tags = {}) {
    if (!this.config.enableCollection) return;
    
    const metric = this.getOrCreateMetric(name, METRIC_TYPES.TIMER, tags);
    
    if (!metric.samples) {
      metric.samples = [];
      metric.count = 0;
      metric.sum = 0;
      metric.min = Infinity;
      metric.max = -Infinity;
    }
    
    metric.samples.push(value);
    metric.count++;
    metric.sum += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    metric.lastUpdated = Date.now();
    
    // Keep only recent samples to prevent memory issues
    if (metric.samples.length > 1000) {
      metric.samples = metric.samples.slice(-500);
    }
    
    this.systemMetrics.metricsCount++;
    this.emit('metric', { type: 'timing', name, value, tags });
    
    // Check for performance alerts
    this.checkPerformanceAlerts(name, value, tags);
  }

  /**
   * Record a histogram value
   * @param {string} name - Metric name
   * @param {number} value - Histogram value
   * @param {Object} tags - Metric tags
   */
  histogram(name, value, tags = {}) {
    if (!this.config.enableCollection) return;
    
    const metric = this.getOrCreateMetric(name, METRIC_TYPES.HISTOGRAM, tags);
    
    if (!metric.buckets) {
      metric.buckets = new Map();
      this.config.histogramBuckets.forEach(bucket => {
        metric.buckets.set(bucket, 0);
      });
      metric.count = 0;
      metric.sum = 0;
    }
    
    // Update buckets
    this.config.histogramBuckets.forEach(bucket => {
      if (value <= bucket) {
        metric.buckets.set(bucket, metric.buckets.get(bucket) + 1);
      }
    });
    
    metric.count++;
    metric.sum += value;
    metric.lastUpdated = Date.now();
    
    this.systemMetrics.metricsCount++;
    this.emit('metric', { type: 'histogram', name, value, tags });
  }

  /**
   * Add value to a set metric
   * @param {string} name - Metric name
   * @param {string} value - Set value
   * @param {Object} tags - Metric tags
   */
  set(name, value, tags = {}) {
    if (!this.config.enableCollection) return;
    
    const metric = this.getOrCreateMetric(name, METRIC_TYPES.SET, tags);
    
    if (!metric.values) {
      metric.values = new Set();
    }
    
    metric.values.add(value);
    metric.lastUpdated = Date.now();
    
    this.systemMetrics.metricsCount++;
    this.emit('metric', { type: 'set', name, value, tags });
  }

  /**
   * Start timing an operation
   * @param {string} name - Timer name
   * @param {Object} tags - Metric tags
   * @returns {string} Timer ID
   */
  startTimer(name, tags = {}) {
    const timerId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.timers.set(timerId, {
      name,
      tags,
      startTime: Date.now(),
      startHrTime: process.hrtime()
    });
    
    return timerId;
  }

  /**
   * End timing operation
   * @param {string} timerId - Timer ID from startTimer
   * @returns {number} Duration in milliseconds
   */
  endTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer) {
      this.logger.warn('[MetricsCollector] Timer not found', { timerId });
      return null;
    }
    
    const endTime = Date.now();
    const endHrTime = process.hrtime(timer.startHrTime);
    const duration = endTime - timer.startTime;
    const preciseMs = endHrTime[0] * 1000 + endHrTime[1] / 1000000;
    
    this.timing(timer.name, duration, {
      ...timer.tags,
      preciseMs
    });
    
    this.timers.delete(timerId);
    return duration;
  }

  /**
   * Get or create a metric
   * @param {string} name - Metric name
   * @param {string} type - Metric type
   * @param {Object} tags - Metric tags
   * @returns {Object} Metric object
   */
  getOrCreateMetric(name, type, tags = {}) {
    const key = this.createMetricKey(name, tags);
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        name,
        type,
        tags,
        value: type === METRIC_TYPES.COUNTER ? 0 : null,
        created: Date.now(),
        lastUpdated: Date.now()
      });
    }
    
    return this.metrics.get(key);
  }

  /**
   * Create metric key from name and tags
   * @param {string} name - Metric name
   * @param {Object} tags - Metric tags
   * @returns {string} Metric key
   */
  createMetricKey(name, tags) {
    const tagString = Object.keys(tags)
      .sort()
      .map(key => `${key}:${tags[key]}`)
      .join(',');
    
    return tagString ? `${name}[${tagString}]` : name;
  }

  /**
   * Collect system metrics
   */
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Memory metrics
    this.gauge('system.memory.rss', memUsage.rss);
    this.gauge('system.memory.heapTotal', memUsage.heapTotal);
    this.gauge('system.memory.heapUsed', memUsage.heapUsed);
    this.gauge('system.memory.external', memUsage.external);
    
    // CPU metrics
    this.gauge('system.cpu.user', cpuUsage.user);
    this.gauge('system.cpu.system', cpuUsage.system);
    
    // Process metrics
    this.gauge('system.uptime', Date.now() - this.systemMetrics.startTime);
    this.gauge('system.metrics.count', this.systemMetrics.metricsCount);
    this.gauge('system.metrics.active', this.metrics.size);
    this.gauge('system.timers.active', this.timers.size);
    
    // Check for memory alerts
    const memoryUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
    if (memoryUsagePercent > this.config.alertThresholds.memoryUsage) {
      this.emit('alert', {
        type: 'memory_high',
        level: 'warning',
        message: `High memory usage: ${(memoryUsagePercent * 100).toFixed(2)}%`,
        value: memoryUsagePercent,
        threshold: this.config.alertThresholds.memoryUsage
      });
    }
  }

  /**
   * Check for performance alerts
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {Object} tags - Metric tags
   */
  checkPerformanceAlerts(name, value, tags) {
    if (!this.config.enableAlerting) return;
    
    // Response time alerts
    if (name.includes('response_time') || name.includes('duration')) {
      if (value > this.config.alertThresholds.responseTime) {
        this.emit('alert', {
          type: 'response_time_high',
          level: 'warning',
          message: `High response time for ${name}: ${value}ms`,
          metric: name,
          value,
          threshold: this.config.alertThresholds.responseTime,
          tags
        });
      }
    }
  }

  /**
   * Calculate percentiles for timer/histogram data
   * @param {Array} samples - Sample data
   * @param {Array} percentiles - Percentiles to calculate
   * @returns {Object} Percentile values
   */
  calculatePercentiles(samples, percentiles = this.config.percentiles) {
    if (!samples || samples.length === 0) return {};
    
    const sorted = [...samples].sort((a, b) => a - b);
    const result = {};
    
    percentiles.forEach(p => {
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      result[`p${p}`] = sorted[Math.max(0, index)];
    });
    
    return result;
  }

  /**
   * Get aggregated metrics data
   * @returns {Object} Aggregated metrics
   */
  getMetrics() {
    const aggregated = {
      timestamp: Date.now(),
      system: this.systemMetrics,
      metrics: {}
    };
    
    this.metrics.forEach((metric, key) => {
      const result = {
        name: metric.name,
        type: metric.type,
        tags: metric.tags,
        lastUpdated: metric.lastUpdated
      };
      
      switch (metric.type) {
        case METRIC_TYPES.COUNTER:
        case METRIC_TYPES.GAUGE:
          result.value = metric.value;
          break;
          
        case METRIC_TYPES.TIMER:
          if (metric.samples && metric.samples.length > 0) {
            result.count = metric.count;
            result.sum = metric.sum;
            result.min = metric.min;
            result.max = metric.max;
            result.avg = metric.sum / metric.count;
            result.percentiles = this.calculatePercentiles(metric.samples);
          }
          break;
          
        case METRIC_TYPES.HISTOGRAM:
          if (metric.buckets) {
            result.count = metric.count;
            result.sum = metric.sum;
            result.buckets = Object.fromEntries(metric.buckets);
          }
          break;
          
        case METRIC_TYPES.SET:
          if (metric.values) {
            result.size = metric.values.size;
            result.values = Array.from(metric.values);
          }
          break;
      }
      
      aggregated.metrics[key] = result;
    });
    
    return aggregated;
  }

  /**
   * Get metrics summary
   * @returns {Object} Metrics summary
   */
  getSummary() {
    const typeCount = {};
    let totalMetrics = 0;
    
    this.metrics.forEach(metric => {
      typeCount[metric.type] = (typeCount[metric.type] || 0) + 1;
      totalMetrics++;
    });
    
    return {
      totalMetrics,
      typeCount,
      activeTimers: this.timers.size,
      uptime: Date.now() - this.systemMetrics.startTime,
      lastFlush: this.systemMetrics.lastFlush,
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Flush metrics to storage/output
   */
  flush() {
    const metrics = this.getMetrics();
    
    this.emit('flush', metrics);
    
    if (this.config.enablePersistence) {
      this.persistMetrics(metrics);
    }
    
    this.systemMetrics.lastFlush = Date.now();
    
    // Clean up old metrics to prevent memory issues
    if (this.metrics.size > this.config.maxMetricsInMemory) {
      this.cleanupOldMetrics();
    }
    
    this.logger.debug('[MetricsCollector] Flushed metrics', {
      metricsCount: this.metrics.size,
      activeTimers: this.timers.size
    });
  }

  /**
   * Persist metrics to file
   * @param {Object} metrics - Metrics data to persist
   */
  persistMetrics(metrics) {
    try {
      const metricsDir = path.dirname(this.config.metricsFile);
      if (!require('fs').existsSync(metricsDir)) {
        require('fs').mkdirSync(metricsDir, { recursive: true });
      }
      
      require('fs').writeFileSync(
        this.config.metricsFile,
        JSON.stringify(metrics, null, 2)
      );
    } catch (error) {
      this.logger.error('[MetricsCollector] Failed to persist metrics', error);
    }
  }

  /**
   * Clean up old metrics to free memory
   */
  cleanupOldMetrics() {
    const cutoffTime = Date.now() - (5 * 60 * 1000); // 5 minutes ago
    let cleaned = 0;
    
    this.metrics.forEach((metric, key) => {
      if (metric.lastUpdated < cutoffTime) {
        this.metrics.delete(key);
        cleaned++;
      }
    });
    
    this.logger.debug('[MetricsCollector] Cleaned up old metrics', {
      cleaned,
      remaining: this.metrics.size
    });
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.timers.clear();
    this.samples.clear();
    
    this.systemMetrics.metricsCount = 0;
    this.systemMetrics.errorsCount = 0;
    
    this.logger.info('[MetricsCollector] Reset all metrics');
  }

  /**
   * Shutdown metrics collector
   */
  shutdown() {
    this.stopCollection();
    this.flush();
    this.removeAllListeners();
    
    this.logger.info('[MetricsCollector] Shutdown complete');
  }
}

module.exports = {
  MetricsCollector,
  METRIC_TYPES,
  DEFAULT_CONFIG
};