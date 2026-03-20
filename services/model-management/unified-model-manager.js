/**
 * Unified Model Management Orchestrator
 * 
 * Central orchestrator for managing AI model data synchronization across all providers.
 * Provides unified interface for initialization, updates, and synchronization operations
 * with comprehensive error handling, monitoring, and provider coordination.
 */

const path = require('path');
const db = require('../../database');
const config = require('../../config/config');
const EnhancedErrorHandler = require('./utils/enhanced-error-handler');
const { ModelProcessor } = require('./model-processor');
const { createLogger } = require('../../scripts/utils/error-handler');

// Import provider adapters
const { AnthropicAdapter } = require('./adapters/anthropic-adapter');
const { OpenAIAdapter } = require('./adapters/openai-adapter');
const { OpenRouterAdapter } = require('./adapters/openrouter-adapter');
const { DeepSeekAdapter } = require('./adapters/deepseek-adapter');
const { IdeogramAdapter } = require('./adapters/ideogram-adapter');
const { TogetherAdapter } = require('./adapters/together-adapter');
// Video provider adapters
const { GoogleVeoAdapter } = require('./adapters/google-veo-adapter');
const { AmazonNovaAdapter } = require('./adapters/amazon-nova-adapter');
const { RunwayAdapter } = require('./adapters/runway-adapter');

/**
 * Execution modes
 */
const EXECUTION_MODES = {
  INIT: 'init',         // Initial setup, create all models from scratch
  UPDATE: 'update',     // Update existing models and add new ones
  SYNC: 'sync'          // Full synchronization, clean up stale models
};

/**
 * Execution strategies
 */
const EXECUTION_STRATEGIES = {
  SEQUENTIAL: 'sequential',   // Process providers one by one
  PARALLEL: 'parallel',       // Process providers concurrently
  MIXED: 'mixed'              // Parallel aggregators, sequential direct providers
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // Execution settings
  strategy: EXECUTION_STRATEGIES.MIXED,
  maxConcurrency: 3,
  batchSize: 50,
  
  // Timeout settings
  providerTimeout: 300000,    // 5 minutes per provider
  totalTimeout: 1800000,      // 30 minutes total
  
  // Retry settings
  maxProviderRetries: 2,
  retryDelay: 30000,
  
  // Health check settings
  healthCheckTimeout: 30000,
  skipUnhealthyProviders: true,
  
  // Database settings
  transactionTimeout: 120000,
  
  // Logging settings
  logLevel: 'info',
  enableMetrics: true
};

/**
 * Provider configurations and priorities
 */
const PROVIDER_CONFIGS = {
  // Direct providers (higher priority, more reliable)
  openai: {
    adapter: OpenAIAdapter,
    type: 'direct',
    priority: 1,
    dependsOn: [],
    timeout: 120000
  },
  anthropic: {
    adapter: AnthropicAdapter,
    type: 'direct',
    priority: 1,
    dependsOn: [],
    timeout: 120000
  },
  deepseek: {
    adapter: DeepSeekAdapter,
    type: 'direct',
    priority: 1,
    dependsOn: [],
    timeout: 120000
  },
  ideogram: {
    adapter: IdeogramAdapter,
    type: 'direct',
    priority: 1,
    dependsOn: [],
    timeout: 120000
  },
  'google-veo': {
    adapter: GoogleVeoAdapter,
    type: 'direct',
    priority: 1,
    dependsOn: [],
    timeout: 120000
  },
  'amazon-nova': {
    adapter: AmazonNovaAdapter,
    type: 'direct',
    priority: 1,
    dependsOn: [],
    timeout: 120000
  },
  runway: {
    adapter: RunwayAdapter,
    type: 'direct',
    priority: 1,
    dependsOn: [],
    timeout: 120000
  },
  together: {
    adapter: TogetherAdapter,
    type: 'direct',
    priority: 2,
    dependsOn: [],
    timeout: 180000
  },
  
  // Aggregator providers (lower priority, may depend on direct providers)
  openrouter: {
    adapter: OpenRouterAdapter,
    type: 'aggregator',
    priority: 3,
    dependsOn: ['openai', 'anthropic'],
    timeout: 300000
  }
};

