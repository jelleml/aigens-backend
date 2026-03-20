/**
 * Log Rotation and Retention Manager
 * 
 * Manages log file rotation, compression, and cleanup based on configurable
 * retention policies to prevent disk space issues and maintain system performance.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const nodeCron = require('node-cron');

// Promisified filesystem operations
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const rename = promisify(fs.rename);
const copyFile = promisify(fs.copyFile);

/**
 * Default configuration for log rotation
 */
const DEFAULT_CONFIG = {
  // Rotation settings
  maxFileSize: 50 * 1024 * 1024, // 50MB
  maxFiles: 10,
  rotateOnStartup: false,
  
  // Retention settings
  retentionDays: 30,
  cleanupInterval: '0 2 * * *', // Daily at 2 AM
  
  // Compression settings
  enableCompression: true,
  compressAfterDays: 1,
  compressionLevel: 6,
  
  // Directories to manage
  logDirectories: [
    path.join(process.cwd(), 'logs', 'model-management')
  ],
  
  // File patterns to manage
  filePatterns: [
    '*.log',
    '*.json'
  ],
  
  // Files to exclude from rotation
  excludePatterns: [
    'current.log',
    '*.tmp'
  ]
};

/**
 * LogRotationManager class
 */
class LogRotationManager {
  /**
   * @param {Object} options - Configuration options
   * @param {Object} options.config - Rotation configuration
   * @param {Object} options.logger - Logger instance
   */
  constructor(options = {}) {
    const { config = {}, logger = console } = options;
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
    
    // Scheduled tasks
    this.cleanupTask = null;
    this.rotationTasks = new Map();
    
    // Statistics
    this.stats = {
      rotationsPerformed: 0,
      filesCompressed: 0,
      filesDeleted: 0,
      spaceFreed: 0,
      lastCleanup: null,
      errors: []
    };
    
    this.logger.debug('[LogRotationManager] Initialized', {
      maxFileSize: this.config.maxFileSize,
      retentionDays: this.config.retentionDays,
      enableCompression: this.config.enableCompression
    });
  }

  /**
   * Start log rotation and cleanup scheduling
   */
  start() {
    // Schedule cleanup task
    if (this.config.cleanupInterval) {
      this.cleanupTask = nodeCron.schedule(this.config.cleanupInterval, () => {
        this.performCleanup().catch(error => {
          this.logger.error('[LogRotationManager] Scheduled cleanup failed', error);
        });
      }, {
        scheduled: true,
        timezone: 'UTC'
      });
      
      this.logger.info('[LogRotationManager] Scheduled cleanup task', {
        interval: this.config.cleanupInterval
      });
    }
    
    // Perform initial cleanup if configured
    if (this.config.rotateOnStartup) {
      setImmediate(() => {
        this.performCleanup().catch(error => {
          this.logger.error('[LogRotationManager] Startup cleanup failed', error);
        });
      });
    }
    
    this.logger.info('[LogRotationManager] Started');
  }

  /**
   * Stop log rotation and cleanup scheduling
   */
  stop() {
    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask = null;
    }
    
    // Stop all rotation tasks
    this.rotationTasks.forEach(task => task.stop());
    this.rotationTasks.clear();
    
