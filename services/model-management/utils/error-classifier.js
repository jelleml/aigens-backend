/**
 * Comprehensive Error Classification System
 * 
 * Provides standardized error classification and handling strategies for:
 * - Network and connectivity errors
 * - HTTP status-based errors
 * - Provider-specific API errors
 * - Database and system errors
 * - Custom application errors
 */

/**
 * Error types and their characteristics
 */
const ERROR_TYPES = {
  NETWORK: {
    name: 'NETWORK_ERROR',
    severity: 'MEDIUM',
    retryable: true,
    description: 'Network connectivity or DNS resolution error'
  },
  TIMEOUT: {
    name: 'TIMEOUT_ERROR',
    severity: 'MEDIUM',
    retryable: true,
    description: 'Request or operation timeout'
  },
  RATE_LIMIT: {
    name: 'RATE_LIMIT_ERROR',
    severity: 'LOW',
    retryable: true,
    description: 'Rate limit exceeded, temporary restriction'
  },
  AUTHENTICATION: {
    name: 'AUTHENTICATION_ERROR',
    severity: 'HIGH',
    retryable: false,
    description: 'Authentication failed, invalid credentials'
  },
  AUTHORIZATION: {
    name: 'AUTHORIZATION_ERROR',
    severity: 'HIGH',
    retryable: false,
    description: 'Authorization denied, insufficient permissions'
  },
  VALIDATION: {
    name: 'VALIDATION_ERROR',
    severity: 'MEDIUM',
    retryable: false,
    description: 'Request data validation failed'
  },
  SERVER: {
    name: 'SERVER_ERROR',
    severity: 'HIGH',
    retryable: true,
    description: 'Server-side error or service unavailable'
  },
  CLIENT: {
    name: 'CLIENT_ERROR',
    severity: 'MEDIUM',
    retryable: false,
    description: 'Client-side error in request format or logic'
  },
  DATABASE: {
    name: 'DATABASE_ERROR',
    severity: 'HIGH',
    retryable: true,
    description: 'Database connectivity or query error'
  },
  CONFIGURATION: {
    name: 'CONFIGURATION_ERROR',
    severity: 'HIGH',
    retryable: false,
    description: 'Invalid configuration or missing required settings'
  },
  QUOTA: {
    name: 'QUOTA_ERROR',
    severity: 'MEDIUM',
    retryable: false,
    description: 'API quota or usage limit exceeded'
  },
  SERVICE_UNAVAILABLE: {
    name: 'SERVICE_UNAVAILABLE_ERROR',
    severity: 'HIGH',
    retryable: true,
    description: 'External service temporarily unavailable'
  },
  DATA_FORMAT: {
    name: 'DATA_FORMAT_ERROR',
    severity: 'MEDIUM',
    retryable: false,
    description: 'Unexpected data format or structure'
  },
  UNKNOWN: {
    name: 'UNKNOWN_ERROR',
    severity: 'HIGH',
    retryable: false,
    description: 'Unknown or unclassified error'
  }
};

/**
 * Severity levels
 */
const SEVERITY_LEVELS = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

/**
 * Provider-specific error patterns
 */
const PROVIDER_ERROR_PATTERNS = {
  openai: {
    patterns: [
      { regex: /invalid_api_key/i, type: ERROR_TYPES.AUTHENTICATION },
      { regex: /insufficient_quota/i, type: ERROR_TYPES.QUOTA },
      { regex: /rate_limit_exceeded/i, type: ERROR_TYPES.RATE_LIMIT },
      { regex: /model_not_found/i, type: ERROR_TYPES.VALIDATION },
      { regex: /content_policy_violation/i, type: ERROR_TYPES.VALIDATION }
    ]
  },
  anthropic: {
    patterns: [
      { regex: /authentication_error/i, type: ERROR_TYPES.AUTHENTICATION },
      { regex: /permission_error/i, type: ERROR_TYPES.AUTHORIZATION },
      { regex: /overloaded_error/i, type: ERROR_TYPES.SERVER },
      { regex: /rate_limit_error/i, type: ERROR_TYPES.RATE_LIMIT }
    ]
  },
  together: {
    patterns: [
      { regex: /unauthorized/i, type: ERROR_TYPES.AUTHENTICATION },
      { regex: /model.*not.*found/i, type: ERROR_TYPES.VALIDATION },
      { regex: /rate.*limit/i, type: ERROR_TYPES.RATE_LIMIT }
    ]
  },
  openrouter: {
    patterns: [
      { regex: /invalid.*key/i, type: ERROR_TYPES.AUTHENTICATION },
      { regex: /insufficient.*credits/i, type: ERROR_TYPES.QUOTA },
      { regex: /model.*unavailable/i, type: ERROR_TYPES.SERVICE_UNAVAILABLE }
    ]
  },
  deepseek: {
    patterns: [
      { regex: /api.*key.*invalid/i, type: ERROR_TYPES.AUTHENTICATION },
      { regex: /quota.*exceeded/i, type: ERROR_TYPES.QUOTA },
      { regex: /request.*limit/i, type: ERROR_TYPES.RATE_LIMIT }
    ]
  },
  ideogram: {
    patterns: [
      { regex: /unauthorized/i, type: ERROR_TYPES.AUTHENTICATION },
      { regex: /credits.*insufficient/i, type: ERROR_TYPES.QUOTA },
      { regex: /generation.*failed/i, type: ERROR_TYPES.SERVER }
    ]
  }
};

