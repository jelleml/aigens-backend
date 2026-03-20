/**
 * Unit tests for RetryManager
 */

const RetryManager = require('../../../../services/model-management/utils/retry-manager');

describe('RetryManager', () => {
  let retryManager;
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
      recordRetrySuccess: jest.fn(),
      recordRetryFailure: jest.fn()
    };

    retryManager = new RetryManager({
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 1000,
      factor: 2,
      jitter: 0.1
    }, mockLogger, mockMetrics);
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const manager = new RetryManager();
      expect(manager.config.maxRetries).toBe(3);
      expect(manager.config.initialDelay).toBe(2000);
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = { maxRetries: 5, initialDelay: 500 };
      const manager = new RetryManager(customConfig);
      
      expect(manager.config.maxRetries).toBe(5);
      expect(manager.config.initialDelay).toBe(500);
      expect(manager.config.factor).toBe(2); // Should keep default
    });
  });

  describe('execute', () => {
    it('should execute function successfully on first attempt', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await retryManager.execute(mockFn, {
        operationName: 'test_operation'
      });
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockMetrics.recordRetrySuccess).toHaveBeenCalledWith(
        'test_operation',
        0,
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should retry on retryable errors', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success');
      
      const result = await retryManager.execute(mockFn, {
        operationName: 'test_operation'
      });
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('HTTP_401'));
      
      await expect(retryManager.execute(mockFn, {
        operationName: 'test_operation'
      })).rejects.toThrow('HTTP_401');
      
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockMetrics.recordRetryFailure).toHaveBeenCalled();
    });

    it('should exhaust retries and throw enhanced error', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
      
      await expect(retryManager.execute(mockFn, {
        operationName: 'test_operation'
      })).rejects.toMatchObject({
        name: 'RetryExhaustedException',
        message: expect.stringContaining('test_operation'),
        retryContext: expect.objectContaining({
          operationName: 'test_operation',
          totalAttempts: 4
        })
      });
      
      expect(mockFn).toHaveBeenCalledTimes(4);
    });

    it('should call onRetry callback', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValue('success');
      
      const onRetry = jest.fn();
      
      await retryManager.execute(mockFn, {
        operationName: 'test_operation',
        onRetry
      });
      
      expect(onRetry).toHaveBeenCalledWith(
        expect.any(Error),
        1,
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should call onFailure callback', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
      const onFailure = jest.fn();
      
      await expect(retryManager.execute(mockFn, {
        operationName: 'test_operation',
        onFailure
      })).rejects.toThrow();
      
      expect(onFailure).toHaveBeenCalledWith(
        expect.any(Error),
        expect.any(Array),
        expect.any(String)
      );
    });

    it('should use custom shouldRetry function', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('CUSTOM_ERROR'));
      const shouldRetry = jest.fn().mockReturnValue(true);
      
      await expect(retryManager.execute(mockFn, {
        operationName: 'test_operation',
        shouldRetry
      })).rejects.toThrow();
      
      expect(shouldRetry).toHaveBeenCalledTimes(4);
      expect(mockFn).toHaveBeenCalledTimes(4);
    });
  });

  describe('classifyError', () => {
    it('should classify network errors correctly', () => {
      const error = new Error('Connection reset');
      error.code = 'ECONNRESET';
      
      const classification = retryManager.classifyError(error);
      
      expect(classification.type).toBe('NETWORK_ERROR');
      expect(classification.retryable).toBe(true);
      expect(classification.severity).toBe('medium');
    });

    it('should classify HTTP errors correctly', () => {
      const error = new Error('Rate limit exceeded');
      error.response = { status: 429 };
      
      const classification = retryManager.classifyError(error);
      
      expect(classification.type).toBe('RATE_LIMIT');
      expect(classification.retryable).toBe(true);
      expect(classification.severity).toBe('low');
    });

    it('should classify server errors as retryable', () => {
      const error = new Error('Internal server error');
      error.response = { status: 500 };
      
      const classification = retryManager.classifyError(error);
      
      expect(classification.type).toBe('SERVER_ERROR');
      expect(classification.retryable).toBe(true);
      expect(classification.severity).toBe('high');
    });

    it('should classify client errors as non-retryable', () => {
      const error = new Error('Bad request');
      error.response = { status: 400 };
      
      const classification = retryManager.classifyError(error);
      
      expect(classification.type).toBe('CLIENT_ERROR');
      expect(classification.retryable).toBe(false);
      expect(classification.severity).toBe('high');
    });

    it('should classify unknown errors as non-retryable', () => {
      const error = new Error('Unknown error');
      
      const classification = retryManager.classifyError(error);
      
      expect(classification.type).toBe('UNKNOWN_ERROR');
      expect(classification.retryable).toBe(false);
      expect(classification.severity).toBe('high');
    });
  });

  describe('calculateDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      const config = {
        initialDelay: 1000,
        maxDelay: 10000,
        factor: 2,
        jitter: 0
      };
      
      const delay1 = retryManager.calculateDelay(0, config);
      const delay2 = retryManager.calculateDelay(1, config);
      const delay3 = retryManager.calculateDelay(2, config);
      
      expect(delay1).toBe(1000);
      expect(delay2).toBe(2000);
      expect(delay3).toBe(4000);
    });

    it('should respect maximum delay', () => {
      const config = {
        initialDelay: 1000,
        maxDelay: 5000,
        factor: 2,
        jitter: 0
      };
      
      const delay = retryManager.calculateDelay(10, config);
      expect(delay).toBe(5000);
    });

    it('should add jitter to delay', () => {
      const config = {
        initialDelay: 1000,
        maxDelay: 10000,
        factor: 2,
        jitter: 0.5
      };
      
      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(retryManager.calculateDelay(1, config));
      }
      
      // Check that delays vary (jitter is applied)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
      
      // Check that all delays are within expected range
      delays.forEach(delay => {
        expect(delay).toBeGreaterThan(1000);
        expect(delay).toBeLessThan(3000);
      });
    });
  });

  describe('createEnhancedError', () => {
    it('should create enhanced error with retry context', () => {
      const originalError = new Error('Original error');
      const errors = [
        { attempt: 0, error: new Error('First error'), attemptTime: 100 },
        { attempt: 1, error: new Error('Second error'), attemptTime: 200 }
      ];
      
      const enhancedError = retryManager.createEnhancedError(
        originalError,
        errors,
        'test_operation',
        'test_id_123'
      );
      
      expect(enhancedError.name).toBe('RetryExhaustedException');
      expect(enhancedError.originalError).toBe(originalError);
      expect(enhancedError.retryContext.operationName).toBe('test_operation');
      expect(enhancedError.retryContext.operationId).toBe('test_id_123');
      expect(enhancedError.retryContext.totalAttempts).toBe(2);
      expect(enhancedError.retryContext.attempts).toHaveLength(2);
    });
  });

  describe('sleep', () => {
    it('should sleep for specified duration', async () => {
      const startTime = Date.now();
      await retryManager.sleep(100);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeGreaterThanOrEqual(95);
      expect(endTime - startTime).toBeLessThan(150);
    });
  });

  describe('getStats', () => {
    it('should return current statistics', () => {
      const stats = retryManager.getStats();
      
      expect(stats).toMatchObject({
        config: expect.objectContaining({
          maxRetries: 3,
          initialDelay: 100
        }),
        activeOperations: 0
      });
    });
  });

  describe('resetStats', () => {
    it('should reset statistics', () => {
      // Add some operations to track
      retryManager.attemptMetrics.set('test', { attempts: 3 });
      
      retryManager.resetStats();
      
      expect(retryManager.attemptMetrics.size).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    it('should handle mixed success and failure scenarios', async () => {
      const results = [];
      
      // Successful operation
      const successFn = jest.fn().mockResolvedValue('success');
      const result1 = await retryManager.execute(successFn, {
        operationName: 'success_op'
      });
      results.push(result1);
      
      // Operation that fails then succeeds
      const retrySuccessFn = jest.fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValue('retry_success');
      
      const result2 = await retryManager.execute(retrySuccessFn, {
        operationName: 'retry_success_op'
      });
      results.push(result2);
      
      // Operation that exhausts retries
      const failureFn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
      
      await expect(retryManager.execute(failureFn, {
        operationName: 'failure_op'
      })).rejects.toThrow('RetryExhaustedException');
      
      expect(results).toEqual(['success', 'retry_success']);
      expect(mockMetrics.recordRetrySuccess).toHaveBeenCalledTimes(2);
      expect(mockMetrics.recordRetryFailure).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent operations', async () => {
      const operations = [];
      
      for (let i = 0; i < 5; i++) {
        const fn = jest.fn()
          .mockRejectedValueOnce(new Error('ECONNRESET'))
          .mockResolvedValue(`result_${i}`);
        
        operations.push(
          retryManager.execute(fn, {
            operationName: `concurrent_op_${i}`
          })
        );
      }
      
      const results = await Promise.all(operations);
      
      expect(results).toEqual([
        'result_0',
        'result_1',
        'result_2',
        'result_3',
        'result_4'
      ]);
      
      expect(mockMetrics.recordRetrySuccess).toHaveBeenCalledTimes(5);
    });
  });
});