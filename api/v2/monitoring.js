/**
 * API v2 Monitoring Endpoint
 * Provides performance metrics and health status
 */

const express = require('express');
const router = express.Router();

const performanceMonitoringService = require('../../services/performance-monitoring.service');
const authMiddleware = require('../../middlewares/auth.middleware');
const { createLogger } = require('../../scripts/utils/error-handler');

const logger = createLogger('api-v2-monitoring');

/**
 * @swagger
 * /api/v2/monitoring/metrics:
 *   get:
 *     summary: Get comprehensive performance metrics
 *     tags: [Monitoring v2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance metrics report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 system:
 *                   type: object
 *                   properties:
 *                     uptime:
 *                       type: number
 *                     uptimeFormatted:
 *                       type: string
 *                     startTime:
 *                       type: string
 *                 requests:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     errors:
 *                       type: number
 *                     errorRate:
 *                       type: number
 *                     streams:
 *                       type: number
 *                     activeStreams:
 *                       type: number
 *                     requestsPerMinute:
 *                       type: number
 *                 providers:
 *                   type: object
 *                 autoSelector:
 *                   type: object
 *                 health:
 *                   type: object
 *                 generatedAt:
 *                   type: string
 */
router.get('/metrics',
    authMiddleware.authenticate,
    async (req, res) => {
        try {
            logger.info('Metrics requested', { userId: req.user.id });

            const metricsReport = performanceMonitoringService.getMetricsReport();

            res.json(metricsReport);
        } catch (error) {
            logger.error('Error generating metrics report', {
                error: error.message,
                stack: error.stack
            });

            res.status(500).json({
                error: {
                    type: 'internal_error',
                    message: 'Errore nella generazione del report metriche',
                    code: 'METRICS_ERROR'
                }
            });
        }
    }
);

/**
 * @swagger
 * /api/v2/monitoring/health:
 *   get:
 *     summary: Get system health status
 *     tags: [Monitoring v2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded, unhealthy]
 *                 alerts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       severity:
 *                         type: string
 *                       message:
 *                         type: string
 *                       value:
 *                         type: number
 *                       threshold:
 *                         type: number
 *                 timestamp:
 *                   type: string
 */
router.get('/health',
    authMiddleware.authenticate,
    async (req, res) => {
        try {
            const healthStatus = performanceMonitoringService.getHealthStatus();
            const alerts = performanceMonitoringService.getActiveAlerts();

            const response = {
                status: healthStatus,
                alerts: alerts,
                timestamp: new Date().toISOString()
            };

            // Set appropriate HTTP status based on health
            const statusCode = healthStatus === 'healthy' ? 200 :
                healthStatus === 'degraded' ? 200 : 503;

            res.status(statusCode).json(response);
        } catch (error) {
            logger.error('Error checking health status', {
                error: error.message,
                stack: error.stack
            });

            res.status(500).json({
                status: 'unhealthy',
                alerts: [{
                    type: 'health_check_error',
                    severity: 'critical',
                    message: 'Unable to determine system health',
                    timestamp: new Date().toISOString()
                }],
                timestamp: new Date().toISOString()
            });
        }
    }
);

/**
 * @swagger
 * /api/v2/monitoring/providers:
 *   get:
 *     summary: Get provider-specific performance metrics
 *     tags: [Monitoring v2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Provider performance metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   requests:
 *                     type: number
 *                   totalDuration:
 *                     type: number
 *                   averageDuration:
 *                     type: number
 *                   errors:
 *                     type: number
 *                   errorRate:
 *                     type: number
 *                   totalTokens:
 *                     type: number
 *                   streamingRequests:
 *                     type: number
 */
router.get('/providers',
    authMiddleware.authenticate,
    async (req, res) => {
        try {
            const metricsReport = performanceMonitoringService.getMetricsReport();

            res.json({
                providers: metricsReport.providers,
                generatedAt: metricsReport.generatedAt
            });
        } catch (error) {
            logger.error('Error getting provider metrics', {
                error: error.message,
                stack: error.stack
            });

            res.status(500).json({
                error: {
                    type: 'internal_error',
                    message: 'Errore nel recupero metriche provider',
                    code: 'PROVIDER_METRICS_ERROR'
                }
            });
        }
    }
);

/**
 * @swagger
 * /api/v2/monitoring/auto-selector:
 *   get:
 *     summary: Get auto-selector performance metrics
 *     tags: [Monitoring v2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Auto-selector performance metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalRequests:
 *                   type: number
 *                 successfulSelections:
 *                   type: number
 *                 fallbackUsage:
 *                   type: number
 *                 successRate:
 *                   type: number
 *                 fallbackRate:
 *                   type: number
 *                 averageConfidence:
 *                   type: number
 *                 categoryDistribution:
 *                   type: object
 *                 generatedAt:
 *                   type: string
 */
router.get('/auto-selector',
    authMiddleware.authenticate,
    async (req, res) => {
        try {
            const metricsReport = performanceMonitoringService.getMetricsReport();

            res.json({
                autoSelector: metricsReport.autoSelector,
                generatedAt: metricsReport.generatedAt
            });
        } catch (error) {
            logger.error('Error getting auto-selector metrics', {
                error: error.message,
                stack: error.stack
            });

            res.status(500).json({
                error: {
                    type: 'internal_error',
                    message: 'Errore nel recupero metriche auto-selector',
                    code: 'AUTO_SELECTOR_METRICS_ERROR'
                }
            });
        }
    }
);

/**
 * @swagger
 * /api/v2/monitoring/reset:
 *   post:
 *     summary: Reset performance metrics (admin only)
 *     tags: [Monitoring v2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Metrics reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 resetAt:
 *                   type: string
 *       403:
 *         description: Access denied - admin only
 */
router.post('/reset',
    authMiddleware.authenticate,
    async (req, res) => {
        try {
            // Check if user is admin (you might want to implement proper admin check)
            if (!req.user.is_admin && req.user.role !== 'admin') {
                return res.status(403).json({
                    error: {
                        type: 'access_denied',
                        message: 'Solo gli amministratori possono resettare le metriche',
                        code: 'ADMIN_REQUIRED'
                    }
                });
            }

            performanceMonitoringService.resetMetrics();

            logger.info('Metrics reset by admin', { userId: req.user.id });

            res.json({
                success: true,
                message: 'Metriche resettate con successo',
                resetAt: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Error resetting metrics', {
                error: error.message,
                stack: error.stack,
                userId: req.user.id
            });

            res.status(500).json({
                error: {
                    type: 'internal_error',
                    message: 'Errore nel reset delle metriche',
                    code: 'RESET_ERROR'
                }
            });
        }
    }
);

module.exports = router;
