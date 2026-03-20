# Centralized Logging System

## Overview

The centralized logging system provides a unified, structured approach to logging across the entire backend application. It replaces scattered `console.log` statements with a comprehensive logging infrastructure that supports correlation IDs, verbosity levels, context enrichment, and multiple output formats.

## Key Features

- **Structured Logging**: JSON-formatted logs with consistent structure
- **Correlation IDs**: Track requests across services and components
- **Verbosity Levels**: Configurable log levels (error, warn, info, debug, trace)
- **Context Enrichment**: Automatic addition of metadata to log entries
- **File Management**: Hierarchical log directories by service and date
- **Console Adapter**: Legacy console method replacement
- **Error Handling**: Graceful degradation and retry mechanisms
- **Performance Monitoring**: Built-in metrics collection

## Architecture

```
services/logging/
├── index.js                    # Main exports and factory
├── core/
│   ├── structured-logger.js    # Core logging implementation
│   ├── logger-factory.js       # Logger instance management
│   ├── correlation-manager.js  # Correlation ID handling
│   ├── metrics-collector.js    # Performance metrics
│   └── logging-error-handler.js # Error handling and recovery
├── middleware/
│   ├── correlation-middleware.js # Express correlation middleware
│   └── request-logger.js       # Request/response logging
├── config/
│   ├── logging-config.js       # Configuration management
│   ├── transport-config.js     # Transport configuration
│   └── verbosity-levels.js     # Log level definitions
└── adapters/
    └── console-adapter.js      # Console method replacement
```

## Quick Start

### Basic Usage

```javascript
const { getLogger } = require('./services/logging');

// Create a logger instance
const logger = getLogger('my-service', 'service');

// Log messages
logger.info('Service started successfully');
logger.error('Operation failed', error);
logger.warn('Deprecated method called');
logger.debug('Processing request', { userId: 123, action: 'login' });
```

### Express Integration

```javascript
const { correlationMiddleware, requestLogger } = require('./services/logging');

// Add correlation middleware (early in the stack)
app.use(correlationMiddleware);

// Add request logging middleware
app.use(requestLogger);

// Replace Morgan with structured logging
// app.use(morgan('combined')); // Remove this
```

### Console Replacement

```javascript
const { replaceConsole } = require('./services/logging');

// Replace global console methods
replaceConsole();
```

## Configuration

### Environment Variables

```bash
# Log level (error, warn, info, debug, trace)
LOG_LEVEL=info

# Log directory
LOG_DIR=./logs

# Enable file logging
ENABLE_FILE_LOGGING=true

# Enable console logging
ENABLE_CONSOLE_LOGGING=true

# Correlation ID header name
CORRELATION_ID_HEADER=X-Correlation-ID

# Log format (json, simple)
LOG_FORMAT=json
```

### Configuration File

```javascript
// config/logging.js
module.exports = {
  level: process.env.LOG_LEVEL || 'info',
  transports: {
    console: {
      enabled: process.env.ENABLE_CONSOLE_LOGGING !== 'false',
      format: process.env.LOG_FORMAT || 'json'
    },
    file: {
      enabled: process.env.ENABLE_FILE_LOGGING !== 'false',
      directory: process.env.LOG_DIR || './logs',
      maxSize: '10m',
      maxFiles: 5
    }
  },
  correlation: {
    headerName: process.env.CORRELATION_ID_HEADER || 'X-Correlation-ID',
    generateIfMissing: true
  }
};
```

## Log Levels

| Level | Description | Usage |
|-------|-------------|-------|
| `error` | Error conditions | System errors, exceptions, failures |
| `warn` | Warning conditions | Deprecations, recoverable errors |
| `info` | General information | Service events, operations completed |
| `debug` | Debug information | Detailed flow, variable values |
| `trace` | Trace information | Very detailed debugging |

## Correlation IDs

Correlation IDs allow tracking requests across multiple services and components:

```javascript
// Automatic correlation ID generation
logger.info('Processing request', { 
  correlationId: 'abc-123-def-456',
  userId: 123,
  action: 'login'
});

// Manual correlation ID setting
const { setCorrelationId } = require('./services/logging');
setCorrelationId('custom-id-123');
```

## File Management

Logs are organized in a hierarchical structure:

```
logs/
├── service-name/
│   ├── 2024-01-15/
│   │   ├── error.log
│   │   ├── combined.log
│   │   └── performance.log
│   └── 2024-01-16/
│       ├── error.log
│       ├── combined.log
│       └── performance.log
└── middleware/
    ├── 2024-01-15/
    │   └── request.log
    └── 2024-01-16/
        └── request.log
```

## Error Handling

The system includes robust error handling:

- **In-memory buffering** for transport failures
- **Exponential backoff** retry mechanism
- **Fallback logging** to console
- **Graceful degradation** when transports fail

## Performance Monitoring

Built-in metrics collection:

```javascript
const { MetricsCollector } = require('./services/logging');

// Track custom metrics
MetricsCollector.increment('api.requests');
MetricsCollector.timing('api.response_time', 150);
MetricsCollector.gauge('memory.usage', process.memoryUsage().heapUsed);
```

## Migration Guide

### From Console Logging

```javascript
// Before
console.log('User logged in:', userId);
console.error('Database error:', error);

// After
const logger = getLogger('auth', 'service');
logger.info('User logged in', { userId });
logger.error('Database error', error);
```

### From Morgan

```javascript
// Before
app.use(morgan('combined'));

// After
const { requestLogger } = require('./services/logging');
app.use(requestLogger);
```

## Best Practices

1. **Use appropriate log levels**
2. **Include relevant context**
3. **Avoid logging sensitive data**
4. **Use correlation IDs for request tracking**
5. **Structure log messages consistently**
6. **Monitor log volume and performance**

## Troubleshooting

### Common Issues

1. **Logs not appearing**: Check log level configuration
2. **File permission errors**: Verify log directory permissions
3. **Performance impact**: Monitor log volume and adjust levels
4. **Missing correlation IDs**: Ensure middleware is properly configured

### Debug Mode

Enable debug logging for troubleshooting:

```bash
LOG_LEVEL=debug
```

## API Reference

See [logging-api-reference.md](./logging-api-reference.md) for detailed API documentation.

## Examples

See [logging-examples.md](./logging-examples.md) for practical usage examples. 