    this.logger.info('[LogRotationManager] Stopped');
  }

  /**
   * Perform complete cleanup operation
   * @returns {Promise<Object>} Cleanup results
   */
  async performCleanup() {
    const startTime = Date.now();
    const results = {
      processed: 0,
      rotated: 0,
      compressed: 0,
      deleted: 0,
      spaceFreed: 0,
      errors: []
    };

    this.logger.info('[LogRotationManager] Starting cleanup operation');

    try {
      for (const logDir of this.config.logDirectories) {
        if (!fs.existsSync(logDir)) {
          this.logger.warn('[LogRotationManager] Log directory does not exist', { 
            directory: logDir 
          });
          continue;
        }

        const dirResults = await this.cleanupDirectory(logDir);
        
        results.processed += dirResults.processed;
        results.rotated += dirResults.rotated;
        results.compressed += dirResults.compressed;
        results.deleted += dirResults.deleted;
        results.spaceFreed += dirResults.spaceFreed;
        results.errors.push(...dirResults.errors);
      }

      // Update statistics
      this.stats.rotationsPerformed += results.rotated;
      this.stats.filesCompressed += results.compressed;
      this.stats.filesDeleted += results.deleted;
      this.stats.spaceFreed += results.spaceFreed;
      this.stats.lastCleanup = new Date();

      const duration = Date.now() - startTime;
      
      this.logger.info('[LogRotationManager] Cleanup completed', {
        duration,
        ...results
      });

      return {
        success: true,
        duration,
        ...results
      };

    } catch (error) {
      this.logger.error('[LogRotationManager] Cleanup failed', error);
      this.stats.errors.push({
        timestamp: new Date(),
        error: error.message,
        operation: 'cleanup'
      });

      throw error;
    }
  }

  /**
   * Clean up a specific directory
   * @param {string} directory - Directory path to clean
   * @returns {Promise<Object>} Directory cleanup results
   */
  async cleanupDirectory(directory) {
    const results = {
      processed: 0,
      rotated: 0,
      compressed: 0,
      deleted: 0,
      spaceFreed: 0,
      errors: []
    };

    try {
      const files = await readdir(directory);
      
      for (const filename of files) {
        const filePath = path.join(directory, filename);
        
        try {
          // Skip if file doesn't match patterns
          if (!this.shouldProcessFile(filename)) {
            continue;
          }

          const fileStats = await stat(filePath);
          results.processed++;

          // Check if file needs rotation
          if (await this.shouldRotateFile(filePath, fileStats)) {
            await this.rotateFile(filePath);
            results.rotated++;
          }

          // Check if file needs compression
          if (await this.shouldCompressFile(filePath, fileStats)) {
            const originalSize = fileStats.size;
            await this.compressFile(filePath);
            results.compressed++;
            
            // Calculate space saved (approximate)
            const compressedStats = await stat(filePath + '.gz');
            results.spaceFreed += originalSize - compressedStats.size;
          }

          // Check if file should be deleted
          if (await this.shouldDeleteFile(filePath, fileStats)) {
            results.spaceFreed += fileStats.size;
            await unlink(filePath);
            results.deleted++;
            
            this.logger.debug('[LogRotationManager] Deleted old file', {
              file: filePath,
              age: Date.now() - fileStats.mtime.getTime(),
              size: fileStats.size
            });
          }

        } catch (error) {
          this.logger.error('[LogRotationManager] Error processing file', {
            file: filePath,
            error: error.message
          });
          results.errors.push({
            file: filePath,
            error: error.message
          });
        }
      }

    } catch (error) {
      this.logger.error('[LogRotationManager] Error reading directory', {
        directory,
        error: error.message
      });
      results.errors.push({
        directory,
        error: error.message
      });
    }

    return results;
  }

  /**
   * Check if a file should be processed
   * @param {string} filename - File name to check
   * @returns {boolean} Whether file should be processed
   */
  shouldProcessFile(filename) {
    // Check exclude patterns first
    for (const pattern of this.config.excludePatterns) {
      if (this.matchesPattern(filename, pattern)) {
        return false;
      }
    }

    // Check include patterns
    for (const pattern of this.config.filePatterns) {
      if (this.matchesPattern(filename, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a pattern matches a filename
   * @param {string} filename - File name to check
   * @param {string} pattern - Pattern to match against
   * @returns {boolean} Whether pattern matches
   */
  matchesPattern(filename, pattern) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(filename);
  }

  /**
   * Check if a file should be rotated
   * @param {string} filePath - File path to check
   * @param {fs.Stats} fileStats - File statistics
   * @returns {Promise<boolean>} Whether file should be rotated
   */
  async shouldRotateFile(filePath, fileStats) {
    // Check file size
    if (fileStats.size >= this.config.maxFileSize) {
      return true;
    }

    // Don't rotate compressed files
    if (filePath.endsWith('.gz')) {
      return false;
    }

    return false;
  }

  /**
   * Rotate a log file
   * @param {string} filePath - File path to rotate
   * @returns {Promise<void>}
   */
  async rotateFile(filePath) {
    const directory = path.dirname(filePath);
    const filename = path.basename(filePath);
    const extension = path.extname(filename);
    const baseName = path.basename(filename, extension);

    // Find existing rotated files
    const files = await readdir(directory);
    const rotatedFiles = files
      .filter(f => f.startsWith(`${baseName}.`) && f.endsWith(extension))
      .map(f => {
        const match = f.match(new RegExp(`${baseName}\\.(\\d+)${extension}`));
        return match ? parseInt(match[1]) : 0;
      })
      .filter(n => n > 0)
      .sort((a, b) => b - a);

    // Rotate existing files
    for (const num of rotatedFiles) {
      const oldPath = path.join(directory, `${baseName}.${num}${extension}`);
      const newPath = path.join(directory, `${baseName}.${num + 1}${extension}`);
      
      if (num + 1 > this.config.maxFiles) {
        // Delete files beyond max count
        if (fs.existsSync(oldPath)) {
          await unlink(oldPath);
        }
      } else {
        // Rename to next number
        if (fs.existsSync(oldPath)) {
          await rename(oldPath, newPath);
        }
      }
    }

    // Rotate current file to .1
    const rotatedPath = path.join(directory, `${baseName}.1${extension}`);
    await rename(filePath, rotatedPath);

    this.logger.info('[LogRotationManager] Rotated file', {
      original: filePath,
      rotated: rotatedPath
    });
  }

  /**
   * Check if a file should be compressed
   * @param {string} filePath - File path to check
   * @param {fs.Stats} fileStats - File statistics
   * @returns {Promise<boolean>} Whether file should be compressed
   */
  async shouldCompressFile(filePath, fileStats) {
    if (!this.config.enableCompression) {
      return false;
    }

    // Don't compress already compressed files
    if (filePath.endsWith('.gz')) {
      return false;
    }

    // Don't compress current log files
    if (!filePath.includes('.')) {
      return false;
    }

    // Check age
    const ageMs = Date.now() - fileStats.mtime.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    return ageDays >= this.config.compressAfterDays;
  }

  /**
   * Compress a file using gzip
   * @param {string} filePath - File path to compress
   * @returns {Promise<void>}
   */
  async compressFile(filePath) {
    const compressedPath = `${filePath}.gz`;
    
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(filePath);
      const writeStream = fs.createWriteStream(compressedPath);
      const gzipStream = zlib.createGzip({ level: this.config.compressionLevel });

      readStream
        .pipe(gzipStream)
        .pipe(writeStream)
        .on('finish', async () => {
          try {
            // Delete original file after successful compression
            await unlink(filePath);
            
            this.logger.debug('[LogRotationManager] Compressed file', {
              original: filePath,
              compressed: compressedPath
            });
            
            resolve();
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  /**
   * Check if a file should be deleted
   * @param {string} filePath - File path to check
   * @param {fs.Stats} fileStats - File statistics
   * @returns {Promise<boolean>} Whether file should be deleted
   */
  async shouldDeleteFile(filePath, fileStats) {
    // Calculate age
    const ageMs = Date.now() - fileStats.mtime.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    // Delete files older than retention period
    return ageDays > this.config.retentionDays;
  }

  /**
   * Manually rotate a specific file
   * @param {string} filePath - File path to rotate
   * @returns {Promise<void>}
   */
  async manualRotate(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      const fileStats = await stat(filePath);
      await this.rotateFile(filePath);

      this.stats.rotationsPerformed++;
      
      this.logger.info('[LogRotationManager] Manual rotation completed', {
        file: filePath,
        size: fileStats.size
      });

    } catch (error) {
      this.logger.error('[LogRotationManager] Manual rotation failed', {
        file: filePath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get rotation statistics
   * @returns {Object} Current statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - (this.stats.lastCleanup || Date.now()),
      // node-cron doesn't provide a nextDate() method, so we'll return the scheduled status instead
      nextCleanup: this.cleanupTask ? (this.cleanupTask.options && this.cleanupTask.options.scheduled) : null
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      rotationsPerformed: 0,
      filesCompressed: 0,
      filesDeleted: 0,
      spaceFreed: 0,
      lastCleanup: null,
      errors: []
    };
    
    this.logger.info('[LogRotationManager] Statistics reset');
  }

  /**
   * Get configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration to merge
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Restart if cleanup interval changed
    if (newConfig.cleanupInterval && this.cleanupTask) {
      this.stop();
      this.start();
    }
    
    this.logger.info('[LogRotationManager] Configuration updated', newConfig);
  }
}

module.exports = {
  LogRotationManager,
  DEFAULT_CONFIG
};