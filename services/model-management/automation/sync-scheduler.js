/**
 * Automated Model Synchronization Scheduler
 * 
 * Manages automated synchronization of AI models from providers using
 * configurable schedules, smart retry logic, and comprehensive error handling.
 */

const cron = require('node-cron');
const { EventEmitter } = require('events');
const { getMonitoringService } = require('../monitoring-service');
const { ModelSyncEngine } = require('./sync-engine');
const { SyncStrategy } = require('./sync-strategy');
const db = require('../../../database');

/**
 * Default scheduling configuration
 */
const DEFAULT_SCHEDULE_CONFIG = {
  // Main sync schedules
  schedules: {
    full: '0 2 * * 0',        // Weekly full sync at 2 AM Sunday
    incremental: '0 */6 * * *', // Every 6 hours incremental sync
    health: '*/15 * * * *',    // Every 15 minutes health check
    cleanup: '0 3 * * *'       // Daily cleanup at 3 AM
  },
  
  // Sync behavior
  behavior: {
    enableAutoSync: true,
    maxConcurrentSyncs: 3,
    syncTimeout: 300000, // 5 minutes
    retryAttempts: 3,
    retryDelay: 60000,   // 1 minute
    enableSmartScheduling: true,
    backoffMultiplier: 2
  },
  
  // Provider-specific settings
  providers: {
    openai: {
      priority: 1,
      syncInterval: '0 */4 * * *', // Every 4 hours
      healthCheckInterval: '*/10 * * * *' // Every 10 minutes
    },
    anthropic: {
      priority: 2, 
      syncInterval: '0 */6 * * *', // Every 6 hours
      healthCheckInterval: '*/15 * * * *' // Every 15 minutes
    },
    together: {
      priority: 3,
      syncInterval: '0 */8 * * *', // Every 8 hours
      healthCheckInterval: '*/20 * * * *' // Every 20 minutes
    }
  },
  
  // Conditions for smart scheduling
  conditions: {
    minHealthScore: 70,
    maxErrorRate: 0.1,
    maxConsecutiveFailures: 3,
    cooldownPeriod: 1800000 // 30 minutes
  }
};

/**
 * SyncScheduler class
 */
class SyncScheduler extends EventEmitter {
  /**
   * @param {Object} options - Scheduler options
   * @param {Object} options.config - Scheduler configuration
   * @param {Object} options.monitoring - Monitoring service instance
   */
  constructor(options = {}) {
    super();
    
    const { config = {}, monitoring = null } = options;
    
    this.config = { ...DEFAULT_SCHEDULE_CONFIG, ...config };
    this.monitoring = monitoring || getMonitoringService();
    this.logger = this.monitoring.getLogger('sync-scheduler');
    this.metrics = this.monitoring.getMetrics();
    
    // Core components
    this.syncEngine = new ModelSyncEngine({
      monitoring: this.monitoring,
      config: this.config.behavior
    });
    
    this.syncStrategy = new SyncStrategy({
      monitoring: this.monitoring,
      config: this.config
    });
    
    // Scheduler state
    this.isRunning = false;
    this.scheduledTasks = new Map();
    this.activeSyncs = new Map();
    this.syncHistory = [];
    
    // Statistics
    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSyncTime: null,
      averageSyncDuration: 0,
      uptime: Date.now()
    };
    
