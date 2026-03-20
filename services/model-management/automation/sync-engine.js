/**
 * Model Synchronization Engine
 * 
 * Core engine for synchronizing AI models from providers with intelligent
 * diff detection, conflict resolution, and comprehensive error handling.
 */

const { EventEmitter } = require('events');
const db = require('../../../database');
const config = require('../../../config/config');
const { IDEOGRAM_MODELS_AND_PRICING, ideogram_capabilities } = require('../../../scripts/update-models-info/update-ideogram-models');

/**
 * ModelSyncEngine const IntelligentCache = require('./utils/intelligent-cache');

class
 */
class ModelSyncEngine extends EventEmitter {
  /**
   * @param {Object} options - Engine options
   * @param {Object} options.monitoring - Monitoring service instance
   * @param {Object} options.config - Engine configuration
   */
  constructor(options = {}) {
    super();
    
    const { monitoring, config = {} } = options;
    
    this.monitoring = monitoring;
    this.logger = monitoring.getLogger('sync-engine');
    this.metrics = monitoring.getMetrics();
    
    this.config = {
      batchSize: 50,
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 300000,
      enableDiffDetection: true,
      enableConflictResolution: true,
      preserveCustomFields: true,
      ...config
    };
    
    // Provider handlers
    this.providerHandlers = new Map();
    
    this.logger.info('ModelSyncEngine initialized', {
      batchSize: this.config.batchSize,
      timeout: this.config.timeout
    });
  }

  /**
   * Initialize the sync engine
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.logger.info('Initializing ModelSyncEngine');
      
      // Register provider handlers
      await this.registerProviderHandlers();
      
      // Validate database connection
      await db.sequelize.authenticate();
      
      this.logger.info('ModelSyncEngine initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize ModelSyncEngine', error);
      throw error;
    }
  }

  /**
   * Register handlers for different provider types
   * @returns {Promise<void>}
   */
  async registerProviderHandlers() {
    // OpenAI handler
    this.providerHandlers.set('openai', {
      fetchModels: this.fetchOpenAIModels.bind(this),
      transformModel: this.transformOpenAIModel.bind(this),
      validateModel: this.validateOpenAIModel.bind(this)
    });

    // Anthropic handler
    this.providerHandlers.set('anthropic', {
      fetchModels: this.fetchAnthropicModels.bind(this),
      transformModel: this.transformAnthropicModel.bind(this),
      validateModel: this.validateAnthropicModel.bind(this)
    });

    // Together AI handler
    this.providerHandlers.set('together', {
      fetchModels: this.fetchTogetherModels.bind(this),
      transformModel: this.transformTogetherModel.bind(this),
      validateModel: this.validateTogetherModel.bind(this)
    });

    // OpenRouter handler
    this.providerHandlers.set('openrouter', {
      fetchModels: this.fetchOpenRouterModels.bind(this),
      transformModel: this.transformOpenRouterModel.bind(this),
      validateModel: this.validateOpenRouterModel.bind(this)
    });

    // Ideogram handler
    this.providerHandlers.set('ideogram', {
      fetchModels: this.fetchIdeogramModels.bind(this),
      transformModel: this.transformIdeogramModel.bind(this),
      validateModel: this.validateIdeogramModel.bind(this)
    });

    // DeepSeek handler
    this.providerHandlers.set('deepseek', {
      fetchModels: this.fetchDeepSeekModels.bind(this),
      transformModel: this.transformDeepSeekModel.bind(this),
      validateModel: this.validateDeepSeekModel.bind(this)
    });

    this.logger.debug('Provider handlers registered', {
      providers: Array.from(this.providerHandlers.keys())
    });
  }

