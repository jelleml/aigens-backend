# Logging System Examples

## Table of Contents

- [Basic Usage Examples](#basic-usage-examples)
- [Express Integration Examples](#express-integration-examples)
- [Service Layer Examples](#service-layer-examples)
- [Error Handling Examples](#error-handling-examples)
- [Performance Monitoring Examples](#performance-monitoring-examples)
- [Migration Examples](#migration-examples)
- [Advanced Patterns](#advanced-patterns)

## Basic Usage Examples

### Simple Logging

```javascript
const { getLogger } = require('./services/logging');

// Create a logger for a service
const logger = getLogger('user-service', 'service');

// Basic logging
logger.info('Service started');
logger.warn('Deprecated method called');
logger.error('Database connection failed', error);
```

### Logging with Context

```javascript
const logger = getLogger('auth-service', 'service');

// Log with additional context
logger.info('User authentication successful', {
  userId: 123,
  method: 'jwt',
  ip: '192.168.1.1',
  userAgent: 'Mozilla/5.0...'
});

logger.error('Authentication failed', error, {
  userId: 123,
  attempt: 3,
  reason: 'invalid_credentials'
});
```

### Child Loggers

```javascript
const logger = getLogger('api-gateway', 'service');

// Create child logger with request context
const requestLogger = logger.child({
  requestId: 'req-123',
  userId: 456,
  endpoint: '/api/users'
});

requestLogger.info('Processing request');
requestLogger.debug('Request parameters', { limit: 10, offset: 0 });
requestLogger.info('Request completed', { duration: 150 });
```

## Express Integration Examples

### Basic Express Setup

```javascript
const express = require('express');
const { correlationMiddleware, requestLogger } = require('./services/logging');

const app = express();

// Add correlation middleware early
app.use(correlationMiddleware);

// Add request logging
app.use(requestLogger);

// Your routes here
app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});
```

### Custom Request Logging

```javascript
const { getLogger } = require('./services/logging');

const logger = getLogger('api', 'middleware');

// Custom request logging middleware
const customRequestLogger = (req, res, next) => {
  const start = Date.now();
  
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length')
    });
  });

  next();
};

app.use(customRequestLogger);
```

### Error Handling Middleware

```javascript
const { getLogger } = require('./services/logging');

const logger = getLogger('error-handler', 'middleware');

const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', err, {
    method: req.method,
    url: req.url,
    userId: req.user?.id,
    correlationId: req.correlationId
  });

  res.status(500).json({
    error: 'Internal server error',
    correlationId: req.correlationId
  });
};

app.use(errorHandler);
```

## Service Layer Examples

### Database Service

```javascript
const { getLogger } = require('./services/logging');

class UserService {
  constructor() {
    this.logger = getLogger('user-service', 'service');
  }

  async createUser(userData) {
    try {
      this.logger.info('Creating new user', { email: userData.email });
      
      const user = await User.create(userData);
      
      this.logger.info('User created successfully', { 
        userId: user.id,
        email: user.email 
      });
      
      return user;
    } catch (error) {
      this.logger.error('Failed to create user', error, {
        email: userData.email,
        errorCode: error.code
      });
      throw error;
    }
  }

  async getUserById(userId) {
    try {
      this.logger.debug('Fetching user by ID', { userId });
      
      const user = await User.findByPk(userId);
      
      if (!user) {
        this.logger.warn('User not found', { userId });
        return null;
      }
      
      this.logger.debug('User retrieved successfully', { userId });
      return user;
    } catch (error) {
      this.logger.error('Failed to fetch user', error, { userId });
      throw error;
    }
  }
}
```

### External API Service

```javascript
const { getLogger } = require('./services/logging');

class PaymentService {
  constructor() {
    this.logger = getLogger('payment-service', 'service');
  }

  async processPayment(paymentData) {
    const requestLogger = this.logger.child({
      paymentId: paymentData.id,
      amount: paymentData.amount,
      currency: paymentData.currency
    });

    try {
      requestLogger.info('Processing payment');
      
      // Validate payment data
      this.validatePayment(paymentData);
      requestLogger.debug('Payment validation passed');
      
      // Call external API
      const result = await this.callPaymentAPI(paymentData);
      requestLogger.info('Payment processed successfully', {
        transactionId: result.transactionId,
        status: result.status
      });
      
      return result;
    } catch (error) {
      requestLogger.error('Payment processing failed', error, {
        errorType: error.name,
        errorCode: error.code
      });
      throw error;
    }
  }

  validatePayment(paymentData) {
    this.logger.debug('Validating payment data', {
      hasAmount: !!paymentData.amount,
      hasCurrency: !!paymentData.currency,
      hasCardToken: !!paymentData.cardToken
    });
    
    // Validation logic here
  }
}
```

## Error Handling Examples

### Try-Catch with Logging

```javascript
const { getLogger } = require('./services/logging');

const logger = getLogger('data-processor', 'service');

async function processData(data) {
  try {
    logger.info('Starting data processing', { 
      recordCount: data.length,
      dataType: data.type 
    });

    const result = await complexProcessing(data);
    
    logger.info('Data processing completed', {
      processedCount: result.length,
      duration: result.duration
    });
    
    return result;
  } catch (error) {
    logger.error('Data processing failed', error, {
      recordCount: data.length,
      dataType: data.type,
      errorPhase: error.phase || 'unknown'
    });
    
    // Re-throw or handle as needed
    throw error;
  }
}
```

### Error Classification

```javascript
const { getLogger } = require('./services/logging');

const logger = getLogger('error-classifier', 'service');

function handleError(error, context) {
  const errorContext = {
    ...context,
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack
  };

  if (error.name === 'ValidationError') {
    logger.warn('Validation error occurred', error, errorContext);
  } else if (error.name === 'DatabaseError') {
    logger.error('Database error occurred', error, errorContext);
  } else if (error.name === 'NetworkError') {
    logger.error('Network error occurred', error, errorContext);
  } else {
    logger.error('Unknown error occurred', error, errorContext);
  }
}
```

## Performance Monitoring Examples

### API Performance Tracking

```javascript
const { getLogger, MetricsCollector } = require('./services/logging');

const logger = getLogger('performance', 'monitoring');

// Middleware for API performance tracking
const performanceMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Log performance data
    logger.info('API performance', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length')
    });
    
    // Track metrics
    MetricsCollector.timing('api.response_time', duration);
    MetricsCollector.increment('api.requests');
    
    if (res.statusCode >= 400) {
      MetricsCollector.increment('api.errors');
    }
  });
  
  next();
};
```

### Database Query Performance

```javascript
const { getLogger, MetricsCollector } = require('./services/logging');

const logger = getLogger('database', 'service');

class DatabaseService {
  async query(sql, params) {
    const start = Date.now();
    
    try {
      logger.debug('Executing database query', { sql, params });
      
      const result = await this.connection.query(sql, params);
      
      const duration = Date.now() - start;
      
      logger.debug('Database query completed', {
        sql,
        rowCount: result.rows.length,
        duration
      });
      
      MetricsCollector.timing('database.query_time', duration);
      MetricsCollector.increment('database.queries');
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      logger.error('Database query failed', error, {
        sql,
        params,
        duration
      });
      
      MetricsCollector.increment('database.errors');
      throw error;
    }
  }
}
```

## Migration Examples

### From Console Logging

```javascript
// Before
console.log('User logged in:', userId);
console.error('Database error:', error);
console.warn('Deprecated method called');

// After
const { getLogger } = require('./services/logging');
const logger = getLogger('auth', 'service');

logger.info('User logged in', { userId });
logger.error('Database error', error);
logger.warn('Deprecated method called');
```

### From Morgan

```javascript
// Before
const morgan = require('morgan');
app.use(morgan('combined'));

// After
const { requestLogger } = require('./services/logging');
app.use(requestLogger);
```

### From Custom Logging

```javascript
// Before
const winston = require('winston');
const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

logger.info('Message', { context: 'data' });

// After
const { getLogger } = require('./services/logging');
const logger = getLogger('service-name', 'service');

logger.info('Message', { context: 'data' });
```

## Advanced Patterns

### Request-Scoped Logging

```javascript
const { getLogger } = require('./services/logging');

// Middleware to add request-scoped logger
const requestLoggerMiddleware = (req, res, next) => {
  const baseLogger = getLogger('api', 'middleware');
  
  req.logger = baseLogger.child({
    requestId: req.correlationId,
    method: req.method,
    path: req.path,
    userId: req.user?.id
  });
  
  next();
};

// Usage in route handlers
app.get('/api/users/:id', async (req, res) => {
  req.logger.info('Processing user request');
  
  try {
    const user = await UserService.getUserById(req.params.id);
    req.logger.info('User retrieved successfully', { userId: user.id });
    res.json(user);
  } catch (error) {
    req.logger.error('Failed to retrieve user', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### Batch Processing with Progress

```javascript
const { getLogger } = require('./services/logging');

const logger = getLogger('batch-processor', 'service');

async function processBatch(items) {
  const batchLogger = logger.child({
    batchId: generateBatchId(),
    totalItems: items.length
  });
  
  batchLogger.info('Starting batch processing');
  
  let processed = 0;
  let errors = 0;
  
  for (const item of items) {
    try {
      await processItem(item);
      processed++;
      
      if (processed % 100 === 0) {
        batchLogger.info('Batch progress', {
          processed,
          total: items.length,
          percentage: Math.round((processed / items.length) * 100)
        });
      }
    } catch (error) {
      errors++;
      batchLogger.error('Item processing failed', error, {
        itemId: item.id,
        processed,
        errors
      });
    }
  }
  
  batchLogger.info('Batch processing completed', {
    processed,
    errors,
    successRate: Math.round((processed / items.length) * 100)
  });
}
```

### Conditional Logging

```javascript
const { getLogger } = require('./services/logging');

const logger = getLogger('conditional-logger', 'service');

function processWithConditionalLogging(data, options = {}) {
  const { verbose = false, logErrors = true } = options;
  
  if (verbose) {
    logger.debug('Processing data with verbose logging', { data });
  }
  
  try {
    const result = processData(data);
    
    if (verbose) {
      logger.debug('Processing completed', { result });
    }
    
    return result;
  } catch (error) {
    if (logErrors) {
      logger.error('Processing failed', error, { data });
    }
    throw error;
  }
}
```

### Logging with Sampling

```javascript
const { getLogger } = require('./services/logging');

const logger = getLogger('sampled-logger', 'service');

function logWithSampling(message, context, sampleRate = 0.1) {
  // Only log 10% of the time by default
  if (Math.random() < sampleRate) {
    logger.info(message, context);
  }
}

// Usage
logWithSampling('High-volume event', { eventType: 'click' }, 0.01); // 1% sampling
logWithSampling('Medium-volume event', { eventType: 'view' }, 0.1);  // 10% sampling
```

These examples demonstrate various patterns and best practices for using the centralized logging system effectively across different parts of your application. 