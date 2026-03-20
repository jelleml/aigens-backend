/**
 * Correlation Manager Tests
 * 
 * Tests for the correlation ID management system.
 */

const CorrelationManager = require('../../../../services/logging/core/correlation-manager');

describe('CorrelationManager', () => {
  let manager;

  beforeEach(() => {
    manager = new CorrelationManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('Correlation ID Generation', () => {
    test('should generate valid correlation IDs', () => {
      const id = manager.generateCorrelationId();
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
      expect(id.length).toBe(16);
      expect(manager.isValidCorrelationId(id)).toBe(true);
    });

    test('should generate correlation IDs with prefix', () => {
      const id = manager.generateCorrelationId({ prefix: 'test' });
      expect(id).toMatch(/^test-[a-f0-9]{16}$/i);
      expect(manager.isValidCorrelationId(id)).toBe(true);
    });

    test('should generate correlation IDs with custom length', () => {
      const id = manager.generateCorrelationId({ length: 8 });
      expect(id.length).toBe(8);
      expect(manager.isValidCorrelationId(id)).toBe(true);
    });
  });

  describe('Correlation ID Management', () => {
    test('should set and get correlation ID', () => {
      const id = 'abcdef1234567890';
      manager.setCorrelationId(id);
      expect(manager.getCurrentCorrelationId()).toBe(id);
    });

    test('should reject invalid correlation IDs', () => {
      const result = manager.setCorrelationId('invalid-id');
      expect(result).toBe(false);
      expect(manager.getCurrentCorrelationId()).toBeNull();
    });

    test('should create and store correlation with context', () => {
      const context = { userId: '123', action: 'test' };
      const id = manager.createCorrelation(context);
      
      expect(manager.getCurrentCorrelationId()).toBe(id);
      
      const correlation = manager.getCorrelation(id);
      expect(correlation).toBeTruthy();
      expect(correlation.context).toEqual(context);
    });

    test('should clear current correlation', () => {
      const id = manager.createCorrelation();
      expect(manager.getCurrentCorrelationId()).toBe(id);
      
      manager.clearCurrentCorrelation();
      expect(manager.getCurrentCorrelationId()).toBeNull();
    });

    test('should remove specific correlation', () => {
      const id = manager.createCorrelation();
      expect(manager.getCorrelation(id)).toBeTruthy();
      
      manager.removeCorrelation(id);
      expect(manager.getCorrelation(id)).toBeNull();
    });
  });

  describe('Header Extraction', () => {
    test('should extract correlation ID from headers', () => {
      const id = 'abcdef1234567890';
      const headers = { 'x-correlation-id': id };
      
      const extracted = manager.extractFromHeaders(headers);
      expect(extracted).toBe(id);
    });

    test('should extract correlation ID from case-insensitive headers', () => {
      const id = 'abcdef1234567890';
      const headers = { 'X-Correlation-ID': id };
      
      const extracted = manager.extractFromHeaders(headers);
      expect(extracted).toBe(id);
    });

    test('should extract correlation ID from alternative headers', () => {
      const id = 'abcdef1234567890';
      const headers = { 'request-id': id };
      
      const extracted = manager.extractFromHeaders(headers);
      expect(extracted).toBe(id);
    });

    test('should return null for invalid correlation ID in headers', () => {
      const headers = { 'x-correlation-id': 'invalid-id' };
      
      const extracted = manager.extractFromHeaders(headers);
      expect(extracted).toBeNull();
    });
  });

  describe('Context Management', () => {
    test('should create context with correlation ID', () => {
      const id = manager.createCorrelation({ userId: '123' });
      
      const context = manager.createContext({ action: 'test' });
      expect(context.correlationId).toBe(id);
      expect(context.correlationContext).toEqual({ userId: '123' });
      expect(context.action).toBe('test');
    });

    test('should create child correlation linked to parent', () => {
      const parentId = manager.createCorrelation({ userId: '123' });
      const childId = manager.createChildCorrelation({ action: 'test' });
      
      expect(childId).not.toBe(parentId);
      
      const childCorrelation = manager.getCorrelation(childId);
      expect(childCorrelation.context.parentCorrelationId).toBe(parentId);
      expect(childCorrelation.context.action).toBe('test');
    });
  });

  describe('Async Context', () => {
    test('should maintain correlation ID in async context', async () => {
      const id = manager.createCorrelation();
      
      await manager.withCorrelation(id, {}, () => {
        expect(manager.getCurrentCorrelationId()).toBe(id);
        
        return new Promise(resolve => {
          setTimeout(() => {
            expect(manager.getCurrentCorrelationId()).toBe(id);
            resolve();
          }, 10);
        });
      });
    });

    test('should bind function to correlation context', async () => {
      const id = manager.createCorrelation();
      
      const fn = manager.bindContext(() => {
        return manager.getCurrentCorrelationId();
      });
      
      manager.clearCurrentCorrelation();
      expect(manager.getCurrentCorrelationId()).toBeNull();
      
      const result = await fn();
      expect(result).toBe(id);
    });
  });

  describe('Cleanup and Maintenance', () => {
    test('should clean up expired correlations', () => {
      // Create correlations
      const ids = [];
      for (let i = 0; i < 5; i++) {
        ids.push(manager.createCorrelation());
      }
      
      // Manually set creation time to past
      ids.forEach(id => {
        const correlation = manager.getCorrelation(id);
        correlation.createdAt = new Date(Date.now() - manager.maxAge - 1000);
      });
      
      // Run cleanup
      const cleaned = manager.cleanup();
      expect(cleaned).toBe(5);
      
      // Verify all correlations are removed
      ids.forEach(id => {
        expect(manager.getCorrelation(id)).toBeNull();
      });
    });

    test('should prune oldest correlations when limit is reached', () => {
      // Set a low max correlations limit
      manager.maxCorrelations = 5;
      
      // Create correlations with timestamps spaced apart
      const ids = [];
      for (let i = 0; i < 10; i++) {
        const id = manager.createCorrelation();
        ids.push(id);
        
        // Set creation time with increasing timestamps
        const correlation = manager.getCorrelation(id);
        correlation.createdAt = new Date(Date.now() - (10 - i) * 1000);
      }
      
      // Verify only the newest correlations are kept
      expect(manager.correlations.size).toBe(5);
      
      // The oldest correlations should be removed
      for (let i = 0; i < 5; i++) {
        expect(manager.getCorrelation(ids[i])).toBeNull();
      }
      
      // The newest correlations should be kept
      for (let i = 5; i < 10; i++) {
        expect(manager.getCorrelation(ids[i])).toBeTruthy();
      }
    });
  });
});