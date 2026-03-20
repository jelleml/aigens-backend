/**
 * Correlation Middleware
 * 
 * Express middleware for managing correlation IDs across HTTP requests.
 * Extracts correlation IDs from headers or generates new ones, and makes
 * them available throughout the request lifecycle.
 * 
 * This implementation satisfies the following requirements:
 * - WHEN processing HTTP requests THEN the system SHALL generate or extract correlation IDs from request headers
 * - WHEN logging within a request context THEN all log entries SHALL include the same correlation ID
 * - WHEN correlation ID is set THEN it SHALL be automatically included in all subsequent log entries
 * - WHEN no correlation ID exists THEN the system SHALL generate a unique identifier for the logging session
 */

const crypto = require('crypto');
const CorrelationManager = require('../core/correlation-manager');
const LoggerFactory = require('../core/logger-factory');

// Default logger for middleware
const middlewareLogger = new LoggerFactory().getLogger('logging', 'correlation-middleware');

/**
 * Create correlation middleware
 * @param {Object} options - Middleware options
 * @param {string} options.headerName - Header name for correlation ID
 * @param {boolean} options.generateIfMissing - Generate ID if not present
 * @param {Function} options.generator - Custom ID generator function
 * @param {boolean} options.setResponseHeader - Set correlation ID in response
 * @param {CorrelationManager} options.correlationManager - Correlation manager instance
 * @param {LoggerFactory} options.loggerFactory - Logger factory instance
 * @returns {Function} Express middleware function
 */
function correlationMiddleware(options = {}) {
  const {
    headerName = 'x-correlation-id',
    generateIfMissing = true,
    generator = null,
    setResponseHeader = true,
    correlationManager = null,
    loggerFactory = null
  } = options;

  // Use provided correlation manager or create a new one
  const manager = correlationManager || new CorrelationManager({ headerName });
  
  // Use provided logger factory or create a new one
  const factory = loggerFactory || new LoggerFactory();

  /**
   * Default correlation ID generator
   * @returns {string} Generated correlation ID
   */
  function defaultGenerator() {
    return manager.generateCorrelationId();
  }

  const generateId = generator || defaultGenerator;

  return (req, res, next) => {
    try {
      // Extract correlation ID from headers
      let correlationId = manager.extractFromHeaders(req.headers, headerName);

      // Generate new correlation ID if missing and generation is enabled
      if (!correlationId && generateIfMissing) {
        correlationId = generateId();
      }

      // Store correlation ID in request object and manager
      if (correlationId) {
        req.correlationId = correlationId;
        
        // Create request context with useful information
        const requestContext = {
          method: req.method,
          url: req.originalUrl || req.url,
          path: req.path,
          userAgent: req.headers['user-agent'],
          ip: getClientIP(req),
          timestamp: new Date().toISOString(),
          requestId: req.id || correlationId,
          userId: req.user?.id,
          sessionId: req.session?.id
        };
        
        // Set correlation in the manager
        manager.setCorrelationId(correlationId, requestContext);
        
        // Store context in request for later use
        req.loggingContext = requestContext;
        
        // Set response header if enabled
        if (setResponseHeader) {
          res.setHeader(headerName, correlationId);
        }
        
        // Create request-specific logger
        req.logger = factory.getLogger('http', 'request', {
          correlationId,
          ...requestContext
        });
        
        // Log request start if debug is enabled
        req.logger.debug(`Request started: ${req.method} ${req.originalUrl || req.url}`, {
          type: 'request-start',
          ...requestContext
        });
        
        // Add request start time for duration calculation
        req.requestStartTime = Date.now();
        
        // Clean up correlation when request ends
        const cleanup = () => {
          // Calculate request duration
          const duration = Date.now() - req.requestStartTime;
          
          // Log request completion
          req.logger.debug(`Request completed: ${req.method} ${req.originalUrl || req.url}`, {
            type: 'request-end',
            status: res.statusCode,
            duration,
            durationHuman: formatDuration(duration),
            ...requestContext
          });
        };
        
        // Register cleanup handlers
        res.on('finish', cleanup);
        res.on('close', cleanup);
      }

      next();
    } catch (error) {
      // Don't fail the request if correlation middleware has issues
      middlewareLogger.error('Correlation middleware error', error);
      next();
    }
  };
}

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for'] ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
}

/**
 * Format duration in human-readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
  return `${(ms / 3600000).toFixed(2)}h`;
}

/**
 * Create correlation context extractor middleware
 * This middleware should be used after the correlation middleware
 * to extract correlation context for use in route handlers
 * @param {Object} options - Middleware options
 * @param {CorrelationManager} options.correlationManager - Correlation manager instance
 * @returns {Function} Express middleware function
 */
function correlationContextMiddleware(options = {}) {
  const { correlationManager = null } = options;
  
  // Use provided correlation manager or create a new one
  const manager = correlationManager || new CorrelationManager();
  
  return (req, res, next) => {
    // Create a function to get correlation context
    req.getCorrelationContext = () => {
      return {
        correlationId: req.correlationId || manager.getCurrentCorrelationId(),
        loggingContext: req.loggingContext || {}
      };
    };
    
    // Create a function to create child context
    req.createChildContext = (additionalContext = {}) => {
      const parentId = req.correlationId || manager.getCurrentCorrelationId();
      const childId = manager.createChildCorrelation({
        ...req.loggingContext,
        ...additionalContext,
        parentCorrelationId: parentId
      });
      
      return {
        correlationId: childId,
        parentCorrelationId: parentId,
        ...req.loggingContext,
        ...additionalContext
      };
    };
    
    next();
  };
}

/**
 * Create async context middleware for maintaining correlation across async operations
 * @param {Object} options - Middleware options
 * @param {CorrelationManager} options.correlationManager - Correlation manager instance
 * @returns {Function} Express middleware function
 */
function asyncCorrelationMiddleware(options = {}) {
  const { correlationManager = null } = options;
  
  // Use provided correlation manager or create a new one
  const manager = correlationManager || new CorrelationManager();
  
  return (req, res, next) => {
    if (!req.correlationId) {
      next();
      return;
    }
    
    // Run the rest of the request in the correlation context
    manager.withCorrelation(req.correlationId, req.loggingContext || {}, () => {
      next();
    });
  };
}

/**
 * Create a middleware that adds correlation utilities to the response locals
 * Useful for template rendering with correlation IDs
 * @param {Object} options - Middleware options
 * @param {CorrelationManager} options.correlationManager - Correlation manager instance
 * @returns {Function} Express middleware function
 */
function correlationLocalsMiddleware(options = {}) {
  const { correlationManager = null } = options;
  
  // Use provided correlation manager or create a new one
  const manager = correlationManager || new CorrelationManager();
  
  return (req, res, next) => {
    // Add correlation ID to response locals for templates
    res.locals = res.locals || {};
    res.locals.correlationId = req.correlationId || manager.getCurrentCorrelationId();
    
    // Add correlation utilities
    res.locals.correlation = {
      id: res.locals.correlationId,
      createChild: (context) => manager.createChildCorrelation(context),
      getContext: () => manager.createContext()
    };
    
    next();
  };
}

module.exports = correlationMiddleware;
module.exports.correlationContextMiddleware = correlationContextMiddleware;
module.exports.asyncCorrelationMiddleware = asyncCorrelationMiddleware;
module.exports.correlationLocalsMiddleware = correlationLocalsMiddleware;
module.exports.getClientIP = getClientIP;