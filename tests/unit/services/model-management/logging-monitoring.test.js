/**
 * Comprehensive Tests for Logging and Monitoring Components
 * 
 * Tests all logging and monitoring utilities including StructuredLogger,
 * MetricsCollector, and LogRotationManager functionality.
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// Import components to test
const { StructuredLogger, createLoggerFactory, LOG_LEVELS } = require('../../../../services/model-management/utils/structured-logger');
const { MetricsCollector, METRIC_TYPES } = require('../../../../services/model-management/utils/metrics-collector');
const { LogRotationManager } = require('../../../../services/model-management/utils/log-rotation-manager');

// Mock dependencies
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    http: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
    silly: jest.fn(),
    on: jest.fn(),
    end: jest.fn()
  })),
  format: {
    combine: jest.fn(() => 'combined-format'),
    colorize: jest.fn(() => 'colorize-format'),
    timestamp: jest.fn(() => 'timestamp-format'),
    errors: jest.fn(() => 'errors-format'),
    printf: jest.fn(() => 'printf-format'),
    json: jest.fn(() => 'json-format')
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    destroy: jest.fn(),
    nextDate: jest.fn(() => new Date())
  }))
}));

describe('Logging and Monitoring Components', () => {
  
  describe('StructuredLogger', () => {
    let logger;
    let mockWinstonLogger;

    beforeEach(() => {
      const winston = require('winston');
      mockWinstonLogger = winston.createLogger();
      
      logger = new StructuredLogger({
        service: 'test-service',
        component: 'test-component',
        config: {
          enableConsole: false,
          enableFile: false
        }
      });
    });

    describe('Initialization', () => {
      it('should initialize with default configuration', () => {
        const defaultLogger = new StructuredLogger();
        expect(defaultLogger.service).toBe('model-management');
        expect(defaultLogger.component).toBeNull();
      });

      it('should initialize with custom configuration', () => {
        const customLogger = new StructuredLogger({
          service: 'custom-service',
          component: 'custom-component',
          config: { level: 'debug' },
          context: { environment: 'test' }
        });

        expect(customLogger.service).toBe('custom-service');
        expect(customLogger.component).toBe('custom-component');
        expect(customLogger.defaultContext.environment).toBe('test');
      });
    });

    describe('Correlation ID Management', () => {
      it('should set and retrieve correlation ID', () => {
        const correlationId = 'test-correlation-123';
        logger.setCorrelationId(correlationId);
        expect(logger.correlationId).toBe(correlationId);
      });

      it('should generate correlation ID', () => {
        const correlationId = logger.generateCorrelationId();
        expect(correlationId).toBeDefined();
        expect(typeof correlationId).toBe('string');
        expect(correlationId.length).toBe(16); // 8 bytes hex = 16 chars
        expect(logger.correlationId).toBe(correlationId);
      });
    });

    describe('Context Creation', () => {
      it('should create enriched context', () => {
        logger.setCorrelationId('test-123');
        const context = logger.createContext({ custom: 'value' });

        expect(context.service).toBe('test-service');
        expect(context.component).toBe('test-component');
        expect(context.correlationId).toBe('test-123');
        expect(context.custom).toBe('value');
        expect(context.timestamp).toBeDefined();
        expect(context.pid).toBe(process.pid);
      });
    });

    describe('Child Logger', () => {
      it('should create child logger with additional context', () => {
        logger.setCorrelationId('parent-123');
        const childLogger = logger.child({ module: 'child-module' });

        expect(childLogger.service).toBe('test-service');
        expect(childLogger.component).toBe('test-component');
        expect(childLogger.correlationId).toBe('parent-123');
        expect(childLogger.defaultContext.module).toBe('child-module');
      });
    });

    describe('Logging Methods', () => {
      beforeEach(() => {
        logger.logger = mockWinstonLogger;
      });

      it('should log error messages', () => {
        logger.error('Test error message', { key: 'value' });
        
        expect(mockWinstonLogger.error).toHaveBeenCalledWith(
          'Test error message',
          expect.objectContaining({
            service: 'test-service',
            component: 'test-component',
            key: 'value'
          })
        );
        expect(logger.metrics.errorCount).toBe(1);
      });

      it('should handle Error objects', () => {
        const error = new Error('Test error');
        error.code = 'TEST_ERROR';
        
        logger.error('Error occurred', error);
        
        expect(mockWinstonLogger.error).toHaveBeenCalledWith(
          'Error occurred',
          expect.objectContaining({
            error: {
              name: 'Error',
              message: 'Test error',
              stack: expect.any(String),
              code: 'TEST_ERROR'
            }
          })
        );
      });

      it('should log info messages', () => {
        logger.info('Test info message', { data: 'test' });
        
        expect(mockWinstonLogger.info).toHaveBeenCalledWith(
          'Test info message',
          expect.objectContaining({
            service: 'test-service',
            data: 'test'
          })
        );
      });

      it('should log performance metrics', () => {
        logger.performance('test_operation', 1500, { items: 10 });
        
        expect(mockWinstonLogger.info).toHaveBeenCalledWith(
          'Performance: test_operation',
          expect.objectContaining({
            type: 'performance',
            operation: 'test_operation',
            duration: 1500,
            durationHuman: '1.50s',
            items: 10
          })
        );
      });

      it('should log structured events', () => {
        logger.event('user_action', { action: 'login', userId: 123 }, 'info');
        
        expect(mockWinstonLogger.info).toHaveBeenCalledWith(
          'Event: user_action',
          expect.objectContaining({
            type: 'event',
            event: 'user_action',
            action: 'login',
            userId: 123
          })
        );
      });

      it('should log audit trail', () => {
        logger.audit('model_updated', { modelId: 456, user: 'admin' });
        
        expect(mockWinstonLogger.info).toHaveBeenCalledWith(
          'Audit: model_updated',
          expect.objectContaining({
            type: 'audit',
            action: 'model_updated',
            modelId: 456,
            user: 'admin'
          })
        );
      });
    });

    describe('Timer Operations', () => {
      beforeEach(() => {
        logger.logger = mockWinstonLogger;
      });

      it('should start and end timers', () => {
        const timerId = logger.startTimer('test_operation');
        expect(timerId).toBeDefined();
        expect(logger.metrics.timings.has(timerId)).toBe(true);

        // Wait a bit to ensure measurable time
        setTimeout(() => {
          logger.endTimer(timerId, { items: 5 });
          expect(logger.metrics.timings.has(timerId)).toBe(false);
          expect(mockWinstonLogger.info).toHaveBeenCalledWith(
            'Performance: test_operation',
            expect.objectContaining({
              type: 'performance',
              operation: 'test_operation',
              items: 5
            })
          );
        }, 10);
      });

      it('should handle invalid timer IDs', () => {
        logger.endTimer('invalid-timer-id');
        expect(mockWinstonLogger.warn).toHaveBeenCalledWith(
          'Timer not found',
          expect.objectContaining({
            timerId: 'invalid-timer-id'
          })
        );
      });
    });

    describe('Utility Methods', () => {
      it('should format duration correctly', () => {
        expect(logger.formatDuration(500)).toBe('500ms');
        expect(logger.formatDuration(1500)).toBe('1.50s');
        expect(logger.formatDuration(90000)).toBe('1.50m');
        expect(logger.formatDuration(7200000)).toBe('2.00h');
      });

      it('should check log level enablement', () => {
        logger.config.level = 'info';
        expect(logger.isLevelEnabled('error')).toBe(true);
        expect(logger.isLevelEnabled('info')).toBe(true);
        expect(logger.isLevelEnabled('debug')).toBe(false);
      });

      it('should provide metrics', () => {
        logger.metrics.logsWritten = 10;
        logger.metrics.errorCount = 2;
        
        const metrics = logger.getMetrics();
        expect(metrics.logsWritten).toBe(10);
        expect(metrics.errorCount).toBe(2);
        expect(metrics.service).toBe('test-service');
      });

      it('should reset metrics', () => {
        logger.metrics.logsWritten = 10;
        logger.resetMetrics();
        expect(logger.metrics.logsWritten).toBe(0);
      });
    });

    describe('Logger Factory', () => {
      it('should create logger factory', () => {
        const factory = createLoggerFactory({
          service: 'factory-service',
          config: { level: 'debug' }
        });

        const factoryLogger = factory({
          component: 'factory-component'
        });

        expect(factoryLogger.service).toBe('factory-service');
        expect(factoryLogger.component).toBe('factory-component');
      });
    });
  });

  describe('MetricsCollector', () => {
    let metrics;
    let mockLogger;

    beforeEach(() => {
      mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      metrics = new MetricsCollector({
        logger: mockLogger,
        config: {
          enableCollection: true,
          flushInterval: 1000
        }
      });
    });

    afterEach(() => {
      if (metrics) {
        metrics.stopCollection();
      }
    });

    describe('Initialization', () => {
      it('should initialize with default configuration', () => {
        const defaultMetrics = new MetricsCollector();
        expect(defaultMetrics.config.enableCollection).toBe(true);
        expect(defaultMetrics.metrics).toBeInstanceOf(Map);
      });

      it('should start and stop collection', () => {
        metrics.startCollection();
        expect(metrics.flushIntervalId).toBeDefined();

        metrics.stopCollection();
        expect(metrics.flushIntervalId).toBeNull();
      });
    });

    describe('Counter Metrics', () => {
      it('should increment counters', () => {
        metrics.increment('test_counter', 5, { tag: 'value' });
        
        const metric = metrics.metrics.get('test_counter[tag:value]');
        expect(metric.value).toBe(5);
        expect(metric.type).toBe(METRIC_TYPES.COUNTER);
      });

      it('should decrement counters', () => {
        metrics.increment('test_counter', 10);
        metrics.decrement('test_counter', 3);
        
        const metric = metrics.metrics.get('test_counter');
        expect(metric.value).toBe(7);
      });
    });

    describe('Gauge Metrics', () => {
      it('should set gauge values', () => {
        metrics.gauge('test_gauge', 42.5, { unit: 'percent' });
        
        const metric = metrics.metrics.get('test_gauge[unit:percent]');
        expect(metric.value).toBe(42.5);
        expect(metric.type).toBe(METRIC_TYPES.GAUGE);
      });
    });

    describe('Timing Metrics', () => {
      it('should record timing values', () => {
        metrics.timing('test_timer', 1500);
        metrics.timing('test_timer', 2000);
        
        const metric = metrics.metrics.get('test_timer');
        expect(metric.count).toBe(2);
        expect(metric.sum).toBe(3500);
        expect(metric.min).toBe(1500);
        expect(metric.max).toBe(2000);
        expect(metric.samples).toEqual([1500, 2000]);
      });

      it('should manage sample size', () => {
        const metric = metrics.getOrCreateMetric('test_timer', METRIC_TYPES.TIMER);
        metric.samples = new Array(1001).fill(100);
        
        metrics.timing('test_timer', 200);
        
        expect(metric.samples.length).toBeLessThanOrEqual(501);
      });
    });

    describe('Histogram Metrics', () => {
      it('should record histogram values', () => {
        metrics.histogram('test_histogram', 150);
        
        const metric = metrics.metrics.get('test_histogram');
        expect(metric.count).toBe(1);
        expect(metric.sum).toBe(150);
        expect(metric.buckets.get(250)).toBe(1);
        expect(metric.buckets.get(100)).toBe(0);
      });
    });

    describe('Set Metrics', () => {
      it('should add values to sets', () => {
        metrics.set('test_set', 'value1');
        metrics.set('test_set', 'value2');
        metrics.set('test_set', 'value1'); // Duplicate
        
        const metric = metrics.metrics.get('test_set');
        expect(metric.values.size).toBe(2);
        expect(metric.values.has('value1')).toBe(true);
        expect(metric.values.has('value2')).toBe(true);
      });
    });

    describe('Timer Operations', () => {
      it('should start and end timers', (done) => {
        const timerId = metrics.startTimer('operation', { type: 'test' });
        expect(metrics.timers.has(timerId)).toBe(true);

        setTimeout(() => {
          const duration = metrics.endTimer(timerId);
          expect(duration).toBeGreaterThan(0);
          expect(metrics.timers.has(timerId)).toBe(false);
          
          const metric = metrics.metrics.get('operation[type:test]');
          expect(metric.count).toBe(1);
          done();
        }, 10);
      });

      it('should handle invalid timer IDs', () => {
        const result = metrics.endTimer('invalid-id');
        expect(result).toBeNull();
        expect(mockLogger.warn).toHaveBeenCalled();
      });
    });

    describe('Metric Key Generation', () => {
      it('should create metric keys with tags', () => {
        const key = metrics.createMetricKey('test_metric', { tag1: 'value1', tag2: 'value2' });
        expect(key).toBe('test_metric[tag1:value1,tag2:value2]');
      });

      it('should create metric keys without tags', () => {
        const key = metrics.createMetricKey('test_metric', {});
        expect(key).toBe('test_metric');
      });
    });

    describe('System Metrics', () => {
      it('should collect system metrics', () => {
        metrics.collectSystemMetrics();
        
        expect(metrics.metrics.has('system.memory.rss')).toBe(true);
        expect(metrics.metrics.has('system.cpu.user')).toBe(true);
        expect(metrics.metrics.has('system.uptime')).toBe(true);
      });
    });

    describe('Percentile Calculations', () => {
      it('should calculate percentiles correctly', () => {
        const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const percentiles = metrics.calculatePercentiles(samples, [50, 90, 99]);
        
        expect(percentiles.p50).toBe(5);
        expect(percentiles.p90).toBe(9);
        expect(percentiles.p99).toBe(10);
      });

      it('should handle empty samples', () => {
        const percentiles = metrics.calculatePercentiles([]);
        expect(Object.keys(percentiles)).toHaveLength(0);
      });
    });

    describe('Data Aggregation', () => {
      it('should get aggregated metrics', () => {
        metrics.increment('counter1', 5);
        metrics.gauge('gauge1', 42);
        metrics.timing('timer1', 1000);
        
        const aggregated = metrics.getMetrics();
        
        expect(aggregated.timestamp).toBeDefined();
        expect(aggregated.metrics['counter1'].value).toBe(5);
        expect(aggregated.metrics['gauge1'].value).toBe(42);
        expect(aggregated.metrics['timer1'].count).toBe(1);
      });

      it('should get metrics summary', () => {
        metrics.increment('counter1');
        metrics.gauge('gauge1', 100);
        
        const summary = metrics.getSummary();
        
        expect(summary.totalMetrics).toBe(2);
        expect(summary.typeCount[METRIC_TYPES.COUNTER]).toBe(1);
        expect(summary.typeCount[METRIC_TYPES.GAUGE]).toBe(1);
      });
    });

    describe('Cleanup and Reset', () => {
      it('should clean up old metrics', () => {
        // Create an old metric
        const oldMetric = metrics.getOrCreateMetric('old_metric', METRIC_TYPES.COUNTER);
        oldMetric.lastUpdated = Date.now() - (10 * 60 * 1000); // 10 minutes ago
        
        // Create a recent metric
        metrics.increment('recent_metric');
        
        metrics.cleanupOldMetrics();
        
        expect(metrics.metrics.has('old_metric')).toBe(false);
        expect(metrics.metrics.has('recent_metric')).toBe(true);
      });

      it('should reset all metrics', () => {
        metrics.increment('test_counter');
        metrics.gauge('test_gauge', 42);
        
        expect(metrics.metrics.size).toBeGreaterThan(0);
        
        metrics.reset();
        
        expect(metrics.metrics.size).toBe(0);
        expect(metrics.systemMetrics.metricsCount).toBe(0);
      });
    });
  });

  describe('LogRotationManager', () => {
    let rotationManager;
    let mockLogger;
    let testLogDir;

    beforeEach(() => {
      mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      testLogDir = path.join(__dirname, 'test-logs');
      
      rotationManager = new LogRotationManager({
        logger: mockLogger,
        config: {
          logDirectories: [testLogDir],
          maxFileSize: 1024, // 1KB for testing
          maxFiles: 3,
          retentionDays: 7,
          enableCompression: false, // Disable for simpler testing
          cleanupInterval: null // Disable scheduled cleanup for tests
        }
      });

      // Ensure test directory exists
      if (!fs.existsSync(testLogDir)) {
        fs.mkdirSync(testLogDir, { recursive: true });
      }
    });

    afterEach(() => {
      rotationManager.stop();
      
      // Cleanup test files
      if (fs.existsSync(testLogDir)) {
        const files = fs.readdirSync(testLogDir);
        files.forEach(file => {
          fs.unlinkSync(path.join(testLogDir, file));
        });
        fs.rmdirSync(testLogDir);
      }
    });

    describe('Initialization', () => {
      it('should initialize with default configuration', () => {
        const defaultManager = new LogRotationManager();
        expect(defaultManager.config.maxFileSize).toBeDefined();
        expect(defaultManager.config.retentionDays).toBeDefined();
      });

      it('should start and stop', () => {
        rotationManager.start();
        expect(mockLogger.info).toHaveBeenCalledWith('[LogRotationManager] Started');
        
        rotationManager.stop();
        expect(mockLogger.info).toHaveBeenCalledWith('[LogRotationManager] Stopped');
      });
    });

    describe('File Pattern Matching', () => {
      it('should match file patterns correctly', () => {
        expect(rotationManager.shouldProcessFile('test.log')).toBe(true);
        expect(rotationManager.shouldProcessFile('data.json')).toBe(true);
        expect(rotationManager.shouldProcessFile('current.log')).toBe(false); // Excluded
        expect(rotationManager.shouldProcessFile('test.txt')).toBe(false);
      });

      it('should match glob patterns', () => {
        expect(rotationManager.matchesPattern('test.log', '*.log')).toBe(true);
        expect(rotationManager.matchesPattern('test.json', '*.json')).toBe(true);
        expect(rotationManager.matchesPattern('test.log', '*.txt')).toBe(false);
      });
    });

    describe('File Operations', () => {
      let testFilePath;

      beforeEach(() => {
        testFilePath = path.join(testLogDir, 'test.log');
      });

      it('should detect files needing rotation by size', async () => {
        // Create a file larger than maxFileSize
        fs.writeFileSync(testFilePath, 'a'.repeat(2048));
        const stats = fs.statSync(testFilePath);
        
        const shouldRotate = await rotationManager.shouldRotateFile(testFilePath, stats);
        expect(shouldRotate).toBe(true);
      });

      it('should detect files needing deletion by age', async () => {
        fs.writeFileSync(testFilePath, 'test content');
        const stats = fs.statSync(testFilePath);
        
        // Mock old file by changing the config
        rotationManager.config.retentionDays = 0;
        
        const shouldDelete = await rotationManager.shouldDeleteFile(testFilePath, stats);
        expect(shouldDelete).toBe(true);
      });

      it('should perform manual rotation', async () => {
        fs.writeFileSync(testFilePath, 'test content');
        
        await rotationManager.manualRotate(testFilePath);
        
        expect(fs.existsSync(testFilePath)).toBe(false);
        expect(fs.existsSync(path.join(testLogDir, 'test.1.log'))).toBe(true);
        expect(rotationManager.stats.rotationsPerformed).toBe(1);
      });
    });

    describe('Statistics', () => {
      it('should track statistics', () => {
        const stats = rotationManager.getStats();
        
        expect(stats.rotationsPerformed).toBeDefined();
        expect(stats.filesCompressed).toBeDefined();
        expect(stats.filesDeleted).toBeDefined();
        expect(stats.spaceFreed).toBeDefined();
      });

      it('should reset statistics', () => {
        rotationManager.stats.rotationsPerformed = 5;
        rotationManager.resetStats();
        
        expect(rotationManager.stats.rotationsPerformed).toBe(0);
      });
    });

    describe('Configuration Management', () => {
      it('should get current configuration', () => {
        const config = rotationManager.getConfig();
        expect(config.maxFileSize).toBe(1024);
        expect(config.retentionDays).toBe(7);
      });

      it('should update configuration', () => {
        rotationManager.updateConfig({
          maxFileSize: 2048,
          retentionDays: 14
        });
        
        expect(rotationManager.config.maxFileSize).toBe(2048);
        expect(rotationManager.config.retentionDays).toBe(14);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should integrate logger with metrics collector', () => {
      const mockMetrics = {
        increment: jest.fn(),
        gauge: jest.fn(),
        timing: jest.fn()
      };

      const logger = new StructuredLogger({
        service: 'integration-test',
        config: { enableConsole: false, enableFile: false }
      });

      // Mock the winston logger to avoid actual logging
      logger.logger = {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn()
      };

      // Simulate logging with metrics
      logger.info('Test message');
      mockMetrics.increment('log_messages', 1, { level: 'info' });
      
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'log_messages',
        1,
        { level: 'info' }
      );
    });

    it('should handle metrics collector events', (done) => {
      const metrics = new MetricsCollector({
        config: { enableCollection: true }
      });

      metrics.on('metric', (data) => {
        expect(data.type).toBe('increment');
        expect(data.name).toBe('test_event');
        expect(data.value).toBe(1);
        done();
      });

      metrics.increment('test_event');
    });
  });
});