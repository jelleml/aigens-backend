/**
 * Performance Monitoring Service for AI SDK Integration
 * Tracks metrics, performance, and usage statistics for v2 API
 */

const { createLogger } = require('../scripts/utils/error-handler');
const logger = createLogger('performance-monitoring');

/**
 * Performance Monitoring Service
 */
class PerformanceMonitoringService {
    constructor() {
        this.metrics = new Map();
        this.startTime = Date.now();
        this.requestCount = 0;
        this.errorCount = 0;
        this.streamCount = 0;
        this.activeStreams = new Set();

        // Provider-specific metrics
        this.providerMetrics = new Map();

        // Auto-selector metrics
        this.autoSelectorMetrics = {
            totalRequests: 0,
            successfulSelections: 0,
            fallbackUsage: 0,
            averageConfidence: 0,
            categoryDistribution: new Map()
        };

        // Performance thresholds
        this.thresholds = {
            responseTime: 5000, // 5 seconds
            errorRate: 0.05,    // 5%
            streamLatency: 2000 // 2 seconds to first token
        };
    }

    /**
     * Record API request metrics
     * @param {Object} params - Request parameters
     */
    recordAPIRequest(params) {
        const {
            endpoint,
            method,
            userId,
            duration,
            statusCode,
            modelSlug,
            provider,
            streaming = false,
            autoSelectorUsed = false,
            tokenCount = 0
        } = params;

        this.requestCount++;

        const metricKey = `${method}_${endpoint}`;
        if (!this.metrics.has(metricKey)) {
            this.metrics.set(metricKey, {
                count: 0,
                totalDuration: 0,
                errors: 0,
                averageDuration: 0,
                minDuration: Infinity,
                maxDuration: 0,
                statusCodes: new Map()
            });
        }

        const metric = this.metrics.get(metricKey);
        metric.count++;
        metric.totalDuration += duration;
        metric.averageDuration = metric.totalDuration / metric.count;
        metric.minDuration = Math.min(metric.minDuration, duration);
        metric.maxDuration = Math.max(metric.maxDuration, duration);

        // Track status codes
        const statusKey = Math.floor(statusCode / 100) * 100;
        metric.statusCodes.set(statusKey, (metric.statusCodes.get(statusKey) || 0) + 1);

        if (statusCode >= 400) {
            metric.errors++;
            this.errorCount++;
        }

        // Track streaming metrics
        if (streaming) {
            this.streamCount++;
        }

        // Track provider metrics
        if (provider) {
            this.recordProviderMetrics(provider, {
                duration,
                statusCode,
                tokenCount,
                streaming
            });
        }

        // Track auto-selector metrics
        if (autoSelectorUsed) {
            this.recordAutoSelectorMetrics(params);
        }

        logger.info('API request recorded', {
            endpoint,
            method,
            userId,
            duration,
            statusCode,
            modelSlug,
            provider,
            streaming,
            autoSelectorUsed
        });
    }

    /**
     * Record provider-specific metrics
     * @param {string} provider - Provider name
     * @param {Object} metrics - Provider metrics
     */
    recordProviderMetrics(provider, metrics) {
        if (!this.providerMetrics.has(provider)) {
            this.providerMetrics.set(provider, {
                requests: 0,
                totalDuration: 0,
                averageDuration: 0,
                errors: 0,
                totalTokens: 0,
                streamingRequests: 0,
                errorRate: 0
            });
        }

        const providerMetric = this.providerMetrics.get(provider);
        providerMetric.requests++;
        providerMetric.totalDuration += metrics.duration;
        providerMetric.averageDuration = providerMetric.totalDuration / providerMetric.requests;
        providerMetric.totalTokens += metrics.tokenCount || 0;

        if (metrics.streaming) {
            providerMetric.streamingRequests++;
        }

        if (metrics.statusCode >= 400) {
            providerMetric.errors++;
        }

        providerMetric.errorRate = providerMetric.errors / providerMetric.requests;
    }

