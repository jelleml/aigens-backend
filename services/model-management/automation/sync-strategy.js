/**
 * Synchronization Strategy Manager
 * 
 * Intelligent decision-making system for determining when, how, and which
 * providers should be synchronized based on health, performance, and business rules.
 */

const { EventEmitter } = require('events');
const db = require('../../../database');

/**
 * Strategy decision reasons
 */
const DECISION_REASONS = {
  HEALTH_SCORE_LOW: 'Provider health score below threshold',
  ERROR_RATE_HIGH: 'Provider error rate too high',
  CONSECUTIVE_FAILURES: 'Too many consecutive failures',
  COOLDOWN_ACTIVE: 'Provider in cooldown period',
  CIRCUIT_BREAKER_OPEN: 'Circuit breaker is open',
  RATE_LIMITED: 'Provider is rate limited',
  LAST_SYNC_RECENT: 'Last sync was too recent',
  SYNC_IN_PROGRESS: 'Sync already in progress',
  MAINTENANCE_WINDOW: 'Provider in maintenance window',
  RESOURCE_CONSTRAINTS: 'System resource constraints',
  BUSINESS_HOURS_ONLY: 'Sync allowed only during business hours',
  PRIORITY_OVERRIDE: 'Higher priority provider takes precedence',
  MANUAL_OVERRIDE: 'Manual override active',
  SMART_SCHEDULING: 'Smart scheduling decision'
};

/**
 * SyncStrategy class
 */
class SyncStrategy extends EventEmitter {
  /**
   * @param {Object} options - Strategy options
   * @param {Object} options.monitoring - Monitoring service instance
   * @param {Object} options.config - Strategy configuration
   */
  constructor(options = {}) {
    super();
    
    const { monitoring, config = {} } = options;
    
    this.monitoring = monitoring;
    this.logger = monitoring.getLogger('sync-strategy');
    this.metrics = monitoring.getMetrics();
    
    this.config = config;
    
    // Strategy state
    this.providerStates = new Map();
    this.globalConstraints = {
      maxConcurrentSyncs: config.behavior?.maxConcurrentSyncs || 3,
      systemLoad: 0,
      memoryUsage: 0
    };
    
    this.logger.info('SyncStrategy initialized', {
      maxConcurrentSyncs: this.globalConstraints.maxConcurrentSyncs
    });
  }

  /**
   * Determine if full sync can be executed
   * @returns {Promise<Object>} Decision result
   */
  async canExecuteFullSync() {
    try {
      const decision = {
        allowed: true,
        reason: null,
        conditions: {}
      };

      // Check system resources
      const systemCheck = await this.checkSystemResources();
      if (!systemCheck.allowed) {
        decision.allowed = false;
        decision.reason = DECISION_REASONS.RESOURCE_CONSTRAINTS;
        decision.conditions.system = systemCheck;
        return decision;
      }

      // Check business hours (if configured)
      const businessHoursCheck = this.checkBusinessHours();
      if (!businessHoursCheck.allowed) {
        decision.allowed = false;
        decision.reason = DECISION_REASONS.BUSINESS_HOURS_ONLY;
        decision.conditions.businessHours = businessHoursCheck;
        return decision;
      }

      // Check for concurrent syncs
      const concurrencyCheck = await this.checkConcurrency('full');
      if (!concurrencyCheck.allowed) {
        decision.allowed = false;
        decision.reason = DECISION_REASONS.SYNC_IN_PROGRESS;
        decision.conditions.concurrency = concurrencyCheck;
        return decision;
      }

      decision.conditions = {
        system: systemCheck,
        businessHours: businessHoursCheck,
        concurrency: concurrencyCheck
      };

      this.emit('strategyDecision', {
        type: 'full_sync',
        decision,
        timestamp: new Date().toISOString()
      });

      return decision;

    } catch (error) {
      this.logger.error('Error checking full sync eligibility', error);
      return {
        allowed: false,
        reason: 'Strategy check failed',
        error: error.message
      };
    }
  }

