#!/usr/bin/env node

/**
 * Ideogram Models Update Script
 * 
 * This script creates missing Ideogram models and updates their pricing data.
 * Since Ideogram doesn't have a public API for pricing, we use manual pricing data.
 * 
 * Features:
 * - Creates missing Ideogram models in the models table
 * - Updates pricing for Ideogram models in the models_price_score table
 * - Uses price_image field for image generation pricing
 * - Comprehensive error handling and logging
 * - Summary reports of changes made
 * - Idempotent operation (safe to run multiple times)
 * 
 * Usage:
 *   node scripts/update-models-info/update-ideogram-models.js
 */

const db = require('../../database');
const { createLogger, withRetry } = require('../utils/error-handler');

// Initialize logger
const logger = createLogger('update-ideogram-models');

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
 * Ideogram capabilities configuration
 * Defines the capabilities that all Ideogram models support
 */
const ideogram_capabilities = [
  { name: 'Image input', type: 'input', description: 'Ability to accept image inputs for processing' },
  { name: 'Image generation', type: 'vision', description: 'Ability to generate images from text prompts' },
  { name: 'Image editing', type: 'vision', description: 'Ability to edit and modify existing images' },
  { name: 'Text to image', type: 'vision', description: 'Ability to create images from text descriptions' }
];
  
/**
 * Ideogram list made by FF in 27/07/2025
 */
const IDEOGRAM_MODELS_AND_PRICING = [
  {
    "model_slug": "ideogram-v3-ideogram",
    "name" : "Ideogram V3",
    "display_name": "Ideogram V3",
    "api_model_id": "ideogram-v3",
    "rendering_speed": "DEFAULT",
    "generate": "0.06",
    "remix": "0.06",
    "edit": "0.06",
    "reframe": "0.06",
    "replace-background": "0.06"
  },
  {
    "model_slug": "ideogram-v3-quality-ideogram",
    "name" : "Ideogram V3 Quality ",
    "display_name": "Ideogram V3 Quality",
    "api_model_id": "ideogram-v3-quality",
    "rendering_speed": "QUALITY",
    "generate": "0.09",
    "remix": "0.09",
    "edit": "0.09",
    "reframe": "0.09",
    "replace-background": "0.09"
  },
  {
    "model_slug": "ideogram-v3-turbo-ideogram",
    "name" : "ideogram-v3",
    "display_name": "Ideogram V3 Turbo",
    "api_model_id": "ideogram-v3",
    "rendering_speed": "TURBO",
    "generate": "0.03",
    "remix": "0.03",
    "edit": "0.03",
    "reframe": "0.03"
  },
  {
    "model_slug": "ideogram-v2-ideogram",
    "name" : "Ideogram V2",
    "display_name": "Ideogram V2",
    "api_model_id": "ideogram-v2",
    "rendering_speed": "DEFAULT",
    "generate": "0.08",
    "remix": "0.08",
    "edit": "0.08",
    "reframe": "0.08"
  },
  {
    "model_slug": "ideogram-v2-turbo-ideogram",
    "name" : "Ideogram V2 Turbo",
    "display_name": "Ideogram V2 Turbo",
    "api_model_id": "ideogram-v2",
    "rendering_speed": "TURBO",
    "generate": "0.05",
    "remix": "0.05",
    "edit": "0.05",
    "reframe": "0.05"
  },
  {
    "model_slug": "ideogram-v2a-ideogram",
    "name" : "Ideogram V2a",
    "display_name": "Ideogram V2a",
    "api_model_id": "ideogram-v2a",
    "rendering_speed": "DEFAULT",
    "generate": "0.08",
    "remix": "0.08",
    "edit": null,
    "reframe": null
  },
  {
      "model_slug": "ideogram-v2a-turbo-ideogram",
      "name" : "Ideogram V2a Turbo",
      "display_name": "Ideogram V2a Turbo",
      "api_model_id": "ideogram-v2a",
      "rendering_speed": "TURBO",
      "generate": "0.025",
      "remix": "0.025",
      "edit": null,
      "reframe": null
    }
];

/**
 * Gets the Ideogram provider ID from the database
 * @returns {Promise<number>} Provider ID
 */
async function getIdeogramProviderId() {
  const { Provider } = db.models;
  
  try {
    const provider = await Provider.findOne({
      where: { name: 'ideogram' }
    });
    
    if (!provider) {
      throw new Error('Ideogram provider not found in database');
    }
    
    logger.debug(`Found Ideogram provider with ID: ${provider.id}`);
    return provider.id;
  } catch (error) {
    logger.error('Error finding Ideogram provider:', error);
    throw error;
  }
}

/**
 * Creates missing Ideogram models in the database
 * @param {number} providerId - Provider ID
 * @returns {Promise<Object>} Creation results
 */
