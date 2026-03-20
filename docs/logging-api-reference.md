# Logging System API Reference

## Table of Contents

- [Main Exports](#main-exports)
- [LoggerFactory](#loggerfactory)
- [StructuredLogger](#structuredlogger)
- [CorrelationManager](#correlationmanager)
- [MetricsCollector](#metricscollector)
- [Middleware](#middleware)
- [Configuration](#configuration)
- [Error Handling](#error-handling)

## Main Exports

### `getLogger(name, category)`

Creates or retrieves a logger instance.

**Parameters:**
- `name` (string): Logger name/identifier
- `category` (string): Logger category (e.g., 'service', 'middleware', 'controller')

**Returns:** `StructuredLogger` instance

**Example:**
```javascript
const { getLogger } = require('./services/logging');
const logger = getLogger('user-service', 'service');
```

### `replaceConsole()`

Replaces global console methods with structured logging.

**Example:**
```javascript
const { replaceConsole } = require('./services/logging');
replaceConsole();
```

## LoggerFactory

### `LoggerFactory.getInstance(name, category)`

Gets or creates a logger instance.

**Parameters:**
- `name` (string): Logger name
- `category` (string): Logger category

**Returns:** `StructuredLogger` instance

### `LoggerFactory.clearCache()`

Clears the logger instance cache.

## StructuredLogger

### Constructor

```javascript
new StructuredLogger(name, category, options)
```

**Parameters:**
- `name` (string): Logger name
- `category` (string): Logger category
- `options` (object): Logger options

### Methods

#### `logger.error(message, error?, context?)`

Logs an error message.

**Parameters:**
- `message` (string): Error message
- `error` (Error, optional): Error object
- `context` (object, optional): Additional context

**Example:**
```javascript
logger.error('Database connection failed', error, { 
  database: 'users',
  operation: 'connect'
});
```

#### `logger.warn(message, context?)`

Logs a warning message.

**Parameters:**
- `message` (string): Warning message
- `context` (object, optional): Additional context

**Example:**
```javascript
logger.warn('Deprecated method called', { 
  method: 'oldFunction',
  alternative: 'newFunction'
});
```

#### `logger.info(message, context?)`

Logs an informational message.

**Parameters:**
- `message` (string): Info message
- `context` (object, optional): Additional context

**Example:**
```javascript
logger.info('User logged in successfully', { 
  userId: 123,
  timestamp: new Date()
});
```

#### `logger.debug(message, context?)`

Logs a debug message.

**Parameters:**
- `message` (string): Debug message
- `context` (object, optional): Additional context

**Example:**
```javascript
logger.debug('Processing request', { 
  requestId: 'abc-123',
  method: 'POST',
  path: '/api/users'
});
```

#### `logger.trace(message, context?)`

Logs a trace message.

**Parameters:**
- `message` (string): Trace message
- `context` (object, optional): Additional context

**Example:**
```javascript
logger.trace('Function entry', { 
  function: 'processUser',
  parameters: { userId: 123 }
});
```

#### `logger.child(context)`

Creates a child logger with additional context.

**Parameters:**
- `context` (object): Additional context to include in all log messages

**Returns:** `StructuredLogger` instance

**Example:**
```javascript
const childLogger = logger.child({ 
  requestId: 'abc-123',
  userId: 456
});
childLogger.info('Processing user request');
```

#### `logger.setLevel(level)`

Sets the log level for this logger.

**Parameters:**
- `level` (string): Log level ('error', 'warn', 'info', 'debug', 'trace')

**Example:**
```javascript
logger.setLevel('debug');
```

## CorrelationManager

### `CorrelationManager.getCorrelationId()`

Gets the current correlation ID.

**Returns:** `string` or `null`

### `CorrelationManager.setCorrelationId(id)`

Sets the correlation ID for the current context.

**Parameters:**
- `id` (string): Correlation ID

### `CorrelationManager.generateCorrelationId()`

Generates a new correlation ID.

**Returns:** `string`

### `CorrelationManager.clearCorrelationId()`

Clears the current correlation ID.

## MetricsCollector

### `MetricsCollector.increment(metric, value?)`

Increments a counter metric.

**Parameters:**
- `metric` (string): Metric name
- `value` (number, optional): Increment value (default: 1)

**Example:**
```javascript
MetricsCollector.increment('api.requests');
MetricsCollector.increment('api.errors', 5);
```

### `MetricsCollector.timing(metric, value)`

Records a timing metric.

**Parameters:**
- `metric` (string): Metric name
- `value` (number): Timing value in milliseconds

**Example:**
```javascript
MetricsCollector.timing('api.response_time', 150);
```

### `MetricsCollector.gauge(metric, value)`

Sets a gauge metric.

**Parameters:**
- `metric` (string): Metric name
- `value` (number): Gauge value

**Example:**
```javascript
MetricsCollector.gauge('memory.usage', process.memoryUsage().heapUsed);
```

### `MetricsCollector.histogram(metric, value)`

Records a histogram metric.

**Parameters:**
- `metric` (string): Metric name
- `value` (number): Histogram value

**Example:**
```javascript
MetricsCollector.histogram('request.size', 1024);
```

### `MetricsCollector.getMetrics()`

Gets all collected metrics.

**Returns:** `object`

## Middleware

### `correlationMiddleware`

Express middleware for correlation ID handling.

**Usage:**
```javascript
const { correlationMiddleware } = require('./services/logging');
app.use(correlationMiddleware);
```

**Features:**
- Extracts correlation ID from request headers
- Generates correlation ID if not present
- Adds correlation ID to response headers
- Makes correlation ID available to subsequent middleware

### `requestLogger`

Express middleware for request/response logging.

**Usage:**
```javascript
const { requestLogger } = require('./services/logging');
app.use(requestLogger);
```

**Features:**
- Logs incoming requests
- Logs outgoing responses
- Includes timing information
- Captures error responses
- Uses correlation IDs for request tracking

## Configuration

### LoggingConfig

```javascript
const LoggingConfig = {
  level: 'info',
  transports: {
    console: {
      enabled: true,
      format: 'json'
    },
    file: {
      enabled: true,
      directory: './logs',
      maxSize: '10m',
      maxFiles: 5
    }
  },
  correlation: {
    headerName: 'X-Correlation-ID',
    generateIfMissing: true
  }
};
```

### VerbosityLevels

```javascript
const VerbosityLevels = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};
```

## Error Handling

### LoggingErrorHandler

Handles logging transport failures and provides recovery mechanisms.

#### `handleTransportError(error, context)`

Handles transport errors with buffering and retry logic.

**Parameters:**
- `error` (Error): Transport error
- `context` (object): Error context

#### `flushBufferedLogs()`

Flushes any buffered log messages.

**Returns:** `Promise<void>`

#### `getErrorStats()`

Gets error statistics.

**Returns:** `object`

## Log Format

### JSON Format

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "User logged in successfully",
  "logger": {
    "name": "user-service",
    "category": "service"
  },
  "correlationId": "abc-123-def-456",
  "context": {
    "userId": 123,
    "ip": "192.168.1.1"
  },
  "metadata": {
    "pid": 12345,
    "hostname": "server-01"
  }
}
```

### Simple Format

```
[2024-01-15T10:30:00.000Z] [INFO] [user-service] User logged in successfully
```

## Performance Considerations

### Logger Caching

Logger instances are cached by name and category to avoid repeated instantiation.

### Async Logging

All logging operations are asynchronous to avoid blocking the main thread.

### Buffering

Failed log messages are buffered in memory and retried with exponential backoff.

### File Rotation

Log files are automatically rotated based on size and age to manage disk usage.

## Best Practices

1. **Use appropriate log levels** for different types of messages
2. **Include relevant context** in log messages
3. **Avoid logging sensitive data** like passwords or tokens
4. **Use correlation IDs** for request tracking
5. **Structure log messages** consistently
6. **Monitor log volume** and adjust levels as needed
7. **Use child loggers** for request-specific context
8. **Handle errors gracefully** in logging code 