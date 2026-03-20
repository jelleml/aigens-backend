# Logging Migration Guide

## Overview

This guide provides step-by-step instructions for migrating from the existing logging system (console.log, Morgan, etc.) to the new centralized logging system.

## Migration Checklist

- [ ] **Phase 1: Setup and Configuration**
  - [ ] Install and configure centralized logging system
  - [ ] Set up environment variables
  - [ ] Test basic functionality

- [ ] **Phase 2: Core Components**
  - [ ] Migrate server.js and Express setup
  - [ ] Update API routes
  - [ ] Migrate service layer
  - [ ] Update controllers

- [ ] **Phase 3: Supporting Components**
  - [ ] Migrate middleware
  - [ ] Update database and migrations
  - [ ] Migrate scripts and utilities
  - [ ] Update test files

- [ ] **Phase 4: Validation and Cleanup**
  - [ ] Test all components
  - [ ] Remove old logging dependencies
  - [ ] Update documentation
  - [ ] Performance validation

## Phase 1: Setup and Configuration

### Step 1: Install Dependencies

The centralized logging system is already implemented. Ensure all required dependencies are installed:

```bash
npm install winston winston-daily-rotate-file
```

### Step 2: Environment Configuration

Add these environment variables to your `.env` file:

```bash
# Logging Configuration
LOG_LEVEL=info
LOG_DIR=./logs
ENABLE_FILE_LOGGING=true
ENABLE_CONSOLE_LOGGING=true
CORRELATION_ID_HEADER=X-Correlation-ID
LOG_FORMAT=json
```

### Step 3: Test Basic Setup

Create a test script to verify the logging system works:

```javascript
// test-logging.js
const { getLogger } = require('./services/logging');

const logger = getLogger('test', 'migration');

logger.info('Logging system test');
logger.error('Test error', new Error('Test error'));
logger.warn('Test warning');
logger.debug('Test debug message');

console.log('Logging test completed. Check logs directory.');
```

Run the test:
```bash
node test-logging.js
```

## Phase 2: Core Components Migration

### Step 1: Server.js and Express Setup

**Before:**
```javascript
const morgan = require('morgan');

// Morgan middleware
app.use(morgan('combined'));

// Console logging
console.log('Server starting...');
console.error('Server error:', error);
```

**After:**
```javascript
const { correlationMiddleware, requestLogger } = require('./services/logging');

// Replace Morgan with structured logging
app.use(correlationMiddleware);
app.use(requestLogger);

// Replace console logging
const logger = getLogger('server', 'application');
logger.info('Server starting...');
logger.error('Server error:', error);
```

### Step 2: API Routes Migration

**Before:**
```javascript
// routes/users.js
router.get('/', async (req, res) => {
  try {
    console.log('Fetching users...');
    const users = await User.findAll();
    console.log(`Found ${users.length} users`);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**After:**
```javascript
// routes/users.js
const { getLogger } = require('../services/logging');
const logger = getLogger('users', 'route');

