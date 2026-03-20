/**
 * Winston Transport Configuration
 * 
 * Provides Winston transport configurations for different output types
 * including console, file, error, and performance logging.
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { getLogFilePath } = require('./logging-config');

/**
 * Create console transport configuration
 * @param {Object} config - Logging configuration
 * @returns {winston.transports.Console} Console transport
 */
function createConsoleTransport(config) {
  return new winston.transports.Console({
    level: config.consoleLevel,
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(info => {
        const {
          timestamp,
          level,
          message,
          service,
          component,
          correlationId,
          ...meta
        } = info;

        let formatted = `${timestamp} [${level.toUpperCase()}]`;
        
        if (service) formatted += ` [${service}]`;
        if (component) formatted += ` [${component}]`;
        if (correlationId) formatted += ` [${correlationId}]`;
        
        formatted += `: ${message}`;

        // Add metadata if present and not empty
        const metaKeys = Object.keys(meta);
        if (metaKeys.length > 0) {
          // Filter out internal Winston properties
          const cleanMeta = {};
          metaKeys.forEach(key => {
            if (!['level', 'message', 'timestamp'].includes(key)) {
              cleanMeta[key] = meta[key];
            }
          });
          
          if (Object.keys(cleanMeta).length > 0) {
            formatted += ` ${JSON.stringify(cleanMeta)}`;
          }
        }

        return formatted;
      })
    )
  });
}

/**
 * Create file transport configuration
 * @param {string} service - Service name
 * @param {string} filename - Log filename
 * @param {Object} config - Logging configuration
 * @param {string} level - Log level for this transport
 * @returns {winston.transports.File} File transport
 */
function createFileTransport(service, filename, config, level = null) {
  const logDir = path.dirname(getLogFilePath(service, 'combined', config));
  
  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const filePath = path.join(logDir, filename);

  return new winston.transports.File({
    filename: filePath,
    level: level || config.fileLevel,
    maxFiles: config.maxFiles,
    maxsize: parseMaxSize(config.maxSize),
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    )
  });
}

/**
 * Create combined log file transport
 * @param {string} service - Service name
 * @param {Object} config - Logging configuration
 * @returns {winston.transports.File} Combined file transport
 */
function createCombinedFileTransport(service, config) {
  return createFileTransport(service, config.combinedFile, config, config.fileLevel);
}

/**
 * Create error-only file transport
 * @param {string} service - Service name
 * @param {Object} config - Logging configuration
 * @returns {winston.transports.File} Error file transport
 */
function createErrorFileTransport(service, config) {
  return createFileTransport(service, config.errorFile, config, 'error');
}

/**
 * Create performance log file transport
 * @param {string} service - Service name
 * @param {Object} config - Logging configuration
 * @returns {winston.transports.File} Performance file transport
 */
function createPerformanceFileTransport(service, config) {
  const transport = createFileTransport(service, config.performanceFile, config, 'info');
  
  // Add custom format to filter only performance logs
  transport.format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format((info) => {
      // Only log performance-related entries
      return info.type === 'performance' ? info : false;
    })()
  );
  
  return transport;
}

/**
 * Create audit log file transport
 * @param {string} service - Service name
 * @param {Object} config - Logging configuration
 * @returns {winston.transports.File} Audit file transport
 */
function createAuditFileTransport(service, config) {
  const transport = createFileTransport(service, config.auditFile, config, 'info');
  
  // Add custom format to filter only audit logs
  transport.format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format((info) => {
      // Only log audit-related entries
      return info.type === 'audit' ? info : false;
    })()
  );
  
  return transport;
}

/**
 * Create exception handler transport
 * @param {string} service - Service name
 * @param {Object} config - Logging configuration
 * @returns {winston.transports.File} Exception handler transport
 */
function createExceptionTransport(service, config) {
  return createFileTransport(service, config.exceptionsFile, config, 'error');
}

/**
 * Create rejection handler transport
 * @param {string} service - Service name
 * @param {Object} config - Logging configuration
 * @returns {winston.transports.File} Rejection handler transport
 */
function createRejectionTransport(service, config) {
  return createFileTransport(service, config.rejectionsFile, config, 'error');
}

/**
 * Create all transports for a service
 * @param {string} service - Service name
 * @param {Object} config - Logging configuration
 * @returns {Object} Object containing all configured transports
 */
function createAllTransports(service, config) {
  const transports = {
    main: [],
    exceptions: [],
    rejections: []
  };

  // Console transport
  if (config.enableConsole) {
    transports.main.push(createConsoleTransport(config));
  }

  // File transports
  if (config.enableFile) {
    transports.main.push(createCombinedFileTransport(service, config));
    transports.main.push(createErrorFileTransport(service, config));
    
    // Performance logging transport
    if (config.enablePerformanceLogging) {
      transports.main.push(createPerformanceFileTransport(service, config));
    }
    
    // Audit logging transport
    if (config.enableAuditLogging) {
      transports.main.push(createAuditFileTransport(service, config));
    }
    
    // Exception and rejection handlers
    if (config.handleExceptions) {
      transports.exceptions.push(createExceptionTransport(service, config));
    }
    
    if (config.handleRejections) {
      transports.rejections.push(createRejectionTransport(service, config));
    }
  }

  return transports;
}

/**
 * Parse max size string to bytes
 * @param {string} maxSize - Max size string (e.g., '20m', '1g')
 * @returns {number} Size in bytes
 */
function parseMaxSize(maxSize) {
  if (typeof maxSize === 'number') {
    return maxSize;
  }
  
  const sizeStr = maxSize.toString().toLowerCase();
  const match = sizeStr.match(/^(\d+)([kmg]?)$/);
  
  if (!match) {
    return 20 * 1024 * 1024; // Default 20MB
  }
  
  const [, size, unit] = match;
  const sizeNum = parseInt(size, 10);
  
  switch (unit) {
    case 'k':
      return sizeNum * 1024;
    case 'm':
      return sizeNum * 1024 * 1024;
    case 'g':
      return sizeNum * 1024 * 1024 * 1024;
    default:
      return sizeNum;
  }
}

/**
 * Ensure log directory exists for a service
 * @param {string} service - Service name
 * @param {Object} config - Logging configuration
 */
function ensureLogDirectory(service, config) {
  const logDir = path.dirname(getLogFilePath(service, 'combined', config));
  
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create log directory ${logDir}:`, error.message);
      throw error;
    }
  }
}

module.exports = {
  createConsoleTransport,
  createFileTransport,
  createCombinedFileTransport,
  createErrorFileTransport,
  createPerformanceFileTransport,
  createAuditFileTransport,
  createExceptionTransport,
  createRejectionTransport,
  createAllTransports,
  parseMaxSize,
  ensureLogDirectory
};