/**
 * Unified Model Manager class
 */
class UnifiedModelManager {
  /**
   * @param {Object} options - Manager options
   * @param {Object} options.config - Override default configuration
   * @param {Object} options.logger - Logger instance
   * @param {Object} options.metrics - Metrics collector
   * @param {boolean} options.dryRun - Enable dry-run mode
   */
  constructor(options = {}) {
    const {
      config: userConfig = {},
      logger = null,
      metrics = null,
      dryRun = false
    } = options;

    this.config = { ...DEFAULT_CONFIG, ...userConfig };
    this.dryRun = dryRun;
    
    // Initialize logging
    this.logger = logger || createLogger('unified-model-manager', {
      logLevel: this.config.logLevel
    });
    
    this.metrics = metrics;
    
    // Initialize enhanced error handler
    this.errorHandler = new EnhancedErrorHandler({
      timeout: {
        api_request: {
          request: 30000,
          operation: this.config.providerTimeout,
          total: this.config.totalTimeout
        }
      }
    }, this.logger, this.metrics);
    
    // Initialize model processor
    this.modelProcessor = new ModelProcessor(this.logger, this.metrics);
    
    // Provider registry
    this.providers = new Map();
    this.providerStatus = new Map();
    
    // Execution state
    this.executionId = null;
    this.executionResults = new Map();
    this.startTime = null;
    
    this.logger.info('[UnifiedModelManager] Initialized', {
      dryRun: this.dryRun,
      strategy: this.config.strategy,
      maxConcurrency: this.config.maxConcurrency
    });
  }

  /**
   * Initialize the model manager
   * @returns {Promise<void>}
   */
  async initialize() {
    this.logger.info('[UnifiedModelManager] Starting initialization...');
    
    try {
      // Initialize database connection
      await db.initialize();
      this.logger.debug('[UnifiedModelManager] Database connection established');
      
      // Initialize provider adapters
      await this.initializeProviders();
      
      // Perform initial health check
      await this.performHealthCheck();
      
      this.logger.info('[UnifiedModelManager] Initialization complete', {
        providersInitialized: this.providers.size,
        healthyProviders: this.getHealthyProviders().length
      });
      
    } catch (error) {
      this.logger.error('[UnifiedModelManager] Initialization failed', error);
      throw error;
    }
  }

  /**
   * Initialize provider adapters
   * @returns {Promise<void>}
   */
  async initializeProviders() {
    this.logger.debug('[UnifiedModelManager] Initializing provider adapters...');
    
    for (const [providerName, providerConfig] of Object.entries(PROVIDER_CONFIGS)) {
      try {
        // Check if provider is configured
        const apiKey = this.getProviderApiKey(providerName);
        if (!apiKey && providerName !== 'ideogram') { // Ideogram might not need API key for all operations
          this.logger.warn(`[UnifiedModelManager] No API key found for provider: ${providerName}`);
          continue;
        }
        
        // Create adapter instance
        const AdapterClass = providerConfig.adapter;
        const adapter = new AdapterClass(this.logger);
        
        // Store adapter and config
        this.providers.set(providerName, {
          adapter,
          config: providerConfig,
          initialized: true,
          lastHealthCheck: null,
          consecutiveFailures: 0
        });
        
        this.logger.debug(`[UnifiedModelManager] Initialized provider: ${providerName}`);
        
      } catch (error) {
        this.logger.error(`[UnifiedModelManager] Failed to initialize provider: ${providerName}`, error);
        
        // Store failed provider for monitoring
        this.providers.set(providerName, {
          adapter: null,
          config: providerConfig,
          initialized: false,
          error: error.message,
          lastHealthCheck: null,
          consecutiveFailures: 1
        });
      }
    }
    
    this.logger.info(`[UnifiedModelManager] Provider initialization complete`, {
      total: this.providers.size,
      initialized: Array.from(this.providers.values()).filter(p => p.initialized).length,
      failed: Array.from(this.providers.values()).filter(p => !p.initialized).length
    });
  }