  /**
   * Get providers that need incremental sync
   * @returns {Promise<Array>} Array of providers to sync
   */
  async getProvidersForIncrementalSync() {
    try {
      const { Provider, ProviderHealthStatus } = db.models;
      
      // Get all active providers with their health status
      const providers = await Provider.findAll({
        include: [{
          model: ProviderHealthStatus,
          as: 'healthStatus',
          required: false
        }],
        order: [['created_at', 'ASC']]
      });

      const eligibleProviders = [];
      
      for (const provider of providers) {
        const canSync = await this.canSyncProvider(provider);
        
        if (canSync.allowed) {
          // Add priority scoring
          const priority = this.calculateProviderPriority(provider);
          eligibleProviders.push({
            ...provider.toJSON(),
            priority,
            syncReason: canSync.reason
          });
        } else {
          this.logger.debug('Provider skipped for incremental sync', {
            provider: provider.name,
            reason: canSync.reason
          });
        }
      }

      // Sort by priority (higher first)
      eligibleProviders.sort((a, b) => b.priority - a.priority);

      // Limit by concurrency constraints
      const maxProviders = await this.getMaxConcurrentProviders();
      const selectedProviders = eligibleProviders.slice(0, maxProviders);

      this.logger.info('Providers selected for incremental sync', {
        eligible: eligibleProviders.length,
        selected: selectedProviders.length,
        maxConcurrent: maxProviders
      });

      return selectedProviders.map(p => ({ 
        id: p.id, 
        name: p.name, 
        provider_type: p.provider_type,
        priority: p.priority 
      }));

    } catch (error) {
      this.logger.error('Error getting providers for incremental sync', error);
      return [];
    }
  }

  /**
   * Check if a specific provider can be synchronized
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object>} Decision result
   */
  async canSyncProvider(provider) {
    try {
      const decision = {
        allowed: true,
        reason: 'Provider eligible for sync',
        checks: {}
      };

      // Check provider health
      const healthCheck = await this.checkProviderHealth(provider);
      decision.checks.health = healthCheck;
      
      if (!healthCheck.allowed) {
        decision.allowed = false;
        decision.reason = healthCheck.reason;
        return decision;
      }

      // Check rate limiting
      const rateLimitCheck = await this.checkRateLimit(provider);
      decision.checks.rateLimit = rateLimitCheck;
      
      if (!rateLimitCheck.allowed) {
        decision.allowed = false;
        decision.reason = DECISION_REASONS.RATE_LIMITED;
        return decision;
      }

      // Check cooldown period
      const cooldownCheck = await this.checkCooldownPeriod(provider);
      decision.checks.cooldown = cooldownCheck;
      
      if (!cooldownCheck.allowed) {
        decision.allowed = false;
        decision.reason = DECISION_REASONS.COOLDOWN_ACTIVE;
        return decision;
      }

      // Check maintenance window
      const maintenanceCheck = this.checkMaintenanceWindow(provider);
      decision.checks.maintenance = maintenanceCheck;
      
      if (!maintenanceCheck.allowed) {
        decision.allowed = false;
        decision.reason = DECISION_REASONS.MAINTENANCE_WINDOW;
        return decision;
      }

      // Check last sync time
      const lastSyncCheck = await this.checkLastSyncTime(provider);
      decision.checks.lastSync = lastSyncCheck;
      
      if (!lastSyncCheck.allowed) {
        decision.allowed = false;
        decision.reason = DECISION_REASONS.LAST_SYNC_RECENT;
        return decision;
      }

      this.emit('strategyDecision', {
        type: 'provider_sync_check',
        provider: provider.name,
        decision,
        timestamp: new Date().toISOString()
      });

      return decision;

    } catch (error) {
      this.logger.error('Error checking provider sync eligibility', {
        provider: provider.name,
        error: error.message
      });
      
      return {
        allowed: false,
        reason: 'Strategy check failed',
        error: error.message
      };
    }
  }