/**
 * HTTP status code to error type mapping
 */
const HTTP_STATUS_MAPPING = {
  400: ERROR_TYPES.VALIDATION,
  401: ERROR_TYPES.AUTHENTICATION,
  403: ERROR_TYPES.AUTHORIZATION,
  404: ERROR_TYPES.CLIENT,
  408: ERROR_TYPES.TIMEOUT,
  409: ERROR_TYPES.CLIENT,
  422: ERROR_TYPES.VALIDATION,
  429: ERROR_TYPES.RATE_LIMIT,
  500: ERROR_TYPES.SERVER,
  501: ERROR_TYPES.SERVER,
  502: ERROR_TYPES.SERVICE_UNAVAILABLE,
  503: ERROR_TYPES.SERVICE_UNAVAILABLE,
  504: ERROR_TYPES.TIMEOUT,
  505: ERROR_TYPES.SERVER
};

/**
 * Network error code to error type mapping
 */
const NETWORK_ERROR_MAPPING = {
  'ECONNREFUSED': ERROR_TYPES.SERVICE_UNAVAILABLE,
  'ECONNRESET': ERROR_TYPES.NETWORK,
  'ECONNABORTED': ERROR_TYPES.NETWORK,
  'ETIMEDOUT': ERROR_TYPES.TIMEOUT,
  'ENOTFOUND': ERROR_TYPES.NETWORK,
  'EHOSTUNREACH': ERROR_TYPES.NETWORK,
  'ENETDOWN': ERROR_TYPES.NETWORK,
  'ENETUNREACH': ERROR_TYPES.NETWORK,
  'EADDRNOTAVAIL': ERROR_TYPES.NETWORK
};

/**
 * Error classifier class
 */
class ErrorClassifier {
  /**
   * @param {Object} logger - Logger instance
   */
  constructor(logger = null) {
    this.logger = logger || console;
  }

  /**
   * Classify an error and determine handling strategy
   * @param {Error} error - Error to classify
   * @param {Object} context - Additional context
   * @param {string} context.provider - Provider name
   * @param {string} context.operation - Operation being performed
   * @param {string} context.requestId - Request identifier
   * @returns {Object} Error classification result
   */
  classify(error, context = {}) {
    const { provider = 'unknown', operation = 'unknown', requestId = null } = context;
    
    this.logger.debug('[ErrorClassifier] Classifying error', {
      error: error.message,
      provider,
      operation,
      requestId
    });

    // Get base classification
    let classification = this.getBaseClassification(error, provider);
    
    // Enhance with context
    classification = this.enhanceClassification(classification, error, context);
    
    // Add handling strategy
    classification.strategy = this.getHandlingStrategy(classification);
    
    this.logger.debug('[ErrorClassifier] Error classified', {
      type: classification.type.name,
      severity: classification.severity,
      retryable: classification.retryable,
      requestId
    });
    
    return classification;
  }