    /**
     * Record auto-selector metrics
     * @param {Object} params - Auto-selector parameters
     */
    recordAutoSelectorMetrics(params) {
        const { autoSelectorResult, autoSelectorFallback = false } = params;

        this.autoSelectorMetrics.totalRequests++;

        if (autoSelectorFallback) {
            this.autoSelectorMetrics.fallbackUsage++;
        } else {
            this.autoSelectorMetrics.successfulSelections++;

            if (autoSelectorResult?.confidence) {
                const currentAvg = this.autoSelectorMetrics.averageConfidence;
                const count = this.autoSelectorMetrics.successfulSelections;
                this.autoSelectorMetrics.averageConfidence =
                    (currentAvg * (count - 1) + autoSelectorResult.confidence) / count;
            }

            if (autoSelectorResult?.category) {
                const category = autoSelectorResult.category;
                const current = this.autoSelectorMetrics.categoryDistribution.get(category) || 0;
                this.autoSelectorMetrics.categoryDistribution.set(category, current + 1);
            }
        }
    }

    /**
     * Record streaming metrics
     * @param {Object} params - Streaming parameters
     */
    recordStreamingMetrics(params) {
        const {
            streamId,
            event, // 'start', 'token', 'finish', 'error', 'abort'
            duration,
            tokenCount,
            firstTokenLatency
        } = params;

        switch (event) {
            case 'start':
                this.activeStreams.add(streamId);
                break;

            case 'finish':
            case 'error':
            case 'abort':
                this.activeStreams.delete(streamId);
                break;
        }

        logger.info('Streaming event recorded', {
            streamId,
            event,
            duration,
            tokenCount,
            firstTokenLatency,
            activeStreams: this.activeStreams.size
        });
    }

