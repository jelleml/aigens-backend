/**
 * Model Processor for Enhanced Model Processing and Relationship Management
 * 
 * Provides comprehensive model processing capabilities including:
 * - Standardization of provider data into uniform format
 * - Source provider detection for aggregated models
 * - Model deduplication and conflict resolution
 * - Relationship management between aggregators and source providers
 * - Pricing data normalization and tier association
 */

const crypto = require('crypto');
const db = require('../../database');

/**
 * Source provider detection patterns (enhanced from existing patterns)
 */
const SOURCE_PROVIDER_PATTERNS = {
  // Major AI Providers
  openai: [
    /gpt-[0-9]/i,
    /openai/i,
    /text-davinci/i,
    /text-curie/i,
    /code-davinci/i,
    /whisper/i,
    /dall-e/i,
    /tts-/i,
    /babbage/i,
    /ada-/i
  ],
  anthropic: [
    /claude/i,
    /anthropic/i,
    /claude-[0-9]/i,
    /claude-instant/i,
    /claude-v[0-9]/i
  ],
  google: [
    /gemini/i,
    /palm/i,
    /bard/i,
    /google/i,
    /vertex/i,
    /text-bison/i,
    /chat-bison/i,
    /codechat-bison/i,
    /code-bison/i,
    /text-unicorn/i,
    /gemini-[0-9]/i
  ],
  meta: [
    /llama/i,
    /meta/i,
    /llama-2/i,
    /llama-3/i,
    /code-llama/i,
    /llama-guard/i
  ],
  microsoft: [
    /phi-/i,
    /wizardlm/i,
    /microsoft/i,
    /azure/i,
    /bing/i
  ],
  cohere: [
    /cohere/i,
    /command/i,
    /command-r/i,
    /embed-/i,
    /rerank-/i
  ],
  mistral: [
    /mistral/i,
    /mixtral/i,
    /codestral/i,
    /mistral-[0-9]/i,
    /moe-/i
  ],
  
  // Specialized Providers
  'black-forest-labs': [
    /flux/i,
    /black.*forest/i,
    /flux-[0-9]/i,
    /flux-schnell/i,
    /flux-dev/i,
    /flux-pro/i
  ],
  'stability': [
    /stable-diffusion/i,
    /stability/i,
    /sd-/i,
    /stable-cascade/i,
    /stable-video/i
  ],
  ideogram: [
    /ideogram/i,
    /ideogram-v[0-9]/i
  ],
  huggingface: [
    /hugging.*face/i,
    /transformers/i,
    /hf-/i
  ],
  
  // Research Organizations
  nousresearch: [
    /nous/i,
    /hermes/i,
    /nous-hermes/i,
    /capybara/i
  ],
  'perplexity': [
    /pplx/i,
    /perplexity/i,
    /sonar/i,
    /llama-3.*sonar/i
  ],
  'deepseek': [
    /deepseek/i,
    /deepseek-coder/i,
    /deepseek-chat/i
  ],
  
  // Regional Providers
  qwen: [
    /qwen/i,
    /tongyi/i,
    /qwen-[0-9]/i,
    /qwen-turbo/i,
    /qwen-plus/i,
    /qwen-max/i
  ],
  baidu: [
    /ernie/i,
    /baidu/i,
    /wenxin/i
  ]
};

/**
 * Model type classifications
 */
const MODEL_TYPES = {
  TEXT: 'text',
  CHAT: 'chat', 
  CODE: 'code',
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video',
  EMBEDDING: 'embedding',
  MODERATION: 'moderation'
};

/**
 * Conflict resolution strategies
 */
const CONFLICT_RESOLUTION = {
  PREFER_DIRECT: 'prefer_direct',           // Prefer direct provider over aggregator
  PREFER_LATEST: 'prefer_latest',           // Prefer most recently updated
  PREFER_HIGHER_CONFIDENCE: 'prefer_confidence', // Prefer higher confidence source
  MERGE_METADATA: 'merge_metadata'          // Merge compatible metadata
};

