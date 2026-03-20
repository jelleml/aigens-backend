/**
 * Monitoring Service for Model Management System
 * 
 * Central service that integrates logging, metrics collection, health monitoring,
 * and log rotation to provide comprehensive system observability.
 */

const { EventEmitter } = require('events');
const path = require('path');
const { getLogger: getCentralLogger } = require(path.resolve(__dirname, '../../services/logging'));
const { MetricsCollector } = require('./utils/metrics-collector');
const { LogRotationManager } = require('./utils/log-rotation-manager');
const db = require('../../database');

/**
 * Default configuration for monitoring service
 */
const DEFAULT_CONFIG = {
  // Service identification
  serviceName: 'model-management',
  serviceVersion: '1.0.0',

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableConsole: process.env.NODE_ENV !== 'production',
    enableFile: true,
    dirname: 'logs/model-management'
  },

  // Metrics configuration
  metrics: {
    enableCollection: true,
    flushInterval: 30000, // 30 seconds
    enablePersistence: true,
    enableAlerting: true
  },

  // Log rotation configuration
  logRotation: {
    enableRotation: true,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxFiles: 10,
    retentionDays: 30,
    cleanupInterval: '0 2 * * *' // Daily at 2 AM
  },

  // Health monitoring configuration
  healthMonitoring: {
    enableHealthChecks: true,
    healthCheckInterval: 60000, // 1 minute
    enableAlerts: true,
    alertThresholds: {
      errorRate: 0.05,
      responseTime: 5000,
      memoryUsage: 0.85
    }
  }
};

/**
 * MonitoringService class
 */
class MonitoringService extends EventEmitter {
  /**
   * @param {Object} options - Configuration options
   * @param {Object} options.config - Service configuration
   */
  constructor(options = {}) {
    super();

    const { config = {} } = options;
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);

    // Service state
    this.isInitialized = false;
    this.isStarted = false;
    this.startTime = Date.now();

    // Component instances
    this.logger = null;
    this.metrics = null;
    this.logRotation = null;

    // Health check interval
    this.healthCheckInterval = null;

    // Alert handlers
    this.alertHandlers = new Map();