  /**
   * Determine sync type for a provider
   * @param {Object} provider - Provider instance
   * @returns {Promise<string>} Sync type (full, incremental)
   */
  async determineSyncType(provider) {
    try {
      // Check if provider has never been synced
      if (!provider.last_sync_at) {
        return 'full';
      }

      // Check if last sync was more than a week ago
      const weekAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
      if (new Date(provider.last_sync_at) < weekAgo) {
        return 'full';
      }

      // Check if last sync failed
      const { ModelSyncLog } = db.models;
      const lastSyncLog = await ModelSyncLog.findOne({
        where: { id_provider: provider.id },
        order: [['started_at', 'DESC']]
      });

      if (lastSyncLog && lastSyncLog.status === 'failed') {
        return 'full';
      }

      // Check provider health - if degraded, do full sync
      const healthStatus = await this.getProviderHealthStatus(provider);
      if (healthStatus && healthStatus.health_score < 70) {
        return 'full';
      }

      // Default to incremental
      return 'incremental';

    } catch (error) {
      this.logger.error('Error determining sync type', {
        provider: provider.name,
        error: error.message
      });
      
      // Default to incremental on error
      return 'incremental';
    }
  }

  /**
   * Get providers for any type of sync
   * @param {string} syncType - Type of sync
   * @param {boolean} force - Force sync regardless of conditions
   * @returns {Promise<Array>} Array of providers
   */
  async getProvidersForSync(syncType, force = false) {
    try {
      const { Provider } = db.models;
      
      const providers = await Provider.findAll();

      if (force) {
        return providers;
      }

      const eligibleProviders = [];
      
      for (const provider of providers) {
        if (syncType === 'full') {
          const canSync = await this.canExecuteFullSync();
          if (canSync.allowed) {
            eligibleProviders.push(provider);
          }
        } else {
          const canSync = await this.canSyncProvider(provider);
          if (canSync.allowed) {
            eligibleProviders.push(provider);
          }
        }
      }

      return eligibleProviders;

    } catch (error) {
      this.logger.error('Error getting providers for sync', error);
      return [];
    }
  }

  /**
   * Check provider health status
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object>} Health check result
   */
  async checkProviderHealth(provider) {
    try {
      const healthStatus = await this.getProviderHealthStatus(provider);
      
      if (!healthStatus) {
        return {
          allowed: true,
          reason: 'No health status available',
          healthScore: null
        };
      }

      const minHealthScore = this.config.conditions?.minHealthScore || 70;
      const maxErrorRate = this.config.conditions?.maxErrorRate || 0.1;
      const maxConsecutiveFailures = this.config.conditions?.maxConsecutiveFailures || 3;

      // Check health score
      if (healthStatus.health_score < minHealthScore) {
        return {
          allowed: false,
          reason: DECISION_REASONS.HEALTH_SCORE_LOW,
          healthScore: healthStatus.health_score,
          threshold: minHealthScore
        };
      }

      // Check error rate
      if (healthStatus.error_rate_percentage > maxErrorRate * 100) {
        return {
          allowed: false,
          reason: DECISION_REASONS.ERROR_RATE_HIGH,
          errorRate: healthStatus.error_rate_percentage,
          threshold: maxErrorRate * 100
        };
      }

      // Check consecutive failures
      if (healthStatus.consecutive_failures >= maxConsecutiveFailures) {
        return {
          allowed: false,
          reason: DECISION_REASONS.CONSECUTIVE_FAILURES,
          consecutiveFailures: healthStatus.consecutive_failures,
          threshold: maxConsecutiveFailures
        };
      }

      // Check circuit breaker
      if (healthStatus.circuit_breaker_state === 'open') {
        return {
          allowed: false,
          reason: DECISION_REASONS.CIRCUIT_BREAKER_OPEN,
          circuitState: healthStatus.circuit_breaker_state
        };
      }

      return {
        allowed: true,
        reason: 'Provider health check passed',
        healthScore: healthStatus.health_score,
        errorRate: healthStatus.error_rate_percentage,
        consecutiveFailures: healthStatus.consecutive_failures
      };

    } catch (error) {
      this.logger.error('Error checking provider health', {
        provider: provider.name,
        error: error.message
      });
      
      // Allow sync on error (fail open)
      return {
        allowed: true,
        reason: 'Health check failed, allowing sync',
        error: error.message
      };
    }
  }

