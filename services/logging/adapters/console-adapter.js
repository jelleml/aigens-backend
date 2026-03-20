/**
 * Console Adapter
 * 
 * Provides a drop-in replacement for console.log and related methods,
 * routing them through the structured logging system while maintaining
 * backward compatibility with existing code.
 */

/**
 * Console Adapter class
 */
class ConsoleAdapter {
  /**
   * @param {StructuredLogger} logger - Logger instance to use
   */
  constructor(logger) {
    this.logger = logger;
    
    // Store original console methods for fallback
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
      trace: console.trace,
      dir: console.dir,
      table: console.table,
      time: console.time,
      timeEnd: console.timeEnd,
      count: console.count,
      group: console.group,
      groupEnd: console.groupEnd
    };
    
    // Active timers for console.time/timeEnd
    this.timers = new Map();
    
    // Active counters for console.count
    this.counters = new Map();
    
    // Group nesting level
    this.groupLevel = 0;
  }

  /**
   * Format arguments for logging
   * @param {Array} args - Arguments to format
   * @returns {string} Formatted message
   */
  formatArgs(args) {
    return args.map(arg => {
      if (typeof arg === 'string') {
        return arg;
      } else if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch (error) {
          return '[Circular Object]';
        }
      } else {
        return String(arg);
      }
    }).join(' ');
  }

  /**
   * Create context with group information
   * @param {Object} additionalContext - Additional context
   * @returns {Object} Context with group info
   */
  createContext(additionalContext = {}) {
    const context = { ...additionalContext };
    
    if (this.groupLevel > 0) {
      context.groupLevel = this.groupLevel;
    }
    
    return context;
  }

  /**
   * console.log replacement
   * @param {...any} args - Arguments to log
   */
  log(...args) {
    const message = this.formatArgs(args);
    this.logger.info(message, this.createContext({ type: 'console.log' }));
  }

  /**
   * console.error replacement
   * @param {...any} args - Arguments to log
   */
  error(...args) {
    const message = this.formatArgs(args);
    this.logger.error(message, this.createContext({ type: 'console.error' }));
  }

  /**
   * console.warn replacement
   * @param {...any} args - Arguments to log
   */
  warn(...args) {
    const message = this.formatArgs(args);
    this.logger.warn(message, this.createContext({ type: 'console.warn' }));
  }

  /**
   * console.info replacement
   * @param {...any} args - Arguments to log
   */
  info(...args) {
    const message = this.formatArgs(args);
    this.logger.info(message, this.createContext({ type: 'console.info' }));
  }

  /**
   * console.debug replacement
   * @param {...any} args - Arguments to log
   */
  debug(...args) {
    const message = this.formatArgs(args);
    this.logger.debug(message, this.createContext({ type: 'console.debug' }));
  }

  /**
   * console.trace replacement
   * @param {...any} args - Arguments to log
   */
  trace(...args) {
    const message = this.formatArgs(args);
    const stack = new Error().stack;
    this.logger.debug(message, this.createContext({ 
      type: 'console.trace',
      stack: stack
    }));
  }

  /**
   * console.dir replacement
   * @param {any} obj - Object to inspect
   * @param {Object} options - Inspection options
   */
  dir(obj, options = {}) {
    let message;
    try {
      message = JSON.stringify(obj);
    } catch (error) {
      message = '[Object - could not stringify]';
    }
    
    this.logger.debug(`console.dir: ${message}`, this.createContext({ 
      type: 'console.dir',
      options
    }));
  }

  /**
   * console.table replacement
   * @param {any} data - Data to display as table
   * @param {Array} columns - Columns to display
   */
  table(data, columns = null) {
    let message;
    try {
      if (Array.isArray(data)) {
        message = `Table with ${data.length} rows`;
      } else if (typeof data === 'object' && data !== null) {
        message = `Table with ${Object.keys(data).length} entries`;
      } else {
        message = 'Table data';
      }
    } catch (error) {
      message = 'Table - could not analyze data';
    }
    
    this.logger.debug(message, this.createContext({ 
      type: 'console.table',
      data: data,
      columns: columns
    }));
  }

  /**
   * console.time replacement
   * @param {string} label - Timer label
   */
  time(label = 'default') {
    this.timers.set(label, Date.now());
    this.logger.debug(`Timer started: ${label}`, this.createContext({ 
      type: 'console.time',
      label
    }));
  }

  /**
   * console.timeEnd replacement
   * @param {string} label - Timer label
   */
  timeEnd(label = 'default') {
    const startTime = this.timers.get(label);
    
    if (startTime) {
      const duration = Date.now() - startTime;
      this.timers.delete(label);
      
      this.logger.info(`${label}: ${duration}ms`, this.createContext({ 
        type: 'console.timeEnd',
        label,
        duration,
        durationMs: duration
      }));
    } else {
      this.logger.warn(`Timer '${label}' does not exist`, this.createContext({ 
        type: 'console.timeEnd',
        label,
        error: 'Timer not found'
      }));
    }
  }

  /**
   * console.count replacement
   * @param {string} label - Counter label
   */
  count(label = 'default') {
    const currentCount = (this.counters.get(label) || 0) + 1;
    this.counters.set(label, currentCount);
    
    this.logger.info(`${label}: ${currentCount}`, this.createContext({ 
      type: 'console.count',
      label,
      count: currentCount
    }));
  }

  /**
   * console.countReset replacement
   * @param {string} label - Counter label
   */
  countReset(label = 'default') {
    this.counters.delete(label);
    this.logger.debug(`Counter reset: ${label}`, this.createContext({ 
      type: 'console.countReset',
      label
    }));
  }

  /**
   * console.group replacement
   * @param {...any} args - Group label arguments
   */
  group(...args) {
    this.groupLevel++;
    const message = args.length > 0 ? this.formatArgs(args) : `Group ${this.groupLevel}`;
    
    this.logger.info(`▼ ${message}`, this.createContext({ 
      type: 'console.group',
      groupLevel: this.groupLevel
    }));
  }

  /**
   * console.groupCollapsed replacement (same as group for logging)
   * @param {...any} args - Group label arguments
   */
  groupCollapsed(...args) {
    this.group(...args);
  }

  /**
   * console.groupEnd replacement
   */
  groupEnd() {
    if (this.groupLevel > 0) {
      this.logger.info(`▲ End Group ${this.groupLevel}`, this.createContext({ 
        type: 'console.groupEnd',
        groupLevel: this.groupLevel
      }));
      this.groupLevel--;
    }
  }

  /**
   * console.clear replacement
   */
  clear() {
    this.logger.info('Console cleared', this.createContext({ 
      type: 'console.clear'
    }));
  }

  /**
   * console.assert replacement
   * @param {boolean} assertion - Assertion to test
   * @param {...any} args - Arguments to log if assertion fails
   */
  assert(assertion, ...args) {
    if (!assertion) {
      const message = args.length > 0 ? this.formatArgs(args) : 'Assertion failed';
      this.logger.error(`Assertion failed: ${message}`, this.createContext({ 
        type: 'console.assert',
        assertion: false
      }));
    }
  }

  /**
   * Get adapter statistics
   * @returns {Object} Adapter statistics
   */
  getStatistics() {
    return {
      activeTimers: this.timers.size,
      activeCounters: this.counters.size,
      groupLevel: this.groupLevel,
      timers: Object.fromEntries(this.timers),
      counters: Object.fromEntries(this.counters)
    };
  }

  /**
   * Reset adapter state
   */
  reset() {
    this.timers.clear();
    this.counters.clear();
    this.groupLevel = 0;
  }

  /**
   * Restore original console methods
   */
  restore() {
    Object.assign(console, this.originalConsole);
  }
}

module.exports = ConsoleAdapter;