/**
 * Model Processor class
 */
class ModelProcessor {
  /**
   * @param {Object} logger - Logger instance
   * @param {Object} metrics - Metrics collector
   */
  constructor(logger = null, metrics = null) {
    this.logger = logger || console;
    this.metrics = metrics;
    
    // Processing statistics
    this.stats = {
      processed: 0,
      deduplication: {
        duplicatesDetected: 0,
        conflictsResolved: 0,
        merged: 0
      },
      relationships: {
        created: 0,
        updated: 0,
        sourceDetected: 0
      },
      errors: []
    };

    this.logger.debug('[ModelProcessor] Initialized');
  }

  /**
   * Process a batch of models from a provider
   * @param {string} providerName - Provider name
   * @param {Array} rawModels - Raw models from provider API
   * @param {Object} options - Processing options
   * @param {string} options.mode - Processing mode (init, update, sync)
   * @param {boolean} options.createRelationships - Create aggregator relationships
   * @param {boolean} options.enableDeduplication - Enable deduplication
   * @param {string} options.conflictResolution - Conflict resolution strategy
   * @param {number} options.batchSize - Batch size for processing
   * @returns {Promise<Object>} Processing result
   */
  async processBatch(providerName, rawModels, options = {}) {
    const {
      mode = 'update',
      createRelationships = true,
      enableDeduplication = true,
      conflictResolution = CONFLICT_RESOLUTION.PREFER_DIRECT,
      batchSize = 50
    } = options;

    const startTime = Date.now();
    this.resetStats();

    this.logger.info(`[ModelProcessor] Processing batch for ${providerName}`, {
      modelCount: rawModels.length,
      mode,
      options: {
        createRelationships,
        enableDeduplication,
        conflictResolution
      }
    });

    try {
      // Get provider configuration
      const providerConfig = await this.getProviderConfig(providerName);
      
      // Standardize models
      const standardizedModels = await this.standardizeModels(
        rawModels, 
        providerConfig
      );

      // Process in batches
      const results = {
        modelsProcessed: 0,
        modelsCreated: 0,
        modelsUpdated: 0,
        relationshipsCreated: 0,
        duplicatesHandled: 0,
        errors: []
      };

      for (let i = 0; i < standardizedModels.length; i += batchSize) {
        const batch = standardizedModels.slice(i, i + batchSize);
        const batchResult = await this.processBatchChunk(
          batch,
          providerConfig,
          mode,
          {
            createRelationships,
            enableDeduplication,
            conflictResolution
          }
        );

        // Aggregate results
        results.modelsProcessed += batchResult.modelsProcessed;
        results.modelsCreated += batchResult.modelsCreated;
        results.modelsUpdated += batchResult.modelsUpdated;
        results.relationshipsCreated += batchResult.relationshipsCreated;
        results.duplicatesHandled += batchResult.duplicatesHandled;
        results.errors.push(...batchResult.errors);
      }

      const duration = Date.now() - startTime;
      
      this.logger.info(`[ModelProcessor] Batch processing complete for ${providerName}`, {
        ...results,
        duration,
        stats: this.getStats()
      });

      return {
        ...results,
        duration,
        stats: this.getStats()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`[ModelProcessor] Batch processing failed for ${providerName}`, {
        error: error.message,
        duration
      });
      throw error;
    }
  }