  /**
   * Check rate limiting status
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object>} Rate limit check result
   */
  async checkRateLimit(provider) {
    try {
      const healthStatus = await this.getProviderHealthStatus(provider);
      
      if (!healthStatus || !healthStatus.rate_limit_reset_at) {
        return {
          allowed: true,
          reason: 'No rate limit data available'
        };
      }

      const resetTime = new Date(healthStatus.rate_limit_reset_at);
      const now = new Date();

      if (now < resetTime && healthStatus.rate_limit_remaining <= 0) {
        return {
          allowed: false,
          reason: DECISION_REASONS.RATE_LIMITED,
          resetAt: resetTime,
          remaining: healthStatus.rate_limit_remaining
        };
      }

      return {
        allowed: true,
        reason: 'Rate limit check passed',
        remaining: healthStatus.rate_limit_remaining,
        resetAt: resetTime
      };

    } catch (error) {
      this.logger.error('Error checking rate limit', {
        provider: provider.name,
        error: error.message
      });
      
      // Allow sync on error
      return {
        allowed: true,
        reason: 'Rate limit check failed, allowing sync',
        error: error.message
      };
    }
  }

  /**
   * Check cooldown period
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object>} Cooldown check result
   */
  async checkCooldownPeriod(provider) {
    try {
      const healthStatus = await this.getProviderHealthStatus(provider);
      
      if (!healthStatus || !healthStatus.last_failure_at) {
        return {
          allowed: true,
          reason: 'No failure history'
        };
      }

      const cooldownPeriod = this.config.conditions?.cooldownPeriod || 1800000; // 30 minutes
      const lastFailure = new Date(healthStatus.last_failure_at);
      const cooldownEnd = new Date(lastFailure.getTime() + cooldownPeriod);
      const now = new Date();

      if (now < cooldownEnd && healthStatus.consecutive_failures > 0) {
        return {
          allowed: false,
          reason: DECISION_REASONS.COOLDOWN_ACTIVE,
          cooldownEnd,
          lastFailure,
          consecutiveFailures: healthStatus.consecutive_failures
        };
      }

      return {
        allowed: true,
        reason: 'Cooldown period check passed',
        lastFailure,
        consecutiveFailures: healthStatus.consecutive_failures
      };

    } catch (error) {
      this.logger.error('Error checking cooldown period', {
        provider: provider.name,
        error: error.message
      });
      
      return {
        allowed: true,
        reason: 'Cooldown check failed, allowing sync',
        error: error.message
      };
    }
  }

  /**
   * Check maintenance window
   * @param {Object} provider - Provider instance
   * @returns {Object} Maintenance check result
   */
  checkMaintenanceWindow(provider) {
    try {
      // Check if provider has maintenance window configured
      const providerConfig = this.config.providers?.[provider.name.toLowerCase()];
      
      if (!providerConfig || !providerConfig.maintenanceWindow) {
        return {
          allowed: true,
          reason: 'No maintenance window configured'
        };
      }

      const now = new Date();
      const currentHour = now.getUTCHours();
      const currentDay = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
      
      const maintenance = providerConfig.maintenanceWindow;
      
      // Check daily maintenance window
      if (maintenance.daily) {
        const { start, end } = maintenance.daily;
        if (currentHour >= start && currentHour < end) {
          return {
            allowed: false,
            reason: DECISION_REASONS.MAINTENANCE_WINDOW,
            window: 'daily',
            start,
            end,
            currentHour
          };
        }
      }

      // Check weekly maintenance window
      if (maintenance.weekly && maintenance.weekly[currentDay]) {
        const { start, end } = maintenance.weekly[currentDay];
        if (currentHour >= start && currentHour < end) {
          return {
            allowed: false,
            reason: DECISION_REASONS.MAINTENANCE_WINDOW,
            window: 'weekly',
            day: currentDay,
            start,
            end,
            currentHour
          };
        }
      }

      return {
        allowed: true,
        reason: 'Outside maintenance window',
        currentHour,
        currentDay
      };

    } catch (error) {
      this.logger.error('Error checking maintenance window', {
        provider: provider.name,
        error: error.message
      });
      
      return {
        allowed: true,
        reason: 'Maintenance check failed, allowing sync',
        error: error.message
      };
    }
  }