  /**
   * Get API key for provider from configuration
   * @param {string} providerName - Provider name
   * @returns {string|null} API key or null if not found
   */
  getProviderApiKey(providerName) {
    const envKey = `${providerName.toUpperCase()}_API_KEY`;
    return process.env[envKey] || config[providerName]?.apiKey || null;
  }

  /**
   * Perform health check on all providers
   * @returns {Promise<Object>} Health check results
   */
  async performHealthCheck() {
    this.logger.info('[UnifiedModelManager] Performing health check...');
    
    const results = {
      healthy: [],
      unhealthy: [],
      total: this.providers.size,
      timestamp: Date.now()
    };
    
    const healthCheckPromises = Array.from(this.providers.entries()).map(
      async ([providerName, providerData]) => {
        if (!providerData.initialized || !providerData.adapter) {
          results.unhealthy.push({
            name: providerName,
            status: 'not_initialized',
            error: providerData.error || 'Provider not initialized'
          });
          return;
        }
        
        try {
          await this.errorHandler.execute(
            () => providerData.adapter.healthCheck(),
            {
              provider: providerName,
              operationType: 'health_check',
              operationName: 'provider_health_check',
              enableRetry: false, // Don't retry health checks
              enableTimeout: true,
              timeoutOptions: {
                operationTimeout: this.config.healthCheckTimeout
              }
            }
          );
          
          results.healthy.push({
            name: providerName,
            status: 'healthy',
            lastCheck: Date.now()
          });
          
          // Reset consecutive failures on successful health check
          providerData.consecutiveFailures = 0;
          providerData.lastHealthCheck = Date.now();
          
        } catch (error) {
          results.unhealthy.push({
            name: providerName,
            status: 'unhealthy',
            error: error.message,
            lastCheck: Date.now()
          });
          
          // Track consecutive failures
          providerData.consecutiveFailures++;
          providerData.lastHealthCheck = Date.now();
          
          this.logger.warn(`[UnifiedModelManager] Provider ${providerName} health check failed`, {
            error: error.message,
            consecutiveFailures: providerData.consecutiveFailures
          });
        }
      }
    );
    
    await Promise.all(healthCheckPromises);
    
    this.logger.info('[UnifiedModelManager] Health check complete', {
      healthy: results.healthy.length,
      unhealthy: results.unhealthy.length,
      healthyProviders: results.healthy.map(p => p.name),
      unhealthyProviders: results.unhealthy.map(p => p.name)
    });
    
    return results;
  }

  /**
   * Execute model management operation
   * @param {string} mode - Execution mode (init, update, sync)
   * @param {Object} options - Execution options
   * @param {Array<string>} options.providers - Specific providers to process
   * @param {boolean} options.force - Force execution even with unhealthy providers
   * @param {boolean} options.skipHealthCheck - Skip initial health check
   * @param {string} options.strategy - Execution strategy override
   * @param {number} options.maxConcurrency - Max concurrent providers override
   * @returns {Promise<Object>} Execution results
   */
  async execute(mode, options = {}) {
    const {
      providers: requestedProviders = [],
      force = false,
      skipHealthCheck = false,
      strategy = this.config.strategy,
      maxConcurrency = this.config.maxConcurrency
    } = options;

    // Validate execution mode
    if (!Object.values(EXECUTION_MODES).includes(mode)) {
      throw new Error(`Invalid execution mode: ${mode}. Valid modes: ${Object.values(EXECUTION_MODES).join(', ')}`);
    }

    this.executionId = this.generateExecutionId(mode);
    this.startTime = Date.now();
    
    this.logger.info(`[UnifiedModelManager] Starting ${mode} execution`, {
      executionId: this.executionId,
      requestedProviders,
      strategy,
      dryRun: this.dryRun,
      force
    });

    try {
      // Pre-execution health check
      let healthStatus = null;
      if (!skipHealthCheck) {
        healthStatus = await this.performHealthCheck();
        
        if (!force && this.config.skipUnhealthyProviders) {
          const healthyProviderNames = healthStatus.healthy.map(p => p.name);
          this.logger.info('[UnifiedModelManager] Filtering to healthy providers only', {
            healthyProviders: healthyProviderNames
          });
        }
      }

      // Determine providers to process
      const providersToProcess = this.selectProvidersToProcess(
        requestedProviders,
        healthStatus,
        force
      );

      if (providersToProcess.length === 0) {
        throw new Error('No providers available for processing');
      }

      this.logger.info(`[UnifiedModelManager] Processing ${providersToProcess.length} providers`, {
        providers: providersToProcess
      });

      // Execute based on strategy
      const results = await this.executeWithStrategy(
        mode,
        providersToProcess,
        strategy,
        maxConcurrency
      );

      // Generate execution summary
      const summary = this.generateExecutionSummary(mode, results);
      
      this.logger.info(`[UnifiedModelManager] ${mode} execution completed`, summary);
      
      return {
        executionId: this.executionId,
        mode,
        strategy,
        dryRun: this.dryRun,
        duration: Date.now() - this.startTime,
        summary,
        results,
        healthStatus
      };

    } catch (error) {
      const duration = Date.now() - this.startTime;
      
      this.logger.error(`[UnifiedModelManager] ${mode} execution failed`, {
        executionId: this.executionId,
        error: error.message,
        duration
      });
      
      throw error;
    }
  }

