/**
 * Correlation Middleware Tests
 * 
 * Tests for the correlation middleware components.
 */

const correlationMiddleware = require('../../../../services/logging/middleware/correlation-middleware');
const CorrelationManager = require('../../../../services/logging/core/correlation-manager');

describe('Correlation Middleware', () => {
  let manager;
  let req;
  let res;
  let next;

  beforeEach(() => {
    manager = new CorrelationManager();
    
    req = {
      headers: {},
      method: 'GET',
      url: '/test',
      originalUrl: '/test?query=value',
      path: '/test',
      ip: '127.0.0.1',
      user: { id: 'user123' }
    };
    
    res = {
      setHeader: jest.fn(),
      on: jest.fn(),
      statusCode: 200,
      locals: {}
    };
    
    next = jest.fn();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('correlationMiddleware', () => {
    test('should extract correlation ID from headers', () => {
      const id = 'abcdef1234567890';
      req.headers['x-correlation-id'] = id;
      
      const middleware = correlationMiddleware({ correlationManager: manager });
      middleware(req, res, next);
      
      expect(req.correlationId).toBe(id);
      expect(manager.getCurrentCorrelationId()).toBe(id);
      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', id);
      expect(next).toHaveBeenCalled();
    });

    test('should generate correlation ID if missing', () => {
      const middleware = correlationMiddleware({ correlationManager: manager });
      middleware(req, res, next);
      
      expect(req.correlationId).toBeTruthy();
      expect(manager.getCurrentCorrelationId()).toBe(req.correlationId);
      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', req.correlationId);
      expect(next).toHaveBeenCalled();
    });

    test('should not generate correlation ID if disabled', () => {
      const middleware = correlationMiddleware({
        correlationManager: manager,
        generateIfMissing: false
      });
      
      middleware(req, res, next);
      
      expect(req.correlationId).toBeUndefined();
      expect(manager.getCurrentCorrelationId()).toBeNull();
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    test('should use custom header name', () => {
      const id = 'abcdef1234567890';
      req.headers['custom-correlation'] = id;
      
      const middleware = correlationMiddleware({
        correlationManager: manager,
        headerName: 'custom-correlation'
      });
      
      middleware(req, res, next);
      
      expect(req.correlationId).toBe(id);
      expect(res.setHeader).toHaveBeenCalledWith('custom-correlation', id);
    });

    test('should create request logger', () => {
      const middleware = correlationMiddleware({ correlationManager: manager });
      middleware(req, res, next);
      
      expect(req.logger).toBeDefined();
      expect(req.requestStartTime).toBeDefined();
    });

    test('should handle errors gracefully', () => {
      const middleware = correlationMiddleware({ correlationManager: manager });
      
      // Cause an error by making res.setHeader throw
      res.setHeader = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      
      middleware(req, res, next);
      
      // Should still call next despite the error
      expect(next).toHaveBeenCalled();
    });
  });

  describe('correlationContextMiddleware', () => {
    test('should add correlation context functions to request', () => {
      const id = 'abcdef1234567890';
      req.correlationId = id;
      req.loggingContext = { test: 'value' };
      
      manager.setCorrelationId(id, req.loggingContext);
      
      const middleware = correlationMiddleware.correlationContextMiddleware({
        correlationManager: manager
      });
      
      middleware(req, res, next);
      
      expect(req.getCorrelationContext).toBeDefined();
      expect(req.createChildContext).toBeDefined();
      
      const context = req.getCorrelationContext();
      expect(context.correlationId).toBe(id);
      expect(context.loggingContext).toEqual(req.loggingContext);
      
      const childContext = req.createChildContext({ action: 'test' });
      expect(childContext.parentCorrelationId).toBe(id);
      expect(childContext.test).toBe('value');
      expect(childContext.action).toBe('test');
      
      expect(next).toHaveBeenCalled();
    });
  });

  describe('asyncCorrelationMiddleware', () => {
    test('should run request in correlation context', async () => {
      const id = 'abcdef1234567890';
      req.correlationId = id;
      req.loggingContext = { test: 'value' };
      
      const middleware = correlationMiddleware.asyncCorrelationMiddleware({
        correlationManager: manager
      });
      
      // Mock next to capture the correlation ID during execution
      let capturedId = null;
      next = jest.fn(() => {
        capturedId = manager.getCurrentCorrelationId();
      });
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(capturedId).toBe(id);
    });

    test('should skip if no correlation ID', () => {
      const middleware = correlationMiddleware.asyncCorrelationMiddleware({
        correlationManager: manager
      });
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(manager.getCurrentCorrelationId()).toBeNull();
    });
  });

  describe('correlationLocalsMiddleware', () => {
    test('should add correlation data to response locals', () => {
      const id = 'abcdef1234567890';
      req.correlationId = id;
      
      manager.setCorrelationId(id);
      
      const middleware = correlationMiddleware.correlationLocalsMiddleware({
        correlationManager: manager
      });
      
      middleware(req, res, next);
      
      expect(res.locals.correlationId).toBe(id);
      expect(res.locals.correlation).toBeDefined();
      expect(res.locals.correlation.id).toBe(id);
      expect(typeof res.locals.correlation.createChild).toBe('function');
      expect(typeof res.locals.correlation.getContext).toBe('function');
      
      expect(next).toHaveBeenCalled();
    });
  });
});