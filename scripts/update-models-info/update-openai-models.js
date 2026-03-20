#!/usr/bin/env node

/**
 * OpenAI Models Update Script
 * 
 * This script synchronizes OpenAI model data from their API with our database.
 * It updates existing models and creates new ones with is_active: false.
 * 
 * Features:
 * - Fetches models from https://api.openai.com/v1/models
 * - Updates api_model_id, description, and max_tokens for existing models
 * - Creates new models with is_active: false
 * - Updates pricing data in models_price_score table
 * - Comprehensive error handling and logging
 * - Summary reports of changes made
 * - Idempotent operation (safe to run multiple times)
 * 
 * Usage:
 *   node scripts/update-openai-models.js
 */

const axios = require('axios');
const db = require('../../database');
const config = require('../../config/config');
const { createLogger, withRetry, validateResponseData } = require('../utils/error-handler');

// Initialize logger
const logger = createLogger('update-openai-models');

// Configuration
const CONFIG = {
  // OpenAI API endpoint
  apiUrl: 'https://api.openai.com/v1/models',
  // Request timeout in milliseconds
  requestTimeout: 30000,
  // Retry configuration
  maxRetries: 3,
  initialDelay: 2000,
  maxDelay: 30000,
  factor: 2,
  jitter: 0.1,
  // Batch processing size
  batchSize: 20,
  // Response validation schema
  responseSchema: {
    required: ['data'],
    fields: {
      'data': 'array'
    }
  }
};

/**
 * Fetches all models from the OpenAI API with fallback to known models
 * @returns {Promise<Array>} Array of OpenAI model objects
 */
