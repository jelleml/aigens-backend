/**
 * Provider Health Check Endpoints
 * 
 * REST API endpoints for monitoring provider health status,
 * performance metrics, and system diagnostics.
 */

const express = require('express');
const router = express.Router();
const db = require('../../../database');
const { StructuredLogger } = require('../../../services/model-management/utils/structured-logger');
const { MetricsCollector } = require('../../../services/model-management/utils/metrics-collector');

// Initialize logger and metrics for health endpoints
const logger = new StructuredLogger({
  service: 'health-api',
  component: 'providers'
});

const metrics = new MetricsCollector({
  logger,
  config: {
    enableCollection: true,
    flushInterval: 30000 // 30 seconds for health checks
  }
});

/**
 * Middleware to track API metrics
 */
const trackMetrics = (req, res, next) => {
  const timer = metrics.startTimer('health_check_request', {
    endpoint: req.path,
    method: req.method
  });
  
  res.on('finish', () => {
    metrics.endTimer(timer);
    metrics.increment('health_check_requests_total', 1, {
      endpoint: req.path,
      method: req.method,
      status_code: res.statusCode
    });
  });
  
  next();
};

router.use(trackMetrics);

/**
 * GET /api/v1/health/providers
 * Get overall health status of all providers
 */
router.get('/', async (req, res) => {
  const correlationId = logger.generateCorrelationId();
  
  try {
    logger.info('Health check request received', {
      correlationId,
      endpoint: '/providers',
      userAgent: req.get('User-Agent')
    });

    const { ProviderHealthStatus, Provider } = db.models;
    
    // Get all provider health statuses
    const healthStatuses = await ProviderHealthStatus.findAll({
      include: [{
        model: Provider,
        as: 'provider',
        attributes: ['id', 'name', 'provider_type']
      }],
      order: [['health_score', 'DESC']]
    });

    // Calculate overall system health
    const totalProviders = healthStatuses.length;
    const healthyProviders = healthStatuses.filter(h => h.status === 'healthy').length;
    const degradedProviders = healthStatuses.filter(h => h.status === 'degraded').length;
    const unhealthyProviders = healthStatuses.filter(h => h.status === 'unhealthy').length;

    const overallHealthScore = totalProviders > 0 
      ? healthStatuses.reduce((sum, h) => sum + h.health_score, 0) / totalProviders 
      : 100;

    let overallStatus = 'healthy';
    if (overallHealthScore < 50 || unhealthyProviders > totalProviders * 0.5) {
      overallStatus = 'unhealthy';
    } else if (overallHealthScore < 80 || degradedProviders > totalProviders * 0.3) {
      overallStatus = 'degraded';
    }

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      overall_health_score: Math.round(overallHealthScore * 100) / 100,
      summary: {
        total_providers: totalProviders,
        healthy: healthyProviders,
        degraded: degradedProviders,
        unhealthy: unhealthyProviders,
        unknown: totalProviders - healthyProviders - degradedProviders - unhealthyProviders
      },
      providers: healthStatuses.map(health => ({
        id: health.id_provider,
        name: health.provider?.name,
        type: health.provider?.provider_type,
        status: health.status,
        health_score: health.health_score,
        last_check_at: health.last_check_at,
        consecutive_failures: health.consecutive_failures,
        error_rate_percentage: health.error_rate_percentage,
        avg_response_time_ms: health.avg_response_time_ms,
        circuit_breaker_state: health.circuit_breaker_state,
        models_count: health.models_count
      }))
    };

    // Record metrics
    metrics.gauge('providers_total', totalProviders);
    metrics.gauge('providers_healthy', healthyProviders);
    metrics.gauge('providers_degraded', degradedProviders);
    metrics.gauge('providers_unhealthy', unhealthyProviders);
    metrics.gauge('overall_health_score', overallHealthScore);

    logger.info('Health check completed successfully', {
      correlationId,
      overallStatus,
      totalProviders,
      healthyProviders
    });

    res.json(response);

  } catch (error) {
    logger.error('Health check failed', {
      correlationId,
      error: error.message,
      stack: error.stack
    });

    metrics.increment('health_check_errors', 1, {
      endpoint: '/providers',
      error_type: error.name
    });

    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      correlation_id: correlationId
    });
  }
});

/**
 * GET /api/v1/health/providers/:providerId
 * Get detailed health status for a specific provider
 */