router.get('/', async (req, res) => {
  try {
    logger.info('Fetching users');
    const users = await User.findAll();
    logger.info('Users retrieved successfully', { count: users.length });
    res.json(users);
  } catch (error) {
    logger.error('Error fetching users', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### Step 3: Service Layer Migration

**Before:**
```javascript
// services/user.service.js
class UserService {
  async createUser(userData) {
    try {
      console.log('Creating user:', userData.email);
      const user = await User.create(userData);
      console.log('User created:', user.id);
      return user;
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error;
    }
  }
}
```

**After:**
```javascript
// services/user.service.js
const { getLogger } = require('./logging');
const logger = getLogger('user-service', 'service');

class UserService {
  async createUser(userData) {
    try {
      logger.info('Creating user', { email: userData.email });
      const user = await User.create(userData);
      logger.info('User created successfully', { userId: user.id });
      return user;
    } catch (error) {
      logger.error('Failed to create user', error, { email: userData.email });
      throw error;
    }
  }
}
```

### Step 4: Controllers Migration

**Before:**
```javascript
// controllers/user.controller.js
exports.getUser = async (req, res) => {
  try {
    console.log('Getting user:', req.params.id);
    const user = await User.findByPk(req.params.id);
    if (!user) {
      console.log('User not found:', req.params.id);
      return res.status(404).json({ error: 'User not found' });
    }
    console.log('User found:', user.id);
    res.json(user);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
```

**After:**
```javascript
// controllers/user.controller.js
const { getLogger } = require('../services/logging');
const logger = getLogger('user-controller', 'controller');

exports.getUser = async (req, res) => {
  try {
    logger.info('Getting user', { userId: req.params.id });
    const user = await User.findByPk(req.params.id);
    if (!user) {
      logger.warn('User not found', { userId: req.params.id });
      return res.status(404).json({ error: 'User not found' });
    }
    logger.info('User retrieved successfully', { userId: user.id });
    res.json(user);
  } catch (error) {
    logger.error('Error getting user', error, { userId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};
```

## Phase 3: Supporting Components Migration

### Step 1: Middleware Migration

**Before:**
```javascript
// middlewares/auth.middleware.js
const authMiddleware = (req, res, next) => {
  try {
    // Authentication logic
    console.log('User authenticated:', req.user.id);
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
};
```

**After:**
```javascript
// middlewares/auth.middleware.js
const { getLogger } = require('../services/logging');
const logger = getLogger('auth', 'middleware');

const authMiddleware = (req, res, next) => {
  try {
    // Authentication logic
    logger.info('User authenticated', { userId: req.user.id });
    next();
  } catch (error) {
    logger.error('Authentication error', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
};
```

### Step 2: Database and Migrations

**Before:**
```javascript
// database/index.js
try {
  await sequelize.authenticate();
  console.log('Database connected successfully');
} catch (error) {
  console.error('Database connection failed:', error);
}
```

**After:**
```javascript
// database/index.js
const { getLogger } = require('../services/logging');
const logger = getLogger('database', 'database');

try {
  await sequelize.authenticate();
  logger.info('Database connected successfully');
} catch (error) {
  logger.error('Database connection failed', error);
}
```

### Step 3: Scripts and Utilities

**Before:**
```javascript
// scripts/setup.js
console.log('Setting up application...');
try {
  // Setup logic
  console.log('Setup completed successfully');
} catch (error) {
  console.error('Setup failed:', error);
}
```

**After:**
```javascript
// scripts/setup.js
const { getLogger } = require('../services/logging');
const logger = getLogger('setup', 'script');

logger.info('Setting up application...');
try {
  // Setup logic
  logger.info('Setup completed successfully');
} catch (error) {
  logger.error('Setup failed', error);
}
```

## Phase 4: Validation and Cleanup

### Step 1: Testing

1. **Start the application** and verify logs are being generated
2. **Check log files** in the `logs` directory
3. **Test different log levels** by changing `LOG_LEVEL`
4. **Verify correlation IDs** are working in request logs
5. **Test error scenarios** to ensure proper error logging

### Step 2: Remove Old Dependencies

Remove Morgan and other old logging dependencies:

```bash
npm uninstall morgan
```

Update `package.json` to remove unused dependencies.

### Step 3: Update Documentation

- Update README.md with new logging information
- Update API documentation
- Update deployment guides

### Step 4: Performance Validation

1. **Monitor log volume** and adjust levels if needed
2. **Check disk usage** for log files
3. **Verify performance** impact is minimal
4. **Test log rotation** and cleanup

## Common Migration Patterns

### Pattern 1: Simple Console Replacement

**Before:**
```javascript
console.log('Message');
console.error('Error:', error);
console.warn('Warning');
```

**After:**
```javascript
const logger = getLogger('component-name', 'category');
logger.info('Message');
logger.error('Error', error);
logger.warn('Warning');
```

### Pattern 2: Error Handling

**Before:**
```javascript
try {
  // Operation
} catch (error) {
  console.error('Operation failed:', error);
  throw error;
}
```

**After:**
```javascript
try {
  // Operation
} catch (error) {
  logger.error('Operation failed', error, { context: 'data' });
  throw error;
}
```

### Pattern 3: Request Logging

**Before:**
```javascript
app.use(morgan('combined'));
```

**After:**
```javascript
const { correlationMiddleware, requestLogger } = require('./services/logging');
app.use(correlationMiddleware);
app.use(requestLogger);
```

### Pattern 4: Performance Logging

**Before:**
```javascript
const start = Date.now();
// Operation
const duration = Date.now() - start;
console.log(`Operation took ${duration}ms`);
```

**After:**
```javascript
const start = Date.now();
// Operation
const duration = Date.now() - start;
logger.info('Operation completed', { duration });
```

## Troubleshooting

### Issue: Logs not appearing

**Solution:**
1. Check `LOG_LEVEL` configuration
2. Verify log directory permissions
3. Ensure logging system is properly initialized

### Issue: Performance impact

**Solution:**
1. Adjust log levels (use `warn` or `error` in production)
2. Enable log sampling for high-volume operations
3. Monitor and optimize log message content

### Issue: Missing correlation IDs

**Solution:**
1. Ensure `correlationMiddleware` is added early in the middleware stack
2. Check that correlation ID header is being set correctly
3. Verify correlation ID is being passed through the request chain

### Issue: File permission errors

**Solution:**
1. Check log directory permissions
2. Ensure application has write access to log directory
3. Create log directory if it doesn't exist

## Validation Checklist

After migration, verify:

- [ ] All log messages are being captured
- [ ] Log levels are working correctly
- [ ] Correlation IDs are present in request logs
- [ ] Error logging includes proper context
- [ ] Log files are being created and rotated
- [ ] Performance impact is acceptable
- [ ] No console.log statements remain in production code
- [ ] Morgan has been removed and replaced
- [ ] Documentation has been updated

## Rollback Plan

If issues arise, you can rollback by:

1. **Restore Morgan middleware** in server.js
2. **Revert console.log statements** in critical components
3. **Disable centralized logging** by setting `ENABLE_CONSOLE_LOGGING=false`
4. **Remove logging middleware** from Express stack

The migration can be done incrementally, allowing you to test each component before moving to the next. 