/**
 * Request Logger Middleware
 * 
 * Express middleware for logging HTTP requests and responses with structured
 * logging, timing information, and correlation ID tracking.
 */

/**
 * Create request logger middleware
 * @param {Object} options - Middleware options
 * @param {Object} options.logger - Logger instance to use
 * @param {boolean} options.logRequests - Log incoming requests
 * @param {boolean} options.logResponses - Log outgoing responses
 * @param {Array} options.skipPaths - Paths to skip logging
 * @param {Array} options.skipMethods - HTTP methods to skip logging
 * @param {boolean} options.logBody - Log request/response bodies
 * @param {number} options.maxBodySize - Maximum body size to log
 * @param {boolean} options.logHeaders - Log request/response headers
 * @param {Array} options.sensitiveHeaders - Headers to redact
 * @returns {Function} Express middleware function
 */
function requestLoggerMiddleware(options = {}) {
  const {
    logger = null,
    logRequests = true,
    logResponses = true,
    skipPaths = ['/health', '/favicon.ico'],
    skipMethods = [],
    logBody = false,
    maxBodySize = 1024,
    logHeaders = false,
    sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token']
  } = options;

  return (req, res, next) => {
    // Skip logging for specified paths
    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Skip logging for specified methods
    if (skipMethods.includes(req.method.toUpperCase())) {
      return next();
    }

    // Get or create logger instance
    const requestLogger = logger || req.logger || console;

    // Record request start time
    const startTime = Date.now();
    const startHrTime = process.hrtime();

    // Create request context
    const requestContext = {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      userAgent: req.headers['user-agent'],
      ip: getClientIP(req),
      correlationId: req.correlationId,
      requestId: generateRequestId()
    };

    // Add headers if enabled
    if (logHeaders) {
      requestContext.headers = sanitizeHeaders(req.headers, sensitiveHeaders);
    }

    // Add body if enabled and present
    if (logBody && req.body) {
      requestContext.body = sanitizeBody(req.body, maxBodySize);
    }

    // Log incoming request
    if (logRequests && requestLogger.request) {
      requestLogger.request(req.method, req.url, requestContext);
    } else if (logRequests && requestLogger.http) {
      requestLogger.http(`${req.method} ${req.url}`, {
        type: 'request',
        ...requestContext
      });
    } else if (logRequests) {
      requestLogger.info(`${req.method} ${req.url}`, requestContext);
    }

    // Store original res.end to intercept response
    const originalEnd = res.end;
    const originalWrite = res.write;
    let responseBody = '';

    // Intercept response body if logging is enabled
    if (logBody) {
      res.write = function(chunk, encoding) {
        if (chunk && responseBody.length < maxBodySize) {
          responseBody += chunk.toString();
        }
        return originalWrite.call(this, chunk, encoding);
      };
    }

    // Override res.end to log response
    res.end = function(chunk, encoding) {
      // Calculate response time
      const endTime = Date.now();
      const endHrTime = process.hrtime(startHrTime);
      const duration = endTime - startTime;
      const preciseMs = endHrTime[0] * 1000 + endHrTime[1] / 1000000;

      // Add final chunk to response body
      if (logBody && chunk && responseBody.length < maxBodySize) {
        responseBody += chunk.toString();
      }

      // Create response context
      const responseContext = {
        ...requestContext,
        status: res.statusCode,
        statusMessage: res.statusMessage,
        duration,
        durationMs: duration,
        durationHuman: formatDuration(duration),
        preciseMs,
        contentLength: res.get('content-length'),
        contentType: res.get('content-type')
      };

      // Add response headers if enabled
      if (logHeaders) {
        responseContext.responseHeaders = sanitizeHeaders(res.getHeaders(), sensitiveHeaders);
      }

      // Add response body if enabled
      if (logBody && responseBody) {
        responseContext.responseBody = sanitizeBody(responseBody, maxBodySize);
      }

      // Determine log level based on status code
      const logLevel = getLogLevelForStatus(res.statusCode);

      // Log response
      if (logResponses && requestLogger.response) {
        requestLogger.response(res.statusCode, duration, responseContext);
      } else if (logResponses && requestLogger.http) {
        requestLogger.http(`${req.method} ${req.url} ${res.statusCode}`, {
          type: 'response',
          ...responseContext
        });
      } else if (logResponses) {
        requestLogger[logLevel](`${req.method} ${req.url} ${res.statusCode} - ${duration}ms`, responseContext);
      }

      // Call original end method
      return originalEnd.call(this, chunk, encoding);
    };

    next();
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
 * Generate unique request ID
 * @returns {string} Request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Sanitize headers by redacting sensitive ones
 * @param {Object} headers - Headers object
 * @param {Array} sensitiveHeaders - Headers to redact
 * @returns {Object} Sanitized headers
 */
function sanitizeHeaders(headers, sensitiveHeaders = []) {
  const sanitized = {};
  
  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Sanitize body by truncating if too large
 * @param {any} body - Body to sanitize
 * @param {number} maxSize - Maximum size in characters
 * @returns {any} Sanitized body
 */
function sanitizeBody(body, maxSize = 1024) {
  if (!body) return body;
  
  let bodyStr;
  if (typeof body === 'string') {
    bodyStr = body;
  } else {
    try {
      bodyStr = JSON.stringify(body);
    } catch (error) {
      return '[Could not serialize body]';
    }
  }
  
  if (bodyStr.length > maxSize) {
    return bodyStr.substring(0, maxSize) + '... [TRUNCATED]';
  }
  
  return body;
}

/**
 * Get appropriate log level based on HTTP status code
 * @param {number} statusCode - HTTP status code
 * @returns {string} Log level
 */
function getLogLevelForStatus(statusCode) {
  if (statusCode >= 500) {
    return 'error';
  } else if (statusCode >= 400) {
    return 'warn';
  } else if (statusCode >= 300) {
    return 'info';
  } else {
    return 'info';
  }
}

/**
 * Format duration in human-readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Create error logging middleware
 * Logs unhandled errors in Express error handling middleware
 * @param {Object} options - Middleware options
 * @returns {Function} Express error middleware function
 */
function errorLoggerMiddleware(options = {}) {
  const {
    logger = null,
    logStackTrace = true,
    logRequestContext = true
  } = options;

  return (err, req, res, next) => {
    // Get or create logger instance
    const errorLogger = logger || req.logger || console;

    // Create error context
    const errorContext = {
      error: {
        name: err.name,
        message: err.message,
        code: err.code,
        status: err.status || err.statusCode
      }
    };

    // Add stack trace if enabled
    if (logStackTrace && err.stack) {
      errorContext.error.stack = err.stack;
    }

    // Add request context if enabled
    if (logRequestContext) {
      errorContext.request = {
        method: req.method,
        url: req.url,
        correlationId: req.correlationId,
        userAgent: req.headers['user-agent'],
        ip: getClientIP(req)
      };
    }

    // Log the error
    if (errorLogger.error) {
      errorLogger.error(`Unhandled error: ${err.message}`, errorContext);
    } else {
      errorLogger.error(`Unhandled error: ${err.message}`, errorContext);
    }

    // Continue with error handling
    next(err);
  };
}

module.exports = requestLoggerMiddleware;
module.exports.errorLoggerMiddleware = errorLoggerMiddleware;
module.exports.getClientIP = getClientIP;
module.exports.sanitizeHeaders = sanitizeHeaders;
module.exports.sanitizeBody = sanitizeBody;
module.exports.getLogLevelForStatus = getLogLevelForStatus;