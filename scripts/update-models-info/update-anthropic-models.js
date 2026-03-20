#!/usr/bin/env node

/**
 * Anthropic Models Update Script
 * 
 * This script synchronizes Anthropic model data from their API with our database.
 * It updates existing models and creates new ones with is_active: false.
 * 
 * Features:
 * - Fetches models from https://api.anthropic.com/v1/models
 * - Updates api_model_id, description, and max_tokens for existing models
 * - Creates new models with is_active: false
 * - Updates pricing data in models_price_score table
 * - Comprehensive error handling and logging
 * - Summary reports of changes made
 * - Idempotent operation (safe to run multiple times)
 * 
 * Usage:
 *   node scripts/update-anthropic-models.js
 */

const axios = require('axios');
const db = require('../../database');
const config = require('../../config/config');
const { createLogger, withRetry, validateResponseData, processBatches } = require('../utils/error-handler');

// Initialize logger
const logger = createLogger('update-anthropic-models');

// Configuration
const CONFIG = {
  // Anthropic API endpoint
  apiUrl: 'https://api.anthropic.com/v1/models',
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
 * Fetches all models from the Anthropic API with fallback to known models
 * @returns {Promise<Array>} Array of Anthropic model objects
 */
async function fetchAnthropicModels() {
  logger.info('Fetching models from Anthropic API...');
  
  if (!config.anthropic?.apiKey) {
    logger.warn('Anthropic API key not found in configuration, using fallback models');
    return getFallbackModels();
  }
  
  try {
    const response = await axios.get(CONFIG.apiUrl, {
      headers: {
        'x-api-key': config.anthropic.apiKey,
        'anthropic-version': '2023-06-01', // Required header for Anthropic API
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: CONFIG.requestTimeout
    });
    
    // Validate response structure
    validateResponseData(response.data, CONFIG.responseSchema);
    
    logger.info(`Successfully fetched ${response.data.data.length} models from Anthropic API`);
    
    // Log model details for debugging
    response.data.data.forEach(model => {
      logger.debug(`API Model: ${model.id} (type: ${model.type || 'unknown'})`);
    });
    
    return response.data.data;
  } catch (error) {
    if (error.response) {
      logger.warn(`Anthropic API returned ${error.response.status}: ${error.response.statusText}`);
      if (error.response.data) {
        logger.debug('API Error Details:', error.response.data);
      }
    } else if (error.request) {
      logger.warn('No response received from Anthropic API');
    } else {
      logger.warn('Error setting up request to Anthropic API:', error.message);
    }
    
    logger.info('Falling back to known Anthropic models...');
    return getFallbackModels();
  }
}

/**
 * Returns a list of known Anthropic models when API is not available
 * @returns {Array} Array of known Anthropic model objects
 */
function function getFallbackModels() {
  logger.warn('Unknown API unavailable - no fallback models available');
  logger.error('Cannot proceed without API access. Please check your API key and network connection.');
  throw new Error('Unknown API unavailable and no fallback models configured. Please ensure API access is available.');
},
    {
      id: 'claude-3-sonnet-20240229',
      display_name: 'Claude 3 Sonnet',
      description: 'Balance of intelligence and speed for everyday tasks',
      max_tokens: 200000,
      type: 'text'
    },
    {
      id: 'claude-3-opus-20240229',
      display_name: 'Claude 3 Opus',
      description: 'Most powerful model for highly complex tasks',
      max_tokens: 200000,
      type: 'text'
    },
    {
      id: 'claude-3-5-sonnet-20240620',
      display_name: 'Claude 3.5 Sonnet',
      description: 'Enhanced version of Claude 3 Sonnet with improved capabilities',
      max_tokens: 200000,
      type: 'text'
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      display_name: 'Claude 3.5 Sonnet (Latest)',
      description: 'Latest version of Claude 3.5 Sonnet with updated training',
      max_tokens: 200000,
      type: 'text'
    },
    {
      id: 'claude-3-5-haiku-20241022',
      display_name: 'Claude 3.5 Haiku',
      description: 'Enhanced version of Claude 3 Haiku with improved capabilities',
      max_tokens: 200000,
      type: 'text'
    },
    {
      id: 'claude-sonnet-4-20250514',
      display_name: 'Claude Sonnet 4',
      description: 'Next generation Claude model with advanced capabilities',
      max_tokens: 200000,
      type: 'text'
    },
    {
      id: 'claude-3-7-sonnet-20250219',
      display_name: 'Claude 3.7 Sonnet',
      description: 'Advanced Claude model with enhanced reasoning capabilities',
      max_tokens: 200000,
      type: 'text'
    }
  ];
}

/**
 * Gets the Anthropic provider ID from the database
 * @returns {Promise<number>} Provider ID
 */
