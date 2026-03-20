/**
 * Unit tests for CircuitBreaker
 */

const { CircuitBreaker, STATES } = require('../../../../services/model-management/utils/circuit-breaker');

describe('CircuitBreaker', () => {
  let circuitBreaker;
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
      recordCircuitBreakerSuccess: jest.fn(),
      recordCircuitBreakerFailure: jest.fn(),
      recordCircuitBreakerStateChange: jest.fn()
    };

    circuitBreaker = new CircuitBreaker('test_provider', {
      failureThreshold: 3,
      failureRate: 0.5,
      resetTimeout: 1000,
      monitoringPeriod: 5000,
      halfOpenMaxRequests: 2,
      responseTimeThreshold: 1000,
      minRequestsForStats: 5
    }, mockLogger, mockMetrics);

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const cb = new CircuitBreaker('test');
      
      expect(cb.name).toBe('test');
      expect(cb.state).toBe(STATES.CLOSED);
      expect(cb.config.failureThreshold).toBe(5);
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = { failureThreshold: 10, resetTimeout: 30000 };
      const cb = new CircuitBreaker('test', customConfig);
      
      expect(cb.config.failureThreshold).toBe(10);
      expect(cb.config.resetTimeout).toBe(30000);
      expect(cb.config.failureRate).toBe(0.5); // Should keep default
    });
  });

  describe('execute', () => {
    it('should execute function successfully in CLOSED state', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.state).toBe(STATES.CLOSED);
      expect(mockMetrics.recordCircuitBreakerSuccess).toHaveBeenCalled();
    });

    it('should track successful requests', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await circuitBreaker.execute(mockFn);
      
      expect(circuitBreaker.stats.totalRequests).toBe(1);
      expect(circuitBreaker.stats.successfulRequests).toBe(1);
      expect(circuitBreaker.stats.consecutiveFailures).toBe(0);
    });

    it('should track failed requests', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test error');
      
      expect(circuitBreaker.stats.totalRequests).toBe(1);
      expect(circuitBreaker.stats.failedRequests).toBe(1);
      expect(circuitBreaker.stats.consecutiveFailures).toBe(1);
      expect(mockMetrics.recordCircuitBreakerFailure).toHaveBeenCalled();
    });

    it('should open circuit after consecutive failures exceed threshold', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Execute enough successful requests to meet minRequestsForStats
      const successFn = jest.fn().mockResolvedValue('success');
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.execute(successFn);
      }
      
      // Now execute failures to trigger circuit opening
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow();
      }
      
      expect(circuitBreaker.state).toBe(STATES.OPEN);
      expect(mockMetrics.recordCircuitBreakerStateChange).toHaveBeenCalledWith(
        'test_provider',
        STATES.CLOSED,
        STATES.OPEN
      );
    });

    it('should reject requests immediately when circuit is OPEN', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Force circuit to OPEN state
      circuitBreaker.forceState(STATES.OPEN);
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(
        'Circuit breaker for test_provider is OPEN'
      );
      
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should use fallback function when circuit is OPEN', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const fallbackFn = jest.fn().mockResolvedValue('fallback_result');
      
      circuitBreaker.forceState(STATES.OPEN);
      
      const result = await circuitBreaker.execute(mockFn, {
        fallback: fallbackFn
      });
      
      expect(result).toBe('fallback_result');
      expect(mockFn).not.toHaveBeenCalled();
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Force circuit to OPEN state
      circuitBreaker.forceState(STATES.OPEN);
      
      // Fast-forward time beyond reset timeout
      jest.advanceTimersByTime(1100);
      
      // Next request should transition to HALF_OPEN
      await circuitBreaker.execute(mockFn);
      
      expect(circuitBreaker.state).toBe(STATES.HALF_OPEN);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should close circuit from HALF_OPEN after successful requests', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      circuitBreaker.forceState(STATES.HALF_OPEN);
      
      // Execute successful requests up to halfOpenMaxRequests
      await circuitBreaker.execute(mockFn);
      await circuitBreaker.execute(mockFn);
      
      expect(circuitBreaker.state).toBe(STATES.CLOSED);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should reopen circuit from HALF_OPEN on failure', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      
      circuitBreaker.forceState(STATES.HALF_OPEN);
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow();
      
      expect(circuitBreaker.state).toBe(STATES.OPEN);
    });

    it('should handle timeout errors', async () => {
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 2000));
      
      await expect(circuitBreaker.execute(slowFn, {
        timeout: 500
      })).rejects.toThrow('Request timeout after 500ms');
    });

    it('should limit requests in HALF_OPEN state', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      circuitBreaker.forceState(STATES.HALF_OPEN);
      
      // First two requests should succeed
      expect(circuitBreaker.canExecute()).toBe(true);
      await circuitBreaker.execute(mockFn);
      
      expect(circuitBreaker.canExecute()).toBe(true);
      await circuitBreaker.execute(mockFn);
      
      // Circuit should now be closed, but if it were still HALF_OPEN,
      // it shouldn't accept more requests
      circuitBreaker.forceState(STATES.HALF_OPEN);
      circuitBreaker.halfOpenRequestCount = 2;
      
      expect(circuitBreaker.canExecute()).toBe(false);
    });
  });

  describe('canExecute', () => {
    it('should allow execution when circuit is CLOSED', () => {
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should not allow execution when circuit is OPEN', () => {
      circuitBreaker.forceState(STATES.OPEN);
      expect(circuitBreaker.canExecute()).toBe(false);
    });

    it('should allow limited execution when circuit is HALF_OPEN', () => {
      circuitBreaker.forceState(STATES.HALF_OPEN);
      circuitBreaker.halfOpenRequestCount = 0;
      
      expect(circuitBreaker.canExecute()).toBe(true);
      
      circuitBreaker.halfOpenRequestCount = 2;
      expect(circuitBreaker.canExecute()).toBe(false);
    });

    it('should transition to HALF_OPEN when reset timeout expires', () => {
      circuitBreaker.forceState(STATES.OPEN);
      circuitBreaker.lastFailureTime = Date.now() - 1100;
      
      expect(circuitBreaker.canExecute()).toBe(true);
      expect(circuitBreaker.state).toBe(STATES.HALF_OPEN);
    });
  });

  describe('shouldOpenCircuit', () => {
    it('should not open circuit with insufficient requests', () => {
      circuitBreaker.stats.totalRequests = 3;
      circuitBreaker.stats.consecutiveFailures = 5;
      
      expect(circuitBreaker.shouldOpenCircuit()).toBe(false);
    });

    it('should open circuit when consecutive failures exceed threshold', () => {
      circuitBreaker.stats.totalRequests = 10;
      circuitBreaker.stats.consecutiveFailures = 3;
      
      expect(circuitBreaker.shouldOpenCircuit()).toBe(true);
    });

    it('should open circuit when failure rate exceeds threshold', () => {
      circuitBreaker.stats.totalRequests = 10;
      circuitBreaker.stats.failedRequests = 6;
      circuitBreaker.stats.consecutiveFailures = 2;
      
      expect(circuitBreaker.shouldOpenCircuit()).toBe(true);
    });
  });

  describe('getFailureRate', () => {
    it('should return 0 when no requests have been made', () => {
      expect(circuitBreaker.getFailureRate()).toBe(0);
    });

    it('should calculate failure rate correctly', () => {
      circuitBreaker.stats.totalRequests = 10;
      circuitBreaker.stats.failedRequests = 3;
      
      expect(circuitBreaker.getFailureRate()).toBe(0.3);
    });
  });

  describe('getSuccessRate', () => {
    it('should return 0 when no requests have been made', () => {
      expect(circuitBreaker.getSuccessRate()).toBe(0);
    });

    it('should calculate success rate correctly', () => {
      circuitBreaker.stats.totalRequests = 10;
      circuitBreaker.stats.successfulRequests = 7;
      
      expect(circuitBreaker.getSuccessRate()).toBe(0.7);
    });
  });

  describe('isHealthy', () => {
    it('should return true when circuit is closed with few failures', () => {
      circuitBreaker.stats.consecutiveFailures = 2;
      
      expect(circuitBreaker.isHealthy()).toBe(true);
    });

    it('should return false when circuit is open', () => {
      circuitBreaker.forceState(STATES.OPEN);
      
      expect(circuitBreaker.isHealthy()).toBe(false);
    });

    it('should return false when too many consecutive failures', () => {
      circuitBreaker.stats.consecutiveFailures = 5;
      
      expect(circuitBreaker.isHealthy()).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', () => {
      circuitBreaker.stats.totalRequests = 10;
      circuitBreaker.stats.successfulRequests = 7;
      circuitBreaker.stats.failedRequests = 3;
      circuitBreaker.stats.consecutiveFailures = 2;
      
      const stats = circuitBreaker.getStats();
      
      expect(stats).toMatchObject({
        name: 'test_provider',
        state: STATES.CLOSED,
        isHealthy: true,
        stats: {
          total: {
            requests: 10,
            successes: 7,
            failures: 3,
            failureRate: 0.3,
            successRate: 0.7,
            consecutiveFailures: 2
          },
          recent: expect.objectContaining({
            monitoringPeriod: 5000
          })
        },
        config: expect.any(Object)
      });
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', () => {
      circuitBreaker.stats.totalRequests = 10;
      circuitBreaker.stats.successfulRequests = 7;
      circuitBreaker.stats.failedRequests = 3;
      circuitBreaker.recentRequests = [{ success: true, responseTime: 100, timestamp: Date.now() }];
      
      circuitBreaker.resetStats();
      
      expect(circuitBreaker.stats.totalRequests).toBe(0);
      expect(circuitBreaker.stats.successfulRequests).toBe(0);
      expect(circuitBreaker.stats.failedRequests).toBe(0);
      expect(circuitBreaker.recentRequests).toHaveLength(0);
    });
  });

  describe('forceState', () => {
    it('should force circuit to specified state', () => {
      circuitBreaker.forceState(STATES.OPEN);
      expect(circuitBreaker.state).toBe(STATES.OPEN);
      
      circuitBreaker.forceState(STATES.HALF_OPEN);
      expect(circuitBreaker.state).toBe(STATES.HALF_OPEN);
    });

    it('should throw error for invalid state', () => {
      expect(() => {
        circuitBreaker.forceState('INVALID_STATE');
      }).toThrow('Invalid circuit breaker state');
    });
  });

  describe('addRecentRequest', () => {
    it('should add request to recent requests', () => {
      circuitBreaker.addRecentRequest(true, 100);
      
      expect(circuitBreaker.recentRequests).toHaveLength(1);
      expect(circuitBreaker.recentRequests[0]).toMatchObject({
        success: true,
        responseTime: 100,
        timestamp: expect.any(Number)
      });
    });

    it('should clean up old requests', () => {
      const now = Date.now();
      
      // Add old request
      circuitBreaker.recentRequests.push({
        success: true,
        responseTime: 100,
        timestamp: now - 10000 // 10 seconds ago
      });
      
      // Add recent request
      circuitBreaker.addRecentRequest(true, 200);
      
      // Old request should be removed (monitoring period is 5000ms)
      expect(circuitBreaker.recentRequests).toHaveLength(1);
      expect(circuitBreaker.recentRequests[0].responseTime).toBe(200);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete circuit breaker lifecycle', async () => {
      const mockFn = jest.fn();
      
      // 1. Start with successful requests (CLOSED state)
      mockFn.mockResolvedValue('success');
      
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.execute(mockFn);
      }
      
      expect(circuitBreaker.state).toBe(STATES.CLOSED);
      expect(circuitBreaker.stats.successfulRequests).toBe(5);
      
      // 2. Introduce failures to trigger OPEN state
      mockFn.mockRejectedValue(new Error('Service error'));
      
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow();
      }
      
      expect(circuitBreaker.state).toBe(STATES.OPEN);
      
      // 3. Try to execute while OPEN (should fail fast)
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(
        'Circuit breaker for test_provider is OPEN'
      );
      
      // 4. Wait for reset timeout and transition to HALF_OPEN
      jest.advanceTimersByTime(1100);
      
      mockFn.mockResolvedValue('recovery');
      await circuitBreaker.execute(mockFn);
      
      expect(circuitBreaker.state).toBe(STATES.HALF_OPEN);
      
      // 5. Complete recovery to CLOSED state
      await circuitBreaker.execute(mockFn);
      
      expect(circuitBreaker.state).toBe(STATES.CLOSED);
    });

    it('should handle partial recovery failure', async () => {
      const mockFn = jest.fn();
      
      // Start in HALF_OPEN state
      circuitBreaker.forceState(STATES.HALF_OPEN);
      
      // First request succeeds
      mockFn.mockResolvedValueOnce('success');
      await circuitBreaker.execute(mockFn);
      
      expect(circuitBreaker.state).toBe(STATES.HALF_OPEN);
      
      // Second request fails, should reopen circuit
      mockFn.mockRejectedValue(new Error('Still failing'));
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow();
      
      expect(circuitBreaker.state).toBe(STATES.OPEN);
    });

    it('should handle concurrent requests in HALF_OPEN state', async () => {
      circuitBreaker.forceState(STATES.HALF_OPEN);
      
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Start multiple concurrent requests
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(circuitBreaker.execute(mockFn).catch(err => err));
      }
      
      const results = await Promise.all(promises);
      
      // Only halfOpenMaxRequests (2) should succeed
      const successes = results.filter(r => r === 'success');
      const failures = results.filter(r => r instanceof Error);
      
      expect(successes).toHaveLength(2);
      expect(failures).toHaveLength(3);
      expect(circuitBreaker.state).toBe(STATES.CLOSED);
    });
  });
});