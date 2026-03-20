/**
 * Jest setup file for model management system tests
 * Runs before each test file
 */

const { getLogger } = require('../../services/logging');
const logger = getLogger('jest-setup', 'test');

// Set test environment variables
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise in test output
const originalConsole = { ...console };
if (process.env.JEST_HIDE_CONSOLE_OUTPUT) {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

// Restore original console after tests
afterAll(() => {
  if (process.env.JEST_HIDE_CONSOLE_OUTPUT) {
    global.console = originalConsole;
  }
});

// Add global test utilities
global.waitFor = async (condition, timeout = 5000, interval = 100) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
};

// Add performance measurement utilities
global.measurePerformance = async (fn, label) => {
  const start = process.hrtime.bigint();
  const memBefore = process.memoryUsage();
  
  const result = await fn();
  
  const end = process.hrtime.bigint();
  const memAfter = process.memoryUsage();
  
  const executionTime = Number(end - start) / 1_000_000; // Convert to ms
  const memoryDelta = {
    heapUsed: memAfter.heapUsed - memBefore.heapUsed,
    heapTotal: memAfter.heapTotal - memBefore.heapTotal,
    external: memAfter.external - memBefore.external,
    rss: memAfter.rss - memBefore.rss
  };
  
  if (label) {
    logger.info(`\nPerformance [${label}]:`);
    logger.info(`  Time: ${executionTime.toFixed(2)}ms`);
    logger.info(`  Memory: +${(memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB heap used`);
  }
  
  return {
    result,
    metrics: {
      executionTime,
      memoryDelta
    }
  };
};

// Add custom matchers
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false
      };
    }
  },
  
  toHaveBeenCalledWithMatch(received, ...expectedArgs) {
    const pass = received.mock.calls.some(call => {
      return expectedArgs.every((arg, i) => {
        if (typeof arg === 'object' && arg !== null) {
          return JSON.stringify(call[i]).includes(JSON.stringify(arg));
        }
        return call[i] === arg;
      });
    });
    
    if (pass) {
      return {
        message: () => `expected ${received.getMockName()} not to have been called with match ${expectedArgs}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received.getMockName()} to have been called with match ${expectedArgs}`,
        pass: false
      };
    }
  }
});