router.get('/:providerId', async (req, res) => {
  const correlationId = logger.generateCorrelationId();
  const providerId = parseInt(req.params.providerId);

  try {
    logger.info('Provider health check request', {
      correlationId,
      providerId
    });

    const { ProviderHealthStatus, Provider, Model } = db.models;

    // Get provider health status
    const healthStatus = await ProviderHealthStatus.findOne({
      where: { id_provider: providerId },
      include: [{
        model: Provider,
        as: 'provider',
        attributes: ['id', 'name', 'provider_type', 'description']
      }]
    });

    if (!healthStatus) {
      return res.status(404).json({
        status: 'error',
        message: 'Provider health status not found',
        provider_id: providerId,
        timestamp: new Date().toISOString()
      });
    }

    // Get provider models count
    const modelsCount = await Model.count({
      where: { 
        id_provider: providerId,
        is_active: true 
      }
    });

    // Get recent sync logs for this provider
    const { ModelSyncLog } = db.models;
    const recentSyncs = await ModelSyncLog.findAll({
      where: { id_provider: providerId },
      order: [['started_at', 'DESC']],
      limit: 5,
      attributes: [
        'execution_id', 'sync_type', 'status', 'started_at', 
        'completed_at', 'duration_ms', 'models_processed',
        'models_created', 'models_updated', 'errors_count'
      ]
    });

    const response = {
      provider: {
        id: healthStatus.provider.id,
        name: healthStatus.provider.name,
        type: healthStatus.provider.provider_type,
        description: healthStatus.provider.description
      },
      health: {
        status: healthStatus.status,
        health_score: healthStatus.health_score,
        last_check_at: healthStatus.last_check_at,
        last_success_at: healthStatus.last_success_at,
        last_failure_at: healthStatus.last_failure_at
      },
      performance: {
        consecutive_failures: healthStatus.consecutive_failures,
        consecutive_successes: healthStatus.consecutive_successes,
        total_requests: healthStatus.total_requests,
        successful_requests: healthStatus.successful_requests,
        failed_requests: healthStatus.failed_requests,
        error_rate_percentage: healthStatus.error_rate_percentage,
        availability_percentage: healthStatus.availability_percentage,
        avg_response_time_ms: healthStatus.avg_response_time_ms,
        last_response_time_ms: healthStatus.last_response_time_ms
      },
      circuit_breaker: {
        state: healthStatus.circuit_breaker_state,
        opened_at: healthStatus.circuit_breaker_opened_at
      },
      rate_limiting: {
        remaining: healthStatus.rate_limit_remaining,
        reset_at: healthStatus.rate_limit_reset_at
      },
      models: {
        total_count: modelsCount,
        last_sync_at: healthStatus.last_sync_at
      },
      recent_syncs: recentSyncs,
      error_info: healthStatus.last_error_message ? {
        last_error_message: healthStatus.last_error_message,
        last_error_type: healthStatus.last_error_type
      } : null,
      monitoring: {
        is_enabled: healthStatus.is_enabled,
        alerting_enabled: healthStatus.alerting_enabled,
        next_check_at: healthStatus.next_check_at
      },
      metadata: healthStatus.metadata,
      timestamp: new Date().toISOString()
    };

    logger.info('Provider health check completed', {
      correlationId,
      providerId,
      providerName: healthStatus.provider.name,
      status: healthStatus.status,
      healthScore: healthStatus.health_score
    });

    res.json(response);

  } catch (error) {
    logger.error('Provider health check failed', {
      correlationId,
      providerId,
      error: error.message
    });

    metrics.increment('provider_health_check_errors', 1, {
      provider_id: providerId
    });

    res.status(500).json({
      status: 'error',
      message: 'Provider health check failed',
      provider_id: providerId,
      timestamp: new Date().toISOString(),
      correlation_id: correlationId
    });
  }
});

/**
 * POST /api/v1/health/providers/:providerId/check
 * Trigger immediate health check for a specific provider
 */