    /**
     * Get comprehensive metrics report
     * @returns {Object} Metrics report
     */
    getMetricsReport() {
        const uptime = Date.now() - this.startTime;
        const errorRate = this.errorCount / Math.max(this.requestCount, 1);

        // Convert metrics Map to object for JSON serialization
        const endpointMetrics = {};
        for (const [key, value] of this.metrics.entries()) {
            endpointMetrics[key] = {
                ...value,
                statusCodes: Object.fromEntries(value.statusCodes)
            };
        }

        const providerMetrics = Object.fromEntries(this.providerMetrics);

        const categoryDistribution = Object.fromEntries(
            this.autoSelectorMetrics.categoryDistribution
        );

        return {
            system: {
                uptime,
                uptimeFormatted: this.formatDuration(uptime),
                startTime: new Date(this.startTime).toISOString()
            },

            requests: {
                total: this.requestCount,
                errors: this.errorCount,
                errorRate: Math.round(errorRate * 10000) / 100, // Percentage with 2 decimals
                streams: this.streamCount,
                activeStreams: this.activeStreams.size,
                requestsPerMinute: Math.round((this.requestCount / (uptime / 60000)) * 100) / 100
            },

            endpoints: endpointMetrics,

            providers: providerMetrics,

            autoSelector: {
                ...this.autoSelectorMetrics,
                successRate: Math.round(
                    (this.autoSelectorMetrics.successfulSelections /
                        Math.max(this.autoSelectorMetrics.totalRequests, 1)) * 10000
                ) / 100,
                fallbackRate: Math.round(
                    (this.autoSelectorMetrics.fallbackUsage /
                        Math.max(this.autoSelectorMetrics.totalRequests, 1)) * 10000
                ) / 100,
                categoryDistribution
            },

            health: {
                status: this.getHealthStatus(),
                alerts: this.getActiveAlerts()
            },

            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Get system health status
     * @returns {string} Health status
     */
    getHealthStatus() {
        const errorRate = this.errorCount / Math.max(this.requestCount, 1);

        if (errorRate > this.thresholds.errorRate) {
            return 'degraded';
        }

        // Check provider health
        for (const [provider, metrics] of this.providerMetrics.entries()) {
            if (metrics.errorRate > this.thresholds.errorRate) {
                return 'degraded';
            }
        }

        return 'healthy';
    }

    /**
     * Get active alerts
     * @returns {Array} Active alerts
     */
    getActiveAlerts() {
        const alerts = [];
        const errorRate = this.errorCount / Math.max(this.requestCount, 1);

        if (errorRate > this.thresholds.errorRate) {
            alerts.push({
                type: 'error_rate',
                severity: 'warning',
                message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(this.thresholds.errorRate * 100)}%`,
                value: errorRate,
                threshold: this.thresholds.errorRate
            });
        }

        // Check provider-specific alerts
        for (const [provider, metrics] of this.providerMetrics.entries()) {
            if (metrics.errorRate > this.thresholds.errorRate) {
                alerts.push({
                    type: 'provider_error_rate',
                    severity: 'warning',
                    message: `Provider ${provider} error rate ${(metrics.errorRate * 100).toFixed(2)}% exceeds threshold`,
                    provider,
                    value: metrics.errorRate,
                    threshold: this.thresholds.errorRate
                });
            }

            if (metrics.averageDuration > this.thresholds.responseTime) {
                alerts.push({
                    type: 'provider_latency',
                    severity: 'info',
                    message: `Provider ${provider} average response time ${metrics.averageDuration}ms exceeds threshold`,
                    provider,
                    value: metrics.averageDuration,
                    threshold: this.thresholds.responseTime
                });
            }
        }

        return alerts;
    }

    /**
     * Reset metrics (useful for testing or periodic resets)
     */
    resetMetrics() {
        this.metrics.clear();
        this.providerMetrics.clear();
        this.requestCount = 0;
        this.errorCount = 0;
        this.streamCount = 0;
        this.activeStreams.clear();
        this.startTime = Date.now();

        this.autoSelectorMetrics = {
            totalRequests: 0,
            successfulSelections: 0,
            fallbackUsage: 0,
            averageConfidence: 0,
            categoryDistribution: new Map()
        };

        logger.info('Metrics reset completed');
    }

    /**
     * Format duration in human-readable format
     * @param {number} ms - Duration in milliseconds
     * @returns {string} Formatted duration
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Log performance summary (called periodically)
     */
    logPerformanceSummary() {
        const report = this.getMetricsReport();

        logger.info('Performance Summary', {
            uptime: report.system.uptimeFormatted,
            requests: report.requests.total,
            errorRate: `${report.requests.errorRate}%`,
            requestsPerMinute: report.requests.requestsPerMinute,
            activeStreams: report.requests.activeStreams,
            healthStatus: report.health.status,
            alertCount: report.health.alerts.length
        });

        // Log provider performance
        for (const [provider, metrics] of Object.entries(report.providers)) {
            logger.info(`Provider Performance: ${provider}`, {
                requests: metrics.requests,
                averageDuration: `${metrics.averageDuration}ms`,
                errorRate: `${(metrics.errorRate * 100).toFixed(2)}%`,
                totalTokens: metrics.totalTokens,
                streamingRequests: metrics.streamingRequests
            });
        }

        // Log auto-selector performance
        if (report.autoSelector.totalRequests > 0) {
            logger.info('Auto-Selector Performance', {
                totalRequests: report.autoSelector.totalRequests,
                successRate: `${report.autoSelector.successRate}%`,
                fallbackRate: `${report.autoSelector.fallbackRate}%`,
                averageConfidence: report.autoSelector.averageConfidence.toFixed(3),
                topCategories: Object.entries(report.autoSelector.categoryDistribution)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([cat, count]) => `${cat}: ${count}`)
                    .join(', ')
            });
        }
    }
}

// Export singleton instance
const performanceMonitoringService = new PerformanceMonitoringService();

// Log performance summary every 5 minutes
setInterval(() => {
    performanceMonitoringService.logPerformanceSummary();
}, 5 * 60 * 1000);

module.exports = performanceMonitoringService;