    this.initializeComponents();
  }

  /**
   * Deep merge configuration objects
   * @param {Object} defaultConfig - Default configuration
   * @param {Object} userConfig - User configuration
   * @returns {Object} Merged configuration
   */
  mergeConfig(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };

    Object.keys(userConfig).forEach(key => {
      if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
        merged[key] = { ...defaultConfig[key], ...userConfig[key] };
      } else {
        merged[key] = userConfig[key];
      }
    });

    return merged;
  }

  /**
   * Initialize monitoring components
   */
  initializeComponents() {
    try {
      // Usa il logger centralizzato
      this.logger = getCentralLogger(
        this.config.serviceName,
        'monitoring-service',
        {
          version: this.config.serviceVersion,
          environment: process.env.NODE_ENV || 'development'
        }
      );

      // Initialize metrics collector
      this.metrics = new MetricsCollector({
        logger: this.logger.child({ component: 'metrics-collector' }),
        config: this.config.metrics
      });

      // Initialize log rotation manager
      if (this.config.logRotation.enableRotation) {
        this.logRotation = new LogRotationManager({
          logger: this.logger.child({ component: 'log-rotation' }),
          config: this.config.logRotation
        });
      }

      // Set up event handlers
      this.setupEventHandlers();

      this.isInitialized = true;
      this.logger.info('[MonitoringService] Initialized successfully', {
        components: {
          logger: true,
          metrics: true,
          logRotation: !!this.logRotation
        }
      });

    } catch (error) {
      console.error('[MonitoringService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Set up event handlers for component integration
   */
  setupEventHandlers() {
    // Handle metrics events
    this.metrics.on('alert', (alert) => {
      this.handleAlert(alert);
    });

    this.metrics.on('flush', (metricsData) => {
      this.logger.debug('[MonitoringService] Metrics flushed', {
        metricsCount: Object.keys(metricsData.metrics).length,
        timestamp: metricsData.timestamp
      });
    });

    // Handle process events (only if not already handled)
    // Remove duplicate event listeners to prevent MaxListenersExceededWarning
    // These are now handled centrally in server.js
    /*
    if (!process.listenerCount('uncaughtException')) {
      process.on('uncaughtException', (error) => {
        this.logger.error('[MonitoringService] Uncaught exception', error);
        this.metrics.increment('uncaught_exceptions', 1);
        this.handleAlert({
          type: 'uncaught_exception',
          level: 'critical',
          message: `Uncaught exception: ${error.message}`,
          error
        });
      });
    }

    if (!process.listenerCount('unhandledRejection')) {
      process.on('unhandledRejection', (reason, promise) => {
        this.logger.error('[MonitoringService] Unhandled rejection', {
          reason: reason instanceof Error ? reason.message : reason,
          stack: reason instanceof Error ? reason.stack : undefined
        });
        this.metrics.increment('unhandled_rejections', 1);
      });
    }
    */

    // Instead, just log metrics when these events occur
    // The actual event handling is done centrally in server.js
    this.logger.info('[MonitoringService] Process event handlers are managed centrally to prevent MaxListenersExceededWarning');

    // Memory monitoring
    this.on('memoryAlert', (alert) => {
      this.logger.warn('[MonitoringService] Memory alert', alert);
      this.handleAlert(alert);
    });
  }

  /**
   * Start monitoring service
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.isInitialized) {
      throw new Error('MonitoringService not initialized');
    }

    if (this.isStarted) {
      this.logger.warn('[MonitoringService] Already started');
      return;
    }

    try {
      // Start metrics collection
      this.metrics.startCollection();

      // Start log rotation
      if (this.logRotation) {
        this.logRotation.start();
      }

      // Start health monitoring
      if (this.config.healthMonitoring.enableHealthChecks) {
        this.startHealthMonitoring();
      }

      this.isStarted = true;
      this.logger.info('[MonitoringService] Started successfully', {
        config: {
          metricsEnabled: true,
          logRotationEnabled: !!this.logRotation,
          healthMonitoringEnabled: this.config.healthMonitoring.enableHealthChecks
        }
      });

      this.emit('started');

    } catch (error) {
      this.logger.error('[MonitoringService] Failed to start', error);
      throw error;
    }
  }

  /**
   * Stop monitoring service
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isStarted) {
      return;
    }

    try {
      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      // Stop log rotation
      if (this.logRotation) {
        this.logRotation.stop();
      }

      // Stop metrics collection and flush final metrics
      this.metrics.stopCollection();
      this.metrics.flush();

      this.isStarted = false;
      this.logger.info('[MonitoringService] Stopped successfully');

      this.emit('stopped');

    } catch (error) {
      this.logger.error('[MonitoringService] Error during shutdown', error);
      throw error;
    }
  }

  /**
   * Start periodic health monitoring
   */
  startHealthMonitoring() {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthMonitoring.healthCheckInterval);

    this.logger.info('[MonitoringService] Health monitoring started', {
      interval: this.config.healthMonitoring.healthCheckInterval
    });
  }

  /**
   * Perform comprehensive health check
   * @returns {Promise<Object>} Health check results
   */
  async performHealthCheck() {
    // Don't perform health check if service is not started or being shut down
    if (!this.isStarted) {
      return {
        timestamp: new Date().toISOString(),
        service: this.config.serviceName,
        version: this.config.serviceVersion,
        status: 'unavailable',
        message: 'Service not started or shutting down'
      };
    }

    const healthCheck = {
      timestamp: new Date().toISOString(),
      service: this.config.serviceName,
      version: this.config.serviceVersion,
      uptime: Date.now() - this.startTime,
      status: 'healthy',
      checks: {}
    };

    try {
      // Database health check
      healthCheck.checks.database = await this.checkDatabaseHealth();

      // Memory health check
      healthCheck.checks.memory = this.checkMemoryHealth();

      // Metrics health check
      healthCheck.checks.metrics = this.checkMetricsHealth();

      // Provider health check
      healthCheck.checks.providers = await this.checkProvidersHealth();

      // Determine overall status
      const failedChecks = Object.values(healthCheck.checks)
        .filter(check => check.status !== 'healthy').length;

      if (failedChecks === 0) {
        healthCheck.status = 'healthy';
      } else if (failedChecks <= Object.keys(healthCheck.checks).length / 2) {
        healthCheck.status = 'degraded';
      } else {
        healthCheck.status = 'unhealthy';
      }

      // Record health metrics
      this.metrics.gauge('health_check_status', healthCheck.status === 'healthy' ? 1 : 0);
      this.metrics.gauge('health_checks_passed',
        Object.values(healthCheck.checks).filter(c => c.status === 'healthy').length);
      this.metrics.gauge('health_checks_failed', failedChecks);

      this.logger.debug('[MonitoringService] Health check completed', {
        status: healthCheck.status,
        failedChecks
      });

      this.emit('healthCheck', healthCheck);
      return healthCheck;

    } catch (error) {
      // Only log if service is still started (logger still available)
      if (this.isStarted) {
        try {
          this.logger.error('[MonitoringService] Health check failed', error);
        } catch (logError) {
          // Logger unavailable, use console instead
          console.error('[MonitoringService] Health check failed (logger unavailable):', error.message);
        }
      }
      healthCheck.status = 'error';
      healthCheck.error = error.message;
      return healthCheck;
    }
  }

  /**
   * Check database health
   * @returns {Promise<Object>} Database health status
   */
  async checkDatabaseHealth() {
    try {
      const startTime = Date.now();
      await db.sequelize.authenticate();
      const latency = Date.now() - startTime;

      this.metrics.timing('database_health_check_duration', latency);

      return {
        status: 'healthy',
        latency,
        message: 'Database connection successful'
      };

    } catch (error) {
      this.metrics.increment('database_health_check_failures', 1);
      return {
        status: 'unhealthy',
        error: error.message,
        message: 'Database connection failed'
      };
    }
  }

  /**
   * Check memory health
   * @returns {Object} Memory health status
   */
  checkMemoryHealth() {
    const memoryUsage = process.memoryUsage();
    const heapUsedPercent = memoryUsage.heapUsed / memoryUsage.heapTotal;

    this.metrics.gauge('memory_heap_used_bytes', memoryUsage.heapUsed);
    this.metrics.gauge('memory_heap_total_bytes', memoryUsage.heapTotal);
    this.metrics.gauge('memory_heap_used_percent', heapUsedPercent * 100);

    if (heapUsedPercent > this.config.healthMonitoring.alertThresholds.memoryUsage) {
      this.emit('memoryAlert', {
        type: 'high_memory_usage',
        level: 'warning',
        message: `High memory usage: ${(heapUsedPercent * 100).toFixed(2)}%`,
        heapUsedPercent,
        threshold: this.config.healthMonitoring.alertThresholds.memoryUsage
      });

      return {
        status: 'degraded',
        heapUsedPercent: heapUsedPercent * 100,
        message: 'High memory usage detected'
      };
    }

    return {
      status: 'healthy',
      heapUsedPercent: heapUsedPercent * 100,
      message: 'Memory usage within normal limits'
    };
  }

  /**
   * Check metrics system health
   * @returns {Object} Metrics health status
   */
  checkMetricsHealth() {
    const summary = this.metrics.getSummary();

    this.metrics.gauge('metrics_total_count', summary.totalMetrics);
    this.metrics.gauge('metrics_active_timers', summary.activeTimers);

    return {
      status: 'healthy',
      totalMetrics: summary.totalMetrics,
      activeTimers: summary.activeTimers,
      uptime: summary.uptime,
      message: 'Metrics collection operational'
    };
  }

  /**
   * Check providers health
   * @returns {Promise<Object>} Providers health status
   */
  async checkProvidersHealth() {
    try {
      if (!db.models.ProviderHealthStatus) {
        return {
          status: 'unknown',
          message: 'Provider health status table not available'
        };
      }

      const healthStatuses = await db.models.ProviderHealthStatus.findAll({
        attributes: ['status', 'health_score']
      });

      if (healthStatuses.length === 0) {
        return {
          status: 'unknown',
          message: 'No provider health data available'
        };
      }

      const healthyCount = healthStatuses.filter(h => h.status === 'healthy').length;
      const totalCount = healthStatuses.length;
      const healthyPercent = (healthyCount / totalCount) * 100;
      const avgHealthScore = healthStatuses.reduce((sum, h) => sum + h.health_score, 0) / totalCount;

      this.metrics.gauge('providers_total', totalCount);
      this.metrics.gauge('providers_healthy', healthyCount);
      this.metrics.gauge('providers_health_percentage', healthyPercent);
      this.metrics.gauge('providers_avg_health_score', avgHealthScore);

      let status = 'healthy';
      if (healthyPercent < 50) {
        status = 'unhealthy';
      } else if (healthyPercent < 80) {
        status = 'degraded';
      }

      return {
        status,
        totalProviders: totalCount,
        healthyProviders: healthyCount,
        healthyPercent,
        avgHealthScore,
        message: `${healthyCount}/${totalCount} providers healthy`
      };

    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        message: 'Failed to check provider health'
      };
    }
  }

  /**
   * Handle system alerts
   * @param {Object} alert - Alert information
   */
  handleAlert(alert) {
    const alertLogger = this.logger.child({ component: 'alert-handler' });

    alertLogger.warn('[MonitoringService] Alert triggered', {
      type: alert.type,
      level: alert.level,
      message: alert.message,
      ...alert
    });

    this.metrics.increment('alerts_triggered', 1, {
      type: alert.type,
      level: alert.level
    });

    // Execute registered alert handlers
    if (this.alertHandlers.has(alert.type)) {
      const handler = this.alertHandlers.get(alert.type);
      try {
        handler(alert);
      } catch (error) {
        alertLogger.error('[MonitoringService] Alert handler failed', {
          alertType: alert.type,
          error: error.message
        });
      }
    }

    this.emit('alert', alert);
  }

  /**
   * Register alert handler
   * @param {string} alertType - Type of alert to handle
   * @param {Function} handler - Handler function
   */
  registerAlertHandler(alertType, handler) {
    this.alertHandlers.set(alertType, handler);
    this.logger.debug('[MonitoringService] Alert handler registered', {
      alertType
    });
  }

  /**
   * Get service status
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      service: this.config.serviceName,
      version: this.config.serviceVersion,
      isInitialized: this.isInitialized,
      isStarted: this.isStarted,
      uptime: Date.now() - this.startTime,
      components: {
        logger: !!this.logger,
        metrics: !!this.metrics,
        logRotation: !!this.logRotation
      },
      metrics: this.metrics ? this.metrics.getSummary() : null,
      logRotation: this.logRotation ? this.logRotation.getStats() : null
    };
  }

  /**
   * Get logger instance
   * @param {string} component - Component name for child logger
   * @returns {StructuredLogger} Logger instance
   */
  getLogger(component = null) {
    if (!this.logger) {
      throw new Error('MonitoringService not initialized');
    }

    return component ? this.logger.child({ component }) : this.logger;
  }

  /**
   * Get metrics collector instance
   * @returns {MetricsCollector} Metrics collector instance
   */
  getMetrics() {
    if (!this.metrics) {
      throw new Error('MonitoringService not initialized');
    }

    return this.metrics;
  }

  /**
   * Shutdown monitoring service gracefully
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.logger.info('[MonitoringService] Initiating graceful shutdown');

    try {
      await this.stop();

      // Final log flush
      if (this.logger.flush) {
        await this.logger.flush();
      }

      this.removeAllListeners();

      console.log('[MonitoringService] Graceful shutdown completed');

    } catch (error) {
      console.error('[MonitoringService] Error during shutdown:', error);
      throw error;
    }
  }
}

// Export singleton instance
let monitoringService = null;

/**
 * Get or create monitoring service singleton
 * @param {Object} config - Configuration options
 * @returns {MonitoringService} Monitoring service instance
 */
function getMonitoringService(config = {}) {
  if (!monitoringService) {
    monitoringService = new MonitoringService({ config });
  }
  return monitoringService;
}

module.exports = {
  MonitoringService,
  getMonitoringService,
  DEFAULT_CONFIG
};