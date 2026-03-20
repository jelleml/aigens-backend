#!/usr/bin/env node

/**
 * OpenRouter Models Update Script
 * 
 * This script synchronizes OpenRouter model data from their API with our database.
 * It updates existing models and creates new ones with is_active: false.
 * 
 * Features:
 * - Fetches models from https://openrouter.ai/api/v1/models
 * - Updates api_model_id, description, and max_tokens for existing models
 * - Creates new models with is_active: false
 * - Comprehensive error handling and logging
 * - Summary reports of changes made
 * - Idempotent operation (safe to run multiple times)
 */

const axios = require('axios');
const db = require('../../database');
const config = require('../../config/config');
const { createLogger, withRetry, validateResponseData, processBatches } = require('../utils/error-handler');

// Initialize logger
const logger = createLogger('update-openrouter-models');

// Configuration
const CONFIG = {
  // OpenRouter API endpoint
  apiUrl: 'https://openrouter.ai/api/v1/models',
  // Request timeout in milliseconds
  requestTimeout: 30000,
  // Retry configuration
  maxRetries: 3,
  initialDelay: 2000,
  maxDelay: 30000,
  factor: 2,
  jitter: 0.1,
  // Batch processing size
  batchSize: 50,
  // Response validation schema
  responseSchema: {
    required: ['data'],
    fields: {
      'data': 'array'
    }
  }
};

/**
 * Fetches all models from the OpenRouter API
 * @returns {Promise<Array>} Array of OpenRouter model objects
 */