async function getAnthropicProviderId() {
  const { Provider } = db.models;
  
  try {
    const provider = await Provider.findOne({
      where: { name: 'anthropic' }
    });
    
    if (!provider) {
      throw new Error('Anthropic provider not found in database');
    }
    
    logger.debug(`Found Anthropic provider with ID: ${provider.id}`);
    return provider.id;
  } catch (error) {
    logger.error('Error finding Anthropic provider:', error);
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
  return `${apiModelId}-anthropic`;
}

/**
 * Extracts pricing data from an Anthropic model object
 * @param {Object} anthropicModel - Model object from Anthropic API
 * @returns {Object|null} Extracted pricing data or null if unavailable
 */
function extractPricingData(anthropicModel) {
  try {
    // Anthropic API models don't always include pricing in the models endpoint
    // We'll use fallback pricing based on model type
    const fallbackPricing = {
      // Claude 3 models
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
      'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
      'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
      
      // Claude 3.5 models  
      'claude-3-5-sonnet-20240620': { input: 3.0, output: 15.0 },
      'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
      'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
      
      // Claude 4 models
      'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
      
      // Generic fallbacks
      'claude-3-haiku': { input: 0.25, output: 1.25 },
      'claude-3-sonnet': { input: 3.0, output: 15.0 },
      'claude-3-opus': { input: 15.0, output: 75.0 },
      'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
      'claude-3-7-sonnet': { input: 3.0, output: 15.0 },
      'claude-3-7-sonnet-20250219': { input: 3.0, output: 15.0 }
    };
    
    const modelId = anthropicModel.id;
    let pricing = fallbackPricing[modelId];
    
    if (!pricing) {
      // Try to find pricing based on model family
      if (modelId.includes('haiku')) {
        pricing = { input: 0.25, output: 1.25 };
      } else if (modelId.includes('sonnet')) {
        pricing = { input: 3.0, output: 15.0 };
      } else if (modelId.includes('opus')) {
        pricing = { input: 15.0, output: 75.0 };
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
    logger.error(`Error extracting pricing data for model ${anthropicModel.id}`, error);
    return null;
  }
}

/**
 * Updates or creates a models_price_score record with Anthropic pricing
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
        source: 'anthropic'
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
      source: 'anthropic',
      updated_at: new Date()
    };
    
    if (existingPriceScore) {
      // Update existing record
      const [updatedRows] = await ModelPriceScore.update(priceScoreData, {
        where: {
          id_model: dbModel.id,
          source: 'anthropic'
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
 * @param {Object} anthropicModel - Model object from Anthropic API
 * @param {number} providerId - Anthropic provider ID
 * @returns {Promise<Object>} Update result with details
 */
async function updateOrCreateModel(anthropicModel, providerId) {
  const { Model } = db.models;
  
  const modelSlug = createModelSlug(anthropicModel.id);
  const apiModelId = anthropicModel.id;
  
  try {
    logger.debug(`Processing model: ${apiModelId} -> ${modelSlug}`);
    
    // Find existing model
    const existingModel = await Model.findOne({
      where: {
        model_slug: modelSlug,
        id_provider: providerId
      }
    });
    
    const modelData = {
      model_slug: modelSlug,
      api_model_id: apiModelId,
      id_provider: providerId,
      name: anthropicModel.display_name || anthropicModel.id,
      display_name: anthropicModel.display_name || anthropicModel.id,
      description: anthropicModel.description || `Anthropic ${anthropicModel.id} model`,
      max_tokens: anthropicModel.max_tokens || 200000, // Anthropic models typically support 200k tokens
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
    const pricingData = extractPricingData(anthropicModel);
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
 * Processes a batch of models from the Anthropic API
 * @param {Array} anthropicModels - Array of model objects from API
 * @param {number} providerId - Anthropic provider ID
 * @returns {Promise<Object>} Batch processing results
 */
async function processBatch(anthropicModels, providerId) {
  const results = {
    processed: 0,
    updated: 0,
    created: 0,
    skipped: 0,
    errors: 0
  };
  
  for (const anthropicModel of anthropicModels) {
    try {
      const updateResult = await updateOrCreateModel(anthropicModel, providerId);
      
      if (updateResult.updated) {
        results.updated++;
      } else if (updateResult.created) {
        results.created++;
      } else {
        results.skipped++;
      }
      
      results.processed++;
      
    } catch (error) {
      logger.error(`Error processing model ${anthropicModel.id}:`, error);
      results.errors++;
      results.processed++;
    }
  }
  
  return results;
}

/**
 * Main function to update all Anthropic models
 */
async function updateAnthropicModels() {
  logger.info('🚀 Starting Anthropic models update...');
  
  try {
    // Initialize database connection
    if (!db.initialized) {
      logger.info('Initializing database connection...');
      await db.initialize();
    }
    
    // Get Anthropic provider ID
    const providerId = await getAnthropicProviderId();
    
    // Fetch models from Anthropic API with retry logic
    const anthropicModels = await withRetry(
      () => fetchAnthropicModels(),
      CONFIG.maxRetries,
      CONFIG.initialDelay,
      CONFIG.maxDelay,
      CONFIG.factor,
      CONFIG.jitter,
      logger
    );
    
    if (!anthropicModels || anthropicModels.length === 0) {
      logger.warn('No models received from Anthropic API');
      return;
    }
    
    // Process models in batches
    logger.info(`Processing ${anthropicModels.length} models in batches of ${CONFIG.batchSize}...`);
    
    const totalResults = {
      processed: 0,
      updated: 0,
      created: 0,
      skipped: 0,
      errors: 0
    };
    
    // Process models in batches
    for (let i = 0; i < anthropicModels.length; i += CONFIG.batchSize) {
      const batch = anthropicModels.slice(i, i + CONFIG.batchSize);
      logger.info(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(anthropicModels.length / CONFIG.batchSize)}...`);
      
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
    logger.info('📊 ANTHROPIC MODELS UPDATE SUMMARY:');
    logger.info('===================================');
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
    logger.error('❌ Fatal error during Anthropic models update:', error);
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
  updateAnthropicModels()
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
  updateAnthropicModels,
  extractPricingData,
  createModelSlug
};