  /**
   * Get base error classification
   * @param {Error} error - Error to classify
   * @param {string} provider - Provider name
   * @returns {Object} Base classification
   */
  getBaseClassification(error, provider) {
    const errorMessage = error.message || '';
    const errorCode = error.code || '';
    const httpStatus = error.response?.status;
    
    // Check provider-specific patterns first
    if (provider && PROVIDER_ERROR_PATTERNS[provider]) {
      const providerPatterns = PROVIDER_ERROR_PATTERNS[provider].patterns;
      for (const pattern of providerPatterns) {
        if (pattern.regex.test(errorMessage)) {
          return {
            type: pattern.type,
            severity: pattern.type.severity,
            retryable: pattern.type.retryable,
            source: 'PROVIDER_PATTERN',
            pattern: pattern.regex.toString()
          };
        }
      }
    }
    
    // Check HTTP status codes
    if (httpStatus && HTTP_STATUS_MAPPING[httpStatus]) {
      const errorType = HTTP_STATUS_MAPPING[httpStatus];
      return {
        type: errorType,
        severity: errorType.severity,
        retryable: errorType.retryable,
        source: 'HTTP_STATUS',
        httpStatus
      };
    }
    
    // Check network error codes
    if (errorCode && NETWORK_ERROR_MAPPING[errorCode]) {
      const errorType = NETWORK_ERROR_MAPPING[errorCode];
      return {
        type: errorType,
        severity: errorType.severity,
        retryable: errorType.retryable,
        source: 'NETWORK_CODE',
        networkCode: errorCode
      };
    }
    
    // Check for timeout errors
    if (errorMessage.toLowerCase().includes('timeout') || 
        errorMessage.toLowerCase().includes('timed out')) {
      return {
        type: ERROR_TYPES.TIMEOUT,
        severity: ERROR_TYPES.TIMEOUT.severity,
        retryable: ERROR_TYPES.TIMEOUT.retryable,
        source: 'MESSAGE_PATTERN'
      };
    }
    
    // Check for database errors
    if (errorCode === 'ER_ACCESS_DENIED_ERROR' || 
        errorCode === 'ECONNREFUSED' || 
        errorMessage.includes('SequelizeDatabaseError')) {
      return {
        type: ERROR_TYPES.DATABASE,
        severity: ERROR_TYPES.DATABASE.severity,
        retryable: ERROR_TYPES.DATABASE.retryable,
        source: 'DATABASE_PATTERN'
      };
    }
    
    // Default to unknown
    return {
      type: ERROR_TYPES.UNKNOWN,
      severity: ERROR_TYPES.UNKNOWN.severity,
      retryable: ERROR_TYPES.UNKNOWN.retryable,
      source: 'DEFAULT'
    };
  }

  /**
   * Enhance classification with additional context
   * @param {Object} classification - Base classification
   * @param {Error} error - Original error
   * @param {Object} context - Additional context
   * @returns {Object} Enhanced classification
   */
  enhanceClassification(classification, error, context) {
    const enhanced = {
      ...classification,
      error: {
        message: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack
      },
      context: {
        ...context,
        timestamp: Date.now(),
        nodeVersion: process.version,
        platform: process.platform
      },
      metadata: {
        isRetryable: classification.retryable,
        severityLevel: SEVERITY_LEVELS[classification.severity],
        recommendedAction: this.getRecommendedAction(classification.type),
        escalationRequired: classification.severity === 'HIGH' || classification.severity === 'CRITICAL'
      }
    };

    // Add HTTP response details if available
    if (error.response) {
      enhanced.http = {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data
      };
    }

    // Add request details if available
    if (error.config) {
      enhanced.request = {
        method: error.config.method,
        url: error.config.url,
        timeout: error.config.timeout,
        headers: error.config.headers
      };
    }

    return enhanced;
  }

  /**
   * Get recommended action for error type
   * @param {Object} errorType - Error type
   * @returns {string} Recommended action
   */
  getRecommendedAction(errorType) {
    const actions = {
      [ERROR_TYPES.NETWORK.name]: 'Check network connectivity and retry',
      [ERROR_TYPES.TIMEOUT.name]: 'Increase timeout or retry with backoff',
      [ERROR_TYPES.RATE_LIMIT.name]: 'Wait and retry with exponential backoff',
      [ERROR_TYPES.AUTHENTICATION.name]: 'Verify API credentials and configuration',
      [ERROR_TYPES.AUTHORIZATION.name]: 'Check account permissions and quotas',
      [ERROR_TYPES.VALIDATION.name]: 'Review request format and parameters',
      [ERROR_TYPES.SERVER.name]: 'Wait and retry, escalate if persistent',
      [ERROR_TYPES.CLIENT.name]: 'Review client implementation and request',
      [ERROR_TYPES.DATABASE.name]: 'Check database connectivity and configuration',
      [ERROR_TYPES.CONFIGURATION.name]: 'Review and fix configuration settings',
      [ERROR_TYPES.QUOTA.name]: 'Check quotas and usage limits',
      [ERROR_TYPES.SERVICE_UNAVAILABLE.name]: 'Wait for service recovery and retry',
      [ERROR_TYPES.DATA_FORMAT.name]: 'Review data processing and validation',
      [ERROR_TYPES.UNKNOWN.name]: 'Investigate error details and escalate'
    };
    
    return actions[errorType.name] || 'Review error details and take appropriate action';
  }

  /**
   * Get handling strategy for classified error
   * @param {Object} classification - Error classification
   * @returns {Object} Handling strategy
   */
  getHandlingStrategy(classification) {
    const strategy = {
      shouldRetry: classification.retryable,
      maxRetries: this.getMaxRetries(classification.type),
      retryDelay: this.getRetryDelay(classification.type),
      circuitBreakerSensitive: this.isCircuitBreakerSensitive(classification.type),
      alerting: this.getAlertingLevel(classification.severity),
      fallbackStrategy: this.getFallbackStrategy(classification.type)
    };

    return strategy;
  }

