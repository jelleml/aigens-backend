/**
 * Correlation ID Management System Usage Example
 * 
 * This example demonstrates how to use the correlation ID management system
 * in an Express application and in asynchronous operations.
 */

const express = require('express');
const { 
  correlationMiddleware, 
  correlationContextMiddleware,
  asyncCorrelationMiddleware,
  correlationLocalsMiddleware
} = require('../services/logging/middleware/correlation-middleware');
const { LoggerFactory } = require('../services/logging');
const CorrelationManager = require('../services/logging/core/correlation-manager');

// Create Express app
const app = express();

// Create correlation manager and logger factory
const correlationManager = new CorrelationManager();
const loggerFactory = new LoggerFactory();

// Create application logger
const logger = loggerFactory.getLogger('example', 'correlation');

// Apply correlation middleware
app.use(correlationMiddleware({ 
  correlationManager,
  loggerFactory
}));

// Apply correlation context middleware
app.use(correlationContextMiddleware({ 
  correlationManager 
}));

// Apply async correlation middleware
app.use(asyncCorrelationMiddleware({ 
  correlationManager 
}));

// Apply correlation locals middleware for templates
app.use(correlationLocalsMiddleware({ 
  correlationManager 
}));

// Example route that uses correlation ID
app.get('/api/example', async (req, res) => {
  // req.logger is already set up with correlation ID
  req.logger.info('Processing example request');
  
  // Get correlation context
  const context = req.getCorrelationContext();
  
  // Perform async operation with correlation context
  await performAsyncOperation(context);
  
  // Create child context for sub-operation
  const childContext = req.createChildContext({ operation: 'sub-task' });
  
  // Perform another async operation with child context
  await performSubOperation(childContext);
  
  // Return response with correlation ID
  res.json({
    message: 'Example response',
    correlationId: req.correlationId
  });
});

/**
 * Example async operation that uses correlation context
 * @param {Object} context - Correlation context
 */
async function performAsyncOperation(context) {
  // Create operation-specific logger with correlation context
  const operationLogger = loggerFactory.getLogger('example', 'async-operation', {
    correlationId: context.correlationId,
    operation: 'main'
  });
  
  // Log with correlation ID
  operationLogger.info('Performing async operation');
  
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Log completion
  operationLogger.info('Async operation completed');
}

/**
 * Example sub-operation that uses child correlation context
 * @param {Object} context - Child correlation context
 */
async function performSubOperation(context) {
  // Run operation in correlation context
  return correlationManager.withCorrelation(context.correlationId, context, async () => {
    // Create operation-specific logger
    const operationLogger = loggerFactory.getLogger('example', 'sub-operation');
    
    // Start performance timer
    const timerId = operationLogger.startTimer('sub-operation');
    
    // Log with correlation ID
    operationLogger.info('Performing sub-operation');
    
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Log completion
    operationLogger.info('Sub-operation completed');
    
    // End performance timer
    operationLogger.endTimer(timerId);
  });
}

// Example of using correlation in a background task
function startBackgroundTask() {
  // Create a new correlation for the background task
  const taskId = correlationManager.createCorrelation({
    taskType: 'background',
    startedAt: new Date().toISOString()
  });
  
  // Create task logger with correlation ID
  const taskLogger = loggerFactory.getLogger('example', 'background-task', {
    correlationId: taskId
  });
  
  taskLogger.info('Starting background task');
  
  // Run task in correlation context
  correlationManager.withCorrelation(taskId, {}, () => {
    // Perform task operations
    taskLogger.info('Background task running');
    
    // Simulate periodic logging
    const interval = setInterval(() => {
      // The correlation ID is maintained across async boundaries
      taskLogger.info('Background task heartbeat');
    }, 5000);
    
    // Clean up after some time
    setTimeout(() => {
      clearInterval(interval);
      taskLogger.info('Background task completed');
      
      // Remove correlation when done
      correlationManager.removeCorrelation(taskId);
    }, 30000);
  });
  
  return taskId;
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  
  // Start background task
  const taskId = startBackgroundTask();
  logger.info(`Background task started with correlation ID: ${taskId}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Shutting down server');
  correlationManager.destroy();
  process.exit(0);
});