#!/usr/bin/env node

/**
 * Veo3 Models Update Script
 * 
 * This script creates missing Veo3 models and updates their pricing data.
 * Since Veo3 doesn't have a public API for pricing, we use manual pricing data.
 * 
 * Features:
 * - Creates missing Veo3 models in the models table
 * - Updates pricing for Veo3 models in the models_price_score table
 * - Uses price_video field for video generation pricing
 * - Comprehensive error handling and logging
 * - Summary reports of changes made
 * - Idempotent operation (safe to run multiple times)
 * 
 * Usage:
 *   node scripts/update-models-info/update-veo3-models.js
 */

const db = require('../../database');
const { createLogger, withRetry } = require('../utils/error-handler');

// Initialize logger
const logger = createLogger('update-veo3-models');

// Configuration
const CONFIG = {
  // Batch processing size
  batchSize: 10,
  // Retry configuration
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  factor: 2,
  jitter: 0.1
};

/**
 * Veo3 capabilities configuration
 * Defines the capabilities that all Veo3 models support
 */
const veo3_capabilities = [
  { name: 'Video generation', type: 'vision', description: 'Ability to generate videos from text prompts' },
  { name: 'Text to video', type: 'output', description: 'Ability to create video from text descriptions' },
  { name: 'Audio generation', type: 'output', description: 'Ability to create synchronized audio with video' }
];
  
/**
 * Veo3 models list made by FF in 06/08/2025
 */

const VEO3_MODELS_AND_PRICING = [
  {
    "model_slug": "veo-3.0-generate-preview-google",
    "name": "Veo 3 (Video + Audio)",
    "display_name": "Veo 3 (Video + Audio)",
    "api_model_id": "veo-3.0-generate-preview",
    "description": "High-quality video generation with synchronized audio, dialogue, and sound effects",
    "max_duration_seconds": 8,
    "price_per_second": 0.75
  },
  {
    "model_slug": "veo-3.0-generate-video-only-preview-google",
    "name": "Veo 3 (Video Only)",
    "display_name": "Veo 3 (Video Only)",
    "api_model_id": "veo-3.0-generate-video-only-preview",
    "description": "High-quality video generation without audio",
    "max_duration_seconds": 8,
    "price_per_second": 0.25
  },
  {
    "model_slug": "veo-3.0-fast-generate-preview-google",
    "name": "Veo 3 Fast (Video + Audio)",
    "display_name": "Veo 3 Fast (Video + Audio)",
    "api_model_id": "veo-3.0-fast-generate-preview",
    "description": "Faster, cost-effective video generation with synchronized audio",
    "max_duration_seconds": 8,
    "price_per_second": 0.40
  },
  {
    "model_slug": "veo-3.0-fast-generate-video-only-preview-google",
    "name": "Veo 3 Fast (Video Only)",
    "display_name": "Veo 3 Fast (Video Only)",
    "api_model_id": "veo-3.0-fast-generate-video-only-preview",
    "description": "Faster, cost-effective video generation without audio",
    "max_duration_seconds": 8,
    "price_per_second": 0.25
  }
]

/**
 * Gets the Google Veo provider ID from the database
 * @returns {Promise<number>} Provider ID
 */
async function getGoogleVeoProviderId() {
  const { Provider } = db.models;
  
  try {
    const provider = await Provider.findOne({
      where: { name: 'google-veo' }
    });
    
    if (!provider) {
      throw new Error('google-veo provider not found in database');
    }
    
    logger.debug(`Found google-veo provider with ID: ${provider.id}`);
    return provider.id;
  } catch (error) {
    logger.error('Error finding google-veo provider:', error);
    throw error;
  }
}

/**
 * Creates missing Google Veo models in the database
 * @param {number} providerId - Provider ID
 * @returns {Promise<Object>} Creation results
 */