  /**
   * Select providers to process based on criteria
   * @param {Array<string>} requestedProviders - Specifically requested providers
   * @param {Object} healthStatus - Health check results
   * @param {boolean} force - Force execution even with unhealthy providers
   * @returns {Array<string>} Provider names to process
   */
  selectProvidersToProcess(requestedProviders, healthStatus, force) {
    let candidateProviders = [];

    if (requestedProviders.length > 0) {
      // Use specifically requested providers
      candidateProviders = requestedProviders.filter(name => 
        this.providers.has(name) && this.providers.get(name).initialized
      );
      
      // Warn about any requested providers that are not available
      const unavailableProviders = requestedProviders.filter(name => 
        !this.providers.has(name) || !this.providers.get(name).initialized
      );
      
      if (unavailableProviders.length > 0) {
        this.logger.warn('[UnifiedModelManager] Some requested providers are unavailable', {
          unavailableProviders
        });
      }
    } else {
      // Use all initialized providers
      candidateProviders = Array.from(this.providers.entries())
        .filter(([, data]) => data.initialized)
        .map(([name]) => name);
    }

    // Filter by health status unless forced
    if (!force && healthStatus && this.config.skipUnhealthyProviders) {
      const healthyProviderNames = new Set(healthStatus.healthy.map(p => p.name));
      candidateProviders = candidateProviders.filter(name => 
        healthyProviderNames.has(name)
      );
    }

    return candidateProviders;
  }

  /**
   * Execute providers with specified strategy
   * @param {string} mode - Execution mode
   * @param {Array<string>} providers - Providers to process
   * @param {string} strategy - Execution strategy
   * @param {number} maxConcurrency - Maximum concurrency
   * @returns {Promise<Map>} Execution results
   */
  async executeWithStrategy(mode, providers, strategy, maxConcurrency) {
    switch (strategy) {
      case EXECUTION_STRATEGIES.SEQUENTIAL:
        return await this.executeSequentially(mode, providers);
        
      case EXECUTION_STRATEGIES.PARALLEL:
        return await this.executeInParallel(mode, providers, maxConcurrency);
        
      case EXECUTION_STRATEGIES.MIXED:
        return await this.executeMixed(mode, providers, maxConcurrency);
        
      default:
        throw new Error(`Unknown execution strategy: ${strategy}`);
    }
  }

  /**
   * Execute providers sequentially
   * @param {string} mode - Execution mode
   * @param {Array<string>} providers - Providers to process
   * @returns {Promise<Map>} Execution results
   */
  async executeSequentially(mode, providers) {
    const results = new Map();
    
    // Sort providers by priority
    const sortedProviders = this.sortProvidersByPriority(providers);
    
    for (const providerName of sortedProviders) {
      this.logger.info(`[UnifiedModelManager] Processing provider: ${providerName}`);
      
      const result = await this.executeProvider(mode, providerName);
      results.set(providerName, result);
      
      // Short delay between providers to avoid overwhelming systems
      await this.sleep(1000);
    }
    
    return results;
  }

