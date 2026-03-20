/**
 * Unit tests for TimeoutManager
 */

const { TimeoutManager, FALLBACK_STRATEGIES } = require('../../../../services/model-management/utils/timeout-manager');

describe('TimeoutManager', () => {
  let timeoutManager;
  let mockLogger;
  let mockMetrics;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockMetrics = {
      recordTimeoutSuccess: jest.fn(),
      recordTimeoutFailure: jest.fn(),
      recordTimeoutError: jest.fn()
    };

    timeoutManager = new TimeoutManager({
      api_request: {
        request: 1000,
        operation: 2000,
        total: 5000
      }
    }, mockLogger, mockMetrics);

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const manager = new TimeoutManager();
      
      expect(manager.config.api_request.request).toBe(30000);
      expect(manager.config.database.query).toBe(15000);
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = {
        api_request: { request: 5000, operation: 10000, total: 30000 }
      };
      const manager = new TimeoutManager(customConfig);
      
      expect(manager.config.api_request.request).toBe(5000);
      expect(manager.config.api_request.operation).toBe(10000);
      expect(manager.config.database.query).toBe(15000); // Should keep default
    });
  });

  describe('executeWithTimeout', () => {
    it('should execute function successfully within timeout', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await timeoutManager.executeWithTimeout(mockFn, {
        operationType: 'api_request',
        operationName: 'test_operation'
      });
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockMetrics.recordTimeoutSuccess).toHaveBeenCalled();
    });

    it('should timeout and throw error when operation exceeds timeout', async () => {
      const slowFn = jest.fn(() => new Promise(resolve => 
        setTimeout(() => resolve('slow_success'), 3000)
      ));
      
      const promise = timeoutManager.executeWithTimeout(slowFn, {
        operationType: 'api_request',
        operationName: 'slow_operation'
      });
      
      // Fast forward past operation timeout
      jest.advanceTimersByTime(2100);
      
      await expect(promise).rejects.toMatchObject({
        name: 'TimeoutError',
        type: 'OPERATION_TIMEOUT'
      });
      
      expect(mockMetrics.recordTimeoutFailure).toHaveBeenCalled();
    });

    it('should use fallback strategy on timeout', async () => {
      const slowFn = jest.fn(() => new Promise(resolve => 
        setTimeout(() => resolve('slow_success'), 3000)
      ));
      
      const promise = timeoutManager.executeWithTimeout(slowFn, {
        operationType: 'api_request',
        operationName: 'slow_operation',
        fallbackStrategy: FALLBACK_STRATEGIES.USE_DEFAULT_VALUES
      });
      
      jest.advanceTimersByTime(2100);
      
      const result = await promise;
      
      expect(result).toMatchObject({
        success: false,
        data: [],
        message: expect.stringContaining('timed out')
      });
    });

    it('should call onTimeout callback when timeout occurs', async () => {
      const slowFn = jest.fn(() => new Promise(resolve => 
        setTimeout(() => resolve('slow_success'), 3000)
      ));
      
      const onTimeout = jest.fn();
      
      const promise = timeoutManager.executeWithTimeout(slowFn, {
        operationType: 'api_request',
        operationName: 'slow_operation',
        onTimeout,
        fallbackStrategy: FALLBACK_STRATEGIES.USE_DEFAULT_VALUES
      });
      
      jest.advanceTimersByTime(2100);
      
      await promise;
      
      expect(onTimeout).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TimeoutError' }),
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should execute cleanup function on completion', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const cleanup = jest.fn();
      
      await timeoutManager.executeWithTimeout(mockFn, {
        operationType: 'api_request',
        operationName: 'test_operation',
        cleanup
      });
      
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should execute cleanup function on timeout', async () => {
      const slowFn = jest.fn(() => new Promise(resolve => 
        setTimeout(() => resolve('slow_success'), 3000)
      ));
      const cleanup = jest.fn();
      
      const promise = timeoutManager.executeWithTimeout(slowFn, {
        operationType: 'api_request',
        operationName: 'slow_operation',
        cleanup,
        fallbackStrategy: FALLBACK_STRATEGIES.USE_DEFAULT_VALUES
      });
      
      jest.advanceTimersByTime(2100);
      await promise;
      
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should pass timeout to function if it accepts parameters', async () => {
      const mockFn = jest.fn(({ timeout }) => 
        Promise.resolve(`completed with timeout: ${timeout}`)
      );
      
      const result = await timeoutManager.executeWithTimeout(mockFn, {
        operationType: 'api_request',
        operationName: 'test_operation'
      });
      
      expect(result).toBe('completed with timeout: 1000');
      expect(mockFn).toHaveBeenCalledWith({
        timeout: 1000,
        operationId: expect.any(String)
      });
    });

    it('should handle custom timeout overrides', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await timeoutManager.executeWithTimeout(mockFn, {
        operationType: 'api_request',
        operationName: 'test_operation',
        requestTimeout: 500,
        operationTimeout: 1500,
        totalTimeout: 3000
      });
      
      expect(mockMetrics.recordTimeoutSuccess).toHaveBeenCalledWith(
        'api_request',
        'test_operation',
        expect.any(Number),
        expect.objectContaining({
          request: 500,
          operation: 1500,
          total: 3000
        })
      );
    });
  });

  describe('executeFallbackStrategy', () => {
    it('should execute USE_CACHED_DATA strategy', async () => {
      const timeoutError = new Error('Timeout');
      timeoutError.type = 'OPERATION_TIMEOUT';
      
      const result = await timeoutManager.executeFallbackStrategy(
        FALLBACK_STRATEGIES.USE_CACHED_DATA,
        null,
        timeoutError,
        'test_op_123'
      );
      
      expect(result).toBe(null); // Default implementation returns null
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to retrieve cached data'),
        expect.any(Object)
      );
    });

    it('should execute USE_DEFAULT_VALUES strategy', async () => {
      const timeoutError = new Error('Timeout');
      
      const result = await timeoutManager.executeFallbackStrategy(
        FALLBACK_STRATEGIES.USE_DEFAULT_VALUES,
        null,
        timeoutError,
        'test_op_123'
      );
      
      expect(result).toMatchObject({
        success: false,
        data: [],
        message: expect.stringContaining('timed out')
      });
    });

    it('should execute SKIP_OPERATION strategy', async () => {
      const timeoutError = new Error('Timeout');
      
      const result = await timeoutManager.executeFallbackStrategy(
        FALLBACK_STRATEGIES.SKIP_OPERATION,
        null,
        timeoutError,
        'test_op_123'
      );
      
      expect(result).toBe(null);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping operation due to timeout'),
        expect.any(Object)
      );
    });

    it('should execute FAIL_FAST strategy', async () => {
      const timeoutError = new Error('Timeout');
      
      await expect(timeoutManager.executeFallbackStrategy(
        FALLBACK_STRATEGIES.FAIL_FAST,
        null,
        timeoutError,
        'test_op_123'
      )).rejects.toBe(timeoutError);
    });

    it('should execute custom fallback function', async () => {
      const timeoutError = new Error('Timeout');
      const fallbackFn = jest.fn().mockResolvedValue('fallback_result');
      
      const result = await timeoutManager.executeFallbackStrategy(
        'CUSTOM_STRATEGY',
        fallbackFn,
        timeoutError,
        'test_op_123'
      );
      
      expect(result).toBe('fallback_result');
      expect(fallbackFn).toHaveBeenCalledWith(timeoutError, 'test_op_123');
    });

    it('should throw error for unknown strategy without fallback function', async () => {
      const timeoutError = new Error('Timeout');
      
      await expect(timeoutManager.executeFallbackStrategy(
        'UNKNOWN_STRATEGY',
        null,
        timeoutError,
        'test_op_123'
      )).rejects.toBe(timeoutError);
    });
  });

  describe('getTimeoutConfig', () => {
    it('should return configuration for known operation type', () => {
      const config = timeoutManager.getTimeoutConfig('api_request');
      
      expect(config).toEqual({
        request: 1000,
        operation: 2000,
        total: 5000
      });
    });

    it('should return default configuration for unknown operation type', () => {
      const config = timeoutManager.getTimeoutConfig('unknown_operation');
      
      expect(config).toEqual({
        request: 1000,
        operation: 2000,
        total: 5000
      });
    });

    it('should apply overrides to base configuration', () => {
      const config = timeoutManager.getTimeoutConfig('api_request', {
        requestTimeout: 2000,
        operationTimeout: 4000
      });
      
      expect(config).toEqual({
        request: 2000,
        operation: 4000,
        total: 5000 // Should keep original
      });
    });
  });

  describe('isTimeoutError', () => {
    it('should identify timeout errors by name', () => {
      const error = new Error('Operation timed out');
      error.name = 'TimeoutError';
      
      expect(timeoutManager.isTimeoutError(error)).toBe(true);
    });

    it('should identify timeout errors by message', () => {
      const error = new Error('Request timeout after 30 seconds');
      
      expect(timeoutManager.isTimeoutError(error)).toBe(true);
    });

    it('should identify timeout errors by code', () => {
      const error = new Error('Connection failed');
      error.code = 'ETIMEDOUT';
      
      expect(timeoutManager.isTimeoutError(error)).toBe(true);
    });

    it('should not identify non-timeout errors', () => {
      const error = new Error('Server error');
      
      expect(timeoutManager.isTimeoutError(error)).toBe(false);
    });
  });

  describe('operation tracking', () => {
    it('should register and unregister operations', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      expect(timeoutManager.activeOperations.size).toBe(0);
      
      const promise = timeoutManager.executeWithTimeout(mockFn, {
        operationName: 'test_operation'
      });
      
      // During execution, operation should be tracked
      expect(timeoutManager.activeOperations.size).toBe(1);
      
      await promise;
      
      // After completion, operation should be unregistered
      expect(timeoutManager.activeOperations.size).toBe(0);
    });

    it('should unregister operations even on failure', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(timeoutManager.executeWithTimeout(mockFn, {
        operationName: 'failing_operation'
      })).rejects.toThrow();
      
      expect(timeoutManager.activeOperations.size).toBe(0);
    });

    it('should generate unique operation IDs', async () => {
      const promises = [];
      const operationIds = [];
      
      for (let i = 0; i < 5; i++) {
        const mockFn = jest.fn().mockImplementation(({ operationId }) => {
          operationIds.push(operationId);
          return Promise.resolve('success');
        });
        
        promises.push(timeoutManager.executeWithTimeout(mockFn, {
          operationName: `test_operation_${i}`
        }));
      }
      
      await Promise.all(promises);
      
      const uniqueIds = new Set(operationIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('timeout history and adaptation', () => {
    it('should update timeout history on successful operations', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await timeoutManager.executeWithTimeout(mockFn, {
        operationType: 'api_request',
        operationName: 'test_operation'
      });
      
      const history = timeoutManager.timeoutHistory.get('api_request_test_operation');
      
      expect(history).toBeDefined();
      expect(history.operations).toHaveLength(1);
      expect(history.operations[0].result).toBe('SUCCESS');
    });

    it('should update timeout history on timeout', async () => {
      const slowFn = jest.fn(() => new Promise(resolve => 
        setTimeout(() => resolve('slow_success'), 3000)
      ));
      
      const promise = timeoutManager.executeWithTimeout(slowFn, {
        operationType: 'api_request',
        operationName: 'slow_operation',
        fallbackStrategy: FALLBACK_STRATEGIES.USE_DEFAULT_VALUES
      });
      
      jest.advanceTimersByTime(2100);
      await promise;
      
      const history = timeoutManager.timeoutHistory.get('api_request_slow_operation');
      
      expect(history).toBeDefined();
      expect(history.operations).toHaveLength(1);
      expect(history.operations[0].result).toBe('TIMEOUT');
      expect(history.timeoutRate).toBe(1);
    });

    it('should calculate suggested timeouts based on history', async () => {
      // Execute multiple operations to build history
      for (let i = 0; i < 15; i++) {
        const mockFn = jest.fn(() => 
          new Promise(resolve => setTimeout(() => resolve('success'), 500))
        );
        
        await timeoutManager.executeWithTimeout(mockFn, {
          operationType: 'api_request',
          operationName: 'consistent_operation'
        });
        
        jest.advanceTimersByTime(600);
      }
      
      const suggested = timeoutManager.getSuggestedTimeouts('api_request', 'consistent_operation');
      
      expect(suggested.confidence).toBeGreaterThan(0);
      expect(suggested.basedOnSamples).toBe(15);
      expect(suggested.request).toBeGreaterThan(0);
      expect(suggested.operation).toBeGreaterThan(0);
      expect(suggested.total).toBeGreaterThan(0);
    });

    it('should return defaults for insufficient history', () => {
      const suggested = timeoutManager.getSuggestedTimeouts('api_request', 'new_operation');
      
      expect(suggested).toEqual({
        request: 1000,
        operation: 2000,
        total: 5000
      });
    });

    it('should limit history size', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Execute more than 100 operations
      for (let i = 0; i < 120; i++) {
        await timeoutManager.executeWithTimeout(mockFn, {
          operationType: 'api_request',
          operationName: 'bulk_operation'
        });
      }
      
      const history = timeoutManager.timeoutHistory.get('api_request_bulk_operation');
      
      expect(history.operations).toHaveLength(100);
    });
  });

  describe('periodic cleanup', () => {
    it('should clean up stale operations', () => {
      // Manually add stale operation
      const staleOperationId = 'stale_op_123';
      timeoutManager.activeOperations.set(staleOperationId, {
        operationName: 'stale_operation',
        registeredAt: Date.now() - (15 * 60 * 1000), // 15 minutes ago
        cleanup: jest.fn()
      });
      
      // Trigger cleanup
      timeoutManager.cleanupStaleOperations();
      
      expect(timeoutManager.activeOperations.has(staleOperationId)).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cleaning up stale operation'),
        expect.any(Object)
      );
    });

    it('should not clean up recent operations', () => {
      const recentOperationId = 'recent_op_123';
      timeoutManager.activeOperations.set(recentOperationId, {
        operationName: 'recent_operation',
        registeredAt: Date.now() - (5 * 60 * 1000), // 5 minutes ago
        cleanup: jest.fn()
      });
      
      timeoutManager.cleanupStaleOperations();
      
      expect(timeoutManager.activeOperations.has(recentOperationId)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Execute some operations to build history
      await timeoutManager.executeWithTimeout(mockFn, {
        operationType: 'api_request',
        operationName: 'test_operation'
      });
      
      const stats = timeoutManager.getStats();
      
      expect(stats).toMatchObject({
        activeOperations: 0,
        timeoutHistory: expect.arrayContaining([
          expect.objectContaining({
            operation: 'api_request_test_operation',
            samples: 1,
            averageDuration: expect.any(Number),
            timeoutRate: 0
          })
        ]),
        config: expect.any(Object)
      });
    });
  });

  describe('reset', () => {
    it('should reset all statistics and history', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await timeoutManager.executeWithTimeout(mockFn, {
        operationName: 'test_operation'
      });
      
      expect(timeoutManager.timeoutHistory.size).toBe(1);
      
      timeoutManager.reset();
      
      expect(timeoutManager.timeoutHistory.size).toBe(0);
      expect(timeoutManager.activeOperations.size).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    it('should handle cascading timeouts correctly', async () => {
      const verySlowFn = jest.fn(() => new Promise(resolve => 
        setTimeout(() => resolve('very_slow_success'), 10000)
      ));
      
      const promise = timeoutManager.executeWithTimeout(verySlowFn, {
        operationType: 'api_request',
        operationName: 'very_slow_operation',
        fallbackStrategy: FALLBACK_STRATEGIES.USE_DEFAULT_VALUES
      });
      
      // Should timeout at operation level first (2000ms)
      jest.advanceTimersByTime(2100);
      
      const result = await promise;
      
      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('timed out')
      });
      
      expect(mockMetrics.recordTimeoutFailure).toHaveBeenCalledWith(
        'api_request',
        'very_slow_operation',
        expect.any(Number),
        expect.objectContaining({
          request: 1000,
          operation: 2000,
          total: 5000
        })
      );
    });

    it('should handle concurrent operations with different timeouts', async () => {
      const operations = [
        { duration: 500, shouldSucceed: true },
        { duration: 1500, shouldTimeout: true },
        { duration: 800, shouldSucceed: true }
      ];
      
      const promises = operations.map(({ duration, shouldSucceed }, index) => {
        const fn = jest.fn(() => new Promise(resolve => 
          setTimeout(() => resolve(`result_${index}`), duration)
        ));
        
        return timeoutManager.executeWithTimeout(fn, {
          operationType: 'api_request',
          operationName: `concurrent_op_${index}`,
          fallbackStrategy: FALLBACK_STRATEGIES.USE_DEFAULT_VALUES
        }).catch(error => ({ error }));
      });
      
      jest.advanceTimersByTime(2100);
      
      const results = await Promise.all(promises);
      
      // Check that fast operations succeeded and slow one used fallback
      expect(results[0]).toBe('result_0');
      expect(results[1]).toMatchObject({
        success: false,
        message: expect.stringContaining('timed out')
      });
      expect(results[2]).toBe('result_2');
    });
  });
});