async function fetchOpenRouterModels() {
  logger.info('Fetching models from OpenRouter API...');
  
  try {
    // Use withRetry utility for exponential backoff
    const response = await withRetry(
      async () => {
        logger.debug('Making API request to OpenRouter');
        return axios.get(CONFIG.apiUrl, {
          headers: {
            'Authorization': `Bearer ${config.openrouter.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: CONFIG.requestTimeout
        });
      },
      {
        maxRetries: CONFIG.maxRetries,
        initialDelay: CONFIG.initialDelay,
        maxDelay: CONFIG.maxDelay,
        factor: CONFIG.factor,
        jitter: CONFIG.jitter,
        onRetry: (error, attempt, delay) => {
          logger.warn(`API request attempt ${attempt}/${CONFIG.maxRetries} failed: ${error.message}. Retrying in ${Math.round(delay)}ms...`);
        }
      }
    );
    
    // Validate response data
    const validation = validateResponseData(response.data, CONFIG.responseSchema);
    if (!validation.isValid) {
      const errorMsg = `Invalid response format from OpenRouter API: ${validation.errors.join(', ')}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    // Additional validation for data array
    if (!Array.isArray(response.data.data)) {
      throw new Error('Response data.data is not an array');
    }
    
    const models = response.data.data;
    logger.success(`Successfully fetched ${models.length} models from OpenRouter API`);
    
    // Log model count by provider for debugging
    const providerCounts = {};
    models.forEach(model => {
      const provider = model.top_provider?.name || 'unknown';
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
    });
    logger.debug('Models by provider:', providerCounts);
    
    return models;
  } catch (error) {
    logger.error('Failed to fetch OpenRouter models', error);
    throw new Error(`Failed to fetch OpenRouter models: ${error.message}`);
  }
}

/**
 * Finds an existing model in the database that matches the OpenRouter model
 * @param {Object} openRouterModel - OpenRouter model object
 * @param {Object} openRouterProvider - OpenRouter provider object
 * @returns {Promise<Object|null>} Database model object or null if not found
 */
async function findExistingModel(openRouterModel, openRouterProvider) {
  const { Model } = db.models;
  
  // Validate input parameters
  if (!openRouterModel || !openRouterModel.id) {
    logger.error('Invalid OpenRouter model object provided to findExistingModel');
    return null;
  }
  
  if (!openRouterProvider || !openRouterProvider.id) {
    logger.error('Invalid OpenRouter provider object provided to findExistingModel');
    return null;
  }
  
  try {
    logger.debug(`Finding existing model for OpenRouter model: ${openRouterModel.id}`);
    
    // First, try to find by api_model_id (exact match)
    let existingModel = await Model.findOne({
      where: {
        api_model_id: openRouterModel.id,
        id_provider: openRouterProvider.id
      }
    });

    if (existingModel) {
      logger.debug(`Found existing model by api_model_id: ${existingModel.model_slug} (ID: ${existingModel.id})`);
      return existingModel;
    }

    // Second, try to find by model_slug that contains the OpenRouter model ID
    // Clean the OpenRouter model ID to create a potential slug
    const cleanModelId = openRouterModel.id
      .replace(/[\/\s\.]/g, '-')
      .replace(/--+/g, '-')
      .toLowerCase();
    
    const potentialSlug = `${cleanModelId}-openrouter`;
    
    existingModel = await Model.findOne({
      where: {
        model_slug: potentialSlug,
        id_provider: openRouterProvider.id
      }
    });

    if (existingModel) {
      logger.debug(`Found existing model by model_slug: ${existingModel.model_slug} (ID: ${existingModel.id})`);
      return existingModel;
    }

    // Third, try to find by name similarity (case-insensitive)
    if (openRouterModel.name) {
      existingModel = await Model.findOne({
        where: {
          name: openRouterModel.name,
          id_provider: openRouterProvider.id
        }
      });

      if (existingModel) {
        logger.debug(`Found existing model by name: ${existingModel.model_slug} (ID: ${existingModel.id})`);
        return existingModel;
      }
    }

    logger.debug(`No existing model found for OpenRouter model: ${openRouterModel.id}`);
    return null;

  } catch (error) {
    logger.error(`Error finding existing model for ${openRouterModel.id}`, error);
    return null;
  }
}

/**
 * Updates an existing model with new data from OpenRouter
 * @param {Object} dbModel - Database model object
 * @param {Object} openRouterModel - OpenRouter model object
 * @returns {Promise<Object>} Updated model object with change summary
 */
async function updateExistingModel(dbModel, openRouterModel) {
  const changes = {};
  const originalValues = {};
  
  // Validate input parameters
  if (!dbModel || !dbModel.id) {
    logger.error('Invalid database model object provided to updateExistingModel');
    throw new Error('Invalid database model object');
  }
  
  if (!openRouterModel || !openRouterModel.id) {
    logger.error('Invalid OpenRouter model object provided to updateExistingModel');
    throw new Error('Invalid OpenRouter model object');
  }
  
  try {
    logger.debug(`Updating existing model: ${dbModel.model_slug} (ID: ${dbModel.id})`);
    
    // Track original values for reporting
    originalValues.api_model_id = dbModel.api_model_id;
    originalValues.description = dbModel.description;
    originalValues.max_tokens = dbModel.max_tokens;

    // Update api_model_id if different
    if (dbModel.api_model_id !== openRouterModel.id) {
      changes.api_model_id = {
        from: dbModel.api_model_id,
        to: openRouterModel.id
      };
      dbModel.api_model_id = openRouterModel.id;
    }

    // Update description if different and not null
    if (openRouterModel.description && dbModel.description !== openRouterModel.description) {
      changes.description = {
        from: dbModel.description,
        to: openRouterModel.description
      };
      dbModel.description = openRouterModel.description;
    }

    // Update max_tokens if different and valid
    const newMaxTokens = openRouterModel.context_length || 16000;
    if (dbModel.max_tokens !== newMaxTokens) {
      changes.max_tokens = {
        from: dbModel.max_tokens,
        to: newMaxTokens
      };
      dbModel.max_tokens = newMaxTokens;
    }

    // Update metadata with architecture information if available
    if (openRouterModel.architecture) {
      // Store architecture data in metadata field
      const currentMetadata = dbModel.metadata || {};
      currentMetadata.architecture = openRouterModel.architecture;
      dbModel.metadata = currentMetadata;
      
      // Track this change
      changes.metadata = {
        from: 'Updated with latest architecture data',
        to: 'Architecture data updated'
      };
    }

    // Save changes if any were made
    if (Object.keys(changes).length > 0) {
      await withRetry(
        async () => await dbModel.save(),
        {
          maxRetries: 3,
          initialDelay: 500,
          maxDelay: 5000,
          factor: 2,
          onRetry: (error, attempt) => {
            logger.warn(`Database save attempt ${attempt}/3 failed for model ${dbModel.model_slug}: ${error.message}`);
          }
        }
      );
      
      logger.success(`Updated model: ${dbModel.model_slug} (ID: ${dbModel.id})`);
      
      // Log specific changes
      Object.entries(changes).forEach(([field, change]) => {
        logger.info(`  ${field}: "${change.from}" → "${change.to}"`);
      });
    } else {
      logger.debug(`No changes needed for model: ${dbModel.model_slug} (ID: ${dbModel.id})`);
    }

    return {
      model: dbModel,
      changes,
      updated: Object.keys(changes).length > 0
    };

  } catch (error) {
    logger.error(`Error updating model ${dbModel.model_slug || 'unknown'}`, error);
    throw new Error(`Failed to update model: ${error.message}`);
  }
}

/**
 * Extracts and processes pricing data from OpenRouter model
 * @param {Object} openRouterModel - OpenRouter model object
 * @returns {Object|null} Processed pricing data or null if invalid
 */
function extractPricingData(openRouterModel) {
  try {
    // Validate pricing data exists
    if (!openRouterModel.pricing || typeof openRouterModel.pricing !== 'object') {
      logger.debug(`No pricing data found for model ${openRouterModel.id}`);
      return null;
    }
    
    const pricing = openRouterModel.pricing;
    
    // Extract pricing values and convert to numbers
    const promptPrice = parseFloat(pricing.prompt || '0');
    const completionPrice = parseFloat(pricing.completion || '0');
    
    // Validate pricing values
    if (isNaN(promptPrice) || isNaN(completionPrice)) {
      logger.warn(`Invalid pricing data for model ${openRouterModel.id}: prompt=${pricing.prompt}, completion=${pricing.completion}`);
      return null;
    }
    
    // Skip models with negative pricing (invalid)
    if (promptPrice < 0 || completionPrice < 0) {
      logger.warn(`Negative pricing for model ${openRouterModel.id}: prompt=${promptPrice}, completion=${completionPrice}`);
      return null;
    }
    
    // Convert from per-token to per-million tokens
    const price1mInputTokens = promptPrice * 1000000;
    const price1mOutputTokens = completionPrice * 1000000;
    
    // Calculate cost score per 1k tokens (average of input and output)
    const scoreCostPer1kTokens = ((promptPrice + completionPrice) / 2) * 1000;
    
    logger.debug(`Extracted pricing for model ${openRouterModel.id}: input=${price1mInputTokens}, output=${price1mOutputTokens}, score=${scoreCostPer1kTokens}`);
    
    return {
      price_1m_input_tokens: price1mInputTokens,
      price_1m_output_tokens: price1mOutputTokens,
      score_cost_per_1k_tokens: scoreCostPer1kTokens,
      source: 'openrouter',
      raw_pricing: pricing
    };
    
  } catch (error) {
    logger.error(`Error extracting pricing data for model ${openRouterModel.id}`, error);
    return null;
  }
}

/**
 * Updates or creates a models_price_score record with OpenRouter pricing
 * @param {Object} dbModel - Database model object
 * @param {Object} pricingData - Processed pricing data
 * @returns {Promise<Object>} Update result with details
 */
async function updateModelPricing(dbModel, pricingData) {
  const { ModelPriceScore } = db.models;
  
  // Validate input parameters
  if (!dbModel || !dbModel.id) {
    logger.error('Invalid database model object provided to updateModelPricing');
    throw new Error('Invalid database model object');
  }
  
  if (!pricingData) {
    logger.debug(`No pricing data provided for model ${dbModel.model_slug}`);
    return { updated: false, created: false, reason: 'no_pricing_data' };
  }
  
  try {
    logger.debug(`Updating pricing for model: ${dbModel.model_slug} (ID: ${dbModel.id})`);
    
    // Find existing price score record
    const existingPriceScore = await ModelPriceScore.findOne({
      where: {
        id_model: dbModel.id,
        source: 'openrouter'
      }
    });
    
    const priceScoreData = {
      id_model: dbModel.id,
      price_1m_input_tokens: pricingData.price_1m_input_tokens,
      price_1m_output_tokens: pricingData.price_1m_output_tokens,
      score_cost_per_1k_tokens: pricingData.score_cost_per_1k_tokens,
      source: 'openrouter'
    };
    
    if (existingPriceScore) {
      // Check if update is needed
      const needsUpdate = (
        existingPriceScore.price_1m_input_tokens !== pricingData.price_1m_input_tokens ||
        existingPriceScore.price_1m_output_tokens !== pricingData.price_1m_output_tokens ||
        existingPriceScore.score_cost_per_1k_tokens !== pricingData.score_cost_per_1k_tokens
      );
      
      if (needsUpdate) {
        const changes = {
          price_1m_input_tokens: {
            from: existingPriceScore.price_1m_input_tokens,
            to: pricingData.price_1m_input_tokens
          },
          price_1m_output_tokens: {
            from: existingPriceScore.price_1m_output_tokens,
            to: pricingData.price_1m_output_tokens
          },
          score_cost_per_1k_tokens: {
            from: existingPriceScore.score_cost_per_1k_tokens,
            to: pricingData.score_cost_per_1k_tokens
          }
        };
        
        // Update existing record
        await withRetry(
          async () => await existingPriceScore.update(priceScoreData),
          {
            maxRetries: 3,
            initialDelay: 500,
            maxDelay: 5000,
            factor: 2,
            onRetry: (error, attempt) => {
              logger.warn(`Price score update attempt ${attempt}/3 failed for model ${dbModel.model_slug}: ${error.message}`);
            }
          }
        );
        
        logger.success(`Updated pricing for model: ${dbModel.model_slug} (ID: ${dbModel.id})`);
        return { updated: true, created: false, changes, record: existingPriceScore };
      } else {
        logger.debug(`No pricing changes needed for model: ${dbModel.model_slug} (ID: ${dbModel.id})`);
        return { updated: false, created: false, reason: 'no_changes_needed' };
      }
    } else {
      // Create new record
      const newPriceScore = await withRetry(
        async () => await ModelPriceScore.create(priceScoreData),
        {
          maxRetries: 3,
          initialDelay: 500,
          maxDelay: 5000,
          factor: 2,
          onRetry: (error, attempt) => {
            logger.warn(`Price score creation attempt ${attempt}/3 failed for model ${dbModel.model_slug}: ${error.message}`);
          }
        }
      );
      
      logger.success(`Created pricing record for model: ${dbModel.model_slug} (ID: ${dbModel.id})`);
      return { updated: false, created: true, record: newPriceScore };
    }
    
  } catch (error) {
    logger.error(`Error updating pricing for model ${dbModel.model_slug || 'unknown'}`, error);
    throw new Error(`Failed to update pricing: ${error.message}`);
  }
}

/**
 * Creates a new model from OpenRouter data
 * @param {Object} openRouterModel - OpenRouter model object
 * @param {Object} openRouterProvider - OpenRouter provider object
 * @returns {Promise<Object>} Created model object
 */
async function createNewModel(openRouterModel, openRouterProvider) {
  const { Model } = db.models;
  
  // Validate input parameters
  if (!openRouterModel || !openRouterModel.id) {
    logger.error('Invalid OpenRouter model object provided to createNewModel');
    throw new Error('Invalid OpenRouter model object');
  }
  
  if (!openRouterProvider || !openRouterProvider.id) {
    logger.error('Invalid OpenRouter provider object provided to createNewModel');
    throw new Error('Invalid OpenRouter provider object');
  }
  
  try {
    // Clean model ID to create slug
    const cleanModelId = openRouterModel.id
      .replace(/[\/\s\.]/g, '-')
      .replace(/--+/g, '-')
      .toLowerCase();
    
    const modelSlug = `${cleanModelId}-openrouter`;
    logger.debug(`Creating new model with slug: ${modelSlug}`);
    
    // Check if a model with this slug already exists
    const existingModel = await Model.findOne({
      where: { model_slug: modelSlug }
    });
    
    if (existingModel) {
      logger.warn(`Model with slug ${modelSlug} already exists, skipping creation`);
      return null;
    }

    // Prepare model data with metadata
    const newModelData = {
      model_slug: modelSlug,
      api_model_id: openRouterModel.id,
      id_provider: openRouterProvider.id,
      name: openRouterModel.name || openRouterModel.id,
      display_name: openRouterModel.name || openRouterModel.id,
      description: openRouterModel.description || `OpenRouter model: ${openRouterModel.name || openRouterModel.id}`,
      max_tokens: openRouterModel.context_length || 16000,
      is_active: false, // New models are inactive by default
      metadata: {
        architecture: openRouterModel.architecture || null,
        pricing: openRouterModel.pricing || null,
        top_provider: openRouterModel.top_provider || null,
        created_at: new Date().toISOString()
      }
    };

    // Create model with retry logic
    const newModel = await withRetry(
      async () => await Model.create(newModelData),
      {
        maxRetries: 3,
        initialDelay: 500,
        maxDelay: 5000,
        factor: 2,
        onRetry: (error, attempt) => {
          logger.warn(`Database create attempt ${attempt}/3 failed for model ${modelSlug}: ${error.message}`);
        }
      }
    );
    
    logger.success(`Created new model: ${newModel.model_slug} (ID: ${newModel.id})`);
    
    return newModel;

  } catch (error) {
    logger.error(`Error creating new model for ${openRouterModel.id}`, error);
    throw new Error(`Failed to create model: ${error.message}`);
  }
}

/**
 * Generates a comprehensive summary report of all changes made
 * @param {Object} results - Results object containing all operation data
 * @returns {Object} Summary report
 */
function generateSummaryReport(results) {
  const summary = {
    timestamp: new Date().toISOString(),
    duration: results.endTime - results.startTime,
    totalModelsProcessed: results.totalModelsProcessed,
    modelsUpdated: results.modelsUpdated.length,
    modelsCreated: results.modelsCreated.length,
    pricingUpdated: results.pricingUpdated.length,
    pricingCreated: results.pricingCreated.length,
    pricingErrors: results.pricingErrors.length,
    errors: results.errors.length,
    success: results.errors.length === 0 && results.pricingErrors.length === 0,
    details: {
      updatedModels: results.modelsUpdated.map(update => ({
        slug: update.model.model_slug,
        id: update.model.id,
        changes: update.changes
      })),
      createdModels: results.modelsCreated.map(model => ({
        slug: model.model_slug,
        id: model.id,
        api_model_id: model.api_model_id
      })),
      updatedPricing: results.pricingUpdated.map(pricing => ({
        model_slug: pricing.model.model_slug,
        model_id: pricing.model.id,
        changes: pricing.changes
      })),
      createdPricing: results.pricingCreated.map(pricing => ({
        model_slug: pricing.model.model_slug,
        model_id: pricing.model.id,
        price_1m_input_tokens: pricing.record.price_1m_input_tokens,
        price_1m_output_tokens: pricing.record.price_1m_output_tokens,
        score_cost_per_1k_tokens: pricing.record.score_cost_per_1k_tokens
      })),
      pricingErrors: results.pricingErrors,
      errors: results.errors
    }
  };

  return summary;
}

/**
 * Main function to orchestrate the OpenRouter models update process
 */
async function updateOpenRouterModels() {
  logger.info('Starting OpenRouter models update process...');
  
  const results = {
    startTime: new Date(),
    endTime: null,
    totalModelsProcessed: 0,
    modelsUpdated: [],
    modelsCreated: [],
    skippedModels: [],
    pricingUpdated: [],
    pricingCreated: [],
    pricingErrors: [],
    errors: []
  };

  try {
    // Initialize database connection with retry logic
    logger.info('Initializing database connection...');
    await withRetry(
      async () => await db.initialize(),
      {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 5000,
        factor: 2,
        onRetry: (error, attempt) => {
          logger.warn(`Database initialization attempt ${attempt}/3 failed: ${error.message}`);
        }
      }
    );
    
    // Get OpenRouter provider
    const { Provider } = db.models;
    const openRouterProvider = await Provider.findOne({
      where: { name: 'openrouter' }
    });
    
    if (!openRouterProvider) {
      const errorMsg = 'OpenRouter provider not found in database. Please ensure providers are initialized.';
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    logger.success(`Found OpenRouter provider (ID: ${openRouterProvider.id})`);

    // Fetch models from OpenRouter API
    const openRouterModels = await fetchOpenRouterModels();
    results.totalModelsProcessed = openRouterModels.length;

    logger.info(`Processing ${openRouterModels.length} models...`);

    // Process models in batches using the processBatches utility
    await processBatches(
      openRouterModels,
      async (batch, batchNumber, totalBatches) => {
        logger.info(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} models)`);
        
        for (const openRouterModel of batch) {
          try {
            // Validate model data
            if (!openRouterModel.id) {
              const errorMsg = `Skipping model with missing ID: ${JSON.stringify(openRouterModel).substring(0, 100)}...`;
              logger.warn(errorMsg);
              results.skippedModels.push({ reason: 'missing_id', model: openRouterModel });
              continue;
            }
            
            // Skip models with invalid pricing (negative values)
            if (openRouterModel.pricing) {
              const inputPrice = parseFloat(openRouterModel.pricing.prompt || '0');
              const outputPrice = parseFloat(openRouterModel.pricing.completion || '0');
              
              if (inputPrice < 0 || outputPrice < 0) {
                logger.warn(`Skipping model ${openRouterModel.id} due to invalid pricing`);
                results.skippedModels.push({ 
                  reason: 'invalid_pricing', 
                  model_id: openRouterModel.id,
                  pricing: openRouterModel.pricing
                });
                continue;
              }
            }

            // Find existing model
            const existingModel = await findExistingModel(openRouterModel, openRouterProvider);

            let currentModel = null;
            if (existingModel) {
              // Update existing model
              const updateResult = await updateExistingModel(existingModel, openRouterModel);
              if (updateResult.updated) {
                results.modelsUpdated.push(updateResult);
              }
              currentModel = existingModel;
            } else {
              // Create new model
              const newModel = await createNewModel(openRouterModel, openRouterProvider);
              if (newModel) {
                results.modelsCreated.push(newModel);
                currentModel = newModel;
              }
            }

            // Process pricing data if we have a model to work with
            if (currentModel) {
              try {
                // Extract pricing data from OpenRouter model
                const pricingData = extractPricingData(openRouterModel);
                
                if (pricingData) {
                  // Update or create pricing record
                  const pricingResult = await updateModelPricing(currentModel, pricingData);
                  
                  if (pricingResult.updated) {
                    results.pricingUpdated.push({
                      model: currentModel,
                      changes: pricingResult.changes,
                      record: pricingResult.record
                    });
                  } else if (pricingResult.created) {
                    results.pricingCreated.push({
                      model: currentModel,
                      record: pricingResult.record
                    });
                  }
                } else {
                  logger.debug(`No valid pricing data found for model ${currentModel.model_slug}`);
                }
              } catch (pricingError) {
                const errorMsg = `Error processing pricing for model ${currentModel.model_slug}: ${pricingError.message}`;
                logger.error(errorMsg, pricingError);
                results.pricingErrors.push({
                  model_slug: currentModel.model_slug,
                  model_id: currentModel.id,
                  error: pricingError.message,
                  timestamp: new Date().toISOString()
                });
              }
            }

          } catch (error) {
            const errorMsg = `Error processing model ${openRouterModel.id || 'unknown'}: ${error.message}`;
            logger.error(errorMsg, error);
            results.errors.push({
              model_id: openRouterModel.id || 'unknown',
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
        }
      },
      {
        batchSize: CONFIG.batchSize,
        delayBetweenBatches: 100,
        onBatchComplete: (batchResults, batchNumber, totalBatches) => {
          logger.debug(`Completed batch ${batchNumber}/${totalBatches}`);
        }
      }
    );

    results.endTime = new Date();

    // Generate and display summary report
    const summary = generateSummaryReport(results);
    
    logger.info('\n📋 SUMMARY REPORT');
    logger.info('================');
    logger.info(`⏱️  Duration: ${Math.round(summary.duration / 1000)}s`);
    logger.info(`📊 Total models processed: ${summary.totalModelsProcessed}`);
    logger.info(`🔄 Models updated: ${summary.modelsUpdated}`);
    logger.info(`➕ Models created: ${summary.modelsCreated}`);
    logger.info(`💰 Pricing updated: ${summary.pricingUpdated}`);
    logger.info(`💵 Pricing created: ${summary.pricingCreated}`);
    logger.info(`⏭️ Models skipped: ${results.skippedModels.length}`);
    logger.info(`❌ Model errors: ${summary.errors}`);
    logger.info(`💸 Pricing errors: ${summary.pricingErrors}`);
    logger.info(`✅ Success: ${summary.success ? 'Yes' : 'No'}`);

    if (summary.modelsUpdated > 0) {
      logger.info('\n🔄 UPDATED MODELS:');
      summary.details.updatedModels.forEach(model => {
        logger.info(`   ${model.slug} (ID: ${model.id})`);
        Object.keys(model.changes).forEach(field => {
          const change = model.changes[field];
          logger.info(`     ${field}: "${change.from}" → "${change.to}"`);
        });
      });
    }

    if (summary.modelsCreated > 0) {
      logger.info('\n➕ CREATED MODELS:');
      summary.details.createdModels.forEach(model => {
        logger.info(`   ${model.slug} (ID: ${model.id}) - API ID: ${model.api_model_id}`);
      });
    }

    if (summary.pricingUpdated > 0) {
      logger.info('\n💰 UPDATED PRICING:');
      summary.details.updatedPricing.forEach(pricing => {
        logger.info(`   ${pricing.model_slug} (ID: ${pricing.model_id})`);
        Object.keys(pricing.changes).forEach(field => {
          const change = pricing.changes[field];
          logger.info(`     ${field}: ${change.from} → ${change.to}`);
        });
      });
    }

    if (summary.pricingCreated > 0) {
      logger.info('\n💵 CREATED PRICING:');
      summary.details.createdPricing.forEach(pricing => {
        logger.info(`   ${pricing.model_slug} (ID: ${pricing.model_id})`);
        logger.info(`     Input: $${pricing.price_1m_input_tokens}/1M tokens`);
        logger.info(`     Output: $${pricing.price_1m_output_tokens}/1M tokens`);
        logger.info(`     Score: $${pricing.score_cost_per_1k_tokens}/1K tokens`);
      });
    }

    if (results.skippedModels.length > 0) {
      logger.info('\n⏭️ SKIPPED MODELS:');
      results.skippedModels.forEach(item => {
        logger.info(`   ${item.model_id || 'unknown'} - Reason: ${item.reason}`);
      });
    }

    if (summary.errors > 0) {
      logger.info('\n❌ MODEL ERRORS:');
      summary.details.errors.forEach(error => {
        logger.info(`   ${error}`);
      });
    }

    if (summary.pricingErrors > 0) {
      logger.info('\n💸 PRICING ERRORS:');
      summary.details.pricingErrors.forEach(error => {
        logger.info(`   ${error.model_slug} (ID: ${error.model_id}): ${error.error}`);
      });
    }

    logger.success('\n🎉 OpenRouter models update completed!');
    
    return summary;

  } catch (error) {
    results.endTime = new Date();
    const errorMsg = `Fatal error during OpenRouter models update: ${error.message}`;
    logger.error(errorMsg, error);
    results.errors.push({
      type: 'fatal',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    const summary = generateSummaryReport(results);
    logger.error('\n📋 SUMMARY REPORT (WITH ERRORS)');
    logger.error('===============================');
    logger.error(`❌ Fatal error occurred: ${error.message}`);
    logger.error(`📊 Models processed before error: ${summary.totalModelsProcessed}`);
    logger.error(`🔄 Models updated: ${summary.modelsUpdated}`);
    logger.error(`➕ Models created: ${summary.modelsCreated}`);
    
    throw error;
  } finally {
    // Close database connection
    try {
      await db.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection:', error);
    }
  }
}

// Run the script if executed directly
if (require.main === module) {
  updateOpenRouterModels()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Script failed:', error.message);
      process.exit(1);
    });
}

// Export for use as a module
module.exports = {
  updateOpenRouterModels,
  fetchOpenRouterModels,
  findExistingModel,
  updateExistingModel,
  createNewModel,
  extractPricingData,
  updateModelPricing,
  generateSummaryReport,
  CONFIG
};