    this.logger.info('SyncScheduler initialized', {
      autoSyncEnabled: this.config.behavior.enableAutoSync,
      maxConcurrent: this.config.behavior.maxConcurrentSyncs
    });
  }

  /**
   * Start the automated synchronization scheduler
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('SyncScheduler already running');
      return;
    }

    try {
      this.logger.info('Starting SyncScheduler');
      
      // Initialize sync engine
      await this.syncEngine.initialize();
      
      // Setup scheduled tasks
      await this.setupScheduledTasks();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      // Perform initial health check
      await this.performInitialHealthCheck();
      
      this.isRunning = true;
      this.stats.uptime = Date.now();
      
      this.logger.info('SyncScheduler started successfully', {
        scheduledTasks: this.scheduledTasks.size
      });
      
      this.emit('started');
      
    } catch (error) {
      this.logger.error('Failed to start SyncScheduler', error);
      throw error;
    }
  }

  /**
   * Stop the automated synchronization scheduler
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      this.logger.info('Stopping SyncScheduler');
      
      // Stop all scheduled tasks
      this.scheduledTasks.forEach((task, taskId) => {
        task.destroy();
        this.logger.debug('Stopped scheduled task', { taskId });
      });
      this.scheduledTasks.clear();
      
      // Wait for active syncs to complete
      await this.waitForActiveSyncs();
      
      // Stop sync engine
      await this.syncEngine.shutdown();
      
      this.isRunning = false;
      
      this.logger.info('SyncScheduler stopped successfully');
      this.emit('stopped');
      
    } catch (error) {
      this.logger.error('Error stopping SyncScheduler', error);
      throw error;
    }
  }

  /**
   * Setup scheduled tasks based on configuration
   * @returns {Promise<void>}
   */
  async setupScheduledTasks() {
    if (!this.config.behavior.enableAutoSync) {
      this.logger.info('Auto-sync disabled, skipping task setup');
      return;
    }

    // Main sync schedules
    const mainTasks = [
      {
        id: 'full-sync',
        schedule: this.config.schedules.full,
        handler: () => this.executeFullSync(),
        description: 'Weekly full synchronization'
      },
      {
        id: 'incremental-sync', 
        schedule: this.config.schedules.incremental,
        handler: () => this.executeIncrementalSync(),
        description: 'Regular incremental synchronization'
      },
      {
        id: 'health-check',
        schedule: this.config.schedules.health,
        handler: () => this.performHealthCheck(),
        description: 'System health monitoring'
      },
      {
        id: 'cleanup',
        schedule: this.config.schedules.cleanup,
        handler: () => this.performCleanup(),
        description: 'Daily system cleanup'
      }
    ];

    // Schedule main tasks
    for (const task of mainTasks) {
      await this.scheduleTask(task);
    }

    // Schedule provider-specific tasks
    await this.setupProviderSpecificTasks();
    
    this.logger.info('Scheduled tasks setup completed', {
      totalTasks: this.scheduledTasks.size
    });
  }

  /**
   * Setup provider-specific scheduled tasks
   * @returns {Promise<void>}
   */
  async setupProviderSpecificTasks() {
    const { Provider } = db.models;
    const activeProviders = await Provider.findAll();

    for (const provider of activeProviders) {
      const providerConfig = this.config.providers[provider.name.toLowerCase()];
      
      if (providerConfig) {
        // Provider sync task
        await this.scheduleTask({
          id: `${provider.name}-sync`,
          schedule: providerConfig.syncInterval,
          handler: () => this.executeProviderSync(provider),
          description: `${provider.name} synchronization`,
          provider: provider.name
        });

        // Provider health check task
        await this.scheduleTask({
          id: `${provider.name}-health`,
          schedule: providerConfig.healthCheckInterval,
          handler: () => this.checkProviderHealth(provider),
          description: `${provider.name} health check`,
          provider: provider.name
        });
      }
    }
  }

  /**
   * Schedule a single task
   * @param {Object} taskConfig - Task configuration
   * @returns {Promise<void>}
   */
  async scheduleTask(taskConfig) {
    const { id, schedule, handler, description, provider } = taskConfig;
    
    try {
      const task = cron.schedule(schedule, async () => {
        const correlationId = this.logger.generateCorrelationId();
        const timer = this.metrics.startTimer('scheduled_task_duration', {
          taskId: id,
          provider: provider || 'system'
        });

        try {
          this.logger.info('Executing scheduled task', {
            correlationId,
            taskId: id,
            description,
            provider
          });

          await handler();

          this.metrics.endTimer(timer);
          this.metrics.increment('scheduled_tasks_completed', 1, {
            taskId: id,
            status: 'success'
          });

          this.logger.info('Scheduled task completed successfully', {
            correlationId,
            taskId: id
          });

        } catch (error) {
          this.metrics.endTimer(timer);
          this.metrics.increment('scheduled_tasks_completed', 1, {
            taskId: id,
            status: 'error'
          });

          this.logger.error('Scheduled task failed', {
            correlationId,
            taskId: id,
            error: error.message
          });

          this.emit('taskError', {
            taskId: id,
            error,
            correlationId
          });
        }
      }, {
        scheduled: false,
        timezone: 'UTC'
      });

      // Start the task
      task.start();
      
      this.scheduledTasks.set(id, task);
      
      this.logger.debug('Scheduled task registered', {
        taskId: id,
        schedule,
        description
      });

    } catch (error) {
      this.logger.error('Failed to schedule task', {
        taskId: id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute full synchronization
   * @returns {Promise<void>}
   */
  async executeFullSync() {
    const correlationId = this.logger.generateCorrelationId();
    
    try {
      this.logger.info('Starting full synchronization', { correlationId });
      
      // Check if we can perform full sync
      const canSync = await this.syncStrategy.canExecuteFullSync();
      if (!canSync.allowed) {
        this.logger.warn('Full sync skipped', {
          correlationId,
          reason: canSync.reason
        });
        return;
      }

      // Get all active providers
      const { Provider } = db.models;
      const providers = await Provider.findAll({
        order: [['created_at', 'ASC']] // Prioritize older providers
      });

      // Execute sync for each provider
      const syncResults = [];
      for (const provider of providers) {
        try {
          const result = await this.executeSingleProviderSync(provider, 'full', correlationId);
          syncResults.push(result);
        } catch (error) {
          syncResults.push({
            provider: provider.name,
            status: 'error',
            error: error.message
          });
        }
      }

      // Record sync history
      this.recordSyncExecution('full', syncResults, correlationId);
      
      this.logger.info('Full synchronization completed', {
        correlationId,
        totalProviders: providers.length,
        successful: syncResults.filter(r => r.status === 'success').length,
        failed: syncResults.filter(r => r.status === 'error').length
      });

    } catch (error) {
      this.logger.error('Full synchronization failed', {
        correlationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute incremental synchronization
   * @returns {Promise<void>}
   */
  async executeIncrementalSync() {
    const correlationId = this.logger.generateCorrelationId();
    
    try {
      this.logger.info('Starting incremental synchronization', { correlationId });
      
      // Get providers that need incremental sync
      const providersToSync = await this.syncStrategy.getProvidersForIncrementalSync();
      
      if (providersToSync.length === 0) {
        this.logger.info('No providers need incremental sync', { correlationId });
        return;
      }

      // Execute sync with concurrency control
      const syncResults = await this.executeConcurrentSync(
        providersToSync,
        'incremental',
        correlationId
      );

      // Record sync history
      this.recordSyncExecution('incremental', syncResults, correlationId);
      
      this.logger.info('Incremental synchronization completed', {
        correlationId,
        syncedProviders: providersToSync.length,
        successful: syncResults.filter(r => r.status === 'success').length
      });

    } catch (error) {
      this.logger.error('Incremental synchronization failed', {
        correlationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute provider-specific synchronization
   * @param {Object} provider - Provider instance
   * @returns {Promise<void>}
   */
  async executeProviderSync(provider) {
    const correlationId = this.logger.generateCorrelationId();
    
    try {
      // Check provider health and sync eligibility
      const canSync = await this.syncStrategy.canSyncProvider(provider);
      if (!canSync.allowed) {
        this.logger.info('Provider sync skipped', {
          correlationId,
          provider: provider.name,
          reason: canSync.reason
        });
        return;
      }

      // Determine sync type based on provider state
      const syncType = await this.syncStrategy.determineSyncType(provider);
      
      // Execute the sync
      const result = await this.executeSingleProviderSync(provider, syncType, correlationId);
      
      this.logger.info('Provider sync completed', {
        correlationId,
        provider: provider.name,
        syncType,
        status: result.status,
        modelsProcessed: result.modelsProcessed
      });

    } catch (error) {
      this.logger.error('Provider sync failed', {
        correlationId,
        provider: provider.name,
        error: error.message
      });
      
      // Record failure for backoff calculation
      await this.recordProviderSyncFailure(provider, error);
    }
  }

  /**
   * Execute synchronization for a single provider
   * @param {Object} provider - Provider instance
   * @param {string} syncType - Type of sync (full, incremental)
   * @param {string} correlationId - Correlation ID for tracking
   * @returns {Promise<Object>} Sync result
   */
  async executeSingleProviderSync(provider, syncType, correlationId) {
    const syncId = `${provider.name}-${syncType}-${Date.now()}`;
    
    try {
      // Check if provider is already syncing
      if (this.activeSyncs.has(provider.id)) {
        throw new Error(`Provider ${provider.name} is already syncing`);
      }

      // Check concurrency limits
      if (this.activeSyncs.size >= this.config.behavior.maxConcurrentSyncs) {
        throw new Error('Maximum concurrent syncs reached');
      }

      // Register active sync
      this.activeSyncs.set(provider.id, {
        syncId,
        provider: provider.name,
        syncType,
        startTime: Date.now(),
        correlationId
      });

      // Execute the sync
      const result = await this.syncEngine.syncProvider(provider, {
        syncType,
        timeout: this.config.behavior.syncTimeout,
        correlationId
      });

      // Update statistics
      this.updateSyncStatistics(result, true);
      
      return result;

    } catch (error) {
      this.updateSyncStatistics({ duration: Date.now() - Date.now() }, false);
      throw error;
      
    } finally {
      // Remove from active syncs
      this.activeSyncs.delete(provider.id);
    }
  }

  /**
   * Execute concurrent synchronization for multiple providers
   * @param {Array} providers - Array of provider instances
   * @param {string} syncType - Type of sync
   * @param {string} correlationId - Correlation ID
   * @returns {Promise<Array>} Array of sync results
   */
  async executeConcurrentSync(providers, syncType, correlationId) {
    const maxConcurrent = this.config.behavior.maxConcurrentSyncs;
    const results = [];
    
    // Process providers in batches
    for (let i = 0; i < providers.length; i += maxConcurrent) {
      const batch = providers.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (provider) => {
        try {
          return await this.executeSingleProviderSync(provider, syncType, correlationId);
        } catch (error) {
          return {
            provider: provider.name,
            status: 'error',
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Perform system health check
   * @returns {Promise<void>}
   */
  async performHealthCheck() {
    try {
      const healthCheck = await this.monitoring.performHealthCheck();
      
      this.metrics.gauge('system_health_score', 
        healthCheck.status === 'healthy' ? 100 : 
        healthCheck.status === 'degraded' ? 50 : 0);

      // Check if any providers need attention
      if (healthCheck.checks.providers && healthCheck.checks.providers.status !== 'healthy') {
        this.emit('healthAlert', {
          type: 'providers_unhealthy',
          details: healthCheck.checks.providers
        });
      }

      this.logger.debug('Health check completed', {
        status: healthCheck.status,
        checks: Object.keys(healthCheck.checks).length
      });

    } catch (error) {
      this.logger.error('Health check failed', error);
      this.emit('healthAlert', {
        type: 'health_check_failed',
        error: error.message
      });
    }
  }

  /**
   * Check health of specific provider
   * @param {Object} provider - Provider instance
   * @returns {Promise<void>}
   */
  async checkProviderHealth(provider) {
    try {
      const health = await this.syncEngine.checkProviderHealth(provider);
      
      this.metrics.gauge('provider_health_score', health.healthScore, {
        provider: provider.name
      });

      if (health.status !== 'healthy') {
        this.emit('providerHealthAlert', {
          provider: provider.name,
          status: health.status,
          healthScore: health.healthScore,
          details: health
        });
      }

    } catch (error) {
      this.logger.error('Provider health check failed', {
        provider: provider.name,
        error: error.message
      });
    }
  }

  /**
   * Perform system cleanup
   * @returns {Promise<void>}
   */
  async performCleanup() {
    try {
      this.logger.info('Starting system cleanup');
      
      // Clean up old sync logs
      await this.cleanupSyncLogs();
      
      // Clean up metrics
      this.metrics.cleanupOldMetrics();
      
      // Rotate logs
      if (this.monitoring.logRotation) {
        await this.monitoring.logRotation.performCleanup();
      }
      
      this.logger.info('System cleanup completed');
      
    } catch (error) {
      this.logger.error('System cleanup failed', error);
    }
  }

  /**
   * Clean up old synchronization logs
   * @returns {Promise<void>}
   */
  async cleanupSyncLogs() {
    try {
      const { ModelSyncLog } = db.models;
      const cutoffDate = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
      
      const deletedCount = await ModelSyncLog.destroy({
        where: {
          started_at: {
            [db.Sequelize.Op.lt]: cutoffDate
          }
        }
      });
      
      this.logger.info('Cleaned up old sync logs', {
        deletedCount,
        cutoffDate: cutoffDate.toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to cleanup sync logs', error);
    }
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Handle sync engine events
    this.syncEngine.on('syncStarted', (data) => {
      this.logger.info('Provider sync started', data);
      this.emit('syncStarted', data);
    });

    this.syncEngine.on('syncCompleted', (data) => {
      this.logger.info('Provider sync completed', data);
      this.emit('syncCompleted', data);
    });

    this.syncEngine.on('syncFailed', (data) => {
      this.logger.error('Provider sync failed', data);
      this.emit('syncFailed', data);
    });

    // Handle strategy events
    this.syncStrategy.on('strategyDecision', (data) => {
      this.logger.debug('Sync strategy decision', data);
    });
  }

  /**
   * Perform initial health check on startup
   * @returns {Promise<void>}
   */
  async performInitialHealthCheck() {
    try {
      this.logger.info('Performing initial health check');
      
      const healthCheck = await this.monitoring.performHealthCheck();
      
      if (healthCheck.status !== 'healthy') {
        this.logger.warn('System not fully healthy on startup', {
          status: healthCheck.status,
          issues: Object.keys(healthCheck.checks)
            .filter(key => healthCheck.checks[key].status !== 'healthy')
        });
      }
      
      this.logger.info('Initial health check completed', {
        status: healthCheck.status
      });
      
    } catch (error) {
      this.logger.error('Initial health check failed', error);
      // Don't throw - allow scheduler to start even if health check fails
    }
  }

  /**
   * Wait for all active syncs to complete
   * @returns {Promise<void>}
   */
  async waitForActiveSyncs() {
    if (this.activeSyncs.size === 0) {
      return;
    }

    this.logger.info('Waiting for active syncs to complete', {
      activeSyncs: this.activeSyncs.size
    });

    const timeout = this.config.behavior.syncTimeout + 30000; // Add 30s buffer
    const startTime = Date.now();

    while (this.activeSyncs.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.activeSyncs.size > 0) {
      this.logger.warn('Some syncs did not complete within timeout', {
        remainingActiveSyncs: this.activeSyncs.size
      });
    }
  }

  /**
   * Record sync execution in history
   * @param {string} syncType - Type of synchronization
   * @param {Array} results - Sync results
   * @param {string} correlationId - Correlation ID
   */
  recordSyncExecution(syncType, results, correlationId) {
    const execution = {
      syncType,
      correlationId,
      timestamp: new Date().toISOString(),
      results,
      totalProviders: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length
    };

    this.syncHistory.push(execution);
    
    // Keep only recent history
    if (this.syncHistory.length > 100) {
      this.syncHistory = this.syncHistory.slice(-50);
    }

    this.metrics.increment('sync_executions_total', 1, {
      syncType,
      status: execution.failed === 0 ? 'success' : 'mixed'
    });
  }

  /**
   * Record provider sync failure for backoff calculation
   * @param {Object} provider - Provider instance
   * @param {Error} error - Error that occurred
   * @returns {Promise<void>}
   */
  async recordProviderSyncFailure(provider, error) {
    try {
      const { ProviderHealthStatus } = db.models;
      
      const healthStatus = await ProviderHealthStatus.findOne({
        where: { id_provider: provider.id }
      });

      if (healthStatus) {
        await healthStatus.recordFailure(error, 'sync');
      }

    } catch (recordError) {
      this.logger.error('Failed to record provider sync failure', {
        provider: provider.name,
        originalError: error.message,
        recordError: recordError.message
      });
    }
  }

  /**
   * Update synchronization statistics
   * @param {Object} result - Sync result
   * @param {boolean} success - Whether sync was successful
   */
  updateSyncStatistics(result, success) {
    this.stats.totalSyncs++;
    
    if (success) {
      this.stats.successfulSyncs++;
    } else {
      this.stats.failedSyncs++;
    }
    
    this.stats.lastSyncTime = new Date().toISOString();
    
    if (result.duration) {
      const avgDuration = this.stats.averageSyncDuration;
      const totalSyncs = this.stats.totalSyncs;
      this.stats.averageSyncDuration = 
        ((avgDuration * (totalSyncs - 1)) + result.duration) / totalSyncs;
    }
  }

  /**
   * Get scheduler status and statistics
   * @returns {Object} Scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      stats: {
        ...this.stats,
        uptime: Date.now() - this.stats.uptime
      },
      activeSyncs: Array.from(this.activeSyncs.values()),
      scheduledTasks: Array.from(this.scheduledTasks.keys()),
      recentHistory: this.syncHistory.slice(-10),
      config: {
        autoSyncEnabled: this.config.behavior.enableAutoSync,
        maxConcurrentSyncs: this.config.behavior.maxConcurrentSyncs,
        schedules: this.config.schedules
      }
    };
  }

  /**
   * Trigger manual synchronization
   * @param {Object} options - Manual sync options
   * @returns {Promise<Object>} Sync results
   */
  async triggerManualSync(options = {}) {
    const {
      providers = null,
      syncType = 'incremental',
      force = false
    } = options;

    const correlationId = this.logger.generateCorrelationId();
    
    try {
      this.logger.info('Manual sync triggered', {
        correlationId,
        providers,
        syncType,
        force
      });

      let providersToSync;
      
      if (providers) {
        const { Provider } = db.models;
        providersToSync = await Provider.findAll({
          where: {
            name: providers
          }
        });
      } else {
        providersToSync = await this.syncStrategy.getProvidersForSync(syncType, force);
      }

      const results = await this.executeConcurrentSync(
        providersToSync,
        syncType,
        correlationId
      );

      this.recordSyncExecution(`manual-${syncType}`, results, correlationId);
      
      return {
        correlationId,
        syncType,
        providersToSync: providersToSync.length,
        results
      };

    } catch (error) {
      this.logger.error('Manual sync failed', {
        correlationId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { SyncScheduler, DEFAULT_SCHEDULE_CONFIG };