async function createMissingModels(providerId) {
  const { Model } = db.models;
  const results = { created: 0, existing: 0, errors: 0 };
  
  logger.info('Checking for missing Google Veo models...');
  
  for (const modelData of VEO3_MODELS_AND_PRICING) {
    try {
      const [model, created] = await Model.findOrCreate({
        where: {
          model_slug: modelData.model_slug,
          id_provider: providerId
        },
        defaults: {
          model_slug: modelData.model_slug,
          api_model_id: modelData.api_model_id,
          id_provider: providerId,
          name: modelData.name,
          display_name: modelData.display_name,
          description: modelData.description,
          max_tokens: 16000, // Default for video models
          is_active: true
        }
      });
      
      if (created) {
        logger.info(`✅ Created model: ${model.model_slug}`);
        results.created++;
      } else {
        logger.debug(`Model already exists: ${model.model_slug}`);
        results.existing++;
      }
    } catch (error) {
      logger.error(`Error creating model ${modelData.model_slug}:`, error);
      results.errors++;
    }
  }
  
  logger.info(`Model creation summary: ${results.created} created, ${results.existing} existing, ${results.errors} errors`);
  return results;
}

/**
 * Fetches all Google Veo models from the database
 * @returns {Promise<Array>} Array of Google Veo model objects
 */
async function fetchGoogleVeoModels() {
  const { Model } = db.models;
  
  try {
    const providerId = await getGoogleVeoProviderId();
    
    const models = await Model.findAll({
      where: {
        id_provider: providerId
      },
      order: [['model_slug', 'ASC']]
    });
    
    logger.info(`Found ${models.length} Google Veo models in database`);
    
    // Log model details for debugging
    models.forEach(model => {
      logger.debug(`  - ${model.model_slug} (ID: ${model.id}, Active: ${model.is_active})`);
    });
    
    return models;
  } catch (error) {
    logger.error('Error fetching Google Veo models:', error);
    throw error;
  }
}

/**
 * Convert VEO3_MODELS_AND_PRICING array to pricing lookup object
 * @returns {Object} Pricing data indexed by model_slug
 */
function createPricingLookup() {
  const pricingLookup = {};
  
  VEO3_MODELS_AND_PRICING.forEach(model => {
    // Create pricing object with video-specific prices
    const pricingData = {
      price_video: JSON.stringify({
        Generate: model.price_per_second,
        maxDuration: model.max_duration_seconds
      })
    };
    
    pricingLookup[model.model_slug] = pricingData;
  });
  
  return pricingLookup;
}

/**
 * Gets pricing data for a specific Google Veo model
 * @param {string} modelSlug - Model slug
 * @returns {Object|null} Pricing data or null if not found
 */
function getModelPricingData(modelSlug) {
  const VEO3_PRICING = createPricingLookup();
  
  if (VEO3_PRICING[modelSlug]) {
    logger.debug(`Found pricing data for model: ${modelSlug}`);
    return VEO3_PRICING[modelSlug];
  }
  
  // Try to find fallback pricing for similar models
  const fallbackPatterns = [
    { pattern: /veo-3.0-generate-preview/i, fallback: 'veo-3.0-generate-preview-google' },
    { pattern: /veo-3.0-fast-generate/i, fallback: 'veo-3.0-fast-generate-preview-google' },
    { pattern: /veo-3.0.*video-only/i, fallback: 'veo-3.0-generate-video-only-preview-google' }
  ];
  
  for (const { pattern, fallback } of fallbackPatterns) {
    if (pattern.test(modelSlug) && VEO3_PRICING[fallback]) {
      logger.debug(`Using fallback pricing for ${modelSlug} -> ${fallback}`);
      return VEO3_PRICING[fallback];
    }
  }
  
  logger.warn(`No pricing data found for model: ${modelSlug}`);
  return null;
}