  /**
   * Check last sync time
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object>} Last sync check result
   */
  async checkLastSyncTime(provider) {
    try {
      if (!provider.last_sync_at) {
        return {
          allowed: true,
          reason: 'Provider never synced'
        };
      }

      const providerConfig = this.config.providers?.[provider.name.toLowerCase()];
      const minInterval = providerConfig?.minSyncInterval || 3600000; // 1 hour default
      
      const lastSync = new Date(provider.last_sync_at);
      const minNextSync = new Date(lastSync.getTime() + minInterval);
      const now = new Date();

      if (now < minNextSync) {
        return {
          allowed: false,
          reason: DECISION_REASONS.LAST_SYNC_RECENT,
          lastSync,
          minNextSync,
          minInterval
        };
      }

      return {
        allowed: true,
        reason: 'Sufficient time since last sync',
        lastSync,
        timeSince: now.getTime() - lastSync.getTime()
      };

    } catch (error) {
      this.logger.error('Error checking last sync time', {
        provider: provider.name,
        error: error.message
      });
      
      return {
        allowed: true,
        reason: 'Last sync check failed, allowing sync',
        error: error.message
      };
    }
  }

  /**
   * Check system resources
   * @returns {Promise<Object>} System resource check result
   */
  async checkSystemResources() {
    try {
      const memoryUsage = process.memoryUsage();
      const heapUsedPercent = memoryUsage.heapUsed / memoryUsage.heapTotal;
      
      // Check memory usage
      const maxMemoryUsage = 0.85; // 85%
      if (heapUsedPercent > maxMemoryUsage) {
        return {
          allowed: false,
          reason: DECISION_REASONS.RESOURCE_CONSTRAINTS,
          issue: 'high_memory_usage',
          memoryUsage: heapUsedPercent * 100,
          threshold: maxMemoryUsage * 100
        };
      }

      // Check active connections (if available)
      const activeSyncs = await this.getActiveSyncCount();
      if (activeSyncs >= this.globalConstraints.maxConcurrentSyncs) {
        return {
          allowed: false,
          reason: DECISION_REASONS.RESOURCE_CONSTRAINTS,
          issue: 'max_concurrent_syncs',
          activeSyncs,
          maxConcurrent: this.globalConstraints.maxConcurrentSyncs
        };
      }

      return {
        allowed: true,
        reason: 'System resources available',
        memoryUsage: heapUsedPercent * 100,
        activeSyncs
      };

    } catch (error) {
      this.logger.error('Error checking system resources', error);
      
      return {
        allowed: true,
        reason: 'Resource check failed, allowing sync',
        error: error.message
      };
    }
  }

  /**
   * Check business hours constraints
   * @returns {Object} Business hours check result
   */
  checkBusinessHours() {
    try {
      const businessHoursConfig = this.config.businessHours;
      
      if (!businessHoursConfig || !businessHoursConfig.enabled) {
        return {
          allowed: true,
          reason: 'Business hours not configured'
        };
      }

      const now = new Date();
      const currentHour = now.getUTCHours();
      const currentDay = now.getUTCDay();
      
      const { start, end, days } = businessHoursConfig;
      
      // Check if current day is allowed
      if (days && !days.includes(currentDay)) {
        return {
          allowed: false,
          reason: DECISION_REASONS.BUSINESS_HOURS_ONLY,
          currentDay,
          allowedDays: days
        };
      }

      // Check if current hour is within business hours
      if (start !== undefined && end !== undefined) {
        if (currentHour < start || currentHour >= end) {
          return {
            allowed: false,
            reason: DECISION_REASONS.BUSINESS_HOURS_ONLY,
            currentHour,
            businessHours: { start, end }
          };
        }
      }

      return {
        allowed: true,
        reason: 'Within business hours',
        currentHour,
        currentDay
      };

    } catch (error) {
      this.logger.error('Error checking business hours', error);
      
      return {
        allowed: true,
        reason: 'Business hours check failed, allowing sync',
        error: error.message
      };
    }
  }