  /**
   * Process a chunk of models within a database transaction
   * @param {Array} models - Standardized models to process
   * @param {Object} providerConfig - Provider configuration
   * @param {string} mode - Processing mode
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async processBatchChunk(models, providerConfig, mode, options) {
    const { Model, Provider, ModelPriceScore, AggregatedModel } = db.sequelize.models;

    return await db.sequelize.transaction(async (transaction) => {
      const results = {
        modelsProcessed: 0,
        modelsCreated: 0,
        modelsUpdated: 0,
        relationshipsCreated: 0,
        duplicatesHandled: 0,
        errors: []
      };

      for (const standardModel of models) {
        try {
          // Handle deduplication
          let existingModel = null;
          if (options.enableDeduplication) {
            existingModel = await this.findExistingModel(
              standardModel,
              transaction
            );
          }

          let modelRecord = null;

          if (existingModel) {
            // Handle existing model
            const resolution = await this.resolveModelConflict(
              existingModel,
              standardModel,
              options.conflictResolution,
              transaction
            );

            if (resolution.action === 'update') {
              modelRecord = await this.updateModel(
                existingModel,
                standardModel,
                transaction
              );
              results.modelsUpdated++;
            } else if (resolution.action === 'merge') {
              modelRecord = await this.mergeModels(
                existingModel,
                standardModel,
                transaction
              );
              results.modelsUpdated++;
            } else {
              // Skip or keep existing
              modelRecord = existingModel;
            }

            results.duplicatesHandled++;
          } else {
            // Create new model
            modelRecord = await this.createModel(
              standardModel,
              providerConfig,
              transaction
            );
            results.modelsCreated++;
          }

          // Create pricing data if available
          if (standardModel.pricing) {
            await this.createOrUpdatePricing(
              modelRecord.id,
              standardModel.pricing,
              providerConfig.name,
              transaction
            );
          }

          // Create aggregator relationships if applicable
          if (options.createRelationships && providerConfig.type === 'aggregator') {
            const relationshipsCreated = await this.createAggregatorRelationships(
              modelRecord,
              standardModel,
              providerConfig,
              transaction
            );
            results.relationshipsCreated += relationshipsCreated;
          }

          results.modelsProcessed++;
          this.stats.processed++;

        } catch (error) {
          this.logger.error(`[ModelProcessor] Failed to process model`, {
            model: standardModel.model_slug,
            error: error.message
          });
          
          results.errors.push({
            model: standardModel.model_slug,
            error: error.message
          });
          
          this.stats.errors.push({
            model: standardModel.model_slug,
            error: error.message,
            timestamp: Date.now()
          });
        }
      }

      return results;
    });
  }

  /**
   * Standardize raw models into consistent format
   * @param {Array} rawModels - Raw models from provider
   * @param {Object} providerConfig - Provider configuration
   * @returns {Promise<Array>} Standardized models
   */
  async standardizeModels(rawModels, providerConfig) {
    const standardized = [];

    for (const rawModel of rawModels) {
      try {
        const standardModel = await this.standardizeModel(rawModel, providerConfig);
        if (standardModel) {
          standardized.push(standardModel);
        }
      } catch (error) {
        this.logger.warn(`[ModelProcessor] Failed to standardize model`, {
          rawModel: rawModel.id || rawModel.name,
          error: error.message
        });
      }
    }

    this.logger.debug(`[ModelProcessor] Standardized ${standardized.length}/${rawModels.length} models for ${providerConfig.name}`);
    
    return standardized;
  }

  /**
   * Standardize individual model
   * @param {Object} rawModel - Raw model data
   * @param {Object} providerConfig - Provider configuration
   * @returns {Promise<Object>} Standardized model
   */
  async standardizeModel(rawModel, providerConfig) {
    // Extract basic model information
    const modelId = rawModel.id || rawModel.model || rawModel.name;
    const modelName = rawModel.name || rawModel.display_name || modelId;
    const description = rawModel.description || `${modelName} model from ${providerConfig.name}`;

    // Generate model slug
    const modelSlug = this.generateModelSlug(modelId, providerConfig.name);

    // Detect model type
    const modelType = this.detectModelType(rawModel);

    // Extract token limits
    const maxTokens = this.extractMaxTokens(rawModel);

    // Extract pricing information
    const pricing = this.extractPricingData(rawModel, providerConfig);

    // Extract metadata
    const metadata = this.extractMetadata(rawModel, providerConfig);

    // Detect source provider for aggregators
    let sourceProvider = null;
    let sourceConfidence = 0;
    if (providerConfig.type === 'aggregator') {
      const detection = await this.detectSourceProvider(rawModel, modelSlug);
      sourceProvider = detection.provider;
      sourceConfidence = detection.confidence;
    }

    return {
      model_slug: modelSlug,
      api_model_id: modelId,
      id_provider: providerConfig.id,
      name: modelName,
      description,
      max_tokens: maxTokens,
      is_active: false, // New models start inactive
      model_type: modelType,
      pricing,
      metadata: {
        ...metadata,
        sourceProvider,
        sourceConfidence,
        processedAt: new Date().toISOString(),
        originalData: this.sanitizeOriginalData(rawModel)
      }
    };
  }

