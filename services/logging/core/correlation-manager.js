/**
 * Correlation Manager
 * 
 * Manages correlation IDs for request tracking across components and services.
 * Provides correlation ID generation, storage, cleanup, and context propagation.
 * 
 * This implementation satisfies the following requirements:
 * - WHEN processing HTTP requests THEN the system SHALL generate or extract correlation IDs from request headers
 * - WHEN logging within a request context THEN all log entries SHALL include the same correlation ID
 * - WHEN creating child loggers THEN they SHALL inherit the correlation ID from their parent logger
 * - WHEN correlation ID is set THEN it SHALL be automatically included in all subsequent log entries
 * - WHEN no correlation ID exists THEN the system SHALL generate a unique identifier for the logging session
 * - WHEN correlation ID is present THEN it SHALL be displayed prominently in both console and file output
 */

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

/**
 * Correlation Manager class
 */
class CorrelationManager {
  constructor(options = {}) {
    // Store correlation IDs with their creation timestamps
    this.correlations = new Map();
    
    // Current correlation ID for the active context
    this.currentCorrelationId = null;
    
    // Cleanup interval (default: 1 hour)
    this.cleanupInterval = options.cleanupInterval || 60 * 60 * 1000;
    
    // Maximum age for correlation IDs (default: 24 hours)
    this.maxAge = options.maxAge || 24 * 60 * 60 * 1000;
    
    // Header name for correlation ID
    this.headerName = options.headerName || 'x-correlation-id';
    
    // Maximum number of correlations to store (prevent memory leaks)
    this.maxCorrelations = options.maxCorrelations || 10000;
    
    // Use AsyncLocalStorage for maintaining correlation context across async operations
    this.asyncLocalStorage = new AsyncLocalStorage();
    
    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Generate a new correlation ID
   * @param {Object} options - Generation options
   * @param {string} options.prefix - Optional prefix for the correlation ID
   * @param {number} options.length - Length of the random part (default: 16 characters)
   * @returns {string} Generated correlation ID
   */
  generateCorrelationId(options = {}) {
    const { prefix = '', length = 16 } = options;
    const randomBytes = Math.ceil(length / 2); // Each byte becomes 2 hex chars
    const randomPart = crypto.randomBytes(randomBytes).toString('hex').substring(0, length);
    return prefix ? `${prefix}-${randomPart}` : randomPart;
  }

  /**
   * Set the current correlation ID
   * @param {string} correlationId - Correlation ID to set
   * @param {Object} context - Additional context for the correlation
   * @returns {boolean} Whether the correlation ID was set successfully
   */
  setCorrelationId(correlationId, context = {}) {
    if (!correlationId) {
      return false;
    }

    // Validate correlation ID format
    if (!this.isValidCorrelationId(correlationId)) {
      return false;
    }

    this.currentCorrelationId = correlationId;
    
    // Store correlation with timestamp and context
    this.correlations.set(correlationId, {
      id: correlationId,
      createdAt: new Date(),
      context,
      lastUsed: new Date()
    });
    
    // Enforce maximum correlations limit
    if (this.correlations.size > this.maxCorrelations) {
      this.pruneOldestCorrelations(Math.floor(this.maxCorrelations * 0.2)); // Remove 20% of oldest
    }
    
    return true;
  }

  /**
   * Get the current correlation ID
   * @returns {string|null} Current correlation ID
   */
  getCurrentCorrelationId() {
    // First check AsyncLocalStorage for context-bound correlation ID
    const asyncContext = this.asyncLocalStorage.getStore();
    if (asyncContext && asyncContext.correlationId) {
      return asyncContext.correlationId;
    }
    
    // Fall back to the instance-level correlation ID
    return this.currentCorrelationId;
  }

  /**
   * Get correlation information by ID
   * @param {string} correlationId - Correlation ID to lookup
   * @returns {Object|null} Correlation information
   */
  getCorrelation(correlationId) {
    const correlation = this.correlations.get(correlationId);
    
    if (correlation) {
      // Update last used timestamp
      correlation.lastUsed = new Date();
      return correlation;
    }
    
    return null;
  }

  /**
   * Create a new correlation ID and set it as current
   * @param {Object} context - Additional context for the correlation
   * @param {Object} options - Generation options
   * @returns {string} Generated correlation ID
   */
  createCorrelation(context = {}, options = {}) {
    const correlationId = this.generateCorrelationId(options);
    this.setCorrelationId(correlationId, context);
    return correlationId;
  }

  /**
   * Clear the current correlation ID
   */
  clearCurrentCorrelation() {
    this.currentCorrelationId = null;
  }

  /**
   * Remove a specific correlation ID
   * @param {string} correlationId - Correlation ID to remove
   * @returns {boolean} Whether the correlation was removed
   */
  removeCorrelation(correlationId) {
    const removed = this.correlations.delete(correlationId);
    
    if (this.currentCorrelationId === correlationId) {
      this.currentCorrelationId = null;
    }
    
    return removed;
  }

  /**
   * Get all active correlations
   * @returns {Array} Array of correlation objects
   */
  getAllCorrelations() {
    return Array.from(this.correlations.values());
  }

  /**
   * Get correlation statistics
   * @returns {Object} Statistics about correlations
   */
  getStatistics() {
    const now = new Date();
    const correlations = Array.from(this.correlations.values());
    
    // Calculate age statistics
    let oldestTime = null;
    let newestTime = null;
    let totalAge = 0;
    
    if (correlations.length > 0) {
      oldestTime = correlations.reduce((oldest, c) => 
        Math.min(oldest, c.createdAt.getTime()), Infinity);
      
      newestTime = correlations.reduce((newest, c) => 
        Math.max(newest, c.createdAt.getTime()), 0);
      
      totalAge = correlations.reduce((sum, c) => 
        sum + (now.getTime() - c.createdAt.getTime()), 0);
    }
    
    return {
      total: correlations.length,
      current: this.getCurrentCorrelationId(),
      oldest: oldestTime !== Infinity ? oldestTime : null,
      newest: newestTime > 0 ? newestTime : null,
      averageAge: correlations.length > 0 ? totalAge / correlations.length : 0,
      maxAge: this.maxAge,
      cleanupInterval: this.cleanupInterval
    };
  }

  /**
   * Validate correlation ID format
   * @param {string} correlationId - Correlation ID to validate
   * @returns {boolean} Whether the correlation ID is valid
   */
  isValidCorrelationId(correlationId) {
    if (!correlationId || typeof correlationId !== 'string') {
      return false;
    }
    
    // Allow both simple hex strings and prefixed formats (e.g., "svc-a1b2c3d4")
    return /^([a-z0-9]+-)?[a-f0-9]{8,32}$/i.test(correlationId);
  }

  /**
   * Extract correlation ID from HTTP headers
   * @param {Object} headers - HTTP headers object
   * @param {string} headerName - Header name to look for (default: x-correlation-id)
   * @returns {string|null} Extracted correlation ID
   */
  extractFromHeaders(headers, headerName = null) {
    if (!headers || typeof headers !== 'object') {
      return null;
    }
    
    const headersToCheck = [
      headerName || this.headerName,
      (headerName || this.headerName).toLowerCase(),
      'x-request-id',
      'request-id',
      'correlation-id',
      'x-correlation-id'
    ];
    
    // Try each header name until we find a valid correlation ID
    for (const header of headersToCheck) {
      const value = headers[header];
      if (value && this.isValidCorrelationId(value)) {
        return value;
      }
    }
    
    return null;
  }

  /**
   * Create correlation context for child processes or async operations
   * @param {Object} additionalContext - Additional context to include
   * @returns {Object} Correlation context object
   */
  createContext(additionalContext = {}) {
    const correlationId = this.getCurrentCorrelationId();
    
    if (!correlationId) {
      return additionalContext;
    }
    
    const correlation = this.getCorrelation(correlationId);
    
    return {
      correlationId,
      correlationContext: correlation ? correlation.context : {},
      ...additionalContext
    };
  }

  /**
   * Run a function with a specific correlation context
   * Uses AsyncLocalStorage to maintain correlation context across async operations
   * @param {string} correlationId - Correlation ID to use
   * @param {Object} context - Additional context
   * @param {Function} fn - Function to run
   * @returns {*} Result of the function
   */
  withCorrelation(correlationId, context, fn) {
    // If correlationId is a function, shift arguments
    if (typeof correlationId === 'function') {
      fn = correlationId;
      correlationId = this.getCurrentCorrelationId() || this.createCorrelation();
      context = {};
    } else if (typeof context === 'function') {
      fn = context;
      context = {};
    }
    
    // Ensure we have a correlation ID
    if (!correlationId) {
      correlationId = this.createCorrelation();
    }
    
    // Set up the async context
    const asyncContext = {
      correlationId,
      context: { ...context }
    };
    
    // Store correlation if it doesn't exist
    if (!this.correlations.has(correlationId)) {
      this.setCorrelationId(correlationId, context);
    }
    
    // Run the function with the correlation context
    return this.asyncLocalStorage.run(asyncContext, fn);
  }

  /**
   * Create a child correlation ID linked to the current one
   * @param {Object} context - Additional context for the child correlation
   * @returns {string} Generated child correlation ID
   */
  createChildCorrelation(context = {}) {
    const parentId = this.getCurrentCorrelationId();
    const childId = this.generateCorrelationId();
    
    const childContext = {
      ...context,
      parentCorrelationId: parentId
    };
    
    this.setCorrelationId(childId, childContext);
    return childId;
  }

  /**
   * Bind a function to the current correlation context
   * Ensures the function runs with the same correlation ID even when called later
   * @param {Function} fn - Function to bind
   * @returns {Function} Bound function
   */
  bindContext(fn) {
    const correlationId = this.getCurrentCorrelationId();
    if (!correlationId) {
      return fn;
    }
    
    const self = this;
    return function(...args) {
      return self.withCorrelation(correlationId, {}, () => fn.apply(this, args));
    };
  }

  /**
   * Start the cleanup timer for expired correlations
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
    
    // Don't keep the process alive just for cleanup
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clean up expired correlation IDs
   * @returns {number} Number of correlations cleaned up
   */
  cleanup() {
    const now = new Date();
    const expiredIds = [];
    
    for (const [id, correlation] of this.correlations) {
      const age = now.getTime() - correlation.createdAt.getTime();
      if (age > this.maxAge) {
        expiredIds.push(id);
      }
    }
    
    expiredIds.forEach(id => {
      this.correlations.delete(id);
      
      // Clear current correlation if it was expired
      if (this.currentCorrelationId === id) {
        this.currentCorrelationId = null;
      }
    });
    
    return expiredIds.length;
  }

  /**
   * Remove oldest correlations when approaching memory limits
   * @param {number} count - Number of correlations to remove
   * @returns {number} Number of correlations removed
   */
  pruneOldestCorrelations(count) {
    if (count <= 0 || this.correlations.size === 0) {
      return 0;
    }
    
    // Sort correlations by creation time (oldest first)
    const sortedCorrelations = Array.from(this.correlations.entries())
      .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());
    
    // Remove the oldest correlations
    const toRemove = sortedCorrelations.slice(0, count);
    toRemove.forEach(([id]) => {
      this.correlations.delete(id);
      
      // Clear current correlation if it was removed
      if (this.currentCorrelationId === id) {
        this.currentCorrelationId = null;
      }
    });
    
    return toRemove.length;
  }

  /**
   * Clear all correlations
   */
  clear() {
    this.correlations.clear();
    this.currentCorrelationId = null;
  }

  /**
   * Destroy the correlation manager
   */
  destroy() {
    this.stopCleanupTimer();
    this.clear();
  }
}

module.exports = CorrelationManager;