async function createMissingModels(providerId) {
  const { Model } = db.models;
  const results = { created: 0, existing: 0, errors: 0 };
  
  logger.info('Checking for missing Ideogram models...');
  
  for (const modelData of IDEOGRAM_MODELS_AND_PRICING) {
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
          description: `${modelData.display_name} - Image generation model with ${modelData.rendering_speed.toLowerCase()} rendering speed`,
          max_tokens: 16000, // Default for image models
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
 * Fetches all Ideogram models from the database
 * @returns {Promise<Array>} Array of Ideogram model objects
 */
async function fetchIdeogramModels() {
  const { Model } = db.models;
  
  try {
    const providerId = await getIdeogramProviderId();
    
    const models = await Model.findAll({
      where: {
        id_provider: providerId
      },
      order: [['model_slug', 'ASC']]
    });
    
    logger.info(`Found ${models.length} Ideogram models in database`);
    
    // Log model details for debugging
    models.forEach(model => {
      logger.debug(`  - ${model.model_slug} (ID: ${model.id}, Active: ${model.is_active})`);
    });
    
    return models;
  } catch (error) {
    logger.error('Error fetching Ideogram models:', error);
    throw error;
  }
}

/**
 * Convert IDEOGRAM_MODELS_AND_PRICING array to pricing lookup object
 * @returns {Object} Pricing data indexed by model_slug
 */
function createPricingLookup() {
  const pricingLookup = {};
  
  IDEOGRAM_MODELS_AND_PRICING.forEach(model => {
    // Create pricing object with operation-specific prices
    const pricingData = {
      price_image: JSON.stringify({
        Generate: model.generate,
        Remix: model.remix,
        Edit: model.edit,
        Reframe: model.reframe,
        "Replace BG": model["replace-background"]
      })
    };
    
    pricingLookup[model.model_slug] = pricingData;
  });
  
  return pricingLookup;
}

/**
 * Gets pricing data for a specific Ideogram model
 * @param {string} modelSlug - Model slug
 * @returns {Object|null} Pricing data or null if not found
 */
function getModelPricingData(modelSlug) {
  const IDEOGRAM_PRICING = createPricingLookup();
  
  if (IDEOGRAM_PRICING[modelSlug]) {
    logger.debug(`Found pricing data for model: ${modelSlug}`);
    return IDEOGRAM_PRICING[modelSlug];
  }
  
  // Try to find fallback pricing for similar models
  const fallbackPatterns = [
    { pattern: /ideogram-v1/i, fallback: 'ideogram-v1-ideogram' },
    { pattern: /ideogram-alpha/i, fallback: 'ideogram-alpha-ideogram' },
    { pattern: /ideogram-v2/i, fallback: 'ideogram-v2-ideogram' },
    { pattern: /ideogram-xl/i, fallback: 'ideogram-xl-ideogram' },
    { pattern: /ideogram-v3/i, fallback: 'ideogram-v3-ideogram' }
  ];
  
  for (const { pattern, fallback } of fallbackPatterns) {
    if (pattern.test(modelSlug) && IDEOGRAM_PRICING[fallback]) {
      logger.debug(`Using fallback pricing for ${modelSlug} -> ${fallback}`);
      return IDEOGRAM_PRICING[fallback];
    }
  }
  
  logger.warn(`No pricing data found for model: ${modelSlug}`);
  return null;
}

/**
 * Updates or creates a models_price_score record with Ideogram pricing
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
        source: 'ideogram'
      }
    });
    
    const priceScoreData = {
      id_model: dbModel.id,
      price_image: pricingData.price_image,
      // Set token prices to 0 for image models
      price_1m_input_tokens: 0,
      price_1m_output_tokens: 0,
      // Score fields - can be enhanced later with actual metrics
      score_cost_per_1k_tokens: null, // Not applicable for image models
      score_intelligence: null,
      score_speed: null,
      score_overall: null,
      source: 'ideogram',
      updated_at: new Date()
    };
    
    if (existingPriceScore) {
      // Update existing record
      const [updatedRows] = await ModelPriceScore.update(priceScoreData, {
        where: {
          id_model: dbModel.id,
          source: 'ideogram'
        }
      });
      
      if (updatedRows > 0) {
        logger.info(`✅ Updated pricing for model: ${dbModel.model_slug} (price_image: $${pricingData.price_image})`);
        return { updated: true, created: false };
      } else {
        logger.warn(`No rows updated for model: ${dbModel.model_slug}`);
        return { updated: false, created: false, reason: 'no_update' };
      }
    } else {
      // Create new record
      const newPriceScore = await ModelPriceScore.create(priceScoreData);
      
      if (newPriceScore) {
        logger.info(`✅ Created pricing for model: ${dbModel.model_slug} (price_image: $${pricingData.price_image})`);
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
 * Main function to update all Ideogram model pricing
 */
async function updateIdeogramModels() {
  logger.info('🚀 Starting Ideogram models pricing update...');
  
  try {
    // Initialize database connection
    if (!db.initialized) {
      logger.info('Initializing database connection...');
      await db.initialize();
    }
    
    // Get provider ID
    const providerId = await getIdeogramProviderId();
    
    // Create missing models first
    logger.info('Creating missing Ideogram models...');
    const creationResults = await createMissingModels(providerId);
    
    // Fetch all Ideogram models from database (including newly created ones)
    logger.info('Fetching Ideogram models from database...');
    const models = await fetchIdeogramModels();
    
    if (models.length === 0) {
      logger.warn('No Ideogram models found in database');
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
    logger.info('📊 IDEOGRAM MODELS PRICING UPDATE SUMMARY:');
    logger.info('==========================================');
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
    logger.error('❌ Fatal error during Ideogram models update:', error);
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
  updateIdeogramModels()
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
  updateIdeogramModels,
  getModelPricingData,
  IDEOGRAM_MODELS_AND_PRICING,
  ideogram_capabilities
};