/**
 * Updates or creates a models_price_score record with Google Veo pricing
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
        source: 'google-veo'
      }
    });
    
    const priceScoreData = {
      id_model: dbModel.id,
      price_video: pricingData.price_video,
      // Set token prices to 0 for video models
      price_1m_input_tokens: 0,
      price_1m_output_tokens: 0,
      // Score fields - can be enhanced later with actual metrics
      score_cost_per_1k_tokens: null, // Not applicable for video models
      score_intelligence: null,
      score_speed: null,
      score_overall: null,
      source: 'google-veo',
      updated_at: new Date()
    };
    
    if (existingPriceScore) {
      // Update existing record
      const [updatedRows] = await ModelPriceScore.update(priceScoreData, {
        where: {
          id_model: dbModel.id,
          source: 'google-veo'
        }
      });
      
      if (updatedRows > 0) {
        logger.info(`✅ Updated pricing for model: ${dbModel.model_slug} (price_video: ${pricingData.price_video})`);
        return { updated: true, created: false };
      } else {
        logger.warn(`No rows updated for model: ${dbModel.model_slug}`);
        return { updated: false, created: false, reason: 'no_update' };
      }
    } else {
      // Create new record
      const newPriceScore = await ModelPriceScore.create(priceScoreData);
      
      if (newPriceScore) {
        logger.info(`✅ Created pricing for model: ${dbModel.model_slug} (price_video: ${pricingData.price_video})`);
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
 * Processes a batch of models for pricing updates
 * @param {Array} models - Array of model objects
 * @returns {Promise<Object>} Batch processing results
 */
async function processBatch(models) {
  const results = {
    processed: 0,
    updated: 0,
    created: 0,
    skipped: 0,
    errors: 0
  };
  
  for (const model of models) {
    try {
      // Get pricing data for this model
      const pricingData = getModelPricingData(model.model_slug);
      
      if (!pricingData) {
        logger.debug(`Skipping model ${model.model_slug} - no pricing data available`);
        results.skipped++;
        results.processed++;
        continue;
      }
      
      // Update model pricing
      const updateResult = await updateModelPricing(model, pricingData);
      
      if (updateResult.updated) {
        results.updated++;
      } else if (updateResult.created) {
        results.created++;
      } else {
        results.skipped++;
      }
      
      results.processed++;
      
    } catch (error) {
      logger.error(`Error processing model ${model.model_slug}:`, error);
      results.errors++;
      results.processed++;
    }
  }
  
  return results;
}

/**
 * Main function to update all Google Veo model pricing
 */
async function updateGoogleVeoModels() {
  logger.info('🚀 Starting Google Veo models pricing update...');
  
  try {
    // Initialize database connection
    if (!db.initialized) {
      logger.info('Initializing database connection...');
      await db.initialize();
    }
    
    // Get provider ID
    const providerId = await getGoogleVeoProviderId();
    
    // Create missing models first
    logger.info('Creating missing Google Veo models...');
    const creationResults = await createMissingModels(providerId);
    
    // Fetch all Google Veo models from database (including newly created ones)
    logger.info('Fetching Google Veo models from database...');
    const models = await fetchGoogleVeoModels();
    
    if (models.length === 0) {
      logger.warn('No Google Veo models found in database');
      return;
    }
    
    // Process models in batches
    logger.info(`Processing ${models.length} models in batches of ${CONFIG.batchSize}...`);
    
    const totalResults = {
      processed: 0,
      updated: 0,
      created: 0,
      skipped: 0,
      errors: 0
    };
    
    // Process models in batches
    for (let i = 0; i < models.length; i += CONFIG.batchSize) {
      const batch = models.slice(i, i + CONFIG.batchSize);
      logger.info(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(models.length / CONFIG.batchSize)}...`);
      
      const batchResults = await withRetry(
        () => processBatch(batch),
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
    logger.info('📊 GOOGLE VEO MODELS PRICING UPDATE SUMMARY:');
    logger.info('==============================================');
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
    logger.error('❌ Fatal error during Google Veo models update:', error);
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
  updateGoogleVeoModels()
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
  updateGoogleVeoModels,
  getModelPricingData,
  VEO3_MODELS_AND_PRICING,
  veo3_capabilities
};
