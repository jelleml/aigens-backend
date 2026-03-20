#!/usr/bin/env node

/**
 * Amazon Nova Models Update Script
 * 
 * This script creates missing Amazon Nova models and updates their pricing data.
 * Since Amazon Nova doesn't have a public API for pricing, we use manual pricing data.
 * 
 * Features:
 * - Creates missing Amazon Nova models in the models table
 * - Updates pricing for Amazon Nova models in the models_price_score table
 * - Uses price_video field for video generation pricing
 * - Comprehensive error handling and logging
 * - Summary reports of changes made
 * - Idempotent operation (safe to run multiple times)
 * 
 * Usage:
 *   node scripts/update-models-info/update-nova-models.js
 */

const db = require('../../database');
const { createLogger, withRetry } = require('../utils/error-handler');

// Initialize logger
const logger = createLogger('update-nova-models');

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
 * Amazon Nova capabilities configuration
 * Defines the capabilities that all Amazon Nova models support
 */
const nova_capabilities = [
  { name: 'Video generation', type: 'vision', description: 'Ability to generate videos from text prompts' },
  { name: 'Text to video', type: 'output', description: 'Ability to create video from text descriptions' },
  { name: 'Multi-shot video', type: 'output', description: 'Ability to create multi-shot videos with scene consistency' }
];
  
/**
 * Amazon Nova models list made by FF in 06/08/2025
 */
const NOVA_REEL_MODELS_AND_PRICING = [
  {
    "model_slug": "nova-reel-v1.0-amazon",
    "name": "Nova Reel 1.0",
    "display_name": "Nova Reel 1.0",
    "api_model_id": "amazon.nova-reel-v1:0",
    "description": "Single-shot video generation up to 6 seconds with 720p resolution",
    "max_duration_seconds": 6,
    "price_per_second": 0.08
  },
  {
    "model_slug": "nova-reel-v1.1-amazon",
    "name": "Nova Reel 1.1",
    "display_name": "Nova Reel 1.1",
    "api_model_id": "amazon.nova-reel-v1:1",
    "description": "Multi-shot video generation up to 2 minutes with style consistency across shots",
    "max_duration_seconds": 120,
    "price_per_second": 0.08
  }
];

/**
 * Gets the Amazon Nova provider ID from the database
 * @returns {Promise<number>} Provider ID
 */
async function getAmazonNovaProviderId() {
  const { Provider } = db.models;
  
  try {
    const provider = await Provider.findOne({
      where: { name: 'amazon' }
    });
    
    if (!provider) {
      throw new Error('amazon provider not found in database');
    }
    
    logger.debug(`Found amazon provider with ID: ${provider.id}`);
    return provider.id;
  } catch (error) {
    logger.error('Error finding amazon provider:', error);
    throw error;
  }
}

/**
 * Creates missing Amazon Nova models in the database
 * @param {number} providerId - Provider ID
 * @returns {Promise<Object>} Creation results
 */
async function createMissingModels(providerId) {
  const { Model } = db.models;
  const results = { created: 0, existing: 0, errors: 0 };
  
  logger.info('Checking for missing Amazon Nova models...');
  
  for (const modelData of NOVA_REEL_MODELS_AND_PRICING) {
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
 * Fetches all Amazon Nova models from the database
 * @returns {Promise<Array>} Array of Amazon Nova model objects
 */
async function fetchAmazonNovaModels() {
  const { Model } = db.models;
  
  try {
    const providerId = await getAmazonNovaProviderId();
    
    const models = await Model.findAll({
      where: {
        id_provider: providerId
      },
      order: [['model_slug', 'ASC']]
    });
    
    logger.info(`Found ${models.length} Amazon Nova models in database`);
    
    // Log model details for debugging
    models.forEach(model => {
      logger.debug(`  - ${model.model_slug} (ID: ${model.id}, Active: ${model.is_active})`);
    });
    
    return models;
  } catch (error) {
    logger.error('Error fetching Amazon Nova models:', error);
    throw error;
  }
}

/**
 * Convert NOVA_REEL_MODELS_AND_PRICING array to pricing lookup object
 * @returns {Object} Pricing data indexed by model_slug
 */
function createPricingLookup() {
  const pricingLookup = {};
  
  NOVA_REEL_MODELS_AND_PRICING.forEach(model => {
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
 * Gets pricing data for a specific Amazon Nova model
 * @param {string} modelSlug - Model slug
 * @returns {Object|null} Pricing data or null if not found
 */
function getModelPricingData(modelSlug) {
  const NOVA_PRICING = createPricingLookup();
  
  if (NOVA_PRICING[modelSlug]) {
    logger.debug(`Found pricing data for model: ${modelSlug}`);
    return NOVA_PRICING[modelSlug];
  }
  
  // Try to find fallback pricing for similar models
  const fallbackPatterns = [
    { pattern: /nova-reel-v1\.0/i, fallback: 'nova-reel-v1.0-amazon' },
    { pattern: /nova-reel-v1\.1/i, fallback: 'nova-reel-v1.1-amazon' },
    { pattern: /nova-reel/i, fallback: 'nova-reel-v1.1-amazon' }
  ];
  
  for (const { pattern, fallback } of fallbackPatterns) {
    if (pattern.test(modelSlug) && NOVA_PRICING[fallback]) {
      logger.debug(`Using fallback pricing for ${modelSlug} -> ${fallback}`);
      return NOVA_PRICING[fallback];
    }
  }
  
  logger.warn(`No pricing data found for model: ${modelSlug}`);
  return null;
}

/**
 * Updates or creates a models_price_score record with Amazon Nova pricing
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
        source: 'amazon-nova'
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
      source: 'amazon-nova',
      updated_at: new Date()
    };
    
    if (existingPriceScore) {
      // Update existing record
      const [updatedRows] = await ModelPriceScore.update(priceScoreData, {
        where: {
          id_model: dbModel.id,
          source: 'amazon-nova'
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
 * Main function to update all Amazon Nova model pricing
 */
async function updateAmazonNovaModels() {
  logger.info('🚀 Starting Amazon Nova models pricing update...');
  
  try {
    // Initialize database connection
    if (!db.initialized) {
      logger.info('Initializing database connection...');
      await db.initialize();
    }
    
    // Get provider ID
    const providerId = await getAmazonNovaProviderId();
    
    // Create missing models first
    logger.info('Creating missing Amazon Nova models...');
    const creationResults = await createMissingModels(providerId);
    
    // Fetch all Amazon Nova models from database (including newly created ones)
    logger.info('Fetching Amazon Nova models from database...');
    const models = await fetchAmazonNovaModels();
    
    if (models.length === 0) {
      logger.warn('No Amazon Nova models found in database');
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
    logger.info('📊 AMAZON NOVA MODELS PRICING UPDATE SUMMARY:');
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
    logger.error('❌ Fatal error during Amazon Nova models update:', error);
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
  updateAmazonNovaModels()
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
  updateAmazonNovaModels,
  getModelPricingData,
  NOVA_REEL_MODELS_AND_PRICING,
  nova_capabilities
};