  /**
   * Execute providers in parallel
   * @param {string} mode - Execution mode
   * @param {Array<string>} providers - Providers to process
   * @param {number} maxConcurrency - Maximum concurrent executions
   * @returns {Promise<Map>} Execution results
   */
  async executeInParallel(mode, providers, maxConcurrency) {
    const results = new Map();
    
    // Process providers in batches to respect concurrency limits
    for (let i = 0; i < providers.length; i += maxConcurrency) {
      const batch = providers.slice(i, i + maxConcurrency);
      
      this.logger.info(`[UnifiedModelManager] Processing batch: ${batch.join(', ')}`);
      
      const batchPromises = batch.map(async (providerName) => {
        const result = await this.executeProvider(mode, providerName);
        results.set(providerName, result);
        return { providerName, result };
      });
      
      await Promise.allSettled(batchPromises);
    }
    
    return results;
  }

  /**
   * Execute with mixed strategy (parallel aggregators, sequential direct)
   * @param {string} mode - Execution mode
   * @param {Array<string>} providers - Providers to process
   * @param {number} maxConcurrency - Maximum concurrency
   * @returns {Promise<Map>} Execution results
   */
  async executeMixed(mode, providers, maxConcurrency) {
    const results = new Map();
    
    // Separate providers by type
    const directProviders = [];
    const aggregatorProviders = [];
    
    providers.forEach(name => {
      const config = PROVIDER_CONFIGS[name];
      if (config?.type === 'aggregator') {
        aggregatorProviders.push(name);
      } else {
        directProviders.push(name);
      }
    });
    
    // Execute direct providers sequentially first
    if (directProviders.length > 0) {
      this.logger.info('[UnifiedModelManager] Processing direct providers sequentially', {
        providers: directProviders
      });
      
      const directResults = await this.executeSequentially(mode, directProviders);
      for (const [name, result] of directResults) {
        results.set(name, result);
      }
    }
    
    // Execute aggregator providers in parallel
    if (aggregatorProviders.length > 0) {
      this.logger.info('[UnifiedModelManager] Processing aggregator providers in parallel', {
        providers: aggregatorProviders
      });
      
      const aggregatorResults = await this.executeInParallel(mode, aggregatorProviders, maxConcurrency);
      for (const [name, result] of aggregatorResults) {
        results.set(name, result);
      }
    }
    
    return results;
  }