  /**
   * Check if a provider is an aggregator (has aggregated models)
   * @param {Object} provider - Provider instance
   * @returns {Promise<boolean>} True if provider is an aggregator
   */
  async isProviderAggregator(provider) {
    try {
      const { AggregatedModel } = db.models;
      const aggregatedCount = await AggregatedModel.count({
        where: { id_aggregator_provider: provider.id }
      });
      return aggregatedCount > 0;
    } catch (error) {
      this.logger.warn('Error checking if provider is aggregator', {
        provider: provider.name,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Synchronize models for a specific provider
   * @param {Object} provider - Provider instance
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Sync result
   */
  async syncProvider(provider, options = {}) {
    const {
      syncType = 'incremental',
      timeout = this.config.timeout,
      correlationId = null
    } = options;

    // Check if provider is an aggregator - skip synchronization
    const isAggregator = await this.isProviderAggregator(provider);
    if (isAggregator) {
      this.logger.info('Skipping aggregator provider synchronization', {
        correlationId,
        provider: provider.name,
        reason: 'Provider is an aggregator and should not be synchronized directly'
      });
      
      return {
        success: true,
        skipped: true,
        reason: 'aggregator_provider',
        processed: 0,
        created: 0,
        updated: 0,
        deactivated: 0,
        invalid: 0,
        valid: 0,
        invalidModels: [],
        statistics: {
          fetchTime: 0,
          transformationSuccess: 0,
          validationErrors: 0
        }
      };
    }

    // Map syncType to valid enum values
    const validSyncType = this.mapSyncTypeToValidEnum(syncType);

    const timer = this.metrics.startTimer('provider_sync_duration', {
      provider: provider.name,
      syncType: validSyncType
    });

    const syncId = `${provider.name}-${Date.now()}`;
    let syncLog = null; // Declare syncLog outside try block
    
    try {
      this.logger.info('Starting provider synchronization', {
        correlationId,
        syncId,
        provider: provider.name,
        syncType: validSyncType
      });

      this.emit('syncStarted', {
        syncId,
        provider: provider.name,
        syncType: validSyncType,
        correlationId
      });

      // Record sync start in database
      const { ModelSyncLog } = db.models;
      syncLog = await ModelSyncLog.createExecution(
        syncId, // executionId
        provider.id, // providerId
        validSyncType, // syncType
        { correlationId, syncId } // options
      );

      // Execute the synchronization
      const result = await Promise.race([
        this.executeSynchronization(provider, validSyncType, correlationId),
        this.createTimeoutPromise(timeout)
      ]);

      // Record success
      await syncLog.markCompleted({
        modelsProcessed: result.processed,
        modelsCreated: result.created,
        modelsUpdated: result.updated,
        modelsDeactivated: result.deactivated,
        statistics: result.statistics
      });

      this.metrics.endTimer(timer);
      this.metrics.increment('provider_syncs_completed', 1, {
        provider: provider.name,
        syncType: validSyncType,
        status: 'success'
      });

      this.logger.info('Provider synchronization completed', {
        correlationId,
        syncId,
        provider: provider.name,
        ...result
      });

      this.emit('syncCompleted', {
        syncId,
        provider: provider.name,
        result,
        correlationId
      });

      return {
        syncId,
        provider: provider.name,
        status: 'success',
        ...result
      };

    } catch (error) {
      this.metrics.endTimer(timer);
      this.metrics.increment('provider_syncs_completed', 1, {
        provider: provider.name,
        syncType: validSyncType,
        status: 'error'
      });

      // Record failure
      if (syncLog) {
        await syncLog.markFailed(error.message, {
          errorType: error.constructor.name,
          stack: error.stack
        });
      }

      this.logger.error('Provider synchronization failed', {
        correlationId,
        syncId,
        provider: provider.name,
        error: error.message
      });

      this.emit('syncFailed', {
        syncId,
        provider: provider.name,
        error,
        correlationId
      });

      throw error;
    }
  }

  /**
   * Execute the actual synchronization process
   * @param {Object} provider - Provider instance
   * @param {string} syncType - Type of synchronization
   * @param {string} correlationId - Correlation ID
   * @returns {Promise<Object>} Sync result
   */
  async executeSynchronization(provider, syncType, correlationId) {
    const handler = this.providerHandlers.get(provider.name.toLowerCase());
    
    if (!handler) {
      throw new Error(`No handler found for provider: ${provider.name}`);
    }

    // Fetch models from provider
    this.logger.debug('Fetching models from provider', {
      correlationId,
      provider: provider.name
    });

    const fetchedModels = await handler.fetchModels(provider);
    
    this.logger.debug('Models fetched successfully', {
      correlationId,
      provider: provider.name,
      count: fetchedModels.length
    });

    // Transform and validate models
    const validModels = [];
    const invalidModels = [];

    for (const rawModel of fetchedModels) {
      try {
        const transformedModel = await handler.transformModel(rawModel, provider);
        const isValid = await handler.validateModel(transformedModel);
        
        if (isValid) {
          validModels.push(transformedModel);
        } else {
          invalidModels.push({
            model: rawModel,
            reason: 'Validation failed'
          });
        }
      } catch (error) {
        invalidModels.push({
          model: rawModel,
          reason: error.message
        });
      }
    }

    this.logger.debug('Model validation completed', {
      correlationId,
      provider: provider.name,
      valid: validModels.length,
      invalid: invalidModels.length
    });

    // Synchronize with database
    const syncResult = await this.synchronizeWithDatabase(
      provider,
      validModels,
      syncType,
      correlationId
    );

    return {
      processed: fetchedModels.length,
      valid: validModels.length,
      invalid: invalidModels.length,
      invalidModels,
      ...syncResult,
      statistics: {
        fetchTime: Date.now(),
        validationErrors: invalidModels.length,
        transformationSuccess: validModels.length
      }
    };
  }

  /**
   * Synchronize validated models with database
   * @param {Object} provider - Provider instance
   * @param {Array} models - Array of validated models
   * @param {string} syncType - Type of synchronization
   * @param {string} correlationId - Correlation ID
   * @returns {Promise<Object>} Database sync result
   */
  async synchronizeWithDatabase(provider, models, syncType, correlationId) {
    this.logger.debug('synchronizeWithDatabase called with:', {
      provider: provider ? { id: provider.id, name: provider.name } : 'undefined',
      modelsCount: models ? models.length : 0,
      syncType,
      correlationId
    });

    const { Model } = db.models;
    const transaction = await db.sequelize.transaction();
    
    try {
      this.logger.debug('Transaction started');
      
      // Get existing models for this provider
      const existingModels = await Model.findAll({
        where: { id_provider: provider.id },
        transaction
      });
      
      this.logger.debug('Found existing models:', { count: existingModels.length });

      // Create a map for quick lookup
      const existingModelMap = new Map();
      existingModels.forEach(model => {
        existingModelMap.set(model.model_slug, model);
      });

      let createdCount = 0;
      let updatedCount = 0;
      let errorCount = 0;

      for (const modelData of models) {
        try {
          this.logger.debug('Processing model:', { 
            model_slug: modelData.model_slug || modelData.name 
          });
          
          const existingModel = existingModelMap.get(modelData.model_slug);
          
          if (existingModel) {
            this.logger.debug('Updating existing model:', { id: existingModel.id });
            await this.updateExistingModel(existingModel, modelData, transaction);
            
            // Handle pricing data for Ideogram models
            if (provider.name.toLowerCase() === 'ideogram' && modelData.pricing_data) {
              await this.createOrUpdatePricingData(existingModel, modelData.pricing_data, transaction);
            }
            
            // Handle capability mapping for Ideogram models
            if (provider.name.toLowerCase() === 'ideogram' && modelData.capabilities) {
              await this.createCapabilityRelationships(existingModel, modelData.capabilities, transaction);
            }
            
            updatedCount++;
          } else {
            this.logger.debug('Creating new model');
            const newModel = await this.createNewModel(provider, modelData, transaction);
            
            // Handle pricing data for Ideogram models
            if (provider.name.toLowerCase() === 'ideogram' && modelData.pricing_data) {
              await this.createOrUpdatePricingData(newModel, modelData.pricing_data, transaction);
            }
            
            // Handle capability mapping for Ideogram models
            if (provider.name.toLowerCase() === 'ideogram' && modelData.capabilities) {
              await this.createCapabilityRelationships(newModel, modelData.capabilities, transaction);
            }
            
            // For aggregator providers, create aggregated relationships
            if (provider.provider_type === 'aggregator' && modelData.metadata?.sourceProvider) {
              await this.createAggregatedRelationship(newModel, modelData, provider, transaction);
            }
            
            createdCount++;
          }
        } catch (error) {
          this.logger.error('Error processing model:', {
            error: error.message,
            modelData: modelData
          });
          errorCount++;
          // Continue with other models instead of failing completely
        }
      }

      this.logger.info('Sync summary:', { createdCount, updatedCount, errorCount });

      await transaction.commit();
      this.logger.debug('Transaction committed successfully');
      
      return { createdCount, updatedCount, errorCount };
    } catch (error) {
      this.logger.error('Error in synchronizeWithDatabase:', {
        error: error.message,
        stack: error.stack
      });
      await transaction.rollback();
      this.logger.debug('Transaction rolled back');
      throw error;
    }
  }

  /**
   * Detect changes between existing model and new model data
   * @param {Object} existingModel - Existing model instance
   * @param {Object} newModelData - New model data
   * @returns {Promise<boolean>} Whether changes were detected
   */
  async detectModelChanges(existingModel, newModelData) {
    if (!this.config.enableDiffDetection) {
      return true; // Always update if diff detection is disabled
    }

    const fieldsToCheck = [
      'model_type',
      'description',
      'context_window',
      'max_output_tokens',
      'is_deprecated',
      'pricing_input',
      'pricing_output',
      'capabilities',
      'metadata'
    ];

    for (const field of fieldsToCheck) {
      const existingValue = existingModel[field];
      const newValue = newModelData[field];
      
      // Handle JSON fields
      if (field === 'capabilities' || field === 'metadata') {
        if (JSON.stringify(existingValue) !== JSON.stringify(newValue)) {
          return true;
        }
      } else if (existingValue !== newValue) {
        return true;
      }
    }

    return false;
  }

  /**
   * Update existing model with new data
   * @param {Object} existingModel - Existing model instance
   * @param {Object} modelData - New model data
   * @param {Object} transaction - Database transaction
   * @returns {Promise<void>}
   */
  async updateExistingModel(existingModel, modelData, transaction) {
    const updateData = { ...modelData };
    
    // Preserve custom fields if configured
    if (this.config.preserveCustomFields) {
      delete updateData.id;
      delete updateData.created_at;
      
      // Preserve manually set fields
      if (existingModel.manual_override) {
        const preserveFields = ['pricing_input', 'pricing_output', 'is_deprecated'];
        preserveFields.forEach(field => {
          if (existingModel[`${field}_manual`]) {
            delete updateData[field];
          }
        });
      }
    }

    updateData.updated_at = new Date();

    // Rimuovi campi undefined o null per evitare errori MySQL
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined || updateData[key] === null) {
        delete updateData[key];
      }
    });

    await existingModel.update(updateData, { transaction });
  }

  /**
   * Create new model in database
   * @param {Object} provider - Provider instance
   * @param {Object} modelData - Model data
   * @param {Object} transaction - Database transaction
   * @returns {Promise<void>}
   */
  async createNewModel(provider, modelData, transaction) {
    const { Model } = db.models;
    
    this.logger.debug('createNewModel called with:', {
      provider: provider ? { id: provider.id, name: provider.name } : 'undefined',
      modelData: modelData,
      transaction: !!transaction
    });
    
    // Usiamo solo i campi che esistono nel modello del database
    const modelRecord = {
      id_provider: provider.id,
      model_slug: modelData.model_slug,
      api_model_id: modelData.api_model_id,
      name: modelData.name,
      display_name: modelData.display_name,
      description: modelData.description,
      max_tokens: modelData.max_tokens !== undefined ? modelData.max_tokens : 16000,
      is_active: modelData.is_active !== undefined ? modelData.is_active : true,
      has_stats_aa: modelData.has_stats_aa !== undefined ? modelData.has_stats_aa : false
    };

    this.logger.debug('Initial modelRecord:', modelRecord);

    // Assicuriamoci che tutti i campi obbligatori siano presenti
    if (!modelRecord.model_slug) {
      throw new Error(`model_slug is required for model creation`);
    }
    if (!modelRecord.name) {
      throw new Error(`name is required for model creation`);
    }
    if (!modelRecord.display_name) {
      throw new Error(`display_name is required for model creation`);
    }

    // Rimuovi campi undefined o null per evitare errori MySQL
    Object.keys(modelRecord).forEach(key => {
      if (modelRecord[key] === undefined || modelRecord[key] === null) {
        this.logger.debug(`Removing null/undefined field: ${key}`);
        delete modelRecord[key];
      }
    });

    this.logger.debug('Final modelRecord before Model.create:', modelRecord);

    try {
      const result = await Model.create(modelRecord, { transaction });
      this.logger.info('Model created successfully:', { id: result.id, model_slug: result.model_slug });
      return result;
    } catch (error) {
      this.logger.error('Error creating model:', {
        error: error.message,
        modelRecord: modelRecord,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Create aggregated model relationship for aggregator providers
   * @param {Object} model - Created model instance
   * @param {Object} modelData - Model data with metadata
   * @param {Object} provider - Aggregator provider
   * @param {Object} transaction - Database transaction
   */
  async createAggregatedRelationship(model, modelData, provider, transaction) {
    try {
      const { Provider, AggregatedModel, AggregatorPricingTier } = db.models;

      // Find source provider
      const sourceProvider = await Provider.findOne({
        where: { name: modelData.metadata.sourceProvider },
        transaction
      });

      if (!sourceProvider) {
        this.logger.warn(`Source provider not found: ${modelData.metadata.sourceProvider}`, {
          aggregator: provider.name,
          model: model.model_slug
        });
        return;
      }

      // Find or create default pricing tier
      let pricingTier = await AggregatorPricingTier.findOne({
        where: {
          id_aggregator_provider: provider.id,
          tier_name: 'pay_as_you_go'
        },
        transaction
      });

      if (!pricingTier) {
        pricingTier = await AggregatorPricingTier.create({
          id_aggregator_provider: provider.id,
          tier_name: 'pay_as_you_go',
          markup_percentage: 20.0, // 20% markup
          markup_fixed: 0.001,
          description: 'Default aggregator pricing tier',
          is_active: true,
          effective_from: new Date()
        }, { transaction });
        
        this.logger.debug('Created pricing tier for aggregator', {
          aggregator: provider.name,
          tier: pricingTier.tier_name
        });
      }

      // Create aggregated model relationship
      await AggregatedModel.upsert({
        id_aggregator_provider: provider.id,
        id_source_provider: sourceProvider.id,
        id_model: model.id,
        source_model_id: modelData.api_model_id,
        id_pricing_tier: pricingTier.id,
        is_available: true
      }, {
        transaction,
        conflictFields: ['id_aggregator_provider', 'source_model_id']
      });

      this.logger.info('Created aggregated relationship', {
        model: model.model_slug,
        aggregator: provider.name,
        sourceProvider: modelData.metadata.sourceProvider
      });

    } catch (error) {
      this.logger.error('Error creating aggregated relationship', {
        error: error.message,
        model: model.model_slug,
        aggregator: provider.name,
        sourceProvider: modelData.metadata?.sourceProvider
      });
      // Don't throw - continue with model creation even if relationship fails
    }
  }

  /**
   * Fetch models from OpenAI
   * @param {Object} provider - Provider instance
   * @returns {Promise<Array>} Array of models
   */
  async fetchOpenAIModels(provider) {
    // Validate API key
    if (!config.openai.apiKey) {
      this.logger.error('OpenAI API key not configured');
      throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
    }
    
    try {
      // Call the OpenAI API to get models
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });
      
      if (!response.ok) {
        this.logger.error('OpenAI API call failed', {
          status: response.status,
          statusText: response.statusText,
          provider: provider.name
        });
        throw new Error(`OpenAI API call failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const models = data.data || [];
      
      this.logger.info('Successfully fetched OpenAI models from API', {
        provider: provider.name,
        modelCount: models.length
      });
      
      return models;
    } catch (error) {
      this.logger.error('Error fetching OpenAI models', {
        provider: provider.name,
        error: error.message
      });
      throw new Error(`Failed to fetch OpenAI models: ${error.message}`);
    }
  }



  /**
   * Transform OpenAI model to our format
   * @param {Object} rawModel - Raw model from OpenAI
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object>} Transformed model
   */
  async transformOpenAIModel(rawModel, provider) {
    const contextWindow = this.getOpenAIContextWindow(rawModel.id);
    const modelType = this.getOpenAIModelType(rawModel.id);
    
    return {
      model_slug: `${rawModel.id}-${provider.name}`,
      api_model_id: rawModel.id,
      name: rawModel.id,
      display_name: this.getOpenAIDisplayName(rawModel.id),
      description: this.getOpenAIDescription(rawModel.id),
      max_tokens: contextWindow,
      is_active: true,
      has_stats_aa: false,
      model_type: modelType,
      pricing_input: this.getOpenAIPricing(rawModel.id, 'input'),
      pricing_output: this.getOpenAIPricing(rawModel.id, 'output')
    };
  }

  /**
   * Get OpenAI context window for specific models
   */
  getOpenAIContextWindow(modelId) {
    const contextMap = {
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'gpt-4-turbo': 128000,
      'gpt-4': 8192,
      'gpt-4-32k': 32768,
      'gpt-3.5-turbo': 16385,
      'gpt-3.5-turbo-16k': 16385,
      'text-embedding-ada-002': 8191,
      'text-embedding-3-small': 8191,
      'text-embedding-3-large': 8191
    };
    return contextMap[modelId] || 8192;
  }

  /**
   * Get OpenAI model type
   */
  getOpenAIModelType(modelId) {
    if (modelId.includes('embedding')) return 'embedding';
    if (modelId.includes('gpt')) return 'chat';
    return 'text';
  }

  /**
   * Get OpenAI display name
   */
  getOpenAIDisplayName(modelId) {
    const displayMap = {
      'gpt-4o': 'GPT-4o',
      'gpt-4o-mini': 'GPT-4o Mini',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'gpt-4': 'GPT-4',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'text-embedding-ada-002': 'Text Embedding Ada 002',
      'text-embedding-3-small': 'Text Embedding 3 Small',
      'text-embedding-3-large': 'Text Embedding 3 Large'
    };
    return displayMap[modelId] || modelId;
  }

  /**
   * Get OpenAI description
   */
  getOpenAIDescription(modelId) {
    const descriptionMap = {
      'gpt-4o': 'Most advanced GPT-4 model with multimodal capabilities',
      'gpt-4o-mini': 'Faster and cheaper GPT-4 model with high intelligence',
      'gpt-4-turbo': 'High-intelligence model with improved instruction following',
      'gpt-4': 'GPT-4 model for complex reasoning tasks',
      'gpt-3.5-turbo': 'Fast, inexpensive model for simple tasks',
      'text-embedding-ada-002': 'Text embedding model for similarity and search',
      'text-embedding-3-small': 'Small text embedding model with improved performance',
      'text-embedding-3-large': 'Large text embedding model with best performance'
    };
    return descriptionMap[modelId] || `OpenAI model: ${modelId}`;
  }

  /**
   * Get OpenAI pricing (per 1K tokens)
   */
  getOpenAIPricing(modelId, type) {
    const pricingMap = {
      'gpt-4o': { input: 0.0025, output: 0.01 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
      'text-embedding-ada-002': { input: 0.0001, output: 0.0001 },
      'text-embedding-3-small': { input: 0.00002, output: 0.00002 },
      'text-embedding-3-large': { input: 0.00013, output: 0.00013 }
    };
    return pricingMap[modelId]?.[type] || 0.001;
  }

  /**
   * Validate OpenAI model
   * @param {Object} model - Transformed model
   * @returns {Promise<boolean>} Whether model is valid
   */
  async validateOpenAIModel(model) {
    // Basic validation - check fields that actually exist in transformed model
    return !!(model.name && 
             model.api_model_id && 
             model.max_tokens > 0);
  }

  /**
   * Fetch models from Anthropic
   * @param {Object} provider - Provider instance
   * @returns {Promise<Array>} Array of models
   */
  async fetchAnthropicModels(provider) {
    // Validate API key
    if (!config.anthropic.apiKey) {
      this.logger.error('Anthropic API key not configured');
      throw new Error('Anthropic API key not configured. Please set ANTHROPIC_API_KEY environment variable.');
    }
    
    try {
      // Call the Anthropic API to get models
      const response = await fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': config.anthropic.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });
      
      if (!response.ok) {
        this.logger.error('Anthropic API call failed', {
          status: response.status,
          statusText: response.statusText,
          provider: provider.name
        });
        throw new Error(`Anthropic API call failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const models = data.data || [];
      
      this.logger.info('Successfully fetched Anthropic models from API', {
        provider: provider.name,
        modelCount: models.length
      });
      
      return models;
    } catch (error) {
      this.logger.error('Error fetching Anthropic models', {
        provider: provider.name,
        error: error.message
      });
      throw new Error(`Failed to fetch Anthropic models: ${error.message}`);
    }
  }



  /**
   * Transform Anthropic model to our format
   * @param {Object} rawModel - Raw model from Anthropic
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object>} Transformed model
   */
  async transformAnthropicModel(rawModel, provider) {
    const modelId = rawModel.id || rawModel.name;
    const contextWindow = this.getAnthropicContextWindow(modelId);
    
    return {
      model_slug: `${modelId}-${provider.name}`,
      api_model_id: modelId,
      name: modelId,
      display_name: rawModel.display_name || this.getAnthropicDisplayName(modelId),
      description: rawModel.description || this.getAnthropicDescription(modelId),
      max_tokens: contextWindow,
      is_active: true,
      has_stats_aa: false,
      model_type: 'chat',
      pricing_input: this.getAnthropicPricing(modelId, 'input'),
      pricing_output: this.getAnthropicPricing(modelId, 'output')
    };
  }

  /**
   * Get Anthropic context window for specific models
   */
  getAnthropicContextWindow(modelId) {
    const contextMap = {
      'claude-3-5-sonnet-20241022': 200000,
      'claude-3-5-haiku-20241022': 200000,
      'claude-3-opus-20240229': 200000,
      'claude-3-sonnet-20240229': 200000,
      'claude-3-haiku-20240307': 200000,
      'claude-2.1': 200000,
      'claude-2.0': 100000,
      'claude-instant-1.2': 100000
    };
    return contextMap[modelId] || 200000;
  }

  /**
   * Get Anthropic display name
   */
  getAnthropicDisplayName(modelId) {
    const displayMap = {
      'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
      'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
      'claude-3-opus-20240229': 'Claude 3 Opus',
      'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
      'claude-3-haiku-20240307': 'Claude 3 Haiku',
      'claude-2.1': 'Claude 2.1',
      'claude-2.0': 'Claude 2.0',
      'claude-instant-1.2': 'Claude Instant 1.2'
    };
    return displayMap[modelId] || modelId;
  }

  /**
   * Get Anthropic description
   */
  getAnthropicDescription(modelId) {
    const descriptionMap = {
      'claude-3-5-sonnet-20241022': 'Most intelligent Claude model with best-in-class performance',
      'claude-3-5-haiku-20241022': 'Fastest Claude model with strong performance for daily tasks',  
      'claude-3-opus-20240229': 'Most powerful Claude model for highly complex tasks',
      'claude-3-sonnet-20240229': 'Balanced model for complex tasks with good speed',
      'claude-3-haiku-20240307': 'Fastest and most compact model for near-instant responses',
      'claude-2.1': 'Claude 2.1 with improved accuracy and longer context',
      'claude-2.0': 'Claude 2.0 conversational AI model',
      'claude-instant-1.2': 'Fast and affordable Claude model for simple tasks'
    };
    return descriptionMap[modelId] || `Anthropic Claude model: ${modelId}`;
  }

  /**
   * Get Anthropic pricing (per 1K tokens)
   */
  getAnthropicPricing(modelId, type) {
    const pricingMap = {
      'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
      'claude-3-5-haiku-20241022': { input: 0.00025, output: 0.00125 },
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
      'claude-2.1': { input: 0.008, output: 0.024 },
      'claude-2.0': { input: 0.008, output: 0.024 },
      'claude-instant-1.2': { input: 0.00163, output: 0.00551 }
    };
    return pricingMap[modelId]?.[type] || 0.003;
  }

  /**
   * Validate Anthropic model
   * @param {Object} model - Transformed model
   * @returns {Promise<boolean>} Whether model is valid
   */
  async validateAnthropicModel(model) {
    // Basic validation - check fields that actually exist in transformed model
    return !!(model.name && 
             model.api_model_id && 
             model.max_tokens > 0);
  }

  /**
   * Fetch models from Together AI
   * @param {Object} provider - Provider instance
   * @returns {Promise<Array>} Array of models
   */
  async fetchTogetherModels(provider) {
    try {
      // Call the Together AI API to get models
      const response = await fetch('https://api.together.xyz/v1/models', {
        headers: {
          'Authorization': `Bearer ${config.together.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Together AI API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      this.logger.error('Error fetching Together AI models', {
        provider: provider.name,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Transform Together AI model to our format
   * @param {Object} rawModel - Raw model from Together AI
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object>} Transformed model
   */
  async transformTogetherModel(rawModel, provider) {
    // Detect source provider from model ID/name
    const sourceProvider = this.detectSourceProvider(rawModel.id || rawModel.name);
    
    return {
      model_slug: `${rawModel.name || rawModel.id}-${provider.name}`,
      api_model_id: rawModel.id,
      name: rawModel.name || rawModel.id,
      display_name: rawModel.name || rawModel.id,
      description: `Together AI model: ${rawModel.name || rawModel.id}`,
      max_tokens: rawModel.context_length || 4096,
      is_active: true,
      has_stats_aa: false,
      metadata: {
        sourceProvider: sourceProvider,
        organization: rawModel.organization,
        pricing: rawModel.pricing
      }
    };
  }

  /**
   * Validate Together AI model
   * @param {Object} model - Transformed model
   * @returns {Promise<boolean>} Whether model is valid
   */
  async validateTogetherModel(model) {
    // Basic validation - check fields that actually exist in transformed model
    return !!(model.name && 
             model.api_model_id && 
             model.max_tokens > 0);
  }

  /**
   * Fetch models from OpenRouter
   * @param {Object} provider - Provider instance
   * @returns {Promise<Array>} Array of models
   */
  async fetchOpenRouterModels(provider) {
    try {
      // Call the OpenRouter API to get models
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${config.openrouter.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      this.logger.error('Error fetching OpenRouter models', {
        provider: provider.name,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Transform OpenRouter model to our format
   * @param {Object} rawModel - Raw model from OpenRouter
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object>} Transformed model
   */
  async transformOpenRouterModel(rawModel, provider) {
    // Detect source provider from model ID/name
    const sourceProvider = this.detectSourceProvider(rawModel.id);
    
    return {
      model_slug: `${rawModel.id}-${provider.name}`,
      api_model_id: rawModel.id,
      name: rawModel.name || rawModel.id,
      display_name: rawModel.name || rawModel.id,
      description: rawModel.description || `OpenRouter model: ${rawModel.name}`,
      max_tokens: rawModel.context_length || 4096,
      is_active: true,
      has_stats_aa: false,
      metadata: {
        sourceProvider: sourceProvider,
        top_provider: rawModel.top_provider,
        pricing: rawModel.pricing
      }
    };
  }

  /**
   * Validate OpenRouter model
   * @param {Object} model - Transformed model
   * @returns {Promise<boolean>} Whether model is valid
   */
  async validateOpenRouterModel(model) {
    return !!(model.name && model.max_tokens > 0);
  }

  /**
   * Fetch models from Ideogram configuration
   * @param {Object} provider - Provider instance
   * @returns {Promise<Array>} Array of models
   */
  async fetchIdeogramModels(provider) {
    try {
      this.logger.info('Fetching Ideogram models from configuration', {
        provider: provider.name,
        modelCount: IDEOGRAM_MODELS_AND_PRICING.length
      });

      // Transform configuration data to expected API format
      const models = IDEOGRAM_MODELS_AND_PRICING.map(configModel => ({
        api_model_id: configModel.api_model_id,
        name: configModel.name,
        display_name: configModel.display_name,
        model_slug: configModel.model_slug,
        description: `${configModel.display_name} - ${configModel.rendering_speed} rendering speed`,
        type: 'image',
        capabilities: ['image-generation', 'text-to-image'],
        rendering_speed: configModel.rendering_speed,
        // Include pricing fields directly on the model object
        generate: configModel.generate,
        remix: configModel.remix,
        edit: configModel.edit,
        reframe: configModel.reframe,
        'replace-background': configModel['replace-background']
      }));

      this.logger.info('Successfully loaded Ideogram models from configuration', {
        provider: provider.name,
        modelCount: models.length
      });

      return models;
    } catch (error) {
      this.logger.error('Error loading Ideogram models from configuration', {
        provider: provider.name,
        error: error.message
      });
      throw new Error(`Failed to load Ideogram models from configuration: ${error.message}`);
    }
  }

  /**
   * Transform Ideogram model to our format
   * @param {Object} rawModel - Raw model from Ideogram configuration
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object>} Transformed model
   */
  async transformIdeogramModel(rawModel, provider) {
    // Create pricing data structure for price_image field
    const pricingData = {
      Generate: rawModel.generate || null,
      Remix: rawModel.remix || null,
      Edit: rawModel.edit || null,
      Reframe: rawModel.reframe || null,
      "Replace BG": rawModel['replace-background'] || null
    };

    // Remove null values to keep JSON clean
    Object.keys(pricingData).forEach(key => {
      if (pricingData[key] === null) {
        delete pricingData[key];
      }
    });

    return {
      model_slug: rawModel.model_slug, // Use model_slug from configuration
      api_model_id: rawModel.api_model_id,
      name: rawModel.name,
      display_name: rawModel.display_name || rawModel.name,
      description: rawModel.description || `${rawModel.display_name || rawModel.name} - Image generation model`,
      max_tokens: 0, // Image models don't use tokens
      is_active: true,
      has_stats_aa: false,
      // Add pricing information for later use in sync process
      pricing_data: {
        // Store JSON pricing data in price_image field (now TEXT type)
        price_image: JSON.stringify(pricingData),
        price_1m_input_tokens: 0, // Not applicable for image models
        price_1m_output_tokens: 0, // Not applicable for image models
        source: 'ideogram-manual'
      },
      // Add capability information for later use in sync process
      capabilities: ideogram_capabilities,
      // Add metadata for image-specific configurations
      metadata: {
        model_type: 'image',
        rendering_speed: rawModel.rendering_speed,
        supported_operations: Object.keys(pricingData)
      }
    };
  }

  /**
   * Validate Ideogram model
   * @param {Object} model - Transformed model
   * @returns {Promise<boolean>} Whether model is valid
   */
  async validateIdeogramModel(model) {
    return !!(model.name && model.api_model_id);
  }

  /**
   * Fetch models from DeepSeek
   * @param {Object} provider - Provider instance
   * @returns {Promise<Array>} Array of models
   */
  async fetchDeepSeekModels(provider) {
    try {
      // Call the DeepSeek API to get models
      const response = await fetch('https://api.deepseek.com/models', {
        headers: {
          'Authorization': `Bearer ${config.deepseek.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        this.logger.warn('DeepSeek API unavailable, using fallback models', {
          status: response.status,
          provider: provider.name
        });
        // Fallback to known DeepSeek models if API is unavailable
        return [
          {
            id: 'deepseek-chat',
            name: 'DeepSeek Chat',
            description: 'DeepSeek Chat model for conversations',
            context_length: 32768,
            pricing: {
              prompt: 0.0014,
              completion: 0.0028
            }
          },
          {
            id: 'deepseek-coder',
            name: 'DeepSeek Coder',
            description: 'DeepSeek Coder model for programming tasks',
            context_length: 16384,
            pricing: {
              prompt: 0.0014,
              completion: 0.0028
            }
          }
        ];
      }
      
      const data = await response.json();
      return data.data || data.models || [];
    } catch (error) {
      this.logger.error('Error fetching DeepSeek models', {
        provider: provider.name,
        error: error.message
      });
      
      // Fallback to known models if API call fails
      this.logger.warn('Using fallback DeepSeek models due to API error');
      return [
        {
          id: 'deepseek-chat',
          name: 'DeepSeek Chat',
          description: 'DeepSeek Chat model for conversations',
          context_length: 32768,
          pricing: {
            prompt: 0.0014,
            completion: 0.0028
          }
        },
        {
          id: 'deepseek-coder',
          name: 'DeepSeek Coder',
          description: 'DeepSeek Coder model for programming tasks',
          context_length: 16384,
          pricing: {
            prompt: 0.0014,
            completion: 0.0028
          }
        }
      ];
    }
  }

  /**
   * Transform DeepSeek model to our format
   * @param {Object} rawModel - Raw model from DeepSeek
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object>} Transformed model
   */
  async transformDeepSeekModel(rawModel, provider) {
    return {
      model_slug: `${rawModel.id}-${provider.name}`,
      api_model_id: rawModel.id,
      name: rawModel.name,
      display_name: rawModel.name,
      description: rawModel.description || `DeepSeek model: ${rawModel.name}`,
      max_tokens: rawModel.context_length || 16384,
      is_active: true,
      has_stats_aa: false
    };
  }

  /**
   * Validate DeepSeek model
   * @param {Object} model - Transformed model
   * @returns {Promise<boolean>} Whether model is valid
   */
  async validateDeepSeekModel(model) {
    return !!(model.name && model.max_tokens > 0);
  }

  /**
   * Detect source provider from model ID/name
   * @param {string} modelId - Model identifier
   * @returns {string} Detected source provider name
   */
  detectSourceProvider(modelId) {
    if (!modelId) return null;
    
    const id = modelId.toLowerCase();
    
    // Check for common provider patterns
    if (id.includes('gpt-') || id.includes('dall-e') || id.includes('whisper') || id.includes('tts-')) {
      return 'openai';
    }
    if (id.includes('claude')) {
      return 'anthropic';
    }
    if (id.includes('gemini') || id.includes('palm') || id.includes('bard')) {
      return 'google';
    }
    if (id.includes('llama') || id.includes('meta')) {
      return 'meta';
    }
    if (id.includes('mistral') || id.includes('mixtral')) {
      return 'mistral';
    }
    if (id.includes('command') || id.includes('cohere')) {
      return 'cohere';
    }
    if (id.includes('qwen') || id.includes('alibaba')) {
      return 'qwen';
    }
    if (id.includes('deepseek')) {
      return 'deepseek';
    }
    if (id.includes('grok') || id.includes('x-ai')) {
      return 'x-ai';
    }
    if (id.includes('perplexity')) {
      return 'perplexity';
    }
    if (id.includes('stability') || id.includes('stable-diffusion')) {
      return 'stability';
    }
    if (id.includes('flux') || id.includes('black-forest')) {
      return 'black-forest-labs';
    }
    if (id.includes('jurassic') || id.includes('ai21')) {
      return 'ai21';
    }
    if (id.includes('nova') || id.includes('amazon')) {
      return 'amazon';
    }
    if (id.includes('phi') || id.includes('wizardlm') || id.includes('microsoft')) {
      return 'microsoft';
    }
    if (id.includes('baidu') || id.includes('ernie')) {
      return 'baidu';
    }
    if (id.includes('minimax')) {
      return 'minimax';
    }
    if (id.includes('moonshot') || id.includes('kimi')) {
      return 'moonshot';
    }
    if (id.includes('tencent')) {
      return 'tencent';
    }
    if (id.includes('nvidia')) {
      return 'nvidia';
    }
    if (id.includes('huggingface') || id.includes('hf-')) {
      return 'huggingface';
    }
    
    // If no specific provider detected, try to extract from common patterns
    // Many aggregators use format like "vendor/model-name"
    const parts = modelId.split('/');
    if (parts.length > 1) {
      const vendor = parts[0].toLowerCase();
      // Map common vendor names to our provider names
      const vendorMap = {
        'meta-llama': 'meta',
        'mistralai': 'mistral',
        'anthropic': 'anthropic',
        'openai': 'openai',
        'google': 'google',
        'cohere': 'cohere',
        'ai21labs': 'ai21',
        'stabilityai': 'stability',
        'microsoft': 'microsoft',
        'qwen': 'qwen'
      };
      
      if (vendorMap[vendor]) {
        return vendorMap[vendor];
      }
    }
    
    // Default to 'community' if no specific provider detected
    return 'community';
  }

  /**
   * Check provider health
   * @param {Object} provider - Provider instance
   * @returns {Promise<Object>} Health status
   */
  async checkProviderHealth(provider) {
    try {
      const { ProviderHealthStatus } = db.models;
      
      let healthStatus = await ProviderHealthStatus.findOne({
        where: { id_provider: provider.id }
      });

      if (!healthStatus) {
        healthStatus = await ProviderHealthStatus.create({
          id_provider: provider.id,
          status: 'unknown'
        });
      }

      // Perform actual health check (mock for now)
      const isHealthy = Math.random() > 0.1; // 90% success rate
      const responseTime = Math.floor(Math.random() * 1000) + 100;

      if (isHealthy) {
        await healthStatus.recordSuccess(responseTime);
      } else {
        await healthStatus.recordFailure(new Error('Health check failed'), 'health_check');
      }

      return {
        provider: provider.name,
        status: healthStatus.status,
        healthScore: healthStatus.health_score,
        lastCheck: healthStatus.last_check_at,
        responseTime
      };

    } catch (error) {
      this.logger.error('Provider health check failed', {
        provider: provider.name,
        error: error.message
      });
      
      return {
        provider: provider.name,
        status: 'error',
        healthScore: 0,
        error: error.message
      };
    }
  }

  /**
   * Create timeout promise
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise} Timeout promise
   */
  createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Sync operation timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Infer model type from model name
   * @param {string} modelName - Model name
   * @returns {string} Inferred model type
   */
  inferModelType(modelName) {
    const chatModels = ['gpt-4', 'gpt-3.5-turbo', 'claude', 'llama', 'chat'];
    const embeddingModels = ['embedding', 'ada', 'text-embedding'];
    
    const lowerName = modelName.toLowerCase();
    
    if (chatModels.some(type => lowerName.includes(type))) {
      return 'chat';
    }
    
    if (embeddingModels.some(type => lowerName.includes(type))) {
      return 'embedding';
    }
    
    return 'text';
  }

  /**
   * Get context window for model
   * @param {string} modelName - Model name
   * @returns {number} Context window size
   */
  getContextWindow(modelName) {
    const contextMap = {
      'gpt-4': 8192,
      'gpt-4-32k': 32768,
      'gpt-3.5-turbo': 4096,
      'gpt-3.5-turbo-16k': 16384
    };
    
    return contextMap[modelName] || 4096;
  }

  /**
   * Get max output tokens for model
   * @param {string} modelName - Model name
   * @returns {number} Max output tokens
   */
  getMaxOutputTokens(modelName) {
    const outputMap = {
      'gpt-4': 4096,
      'gpt-3.5-turbo': 4096
    };
    
    return outputMap[modelName] || 2048;
  }

  /**
   * Get pricing for model
   * @param {string} modelName - Model name
   * @param {string} type - Pricing type (input/output)
   * @returns {number} Price per token
   */
  getPricing(modelName, type) {
    const pricingMap = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.001, output: 0.002 }
    };
    
    return pricingMap[modelName]?.[type] || 0.001;
  }

  /**
   * Get capabilities for model
   * @param {string} modelName - Model name
   * @returns {Array} Model capabilities
   */
  getCapabilities(modelName) {
    const capabilitiesMap = {
      'gpt-4': ['text', 'vision', 'function_calling'],
      'gpt-3.5-turbo': ['text', 'function_calling']
    };
    
    return capabilitiesMap[modelName] || ['text'];
  }

  /**
   * Create or update pricing data for a model
   * @param {Object} model - Model instance
   * @param {Object} pricingData - Pricing data object
   * @param {Object} transaction - Database transaction
   * @returns {Promise<void>}
   */
  async createOrUpdatePricingData(model, pricingData, transaction) {
    try {
      const { ModelPriceScore } = db.models;
      
      this.logger.debug('Creating/updating pricing data for model', {
        modelId: model.id,
        modelSlug: model.model_slug,
        source: pricingData.source,
        priceImage: pricingData.price_image
      });

      // Prepare pricing data for database insertion
      const priceScoreData = {
        id_model: model.id,
        price_image: pricingData.price_image, // Currently FLOAT field
        price_1m_input_tokens: pricingData.price_1m_input_tokens || 0,
        price_1m_output_tokens: pricingData.price_1m_output_tokens || 0,
        source: pricingData.source,
        updated_at: new Date()
      };

      // Upsert pricing data
      await ModelPriceScore.upsert(priceScoreData, {
        transaction,
        conflictFields: ['id_model', 'source']
      });

      this.logger.info('Successfully created/updated pricing data', {
        modelId: model.id,
        modelSlug: model.model_slug,
        source: pricingData.source,
        priceImage: pricingData.price_image,
        inputTokens: pricingData.price_1m_input_tokens,
        outputTokens: pricingData.price_1m_output_tokens
      });

    } catch (error) {
      this.logger.error('Error creating/updating pricing data', {
        modelId: model.id,
        modelSlug: model.model_slug,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Create capability relationships for a model
   * @param {Object} model - Model instance
   * @param {Array} capabilities - Array of capability objects
   * @param {Object} transaction - Database transaction
   * @returns {Promise<void>}
   */
  async createCapabilityRelationships(model, capabilities, transaction) {
    try {
      const { ModelsCapability, ModelsModelsCapability } = db.models;
      
      this.logger.debug('Creating capability relationships for model', {
        modelId: model.id,
        modelSlug: model.model_slug,
        capabilitiesCount: capabilities.length
      });

      for (const capabilityData of capabilities) {
        try {
          // Find or create the capability
          const [capability] = await ModelsCapability.findOrCreate({
            where: {
              name: capabilityData.name,
              type: capabilityData.type
            },
            defaults: {
              name: capabilityData.name,
              type: capabilityData.type,
              description: capabilityData.description || `${capabilityData.name} capability`
            },
            transaction
          });

          // Create the relationship if it doesn't exist
          await ModelsModelsCapability.findOrCreate({
            where: {
              id_model: model.id,
              id_capability: capability.id
            },
            defaults: {
              id_model: model.id,
              id_capability: capability.id
            },
            transaction
          });

          this.logger.debug('Created capability relationship', {
            modelId: model.id,
            capabilityId: capability.id,
            capabilityName: capability.name
          });

        } catch (capabilityError) {
          this.logger.warn('Error creating capability relationship', {
            modelId: model.id,
            capabilityName: capabilityData.name,
            error: capabilityError.message
          });
          // Continue with other capabilities instead of failing completely
        }
      }

      this.logger.info('Successfully created capability relationships', {
        modelId: model.id,
        modelSlug: model.model_slug,
        capabilitiesProcessed: capabilities.length
      });

    } catch (error) {
      this.logger.error('Error creating capability relationships', {
        modelId: model.id,
        modelSlug: model.model_slug,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Shutdown the sync engine
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      this.logger.info('Shutting down ModelSyncEngine');
      
      this.removeAllListeners();
      this.providerHandlers.clear();
      
      this.logger.info('ModelSyncEngine shutdown completed');
      
    } catch (error) {
      this.logger.error('Error during ModelSyncEngine shutdown', error);
      throw error;
    }
  }

  /**
   * Map syncType to valid enum values
   * @param {string} syncType - The sync type to map
   * @returns {string} The valid sync type
   */
  mapSyncTypeToValidEnum(syncType) {
    const validSyncTypes = ['init', 'update', 'sync', 'health_check'];
    if (validSyncTypes.includes(syncType)) {
      return syncType;
    }
    
    // Map common sync types to valid enum values
    const syncTypeMap = {
      'incremental': 'sync',
      'full': 'init',
      'partial': 'update',
      'health': 'health_check'
    };
    
    return syncTypeMap[syncType] || 'sync'; // Default to 'sync' if not valid
  }
}

module.exports = { ModelSyncEngine };