  /**
   * Get maximum retry attempts for error type
   * @param {Object} errorType - Error type
   * @returns {number} Maximum retries
   */
  getMaxRetries(errorType) {
    const retryLimits = {
      [ERROR_TYPES.NETWORK.name]: 3,
      [ERROR_TYPES.TIMEOUT.name]: 2,
      [ERROR_TYPES.RATE_LIMIT.name]: 5,
      [ERROR_TYPES.SERVER.name]: 3,
      [ERROR_TYPES.DATABASE.name]: 2,
      [ERROR_TYPES.SERVICE_UNAVAILABLE.name]: 3
    };
    
    return retryLimits[errorType.name] || 0;
  }

  /**
   * Get retry delay for error type
   * @param {Object} errorType - Error type
   * @returns {number} Retry delay in milliseconds
   */
  getRetryDelay(errorType) {
    const delayLimits = {
      [ERROR_TYPES.NETWORK.name]: 2000,
      [ERROR_TYPES.TIMEOUT.name]: 5000,
      [ERROR_TYPES.RATE_LIMIT.name]: 10000,
      [ERROR_TYPES.SERVER.name]: 3000,
      [ERROR_TYPES.DATABASE.name]: 1000,
      [ERROR_TYPES.SERVICE_UNAVAILABLE.name]: 5000
    };
    
    return delayLimits[errorType.name] || 1000;
  }

  /**
   * Check if error type should affect circuit breaker
   * @param {Object} errorType - Error type
   * @returns {boolean} Whether it affects circuit breaker
   */
  isCircuitBreakerSensitive(errorType) {
    const sensitiveTypes = [
      ERROR_TYPES.SERVER.name,
      ERROR_TYPES.SERVICE_UNAVAILABLE.name,
      ERROR_TYPES.TIMEOUT.name,
      ERROR_TYPES.NETWORK.name
    ];
    
    return sensitiveTypes.includes(errorType.name);
  }

  /**
   * Get alerting level for severity
   * @param {string} severity - Error severity
   * @returns {Object} Alerting configuration
   */
  getAlertingLevel(severity) {
    const alertLevels = {
      LOW: { immediate: false, aggregate: true, channels: ['log'] },
      MEDIUM: { immediate: false, aggregate: true, channels: ['log', 'slack'] },
      HIGH: { immediate: true, aggregate: true, channels: ['log', 'slack', 'email'] },
      CRITICAL: { immediate: true, aggregate: true, channels: ['log', 'slack', 'email', 'phone'] }
    };
    
    return alertLevels[severity] || alertLevels.MEDIUM;
  }

  /**
   * Get fallback strategy for error type
   * @param {Object} errorType - Error type
   * @returns {string} Fallback strategy
   */
  getFallbackStrategy(errorType) {
    const strategies = {
      [ERROR_TYPES.NETWORK.name]: 'USE_CACHED_DATA',
      [ERROR_TYPES.TIMEOUT.name]: 'USE_CACHED_DATA',
      [ERROR_TYPES.RATE_LIMIT.name]: 'QUEUE_REQUEST',
      [ERROR_TYPES.SERVER.name]: 'USE_CACHED_DATA',
      [ERROR_TYPES.SERVICE_UNAVAILABLE.name]: 'USE_CACHED_DATA',
      [ERROR_TYPES.AUTHENTICATION.name]: 'STOP_PROCESSING',
      [ERROR_TYPES.AUTHORIZATION.name]: 'STOP_PROCESSING',
      [ERROR_TYPES.CONFIGURATION.name]: 'STOP_PROCESSING'
    };
    
    return strategies[errorType.name] || 'LOG_AND_CONTINUE';
  }

  /**
   * Create a standardized error summary for reporting
   * @param {Object} classification - Error classification
   * @returns {Object} Error summary
   */
  createErrorSummary(classification) {
    return {
      type: classification.type.name,
      severity: classification.severity,
      retryable: classification.retryable,
      provider: classification.context.provider,
      operation: classification.context.operation,
      message: classification.error.message,
      timestamp: classification.context.timestamp,
      recommendedAction: classification.metadata.recommendedAction,
      escalationRequired: classification.metadata.escalationRequired,
      fingerprint: this.generateErrorFingerprint(classification)
    };
  }

  /**
   * Generate error fingerprint for deduplication
   * @param {Object} classification - Error classification
   * @returns {string} Error fingerprint
   */
  generateErrorFingerprint(classification) {
    const crypto = require('crypto');
    const key = `${classification.type.name}_${classification.context.provider}_${classification.error.name}_${classification.context.operation}`;
    return crypto.createHash('md5').update(key).digest('hex');
  }
}

module.exports = { ErrorClassifier, ERROR_TYPES, SEVERITY_LEVELS };