  /**
   * Detect source provider for aggregated models
   * @param {Object} rawModel - Raw model data
   * @param {string} modelSlug - Generated model slug
   * @returns {Promise<Object>} Detection result with provider and confidence
   */
  async detectSourceProvider(rawModel, modelSlug) {
    const detectionSources = [
      // API metadata hints
      rawModel.owned_by,
      rawModel.created_by,
      rawModel.provider,
      rawModel.organization,
      
      // Model identifiers
      rawModel.id,
      rawModel.name,
      modelSlug,
      
      // Description text
      rawModel.description
    ].filter(Boolean);

    let bestMatch = {
      provider: 'community',
      confidence: 0,
      source: 'default'
    };

    // Test each detection source
    for (const source of detectionSources) {
      if (!source || typeof source !== 'string') continue;

      for (const [providerName, patterns] of Object.entries(SOURCE_PROVIDER_PATTERNS)) {
        for (const pattern of patterns) {
          if (pattern.test(source)) {
            const confidence = this.calculateConfidence(source, pattern, providerName);
            
            if (confidence > bestMatch.confidence) {
              bestMatch = {
                provider: providerName,
                confidence,
                source: 'pattern_match',
                matchedText: source,
                pattern: pattern.toString()
              };
            }
          }
        }
      }
    }

    // Apply confidence adjustments
    if (rawModel.owned_by && bestMatch.matchedText === rawModel.owned_by) {
      bestMatch.confidence = Math.min(bestMatch.confidence * 1.2, 1.0);
      bestMatch.source = 'owned_by_field';
    }

    this.logger.debug(`[ModelProcessor] Source provider detection`, {
      modelSlug,
      detection: bestMatch
    });

    if (bestMatch.provider !== 'community') {
      this.stats.relationships.sourceDetected++;
    }

    return bestMatch;
  }