async function fetchOpenAIModels() {
  logger.info('Fetching models from OpenAI API...');
  
  if (!config.openai?.apiKey) {
    logger.warn('OpenAI API key not found in configuration, using fallback models');
    return getFallbackModels();
  }
  
  try {
    const response = await axios.get(CONFIG.apiUrl, {
      headers: {
        'Authorization': `Bearer ${config.openai.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: CONFIG.requestTimeout
    });
    
    // Validate response structure
    validateResponseData(response.data, CONFIG.responseSchema);
    
    // Filter to only include relevant models (exclude embeddings, moderation, etc.)
    const relevantModels = response.data.data.filter(model => {
      return (
        model.id.includes('gpt') || 
        model.id.includes('davinci') || 
        model.id.includes('text-') ||
        model.id.includes('o1') ||
        model.id.includes('gpt-4o')
      ) && !model.id.includes('embed') && !model.id.includes('moderation');
    });
    
    logger.info(`Successfully fetched ${response.data.data.length} total models, ${relevantModels.length} relevant models from OpenAI API`);
    
    // Log model details for debugging
    relevantModels.forEach(model => {
      logger.debug(`API Model: ${model.id} (owned_by: ${model.owned_by || 'unknown'})`);
    });
    
    return relevantModels;
  } catch (error) {
    if (error.response) {
      logger.warn(`OpenAI API returned ${error.response.status}: ${error.response.statusText}`);
      if (error.response.data) {
        logger.debug('API Error Details:', error.response.data);
      }
    } else if (error.request) {
      logger.warn('No response received from OpenAI API');
    } else {
      logger.warn('Error setting up request to OpenAI API:', error.message);
    }
    
    logger.info('Falling back to known OpenAI models...');
    return getFallbackModels();
  }
}

/**
 * Returns a list of known OpenAI models when API is not available
 * @returns {Array} Array of known OpenAI model objects
 */
function function getFallbackModels() {
  logger.warn('Unknown API unavailable - no fallback models available');
  logger.error('Cannot proceed without API access. Please check your API key and network connection.');
  throw new Error('Unknown API unavailable and no fallback models configured. Please ensure API access is available.');
},
    {
      id: 'gpt-4o-mini',
      object: 'model', 
      owned_by: 'openai-internal',
      context_length: 128000
    },
    {
      id: 'gpt-4-turbo',
      object: 'model',
      owned_by: 'openai',
      context_length: 128000
    },
    {
      id: 'gpt-4-turbo-preview',
      object: 'model',
      owned_by: 'openai',
      context_length: 128000
    },
    {
      id: 'gpt-4-vision-preview',
      object: 'model',
      owned_by: 'openai',
      context_length: 128000
    },
    {
      id: 'gpt-4',
      object: 'model',
      owned_by: 'openai',
      context_length: 8192
    },
    {
      id: 'gpt-3.5-turbo',
      object: 'model',
      owned_by: 'openai',
      context_length: 16385
    },
    {
      id: 'gpt-3.5-turbo-16k',
      object: 'model',
      owned_by: 'openai',
      context_length: 16385
    },
    {
      id: 'o1-preview',
      object: 'model',
      owned_by: 'openai-internal',
      context_length: 128000
    },
    {
      id: 'o1-mini',
      object: 'model',
      owned_by: 'openai-internal', 
      context_length: 65536
    }
  ];
}

/**
 * Gets the OpenAI provider ID from the database
 * @returns {Promise<number>} Provider ID
 */
async function getOpenAIProviderId() {
  const { Provider } = db.models;
  
  try {
    const provider = await Provider.findOne({
      where: { name: 'openai' }
    });
    
    if (!provider) {
      throw new Error('OpenAI provider not found in database');
    }
    
    logger.debug(`Found OpenAI provider with ID: ${provider.id}`);
    return provider.id;
  } catch (error) {
    logger.error('Error finding OpenAI provider:', error);
    throw error;
  }
}

/**
 * Creates a model slug from the API model ID
 * @param {string} apiModelId - API model identifier
 * @returns {string} Model slug for database
 */
function createModelSlug(apiModelId) {
  // Convert API model ID to our slug format
  // Replace dots with hyphens for consistency
  const cleanId = apiModelId.replace(/\./g, '-');
  return `${cleanId}-openai`;
}

/**
 * Extracts pricing data from an OpenAI model object
 * @param {Object} openaiModel - Model object from OpenAI API
 * @returns {Object|null} Extracted pricing data or null if unavailable
 */
function extractPricingData(openaiModel) {
  try {
    // OpenAI API models don't include pricing in the models endpoint
    // We'll use fallback pricing based on model type
    const fallbackPricing = {
      // GPT-4 models
      'gpt-4o': { input: 2.5, output: 10.0 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'gpt-4-turbo': { input: 10.0, output: 30.0 },
      'gpt-4-turbo-preview': { input: 10.0, output: 30.0 },
      'gpt-4-vision-preview': { input: 10.0, output: 30.0 },
      'gpt-4': { input: 30.0, output: 60.0 },
      
      // GPT-3.5 models
      'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
      'gpt-3.5-turbo-16k': { input: 3.0, output: 4.0 },
      
      // O1 models
      'o1-preview': { input: 15.0, output: 60.0 },
      'o1-mini': { input: 3.0, output: 12.0 },
      
      // Legacy models
      'text-davinci-003': { input: 20.0, output: 20.0 },
      'text-davinci-002': { input: 20.0, output: 20.0 }
    };
    
    const modelId = openaiModel.id;
    let pricing = fallbackPricing[modelId];
    
    if (!pricing) {
      // Try to find pricing based on model family
      if (modelId.includes('gpt-4o')) {
        pricing = { input: 2.5, output: 10.0 };
      } else if (modelId.includes('gpt-4') && modelId.includes('turbo')) {
        pricing = { input: 10.0, output: 30.0 };
      } else if (modelId.includes('gpt-4')) {
        pricing = { input: 30.0, output: 60.0 };
      } else if (modelId.includes('gpt-3.5')) {
        pricing = { input: 0.5, output: 1.5 };
      } else if (modelId.includes('o1')) {
        pricing = { input: 15.0, output: 60.0 };
      }
    }
    
    if (pricing) {
      return {
        price_1m_input_tokens: pricing.input,
        price_1m_output_tokens: pricing.output,
        score_cost_per_1k_tokens: (pricing.input + pricing.output) / 1000,
        score_intelligence: null, // To be populated by other scripts
        score_speed: null, // To be populated by other scripts  
        score_overall: null // To be populated by other scripts
      };
    }
    
    logger.warn(`No pricing data available for model: ${modelId}`);
    return null;
  } catch (error) {
    logger.error(`Error extracting pricing data for model ${openaiModel.id}`, error);
    return null;
  }
}

/**
 * Updates or creates a models_price_score record with OpenAI pricing
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
        source: 'openai'
      }
    });
    
    const priceScoreData = {
      id_model: dbModel.id,
      price_1m_input_tokens: pricingData.price_1m_input_tokens,
      price_1m_output_tokens: pricingData.price_1m_output_tokens,
      score_cost_per_1k_tokens: pricingData.score_cost_per_1k_tokens,
      score_intelligence: pricingData.score_intelligence,
      score_speed: pricingData.score_speed,
      score_overall: pricingData.score_overall,
      source: 'openai',
      updated_at: new Date()
    };
    
    if (existingPriceScore) {
      // Update existing record
      const [updatedRows] = await ModelPriceScore.update(priceScoreData, {
        where: {
          id_model: dbModel.id,
          source: 'openai'
        }
      });
      
      if (updatedRows > 0) {
        logger.info(`✅ Updated pricing for model: ${dbModel.model_slug}`);
        return { updated: true, created: false };
      } else {
        logger.warn(`No rows updated for model: ${dbModel.model_slug}`);
        return { updated: false, created: false, reason: 'no_update' };
      }
    } else {
      // Create new record
      const newPriceScore = await ModelPriceScore.create(priceScoreData);
      
      if (newPriceScore) {
        logger.info(`✅ Created pricing for model: ${dbModel.model_slug}`);
        return { updated: false, created: true };
      } else {
        logger.warn(`Failed to create pricing record for model: ${dbModel.model_slug}`);
        return { updated: false, created: false, reason: 'creation_failed' };
      }
    }
  } catch (error) {
    logger.error(`Error updating pricing for model ${dbModel.model_slug}:`, error);
    throw error;
  }
}

/**
 * Updates or creates a model record in the database
 * @param {Object} openaiModel - Model object from OpenAI API
 * @param {number} providerId - OpenAI provider ID
 * @returns {Promise<Object>} Update result with details
 */
async function updateOrCreateModel(openaiModel, providerId) {
  const { Model } = db.models;
  
  const modelSlug = createModelSlug(openaiModel.id);
  const apiModelId = openaiModel.id;
  
  try {
    logger.debug(`Processing model: ${apiModelId} -> ${modelSlug}`);
    
    // Find existing model
    const existingModel = await Model.findOne({
      where: {
        model_slug: modelSlug,
        id_provider: providerId
      }
    });
    
    // Determine max_tokens based on model or API data
    let maxTokens = 16000; // Default
    if (openaiModel.context_length) {
      maxTokens = openaiModel.context_length;
    } else if (apiModelId.includes('gpt-4o') || apiModelId.includes('gpt-4-turbo') || apiModelId.includes('o1')) {
      maxTokens = 128000;
    } else if (apiModelId.includes('gpt-4')) {
      maxTokens = 8192;
    } else if (apiModelId.includes('16k')) {
      maxTokens = 16385;
    }
    
    const modelData = {
      model_slug: modelSlug,
      api_model_id: apiModelId,
      id_provider: providerId,
      name: `${openaiModel.id} (OpenAI)`,
      display_name: `${openaiModel.id}`,
      description: `OpenAI ${openaiModel.id} model`,
      max_tokens: maxTokens,
      is_active: false, // Set to false by default for new models
      updated_at: new Date()
    };
    
    let result = { model: null, updated: false, created: false };
    
    if (existingModel) {
      // Update existing model (preserve is_active setting)
      delete modelData.is_active; // Don't change existing active status
      
      const [updatedRows] = await Model.update(modelData, {
        where: {
          model_slug: modelSlug,
          id_provider: providerId
        }
      });
      
      if (updatedRows > 0) {
        logger.info(`✅ Updated model: ${modelSlug} (api_model_id: ${apiModelId})`);
        result = { model: existingModel, updated: true, created: false };
      } else {
        logger.debug(`No update needed for model: ${modelSlug}`);
        result = { model: existingModel, updated: false, created: false };
      }
    } else {
      // Create new model
      const newModel = await Model.create(modelData);
      logger.info(`✅ Created new model: ${modelSlug} (api_model_id: ${apiModelId}) - set as inactive`);
      result = { model: newModel, updated: false, created: true };
    }
    
    // Update pricing data if available
    const pricingData = extractPricingData(openaiModel);
    if (pricingData && result.model) {
      try {
        await updateModelPricing(result.model, pricingData);
      } catch (pricingError) {
        logger.warn(`Failed to update pricing for ${modelSlug}:`, pricingError.message);
      }
    }
    
    return result;
  } catch (error) {
    logger.error(`Error updating/creating model ${apiModelId}:`, error);
    throw error;
  }
}

/**
 * Processes a batch of models from the OpenAI API
 * @param {Array} openaiModels - Array of model objects from API
 * @param {number} providerId - OpenAI provider ID
 * @returns {Promise<Object>} Batch processing results
 */
async function processBatch(openaiModels, providerId) {
  const results = {
    processed: 0,
    updated: 0,
    created: 0,
    skipped: 0,
    errors: 0
  };
  
  for (const openaiModel of openaiModels) {
    try {
      const updateResult = await updateOrCreateModel(openaiModel, providerId);
      
      if (updateResult.updated) {
        results.updated++;
      } else if (updateResult.created) {
        results.created++;
      } else {
        results.skipped++;
      }
      
      results.processed++;
      
    } catch (error) {
      logger.error(`Error processing model ${openaiModel.id}:`, error);
      results.errors++;
      results.processed++;
    }
  }
  
  return results;
}

/**
 * Main function to update all OpenAI models
 */
async function updateOpenAIModels() {
  logger.info('🚀 Starting OpenAI models update...');
  
  try {
    // Initialize database connection
    if (!db.initialized) {
      logger.info('Initializing database connection...');
      await db.initialize();
    }
    
    // Get OpenAI provider ID
    const providerId = await getOpenAIProviderId();
    
    // Fetch models from OpenAI API with retry logic
    const openaiModels = await withRetry(
      () => fetchOpenAIModels(),
      CONFIG.maxRetries,
      CONFIG.initialDelay,
      CONFIG.maxDelay,
      CONFIG.factor,
      CONFIG.jitter,
      logger
    );
    
    if (!openaiModels || openaiModels.length === 0) {
      logger.warn('No models received from OpenAI API');
      return;
    }
    
    // Process models in batches
    logger.info(`Processing ${openaiModels.length} models in batches of ${CONFIG.batchSize}...`);
    
    const totalResults = {
      processed: 0,
      updated: 0,
      created: 0,
      skipped: 0,
      errors: 0
    };
    
    // Process models in batches
    for (let i = 0; i < openaiModels.length; i += CONFIG.batchSize) {
      const batch = openaiModels.slice(i, i + CONFIG.batchSize);
      logger.info(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(openaiModels.length / CONFIG.batchSize)}...`);
      
      const batchResults = await withRetry(
        () => processBatch(batch, providerId),
        CONFIG.maxRetries,
        CONFIG.initialDelay,
        CONFIG.maxDelay,
        CONFIG.factor,
        CONFIG.jitter,
        logger
      );
      
      // Aggregate results
      totalResults.processed += batchResults.processed;
      totalResults.updated += batchResults.updated;
      totalResults.created += batchResults.created;
      totalResults.skipped += batchResults.skipped;
      totalResults.errors += batchResults.errors;
      
      logger.info(`Batch completed: ${batchResults.processed} processed, ${batchResults.updated} updated, ${batchResults.created} created`);
    }
    
    // Print final summary
    logger.info('');
    logger.info('📊 OPENAI MODELS UPDATE SUMMARY:');
    logger.info('=================================');
    logger.info(`Total models processed: ${totalResults.processed}`);
    logger.info(`Models updated: ${totalResults.updated}`);
    logger.info(`Models created: ${totalResults.created}`);
    logger.info(`Models skipped: ${totalResults.skipped}`);
    logger.info(`Errors encountered: ${totalResults.errors}`);
    
    if (totalResults.errors > 0) {
      logger.warn(`⚠️  Completed with ${totalResults.errors} errors`);
    } else {
      logger.info('✅ Update completed successfully!');
    }
    
  } catch (error) {
    logger.error('❌ Fatal error during OpenAI models update:', error);
    process.exit(1);
  } finally {
    // Close database connection
    try {
      await db.close();
      logger.info('Database connection closed');
    } catch (closeError) {
      logger.error('Error closing database connection:', closeError);
    }
  }
}

// Run if called directly
if (require.main === module) {
  updateOpenAIModels()
    .then(() => {
      logger.info('Script execution completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Script execution failed:', error);
      process.exit(1);
    });
}

module.exports = {
  updateOpenAIModels,
  extractPricingData,
  createModelSlug
};