  /**
   * Check concurrency constraints
   * @param {string} syncType - Type of sync
   * @returns {Promise<Object>} Concurrency check result
   */
  async checkConcurrency(syncType) {
    try {
      const activeSyncs = await this.getActiveSyncCount();
      const maxConcurrent = this.globalConstraints.maxConcurrentSyncs;

      if (activeSyncs >= maxConcurrent) {
        return {
          allowed: false,
          reason: DECISION_REASONS.SYNC_IN_PROGRESS,
          activeSyncs,
          maxConcurrent
        };
      }

      return {
        allowed: true,
        reason: 'Concurrency limit not reached',
        activeSyncs,
        maxConcurrent
      };

    } catch (error) {
      this.logger.error('Error checking concurrency', error);
      
      return {
        allowed: true,
        reason: 'Concurrency check failed, allowing sync',
        error: error.message
      };
    }
  }

  /**
   * Calculate provider priority for sync ordering
   * @param {Object} provider - Provider instance
   * @returns {number} Priority score (higher = more priority)
   */
  calculateProviderPriority(provider) {
    let priority = 0;
    
    // Base priority from configuration
    const providerConfig = this.config.providers?.[provider.name.toLowerCase()];
    if (providerConfig && providerConfig.priority) {
      priority += (10 - providerConfig.priority) * 10; // Invert priority (lower number = higher priority)
    }
    
    // Health score bonus
    if (provider.healthStatus) {
      priority += provider.healthStatus.health_score / 10;
    }
    
    // Time since last sync bonus
    if (provider.last_sync_at) {
      const hoursSinceSync = (Date.now() - new Date(provider.last_sync_at).getTime()) / (1000 * 60 * 60);
      priority += Math.min(hoursSinceSync / 24, 5); // Max 5 points for days without sync
    } else {
      priority += 10; // High priority for never-synced providers
    }
    
    return Math.round(priority);
  }

  /**
   * Get maximum concurrent providers based on system state
   * @returns {Promise<number>} Maximum concurrent providers
   */
  async getMaxConcurrentProviders() {
    try {
      const memoryUsage = process.memoryUsage();
      const heapUsedPercent = memoryUsage.heapUsed / memoryUsage.heapTotal;
      
      let maxConcurrent = this.globalConstraints.maxConcurrentSyncs;
      
      // Reduce concurrency if memory usage is high
      if (heapUsedPercent > 0.7) {
        maxConcurrent = Math.max(1, Math.floor(maxConcurrent / 2));
      }
      
      return maxConcurrent;

    } catch (error) {
      this.logger.error('Error calculating max concurrent providers', error);
      return this.globalConstraints.maxConcurrentSyncs;
    }
  }

  /**
   * Get active sync count
   * @returns {Promise<number>} Number of active syncs
   */
  async getActiveSyncCount() {
    try {
      const { ModelSyncLog } = db.models;
      
      const activeSyncs = await ModelSyncLog.count({
        where: {
          status: 'running',
          started_at: {
            [db.Sequelize.Op.gte]: new Date(Date.now() - 600000) // Last 10 minutes
          }
        }
      });
      
      return activeSyncs;

    } catch (error) {
      this.logger.error('Error getting active sync count', error);
      return 0;
    }
  }

  /**
   * Get provider health status
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object|null>} Health status or null
   */
  async getProviderHealthStatus(provider) {
    try {
      const { ProviderHealthStatus } = db.models;
      
      return await ProviderHealthStatus.findOne({
        where: { id_provider: provider.id }
      });

    } catch (error) {
      this.logger.error('Error getting provider health status', {
        provider: provider.name,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Update global constraints
   * @param {Object} constraints - New constraints
   */
  updateGlobalConstraints(constraints) {
    this.globalConstraints = { ...this.globalConstraints, ...constraints };
    
    this.logger.info('Global constraints updated', {
      constraints: this.globalConstraints
    });
  }

  /**
   * Get strategy statistics
   * @returns {Object} Strategy statistics
   */
  getStats() {
    return {
      globalConstraints: this.globalConstraints,
      providerStates: Object.fromEntries(this.providerStates),
      decisions: {
        reasons: DECISION_REASONS
      }
    };
  }
}

module.exports = { SyncStrategy, DECISION_REASONS };