  /**
   * Calculate confidence score for provider detection
   * @param {string} text - Text being matched
   * @param {RegExp} pattern - Pattern that matched
   * @param {string} providerName - Provider name
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidence(text, pattern, providerName) {
    let confidence = 0.6; // Base confidence for pattern match

    // Exact provider name match gets highest confidence
    if (text.toLowerCase().includes(providerName.toLowerCase())) {
      confidence = 0.95;
    }
    
    // Model-specific patterns get higher confidence
    if (pattern.toString().includes('\\d') || pattern.toString().includes('\\-')) {
      confidence += 0.1;
    }

    // Longer matches get slightly higher confidence
    const matchLength = text.length;
    if (matchLength > 10) {
      confidence += 0.05;
    }

    // Cap at 1.0
    return Math.min(confidence, 1.0);
  }

  /**
   * Generate standardized model slug
   * @param {string} modelId - Model ID from provider
   * @param {string} providerName - Provider name
   * @returns {string} Model slug
   */
  generateModelSlug(modelId, providerName) {
    // Clean and normalize model ID
    const cleanId = modelId
      .toLowerCase()
      .replace(/[^a-z0-9\-_.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Append provider name if not already included
    if (!cleanId.includes(providerName.toLowerCase())) {
      return `${cleanId}-${providerName.toLowerCase()}`;
    }

    return cleanId;
  }

  /**
   * Detect model type from model data
   * @param {Object} rawModel - Raw model data
   * @returns {string} Model type
   */
  detectModelType(rawModel) {
    const modelId = (rawModel.id || rawModel.name || '').toLowerCase();
    const description = (rawModel.description || '').toLowerCase();
    const combined = `${modelId} ${description}`;

    // Image generation models
    if (/dalle|stable.diffusion|midjourney|flux|ideogram|imagen/.test(combined)) {
      return MODEL_TYPES.IMAGE;
    }

    // Audio models
    if (/whisper|tts|speech|audio|voice/.test(combined)) {
      return MODEL_TYPES.AUDIO;
    }

    // Code models
    if (/code|codex|copilot|starcoder|codellama/.test(combined)) {
      return MODEL_TYPES.CODE;
    }

    // Embedding models
    if (/embed|embedding|similarity|vector/.test(combined)) {
      return MODEL_TYPES.EMBEDDING;
    }

    // Moderation models
    if (/moderation|safety|filter/.test(combined)) {
      return MODEL_TYPES.MODERATION;
    }

    // Video models
    if (/video|sora|runway/.test(combined)) {
      return MODEL_TYPES.VIDEO;
    }

    // Default to chat for conversational models
    if (/chat|gpt|claude|gemini|llama/.test(combined)) {
      return MODEL_TYPES.CHAT;
    }

    // Default to text
    return MODEL_TYPES.TEXT;
  }

  /**
   * Extract maximum tokens from model data
   * @param {Object} rawModel - Raw model data
   * @returns {number} Maximum tokens
   */
  extractMaxTokens(rawModel) {
    // Common fields for token limits
    const tokenFields = [
      'max_tokens',
      'context_length',
      'context_window', 
      'max_context_length',
      'token_limit',
      'max_input_length'
    ];

    for (const field of tokenFields) {
      const value = rawModel[field];
      if (typeof value === 'number' && value > 0) {
        return value;
      }
    }

    // Parse from model name or description
    const text = `${rawModel.id || ''} ${rawModel.name || ''} ${rawModel.description || ''}`;
    const tokenMatch = text.match(/(\d+)k?\s*tokens?/i);
    
    if (tokenMatch) {
      let tokens = parseInt(tokenMatch[1]);
      if (text.toLowerCase().includes('k')) {
        tokens *= 1000;
      }
      return tokens;
    }

    // Default based on model type/era
    if (text.includes('gpt-4')) return 128000;
    if (text.includes('gpt-3.5')) return 16385;
    if (text.includes('claude-3')) return 200000;
    if (text.includes('gemini-pro')) return 1000000;

    return 4096; // Conservative default
  }

  /**
   * Extract pricing data from model
   * @param {Object} rawModel - Raw model data
   * @param {Object} providerConfig - Provider configuration
   * @returns {Object|null} Pricing data
   */
  extractPricingData(rawModel, providerConfig) {
    const pricing = {};
    let hasPricing = false;

    // Input token pricing
    if (rawModel.pricing?.prompt !== undefined) {
      pricing.price_1m_input_tokens = this.normalizePricing(rawModel.pricing.prompt);
      hasPricing = true;
    }

    // Output token pricing  
    if (rawModel.pricing?.completion !== undefined) {
      pricing.price_1m_output_tokens = this.normalizePricing(rawModel.pricing.completion);
      hasPricing = true;
    }

    // Image pricing
    if (rawModel.pricing?.image !== undefined) {
      pricing.price_image = rawModel.pricing.image;
      hasPricing = true;
    }

    // Alternative pricing fields
    if (rawModel.input_cost_per_token !== undefined) {
      pricing.price_1m_input_tokens = rawModel.input_cost_per_token * 1000000;
      hasPricing = true;
    }

    if (rawModel.output_cost_per_token !== undefined) {
      pricing.price_1m_output_tokens = rawModel.output_cost_per_token * 1000000;
      hasPricing = true;
    }

    return hasPricing ? pricing : null;
  }

  /**
   * Normalize pricing to per-million-token format
   * @param {number} price - Price per token or per-million-tokens
   * @returns {number} Price per million tokens
   */
  normalizePricing(price) {
    if (price > 1000) {
      // Already per-million-tokens
      return price;
    } else {
      // Convert per-token to per-million-tokens
      return price * 1000000;
    }
  }

  /**
   * Extract metadata from raw model
   * @param {Object} rawModel - Raw model data
   * @param {Object} providerConfig - Provider configuration
   * @returns {Object} Extracted metadata
   */
  extractMetadata(rawModel, providerConfig) {
    const metadata = {
      provider_type: providerConfig.type,
      raw_id: rawModel.id,
      created_at: rawModel.created || new Date().toISOString()
    };

    // Provider-specific metadata
    if (providerConfig.name === 'openrouter') {
      metadata.owned_by = rawModel.owned_by;
      metadata.architecture = rawModel.architecture;
      metadata.modality = rawModel.modality;
      metadata.top_provider = rawModel.top_provider;
    }

    if (providerConfig.name === 'together') {
      metadata.display_type = rawModel.display_type;
      metadata.link = rawModel.link;
      metadata.license = rawModel.license;
    }

    // Common metadata
    if (rawModel.object) metadata.object = rawModel.object;
    if (rawModel.created_by) metadata.created_by = rawModel.created_by;
    if (rawModel.organization) metadata.organization = rawModel.organization;

    return metadata;
  }

  /**
   * Sanitize original data for storage
   * @param {Object} rawModel - Raw model data
   * @returns {Object} Sanitized data
   */
  sanitizeOriginalData(rawModel) {
    // Remove potentially large or sensitive fields
    const sanitized = { ...rawModel };
    
    // Remove large arrays or objects that aren't needed
    delete sanitized.examples;
    delete sanitized.sample_responses;
    delete sanitized.training_data;
    
    // Keep only essential fields for debugging
    return {
      id: sanitized.id,
      name: sanitized.name,
      description: sanitized.description,
      owned_by: sanitized.owned_by,
      created: sanitized.created,
      pricing: sanitized.pricing,
      context_length: sanitized.context_length
    };
  }

  /**
   * Get provider configuration
   * @param {string} providerName - Provider name
   * @returns {Promise<Object>} Provider configuration
   */
  async getProviderConfig(providerName) {
    const { Provider } = db.sequelize.models;
    
    const provider = await Provider.findOne({
      where: { name: providerName }
    });

    if (!provider) {
      throw new Error(`Provider ${providerName} not found in database`);
    }

    return {
      id: provider.id,
      name: provider.name,
      type: provider.type || 'direct'
    };
  }

  /**
   * Find existing model for deduplication
   * @param {Object} standardModel - Standardized model
   * @param {Object} transaction - Database transaction
   * @returns {Promise<Object|null>} Existing model or null
   */
  async findExistingModel(standardModel, transaction) {
    const { Model } = db.sequelize.models;

    // Primary lookup by model_slug
    let existing = await Model.findOne({
      where: { model_slug: standardModel.model_slug },
      transaction
    });

    if (!existing) {
      // Secondary lookup by api_model_id and provider
      existing = await Model.findOne({
        where: {
          api_model_id: standardModel.api_model_id,
          id_provider: standardModel.id_provider
        },
        transaction
      });
    }

    return existing;
  }

  /**
   * Resolve conflict between existing and new model
   * @param {Object} existing - Existing model
   * @param {Object} standardModel - New standardized model
   * @param {string} strategy - Conflict resolution strategy
   * @param {Object} transaction - Database transaction
   * @returns {Promise<Object>} Resolution result
   */
  async resolveModelConflict(existing, standardModel, strategy, transaction) {
    this.logger.debug(`[ModelProcessor] Resolving model conflict`, {
      modelSlug: standardModel.model_slug,
      strategy
    });

    switch (strategy) {
      case CONFLICT_RESOLUTION.PREFER_DIRECT:
        // Prefer direct provider over aggregator
        if (existing.provider?.type === 'aggregator' && standardModel.provider?.type === 'direct') {
          return { action: 'update', reason: 'prefer_direct_provider' };
        }
        return { action: 'skip', reason: 'existing_preferred' };

      case CONFLICT_RESOLUTION.PREFER_LATEST:
        // Compare updated timestamps
        const existingTime = existing.updated_at || existing.created_at;
        const now = new Date();
        
        if (now - existingTime > 24 * 60 * 60 * 1000) { // 24 hours
          return { action: 'update', reason: 'existing_is_stale' };
        }
        return { action: 'skip', reason: 'existing_is_recent' };

      case CONFLICT_RESOLUTION.PREFER_HIGHER_CONFIDENCE:
        // Compare source provider detection confidence
        const existingConfidence = existing.metadata?.sourceConfidence || 0;
        const newConfidence = standardModel.metadata?.sourceConfidence || 0;
        
        if (newConfidence > existingConfidence + 0.1) { // 10% threshold
          return { action: 'update', reason: 'higher_confidence' };
        }
        return { action: 'skip', reason: 'existing_confidence_sufficient' };

      case CONFLICT_RESOLUTION.MERGE_METADATA:
        return { action: 'merge', reason: 'merge_compatible_metadata' };

      default:
        return { action: 'skip', reason: 'unknown_strategy' };
    }
  }

  /**
   * Create new model
   * @param {Object} standardModel - Standardized model data
   * @param {Object} providerConfig - Provider configuration
   * @param {Object} transaction - Database transaction
   * @returns {Promise<Object>} Created model
   */
  async createModel(standardModel, providerConfig, transaction) {
    const { Model } = db.sequelize.models;

    const model = await Model.create({
      ...standardModel,
      is_active: false // New models require manual review
    }, { transaction });

    this.logger.debug(`[ModelProcessor] Created model`, {
      id: model.id,
      slug: model.model_slug,
      provider: providerConfig.name
    });

    return model;
  }

  /**
   * Update existing model
   * @param {Object} existing - Existing model
   * @param {Object} standardModel - New model data
   * @param {Object} transaction - Database transaction
   * @returns {Promise<Object>} Updated model
   */
  async updateModel(existing, standardModel, transaction) {
    await existing.update({
      name: standardModel.name,
      description: standardModel.description,
      max_tokens: standardModel.max_tokens,
      api_model_id: standardModel.api_model_id,
      model_type: standardModel.model_type,
      metadata: {
        ...existing.metadata,
        ...standardModel.metadata,
        updatedAt: new Date().toISOString()
      }
    }, { transaction });

    this.logger.debug(`[ModelProcessor] Updated model`, {
      id: existing.id,
      slug: existing.model_slug
    });

    return existing;
  }

  /**
   * Merge two models
   * @param {Object} existing - Existing model
   * @param {Object} standardModel - New model data
   * @param {Object} transaction - Database transaction
   * @returns {Promise<Object>} Merged model
   */
  async mergeModels(existing, standardModel, transaction) {
    // Merge compatible fields
    const mergedMetadata = this.mergeMetadata(existing.metadata, standardModel.metadata);
    
    await existing.update({
      // Keep existing basic fields, update metadata
      metadata: mergedMetadata
    }, { transaction });

    this.logger.debug(`[ModelProcessor] Merged model metadata`, {
      id: existing.id,
      slug: existing.model_slug
    });

    this.stats.deduplication.merged++;
    return existing;
  }

  /**
   * Merge metadata objects intelligently
   * @param {Object} existing - Existing metadata
   * @param {Object} newData - New metadata
   * @returns {Object} Merged metadata
   */
  mergeMetadata(existing = {}, newData = {}) {
    const merged = { ...existing };

    // Update confidence if higher
    if (newData.sourceConfidence > (existing.sourceConfidence || 0)) {
      merged.sourceProvider = newData.sourceProvider;
      merged.sourceConfidence = newData.sourceConfidence;
    }

    // Merge arrays
    if (newData.capabilities && existing.capabilities) {
      merged.capabilities = [...new Set([...existing.capabilities, ...newData.capabilities])];
    } else if (newData.capabilities) {
      merged.capabilities = newData.capabilities;
    }

    // Update timestamps
    merged.lastMerged = new Date().toISOString();
    merged.mergeCount = (existing.mergeCount || 0) + 1;

    return merged;
  }

  /**
   * Create or update pricing data
   * @param {number} modelId - Model ID
   * @param {Object} pricing - Pricing data
   * @param {string} source - Pricing source
   * @param {Object} transaction - Database transaction
   * @returns {Promise<void>}
   */
  async createOrUpdatePricing(modelId, pricing, source, transaction) {
    const { ModelPriceScore } = db.sequelize.models;

    await ModelPriceScore.upsert({
      id_model: modelId,
      source,
      ...pricing
    }, {
      transaction,
      conflictFields: ['id_model', 'source']
    });

    this.logger.debug(`[ModelProcessor] Created/updated pricing`, {
      modelId,
      source
    });
  }

  /**
   * Create aggregator relationships
   * @param {Object} model - Model record
   * @param {Object} standardModel - Standardized model data
   * @param {Object} providerConfig - Provider configuration  
   * @param {Object} transaction - Database transaction
   * @returns {Promise<number>} Number of relationships created
   */
  async createAggregatorRelationships(model, standardModel, providerConfig, transaction) {
    if (providerConfig.type !== 'aggregator' || !standardModel.metadata.sourceProvider) {
      return 0;
    }

    const { Provider, AggregatedModel, AggregatorPricingTier } = db.sequelize.models;

    // Find source provider
    const sourceProvider = await Provider.findOne({
      where: { name: standardModel.metadata.sourceProvider },
      transaction
    });

    if (!sourceProvider) {
      this.logger.warn(`[ModelProcessor] Source provider not found: ${standardModel.metadata.sourceProvider}`);
      return 0;
    }

    // Find or create default pricing tier
    let pricingTier = await AggregatorPricingTier.findOne({
      where: {
        id_aggregator_provider: providerConfig.id,
        tier_name: 'pay_as_you_go'
      },
      transaction
    });

    if (!pricingTier) {
      pricingTier = await AggregatorPricingTier.create({
        id_aggregator_provider: providerConfig.id,
        tier_name: 'pay_as_you_go',
        markup_percentage: 0.20, // 20% markup
        fixed_cost_per_request: 0.001,
        effective_from: new Date()
      }, { transaction });
    }

    // Create aggregated model relationship
    await AggregatedModel.upsert({
      id_aggregator_provider: providerConfig.id,
      id_source_provider: sourceProvider.id,
      id_model: model.id,
      source_model_id: standardModel.api_model_id,
      id_pricing_tier: pricingTier.id,
      is_available: true,
      confidence_score: standardModel.metadata.sourceConfidence
    }, {
      transaction,
      conflictFields: ['id_aggregator_provider', 'source_model_id']
    });

    this.logger.debug(`[ModelProcessor] Created aggregator relationship`, {
      modelId: model.id,
      aggregator: providerConfig.name,
      sourceProvider: standardModel.metadata.sourceProvider,
      confidence: standardModel.metadata.sourceConfidence
    });

    this.stats.relationships.created++;
    return 1;
  }

  /**
   * Reset processing statistics
   */
  resetStats() {
    this.stats = {
      processed: 0,
      deduplication: {
        duplicatesDetected: 0,
        conflictsResolved: 0,
        merged: 0
      },
      relationships: {
        created: 0,
        updated: 0,
        sourceDetected: 0
      },
      errors: []
    };
  }

  /**
   * Get processing statistics
   * @returns {Object} Processing statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Generate processing fingerprint for change detection
   * @param {Object} model - Model data
   * @returns {string} Fingerprint hash
   */
  generateFingerprint(model) {
    const key = `${model.model_slug}:${model.name}:${model.description}:${model.max_tokens}`;
    return crypto.createHash('md5').update(key).digest('hex');
  }
}

module.exports = { 
  ModelProcessor, 
  MODEL_TYPES, 
  CONFLICT_RESOLUTION,
  SOURCE_PROVIDER_PATTERNS 
};