  /**
   * Execute single provider
   * @param {string} mode - Execution mode
   * @param {string} providerName - Provider name
   * @returns {Promise<Object>} Provider execution result
   */
  async executeProvider(mode, providerName) {
    const providerData = this.providers.get(providerName);
    const startTime = Date.now();
    
    this.logger.info(`[UnifiedModelManager] Starting ${mode} for provider: ${providerName}`);
    
    try {
      const result = await this.errorHandler.execute(
        async () => {
          switch (mode) {
            case EXECUTION_MODES.INIT:
              return await this.initializeProvider(providerName, providerData);
              
            case EXECUTION_MODES.UPDATE:
              return await this.updateProvider(providerName, providerData);
              
            case EXECUTION_MODES.SYNC:
              return await this.synchronizeProvider(providerName, providerData);
              
            default:
              throw new Error(`Unsupported execution mode: ${mode}`);
          }
        },
        {
          provider: providerName,
          operationType: 'model_management',
          operationName: `${mode}_provider`,
          enableRetry: true,
          retryOptions: {
            maxRetries: this.config.maxProviderRetries,
            initialDelay: this.config.retryDelay
          },
          timeoutOptions: {
            operationTimeout: providerData.config.timeout,
            totalTimeout: this.config.totalTimeout
          }
        }
      );
      
      const duration = Date.now() - startTime;
      
      this.logger.info(`[UnifiedModelManager] Provider ${providerName} ${mode} completed successfully`, {
        duration,
        modelsProcessed: result.modelsProcessed || 0,
        modelsCreated: result.modelsCreated || 0,
        modelsUpdated: result.modelsUpdated || 0
      });
      
      return {
        success: true,
        duration,
        ...result
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error(`[UnifiedModelManager] Provider ${providerName} ${mode} failed`, {
        duration,
        error: error.message
      });
      
      return {
        success: false,
        duration,
        error: error.message,
        modelsProcessed: 0,
        modelsCreated: 0,
        modelsUpdated: 0
      };
    }
  }

  /**
   * Initialize provider models
   * @param {string} providerName - Provider name
   * @param {Object} providerData - Provider data
   * @returns {Promise<Object>} Initialization result
   */
  async initializeProvider(providerName, providerData) {
    this.logger.debug(`[UnifiedModelManager] Initializing provider: ${providerName}`);
    
    if (this.dryRun) {
      // In dry-run mode, simulate fetching models without database operations
      const mockModels = await this.fetchProviderModels(providerName, providerData);
      return { 
        modelsProcessed: mockModels.length, 
        modelsCreated: mockModels.length, 
        modelsUpdated: 0, 
        dryRun: true,
        models: mockModels.map(m => ({ name: m.name, model_slug: m.model_slug }))
      };
    }
    
    return await this.processProviderModels(providerName, providerData, 'init');
  }

  /**
   * Update provider models
   * @param {string} providerName - Provider name
   * @param {Object} providerData - Provider data
   * @returns {Promise<Object>} Update result
   */
  async updateProvider(providerName, providerData) {
    this.logger.debug(`[UnifiedModelManager] Updating provider: ${providerName}`);
    
    if (this.dryRun) {
      // In dry-run mode, simulate updating models without database operations
      const mockModels = await this.fetchProviderModels(providerName, providerData);
      return { 
        modelsProcessed: mockModels.length, 
        modelsCreated: Math.floor(mockModels.length * 0.1), 
        modelsUpdated: Math.floor(mockModels.length * 0.9), 
        dryRun: true,
        models: mockModels.map(m => ({ name: m.name, model_slug: m.model_slug }))
      };
    }
    
    return await this.processProviderModels(providerName, providerData, 'update');
  }

  /**
   * Synchronize provider models
   * @param {string} providerName - Provider name
   * @param {Object} providerData - Provider data
   * @returns {Promise<Object>} Synchronization result
   */
  async synchronizeProvider(providerName, providerData) {
    this.logger.debug(`[UnifiedModelManager] Synchronizing provider: ${providerName}`);
    
    if (this.dryRun) {
      // In dry-run mode, simulate full synchronization without database operations
      const mockModels = await this.fetchProviderModels(providerName, providerData);
      return { 
        modelsProcessed: mockModels.length, 
        modelsCreated: Math.floor(mockModels.length * 0.2), 
        modelsUpdated: Math.floor(mockModels.length * 0.6), 
        modelsRemoved: Math.floor(mockModels.length * 0.1),
        dryRun: true,
        models: mockModels.map(m => ({ name: m.name, model_slug: m.model_slug }))
      };
    }
    
    return await this.processProviderModels(providerName, providerData, 'sync');
  }

  /**
   * Fetch models from provider using adapter
   * @param {string} providerName - Provider name
   * @param {Object} providerData - Provider data
   * @returns {Promise<Array>} Array of standard models
   */
  async fetchProviderModels(providerName, providerData) {
    const { adapter } = providerData;
    
    this.logger.debug(`[UnifiedModelManager] Fetching models from provider: ${providerName}`);
    
    try {
      // Try to fetch models from API
      const models = await adapter.fetchModels();
      
      this.logger.debug(`[UnifiedModelManager] Successfully fetched ${models.length} models from ${providerName}`);
      return models;
      
    } catch (error) {
      this.logger.warn(`[UnifiedModelManager] Failed to fetch models from ${providerName}, using fallback`, {
        error: error.message
      });
      
      // Use fallback models if API fetch fails
      const fallbackModels = adapter.getFallbackModels();
      return fallbackModels;
    }
  }

  /**
   * Process provider models based on execution mode
   * @param {string} providerName - Provider name
   * @param {Object} providerData - Provider data
   * @param {string} mode - Processing mode (init, update, sync)
   * @returns {Promise<Object>} Processing result
   */
  async processProviderModels(providerName, providerData, mode) {
    const { adapter } = providerData;
    
    // Fetch raw models from provider
    const rawModels = await this.fetchProviderModels(providerName, providerData);
    
    if (!rawModels || rawModels.length === 0) {
      this.logger.warn(`[UnifiedModelManager] No models fetched from ${providerName}`);
      return {
        modelsProcessed: 0,
        modelsCreated: 0,
        modelsUpdated: 0,
        modelsRemoved: 0
      };
    }
    
    this.logger.info(`[UnifiedModelManager] Processing ${rawModels.length} models for ${providerName} using ModelProcessor`);
    
    try {
      // Use ModelProcessor for comprehensive model processing
      const processingOptions = {
        mode: mode,
        createRelationships: true,
        enableDeduplication: true,
        conflictResolution: 'prefer_direct',
        batchSize: this.config.batchSize
      };
      
      const result = await this.modelProcessor.processBatch(
        providerName,
        rawModels,
        processingOptions
      );
      
      this.logger.info(`[UnifiedModelManager] ModelProcessor completed for ${providerName}`, {
        modelsProcessed: result.modelsProcessed,
        modelsCreated: result.modelsCreated,
        modelsUpdated: result.modelsUpdated,
        relationshipsCreated: result.relationshipsCreated,
        duplicatesHandled: result.duplicatesHandled,
        errors: result.errors.length,
        duration: result.duration
      });
      
      // Format result to match expected interface
      const formattedResult = {
        modelsProcessed: result.modelsProcessed,
        modelsCreated: result.modelsCreated,
        modelsUpdated: result.modelsUpdated,
        relationshipsCreated: result.relationshipsCreated,
        duplicatesHandled: result.duplicatesHandled,
        processingStats: result.stats
      };
      
      // Handle sync mode - remove stale models if needed
      if (mode === 'sync') {
        const syncResult = await this.handleSyncModeCleanup(providerName, rawModels);
        formattedResult.modelsRemoved = syncResult.modelsRemoved;
      }
      
      return formattedResult;
      
    } catch (error) {
      this.logger.error(`[UnifiedModelManager] ModelProcessor failed for ${providerName}`, {
        error: error.message,
        modelsCount: rawModels.length
      });
      throw error;
    }
  }
  
  /**
   * Handle cleanup for sync mode - remove stale models
   * @param {string} providerName - Provider name
   * @param {Array} rawModels - Current models from provider API
   * @returns {Promise<Object>} Cleanup result
   */
  async handleSyncModeCleanup(providerName, rawModels) {
    const { Model, Provider, ModelPriceScore } = db.sequelize.models;
    
    // Get provider database record
    const providerRecord = await Provider.findOne({ 
      where: { name: providerName } 
    });
    
    if (!providerRecord) {
      throw new Error(`Provider ${providerName} not found in database`);
    }
    
    // Get current model slugs from API
    const currentModelSlugs = new Set();
    for (const rawModel of rawModels) {
      const standardModel = await this.modelProcessor.standardizeModel(rawModel, {
        id: providerRecord.id,
        name: providerName,
        type: PROVIDER_CONFIGS[providerName]?.type || 'direct'
      });
      currentModelSlugs.add(standardModel.model_slug);
    }
    
    // Find existing models in database
    const existingModels = await Model.findAll({
      where: { id_provider: providerRecord.id },
      attributes: ['id', 'model_slug']
    });
    
    // Identify stale models
    const staleModelIds = existingModels
      .filter(model => !currentModelSlugs.has(model.model_slug))
      .map(model => model.id);
    
    let modelsRemoved = 0;
    if (staleModelIds.length > 0) {
      await db.sequelize.transaction(async (transaction) => {
        // Remove pricing data first
        await ModelPriceScore.destroy({
          where: { id_model: staleModelIds },
          transaction
        });
        
        // Remove models
        await Model.destroy({
          where: { id: staleModelIds },
          transaction
        });
      });
      
      modelsRemoved = staleModelIds.length;
      this.logger.info(`[UnifiedModelManager] Removed ${modelsRemoved} stale models for ${providerName}`);
    }
    
    return { modelsRemoved };
  }

  /**
   * Sort providers by priority and dependencies
   * @param {Array<string>} providers - Provider names
   * @returns {Array<string>} Sorted provider names
   */
  sortProvidersByPriority(providers) {
    return providers.sort((a, b) => {
      const configA = PROVIDER_CONFIGS[a];
      const configB = PROVIDER_CONFIGS[b];
      
      // Sort by priority first (lower number = higher priority)
      if (configA.priority !== configB.priority) {
        return configA.priority - configB.priority;
      }
      
      // Then by type (direct providers before aggregators)
      if (configA.type !== configB.type) {
        return configA.type === 'direct' ? -1 : 1;
      }
      
      // Finally by name for consistency
      return a.localeCompare(b);
    });
  }

  /**
   * Get list of healthy providers
   * @returns {Array<string>} Healthy provider names
   */
  getHealthyProviders() {
    return Array.from(this.providers.entries())
      .filter(([name, data]) => data.initialized && data.consecutiveFailures < 3)
      .map(([name]) => name);
  }

  /**
   * Generate execution summary
   * @param {string} mode - Execution mode
   * @param {Map} results - Execution results
   * @returns {Object} Execution summary
   */
  generateExecutionSummary(mode, results) {
    const summary = {
      mode,
      totalProviders: results.size,
      successfulProviders: 0,
      failedProviders: 0,
      totalModelsProcessed: 0,
      totalModelsCreated: 0,
      totalModelsUpdated: 0,
      providers: {}
    };

    for (const [providerName, result] of results) {
      if (result.success) {
        summary.successfulProviders++;
      } else {
        summary.failedProviders++;
      }
      
      summary.totalModelsProcessed += result.modelsProcessed || 0;
      summary.totalModelsCreated += result.modelsCreated || 0;
      summary.totalModelsUpdated += result.modelsUpdated || 0;
      
      summary.providers[providerName] = {
        success: result.success,
        duration: result.duration,
        modelsProcessed: result.modelsProcessed || 0,
        modelsCreated: result.modelsCreated || 0,
        modelsUpdated: result.modelsUpdated || 0,
        error: result.error || null
      };
    }

    return summary;
  }

  /**
   * Generate unique execution ID
   * @param {string} mode - Execution mode
   * @returns {string} Execution ID
   */
  generateExecutionId(mode) {
    return `${mode}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get comprehensive status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      initialized: this.providers.size > 0,
      totalProviders: this.providers.size,
      healthyProviders: this.getHealthyProviders().length,
      dryRun: this.dryRun,
      config: this.config,
      providers: Object.fromEntries(
        Array.from(this.providers.entries()).map(([name, data]) => [
          name,
          {
            initialized: data.initialized,
            type: data.config.type,
            priority: data.config.priority,
            consecutiveFailures: data.consecutiveFailures,
            lastHealthCheck: data.lastHealthCheck,
            error: data.error || null
          }
        ])
      ),
      errorHandler: this.errorHandler.getHealthStatus()
    };
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.logger.info('[UnifiedModelManager] Cleaning up resources...');
    
    try {
      // Close database connection
      if (db && db.close) {
        await db.close();
      }
      
      // Reset error handler
      this.errorHandler.reset();
      
      // Clear providers
      this.providers.clear();
      this.providerStatus.clear();
      
      this.logger.info('[UnifiedModelManager] Cleanup completed');
    } catch (error) {
      this.logger.error('[UnifiedModelManager] Cleanup failed', error);
    }
  }
}

module.exports = { 
  UnifiedModelManager, 
  EXECUTION_MODES, 
  EXECUTION_STRATEGIES,
  PROVIDER_CONFIGS 
};