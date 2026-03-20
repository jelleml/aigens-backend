/**
 * Unit tests for ErrorClassifier
 */

const { ErrorClassifier, ERROR_TYPES, SEVERITY_LEVELS } = require('../../../../services/model-management/utils/error-classifier');

describe('ErrorClassifier', () => {
  let errorClassifier;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    errorClassifier = new ErrorClassifier(mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with logger', () => {
      expect(errorClassifier.logger).toBe(mockLogger);
    });

    it('should initialize with default logger if none provided', () => {
      const classifier = new ErrorClassifier();
      expect(classifier.logger).toBe(console);
    });
  });

  describe('classify', () => {
    it('should classify network errors correctly', () => {
      const error = new Error('Connection failed');
      error.code = 'ECONNRESET';
      
      const result = errorClassifier.classify(error, {
        provider: 'openai',
        operation: 'fetch_models'
      });
      
      expect(result.type).toBe(ERROR_TYPES.NETWORK);
      expect(result.severity).toBe('MEDIUM');
      expect(result.retryable).toBe(true);
      expect(result.source).toBe('NETWORK_CODE');
      expect(result.context.provider).toBe('openai');
      expect(result.strategy.shouldRetry).toBe(true);
    });

    it('should classify HTTP status errors correctly', () => {
      const error = new Error('Rate limit exceeded');
      error.response = { 
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': '60' },
        data: { error: 'rate_limit_exceeded' }
      };
      
      const result = errorClassifier.classify(error);
      
      expect(result.type).toBe(ERROR_TYPES.RATE_LIMIT);
      expect(result.severity).toBe('LOW');
      expect(result.retryable).toBe(true);
      expect(result.source).toBe('HTTP_STATUS');
      expect(result.http.status).toBe(429);
    });

    it('should classify provider-specific errors correctly', () => {
      const error = new Error('invalid_api_key: The API key is invalid');
      
      const result = errorClassifier.classify(error, {
        provider: 'openai'
      });
      
      expect(result.type).toBe(ERROR_TYPES.AUTHENTICATION);
      expect(result.severity).toBe('HIGH');
      expect(result.retryable).toBe(false);
      expect(result.source).toBe('PROVIDER_PATTERN');
    });

    it('should classify timeout errors from message patterns', () => {
      const error = new Error('Request timed out after 30 seconds');
      
      const result = errorClassifier.classify(error);
      
      expect(result.type).toBe(ERROR_TYPES.TIMEOUT);
      expect(result.severity).toBe('MEDIUM');
      expect(result.retryable).toBe(true);
      expect(result.source).toBe('MESSAGE_PATTERN');
    });

    it('should classify database errors correctly', () => {
      const error = new Error('SequelizeDatabaseError: Connection terminated');
      
      const result = errorClassifier.classify(error);
      
      expect(result.type).toBe(ERROR_TYPES.DATABASE);
      expect(result.severity).toBe('HIGH');
      expect(result.retryable).toBe(true);
      expect(result.source).toBe('DATABASE_PATTERN');
    });

    it('should classify unknown errors as default', () => {
      const error = new Error('Unknown error occurred');
      
      const result = errorClassifier.classify(error);
      
      expect(result.type).toBe(ERROR_TYPES.UNKNOWN);
      expect(result.severity).toBe('HIGH');
      expect(result.retryable).toBe(false);
      expect(result.source).toBe('DEFAULT');
    });

    it('should include request details when available', () => {
      const error = new Error('Request failed');
      error.config = {
        method: 'GET',
        url: 'https://api.example.com/models',
        timeout: 30000,
        headers: { 'Authorization': 'Bearer token' }
      };
      
      const result = errorClassifier.classify(error);
      
      expect(result.request).toMatchObject({
        method: 'GET',
        url: 'https://api.example.com/models',
        timeout: 30000
      });
    });

    it('should enhance classification with metadata', () => {
      const error = new Error('Server error');
      error.response = { status: 500 };
      
      const result = errorClassifier.classify(error, {
        provider: 'anthropic',
        operation: 'fetch_models',
        requestId: 'req_123'
      });
      
      expect(result.metadata).toMatchObject({
        isRetryable: true,
        severityLevel: SEVERITY_LEVELS.HIGH,
        recommendedAction: expect.stringContaining('Wait and retry'),
        escalationRequired: true
      });
      
      expect(result.context.requestId).toBe('req_123');
      expect(result.context.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getBaseClassification', () => {
    it('should prioritize provider-specific patterns', () => {
      const error = new Error('insufficient_quota: Not enough credits');
      
      const result = errorClassifier.getBaseClassification(error, 'openai');
      
      expect(result.type).toBe(ERROR_TYPES.QUOTA);
      expect(result.source).toBe('PROVIDER_PATTERN');
    });

    it('should fall back to HTTP status when no provider pattern matches', () => {
      const error = new Error('Bad request');
      error.response = { status: 400 };
      
      const result = errorClassifier.getBaseClassification(error, 'openai');
      
      expect(result.type).toBe(ERROR_TYPES.VALIDATION);
      expect(result.source).toBe('HTTP_STATUS');
    });

    it('should handle multiple provider patterns', () => {
      const testCases = [
        { provider: 'anthropic', message: 'authentication_error', expected: ERROR_TYPES.AUTHENTICATION },
        { provider: 'together', message: 'rate limit exceeded', expected: ERROR_TYPES.RATE_LIMIT },
        { provider: 'openrouter', message: 'insufficient credits', expected: ERROR_TYPES.QUOTA },
        { provider: 'deepseek', message: 'API key invalid', expected: ERROR_TYPES.AUTHENTICATION },
        { provider: 'ideogram', message: 'generation failed', expected: ERROR_TYPES.SERVER }
      ];
      
      testCases.forEach(({ provider, message, expected }) => {
        const error = new Error(message);
        const result = errorClassifier.getBaseClassification(error, provider);
        expect(result.type).toBe(expected);
      });
    });
  });

  describe('getHandlingStrategy', () => {
    it('should return appropriate strategy for retryable errors', () => {
      const classification = {
        type: ERROR_TYPES.NETWORK,
        severity: 'MEDIUM',
        retryable: true
      };
      
      const strategy = errorClassifier.getHandlingStrategy(classification);
      
      expect(strategy.shouldRetry).toBe(true);
      expect(strategy.maxRetries).toBe(3);
      expect(strategy.retryDelay).toBe(2000);
      expect(strategy.circuitBreakerSensitive).toBe(true);
      expect(strategy.fallbackStrategy).toBe('USE_CACHED_DATA');
    });

    it('should return appropriate strategy for non-retryable errors', () => {
      const classification = {
        type: ERROR_TYPES.AUTHENTICATION,
        severity: 'HIGH',
        retryable: false
      };
      
      const strategy = errorClassifier.getHandlingStrategy(classification);
      
      expect(strategy.shouldRetry).toBe(false);
      expect(strategy.maxRetries).toBe(0);
      expect(strategy.fallbackStrategy).toBe('STOP_PROCESSING');
    });

    it('should set alerting levels based on severity', () => {
      const highSeverityClassification = {
        type: ERROR_TYPES.SERVER,
        severity: 'HIGH',
        retryable: true
      };
      
      const strategy = errorClassifier.getHandlingStrategy(highSeverityClassification);
      
      expect(strategy.alerting.immediate).toBe(true);
      expect(strategy.alerting.channels).toContain('email');
    });
  });

  describe('getMaxRetries', () => {
    it('should return correct retry limits for different error types', () => {
      expect(errorClassifier.getMaxRetries(ERROR_TYPES.NETWORK)).toBe(3);
      expect(errorClassifier.getMaxRetries(ERROR_TYPES.TIMEOUT)).toBe(2);
      expect(errorClassifier.getMaxRetries(ERROR_TYPES.RATE_LIMIT)).toBe(5);
      expect(errorClassifier.getMaxRetries(ERROR_TYPES.AUTHENTICATION)).toBe(0);
    });
  });

  describe('getRetryDelay', () => {
    it('should return correct retry delays for different error types', () => {
      expect(errorClassifier.getRetryDelay(ERROR_TYPES.NETWORK)).toBe(2000);
      expect(errorClassifier.getRetryDelay(ERROR_TYPES.TIMEOUT)).toBe(5000);
      expect(errorClassifier.getRetryDelay(ERROR_TYPES.RATE_LIMIT)).toBe(10000);
      expect(errorClassifier.getRetryDelay(ERROR_TYPES.AUTHENTICATION)).toBe(1000);
    });
  });

  describe('isCircuitBreakerSensitive', () => {
    it('should identify circuit breaker sensitive errors', () => {
      expect(errorClassifier.isCircuitBreakerSensitive(ERROR_TYPES.SERVER)).toBe(true);
      expect(errorClassifier.isCircuitBreakerSensitive(ERROR_TYPES.SERVICE_UNAVAILABLE)).toBe(true);
      expect(errorClassifier.isCircuitBreakerSensitive(ERROR_TYPES.TIMEOUT)).toBe(true);
      expect(errorClassifier.isCircuitBreakerSensitive(ERROR_TYPES.NETWORK)).toBe(true);
      
      expect(errorClassifier.isCircuitBreakerSensitive(ERROR_TYPES.AUTHENTICATION)).toBe(false);
      expect(errorClassifier.isCircuitBreakerSensitive(ERROR_TYPES.VALIDATION)).toBe(false);
    });
  });

  describe('getAlertingLevel', () => {
    it('should return correct alerting configuration for each severity', () => {
      const lowAlert = errorClassifier.getAlertingLevel('LOW');
      expect(lowAlert.immediate).toBe(false);
      expect(lowAlert.channels).toEqual(['log']);
      
      const mediumAlert = errorClassifier.getAlertingLevel('MEDIUM');
      expect(mediumAlert.channels).toEqual(['log', 'slack']);
      
      const highAlert = errorClassifier.getAlertingLevel('HIGH');
      expect(highAlert.immediate).toBe(true);
      expect(highAlert.channels).toEqual(['log', 'slack', 'email']);
      
      const criticalAlert = errorClassifier.getAlertingLevel('CRITICAL');
      expect(criticalAlert.channels).toEqual(['log', 'slack', 'email', 'phone']);
    });
  });

  describe('getFallbackStrategy', () => {
    it('should return appropriate fallback strategies', () => {
      expect(errorClassifier.getFallbackStrategy(ERROR_TYPES.NETWORK)).toBe('USE_CACHED_DATA');
      expect(errorClassifier.getFallbackStrategy(ERROR_TYPES.RATE_LIMIT)).toBe('QUEUE_REQUEST');
      expect(errorClassifier.getFallbackStrategy(ERROR_TYPES.AUTHENTICATION)).toBe('STOP_PROCESSING');
      expect(errorClassifier.getFallbackStrategy(ERROR_TYPES.UNKNOWN)).toBe('LOG_AND_CONTINUE');
    });
  });

  describe('createErrorSummary', () => {
    it('should create comprehensive error summary', () => {
      const classification = {
        type: ERROR_TYPES.NETWORK,
        severity: 'MEDIUM',
        retryable: true,
        context: {
          provider: 'openai',
          operation: 'fetch_models',
          timestamp: 1640995200000
        },
        error: {
          message: 'Connection failed',
          name: 'NetworkError'
        },
        metadata: {
          recommendedAction: 'Check network connectivity',
          escalationRequired: false
        }
      };
      
      const summary = errorClassifier.createErrorSummary(classification);
      
      expect(summary).toMatchObject({
        type: 'NETWORK_ERROR',
        severity: 'MEDIUM',
        retryable: true,
        provider: 'openai',
        operation: 'fetch_models',
        message: 'Connection failed',
        timestamp: 1640995200000,
        recommendedAction: 'Check network connectivity',
        escalationRequired: false,
        fingerprint: expect.any(String)
      });
    });
  });

  describe('generateErrorFingerprint', () => {
    it('should generate consistent fingerprints for similar errors', () => {
      const classification1 = {
        type: ERROR_TYPES.NETWORK,
        context: { provider: 'openai', operation: 'fetch_models' },
        error: { name: 'NetworkError' }
      };
      
      const classification2 = {
        type: ERROR_TYPES.NETWORK,
        context: { provider: 'openai', operation: 'fetch_models' },
        error: { name: 'NetworkError' }
      };
      
      const fingerprint1 = errorClassifier.generateErrorFingerprint(classification1);
      const fingerprint2 = errorClassifier.generateErrorFingerprint(classification2);
      
      expect(fingerprint1).toBe(fingerprint2);
      expect(fingerprint1).toHaveLength(32); // MD5 hash length
    });

    it('should generate different fingerprints for different errors', () => {
      const classification1 = {
        type: ERROR_TYPES.NETWORK,
        context: { provider: 'openai', operation: 'fetch_models' },
        error: { name: 'NetworkError' }
      };
      
      const classification2 = {
        type: ERROR_TYPES.AUTHENTICATION,
        context: { provider: 'openai', operation: 'fetch_models' },
        error: { name: 'AuthError' }
      };
      
      const fingerprint1 = errorClassifier.generateErrorFingerprint(classification1);
      const fingerprint2 = errorClassifier.generateErrorFingerprint(classification2);
      
      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex error classification workflow', () => {
      const error = new Error('Rate limit exceeded for API key');
      error.response = {
        status: 429,
        data: { error: 'rate_limit_exceeded' }
      };
      error.config = {
        method: 'GET',
        url: 'https://api.openai.com/v1/models'
      };
      
      const result = errorClassifier.classify(error, {
        provider: 'openai',
        operation: 'fetch_models',
        requestId: 'req_123456'
      });
      
      // Should classify as rate limit error
      expect(result.type).toBe(ERROR_TYPES.RATE_LIMIT);
      expect(result.retryable).toBe(true);
      
      // Should include comprehensive context
      expect(result.context.provider).toBe('openai');
      expect(result.http.status).toBe(429);
      expect(result.request.method).toBe('GET');
      
      // Should provide handling strategy
      expect(result.strategy.shouldRetry).toBe(true);
      expect(result.strategy.maxRetries).toBe(5);
      expect(result.strategy.fallbackStrategy).toBe('QUEUE_REQUEST');
      
      // Should be circuit breaker insensitive (rate limits are expected)
      expect(result.strategy.circuitBreakerSensitive).toBe(false);
    });

    it('should handle provider-specific authentication errors', () => {
      const providers = [
        { name: 'anthropic', message: 'authentication_error: Invalid key' },
        { name: 'together', message: 'Unauthorized access' },
        { name: 'openrouter', message: 'Invalid API key provided' },
        { name: 'deepseek', message: 'API key is invalid' }
      ];
      
      providers.forEach(({ name, message }) => {
        const error = new Error(message);
        const result = errorClassifier.classify(error, { provider: name });
        
        expect(result.type).toBe(ERROR_TYPES.AUTHENTICATION);
        expect(result.retryable).toBe(false);
        expect(result.strategy.shouldRetry).toBe(false);
        expect(result.strategy.fallbackStrategy).toBe('STOP_PROCESSING');
        expect(result.metadata.escalationRequired).toBe(true);
      });
    });

    it('should properly classify and handle cascading failure scenario', () => {
      // Simulate a server error that should trigger circuit breaker
      const serverError = new Error('Internal Server Error');
      serverError.response = { status: 500 };
      
      const result = errorClassifier.classify(serverError, {
        provider: 'openai',
        operation: 'fetch_models'
      });
      
      expect(result.type).toBe(ERROR_TYPES.SERVER);
      expect(result.retryable).toBe(true);
      expect(result.strategy.circuitBreakerSensitive).toBe(true);
      expect(result.strategy.shouldRetry).toBe(true);
      expect(result.strategy.maxRetries).toBe(3);
      expect(result.strategy.fallbackStrategy).toBe('USE_CACHED_DATA');
      expect(result.metadata.escalationRequired).toBe(true);
    });
  });
});