router.post('/:providerId/check', async (req, res) => {
  const correlationId = logger.generateCorrelationId();
  const providerId = parseInt(req.params.providerId);

  try {
    logger.info('Manual health check triggered', {
      correlationId,
      providerId,
      userAgent: req.get('User-Agent')
    });

    const { ProviderHealthStatus, Provider } = db.models;

    // Get provider
    const provider = await Provider.findByPk(providerId);
    if (!provider) {
      return res.status(404).json({
        status: 'error',
        message: 'Provider not found',
        provider_id: providerId
      });
    }

    // Get or create health status
    let healthStatus = await ProviderHealthStatus.findOne({
      where: { id_provider: providerId }
    });

    if (!healthStatus) {
      healthStatus = await ProviderHealthStatus.create({
        id_provider: providerId,
        status: 'unknown'
      });
    }

    // TODO: Implement actual health check logic here
    // This would typically involve making a test API call to the provider
    // For now, we'll simulate a health check

    const isHealthy = Math.random() > 0.1; // 90% chance of success for demo
    
    if (isHealthy) {
      await healthStatus.recordSuccess(Math.floor(Math.random() * 1000) + 100);
      logger.info('Health check passed', {
        correlationId,
        providerId,
        providerName: provider.name
      });
    } else {
      const error = new Error('Simulated health check failure');
      await healthStatus.recordFailure(error, 'health_check');
      logger.warn('Health check failed', {
        correlationId,
        providerId,
        providerName: provider.name,
        error: error.message
      });
    }

    await healthStatus.scheduleNextCheck(5); // Next check in 5 minutes

    const response = {
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.provider_type
      },
      check_result: {
        status: healthStatus.status,
        health_score: healthStatus.health_score,
        checked_at: healthStatus.last_check_at,
        next_check_at: healthStatus.next_check_at
      },
      timestamp: new Date().toISOString(),
      correlation_id: correlationId
    };

    metrics.increment('manual_health_checks', 1, {
      provider_id: providerId,
      result: healthStatus.status
    });

    res.json(response);

  } catch (error) {
    logger.error('Manual health check failed', {
      correlationId,
      providerId,
      error: error.message
    });

    res.status(500).json({
      status: 'error',
      message: 'Manual health check failed',
      provider_id: providerId,
      correlation_id: correlationId,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/health/providers/:providerId/metrics
 * Get performance metrics for a specific provider
 */
router.get('/:providerId/metrics', async (req, res) => {
  const correlationId = logger.generateCorrelationId();
  const providerId = parseInt(req.params.providerId);

  try {
    const { ProviderHealthStatus, Provider } = db.models;

    const healthStatus = await ProviderHealthStatus.findOne({
      where: { id_provider: providerId },
      include: [{
        model: Provider,
        as: 'provider',
        attributes: ['name', 'provider_type']
      }]
    });

    if (!healthStatus) {
      return res.status(404).json({
        status: 'error',
        message: 'Provider metrics not found',
        provider_id: providerId
      });
    }

    const response = {
      provider: {
        id: providerId,
        name: healthStatus.provider.name,
        type: healthStatus.provider.provider_type
      },
      metrics: {
        health_score: healthStatus.health_score,
        availability_percentage: healthStatus.availability_percentage,
        error_rate_percentage: healthStatus.error_rate_percentage,
        avg_response_time_ms: healthStatus.avg_response_time_ms,
        total_requests: healthStatus.total_requests,
        successful_requests: healthStatus.successful_requests,
        failed_requests: healthStatus.failed_requests,
        consecutive_failures: healthStatus.consecutive_failures,
        consecutive_successes: healthStatus.consecutive_successes
      },
      performance_metrics: healthStatus.performance_metrics || {},
      circuit_breaker: {
        state: healthStatus.circuit_breaker_state,
        opened_at: healthStatus.circuit_breaker_opened_at
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    logger.error('Failed to retrieve provider metrics', {
      correlationId,
      providerId,
      error: error.message
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve provider metrics',
      provider_id: providerId,
      correlation_id: correlationId
    });
  }
});

/**
 * GET /api/v1/health/system
 * Get overall system health and metrics
 */
router.get('/system', async (req, res) => {
  const correlationId = logger.generateCorrelationId();

  try {
    // Get system metrics from our metrics collector
    const systemMetrics = metrics.getSummary();
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Get database health
    let dbHealth = 'healthy';
    let dbLatency = null;
    
    try {
      const startTime = Date.now();
      await db.sequelize.authenticate();
      dbLatency = Date.now() - startTime;
    } catch (error) {
      dbHealth = 'unhealthy';
      logger.error('Database health check failed', { error: error.message });
    }

    const response = {
      status: dbHealth === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000,
      system: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid
      },
      memory: {
        rss: memUsage.rss,
        heap_total: memUsage.heapTotal,
        heap_used: memUsage.heapUsed,
        heap_used_percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        external: memUsage.external
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      database: {
        status: dbHealth,
        latency_ms: dbLatency
      },
      metrics: systemMetrics,
      correlation_id: correlationId
    };

    // Record system health metrics
    metrics.gauge('system_memory_heap_used_percentage', 
      (memUsage.heapUsed / memUsage.heapTotal) * 100);
    metrics.gauge('system_db_latency_ms', dbLatency || 0);

    res.json(response);

  } catch (error) {
    logger.error('System health check failed', {
      correlationId,
      error: error.message
    });

    res.status(500).json({
      status: 'error',
      message: 'System health check failed',
      timestamp: new Date().toISOString(),
      correlation_id: correlationId
    });
  }
});

module.exports = router;