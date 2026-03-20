#!/usr/bin/env node

/**
 * MODELS-CAPABILITIES LINKS POPULATION SCRIPT
 * Creates links between models and their capabilities based on model types and providers
 * 
 * IMPORTANT: This is STEP 3 of a 5-step process. For complete setup, use:
 *   node scripts/setup-models-complete.js
 * 
 * Or run individual steps in order:
 *   1. node scripts/init-all-models-unified.js
 *   2. node scripts/populate-capabilities.js
 *   3. node scripts/populate-models-capabilities.js    (this script)
 *   4. node scripts/populate-aggregator-pricing-tiers.js
 *   5. node scripts/populate-model-subscriptions.js
 * 
 * This script creates the many-to-many relationships between models and capabilities.
 */

const db = require('../../database');
const { createLogger, withRetry, processBatches, withTransaction } = require('../../scripts/utils/error-handler');

// Initialize logger
const logger = createLogger('populate-models-capabilities');


/**
 * Model-specific capability mappings based on model data
 * Uses pattern-based mapping for all providers
 */
const getCapabilitiesForModel = async (modelSlug, provider, modelId) => {
  // Validate input parameters
  if (!modelSlug) {
    logger.warn('Missing model_slug in getCapabilitiesForModel');
    return ['Text generation', 'Text completion'];
  }
  
  if (!provider) {
    logger.warn(`Missing provider for model ${modelSlug}`);
    return ['Text generation', 'Text completion'];
  }
  
  // For OpenRouter models, use pattern-based mapping
  if (provider === 'openrouter') {
    logger.debug(`Getting capabilities for OpenRouter model: ${modelSlug} using pattern-based mapping`);
    
    // Extract base model name from slug (remove provider suffix)
    const baseModelId = modelSlug.replace(`-${provider}`, '');
    logger.debug(`Base model ID for pattern matching: ${baseModelId}`);
    
    if (baseModelId.includes('claude')) {
      logger.debug(`${modelSlug}: Matched as Claude model`);
      return ['Text generation', 'Text completion', 'Text input', 'Text output', 'Image understanding', 'Image input', 'Logical reasoning'];
    } else if (baseModelId.includes('gpt')) {
      logger.debug(`${modelSlug}: Matched as GPT model`);
      return ['Text generation', 'Text completion', 'Text input', 'Text output', 'Logical reasoning'];
    } else if (baseModelId.includes('llama')) {
      logger.debug(`${modelSlug}: Matched as LLaMA model`);
      return ['Text generation', 'Text completion', 'Text input', 'Text output'];
    } else if (baseModelId.includes('mistral') || baseModelId.includes('mixtral')) {
      logger.debug(`${modelSlug}: Matched as Mistral/Mixtral model`);
      return ['Text generation', 'Text completion', 'Text input', 'Text output', 'Logical reasoning'];
    } else if (baseModelId.includes('image') || baseModelId.includes('flux') || baseModelId.includes('stable')) {
      logger.debug(`${modelSlug}: Matched as image generation model`);
      return ['Image generation', 'Image output', 'Text input'];
    } else {
      logger.debug(`${modelSlug}: No specific pattern match, using default text capabilities`);
      return ['Text generation', 'Text completion', 'Text input', 'Text output'];
    }
  }
  
  // For non-OpenRouter models, use the existing logic
  
  // Extract base model name from slug (remove provider suffix)
  const baseModelId = modelSlug.replace(`-${provider}`, '');
  
  // OpenAI models
  if (provider === 'openai') {
    if (baseModelId === 'gpt-4o') {
      return ['Text generation', 'Text completion', 'Text input', 'Text output', 'Image understanding', 'Image input', 'Logical reasoning', 'Commonsense reasoning'];
    }
    if (baseModelId === 'gpt-4-turbo') {
      return ['Text generation', 'Text completion', 'Text input', 'Text output', 'Logical reasoning', 'Commonsense reasoning'];
    }
    if (baseModelId === 'gpt-4-vision-preview') {
      return ['Text generation', 'Text completion', 'Text input', 'Text output', 'Image understanding', 'Image input', 'Logical reasoning', 'Commonsense reasoning'];
    }
    if (baseModelId === 'gpt-3-5-turbo') {
      return ['Text generation', 'Text completion', 'Text input', 'Text output'];
    }
  }
  
  // Anthropic models
  if (provider === 'anthropic') {
    if (baseModelId.includes('claude')) {
      const baseCapabilities = ['Text generation', 'Text completion', 'Text input', 'Text output', 'Image understanding', 'Image input', 'Logical reasoning', 'Commonsense reasoning'];
      if (baseModelId.includes('3-5') || baseModelId.includes('3-7')) {
        baseCapabilities.push('Chain-of-thought reasoning', 'Multi-step problem solving');
      }
      return baseCapabilities;
    }
  }
  
  // DeepSeek models
  if (provider === 'deepseek') {
    if (baseModelId === 'deepseek-chat') {
      return ['Text generation', 'Text completion', 'Text input', 'Text output', 'Logical reasoning'];
    }
    if (baseModelId === 'deepseek-coder') {
      return ['Text generation', 'Text completion', 'Text input', 'Text output', 'Code generation', 'Code explanation'];
    }
    if (baseModelId === 'deepseek-lite') {
      return ['Text generation', 'Text completion', 'Text input', 'Text output'];
    }
    if (baseModelId === 'deepseek-vision') {
      return ['Text generation', 'Text completion', 'Text input', 'Text output', 'Image understanding', 'Image input'];
    }
  }
  
  // Ideogram models (image generation)
  if (provider === 'ideogram') {
    return ['Image generation', 'Image output', 'Text input'];
  }
  
  // Together.ai models - determine by model type/name
  if (provider === 'together') {
    if (modelSlug.includes('image') || modelSlug.includes('flux') || modelSlug.includes('stable')) {
      return ['Image generation', 'Image output', 'Text input'];
    } else if (modelSlug.includes('audio')) {
      return ['Audio transcription', 'Audio input', 'Audio output', 'Text input', 'Text output'];
    } else {
      // Default for chat models
      return ['Text generation', 'Text completion', 'Text input', 'Text output'];
    }
  }
  
  // Default fallback
  return ['Text generation', 'Text completion', 'Text input', 'Text output'];
};

/**
 * Main function to populate models-capabilities links
 */
const populateModelsCapabilities = async () => {
  logger.info('Starting models-capabilities links population...');
  
  const results = {
    startTime: new Date(),
    endTime: null,
    modelsProcessed: 0,
    totalLinksCreated: 0,
    errors: [],
    missingCapabilities: new Set(),
    summaryByProvider: {}
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
    
    const { Model, Provider, ModelsCapability, ModelsModelsCapability } = db.models;

    // Get all models with their providers
    logger.info('Fetching active models from database...');
    const models = await withRetry(
      async () => {
        return Model.findAll({
          where: { is_active: true },
          include: [
            {
              model: Provider,
              as: 'provider',
              attributes: ['name']
            }
          ],
          attributes: ['id', 'model_slug', 'name', 'api_model_id']
        });
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 5000,
        factor: 2,
        onRetry: (error, attempt) => {
          logger.warn(`Model fetch attempt ${attempt}/3 failed: ${error.message}`);
        }
      }
    );

    // Get all capabilities for mapping
    logger.info('Fetching capabilities from database...');
    const capabilities = await withRetry(
      async () => {
        return ModelsCapability.findAll();
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 5000,
        factor: 2,
        onRetry: (error, attempt) => {
          logger.warn(`Capabilities fetch attempt ${attempt}/3 failed: ${error.message}`);
        }
      }
    );
    
    // Create capability map for quick lookups
    const capabilityMap = {};
    capabilities.forEach(cap => {
      if (cap && cap.name && cap.id) {
        capabilityMap[cap.name] = cap.id;
      }
    });

    logger.info(`Found ${models.length} active models to process`);
    logger.info(`Found ${capabilities.length} capabilities in database`);
    logger.debug(`Capability map contains ${Object.keys(capabilityMap).length} entries`);

    // Process models in batches
    await processBatches(
      models,
      async (batch, batchNumber, totalBatches) => {
        logger.info(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} models)`);
        
        for (const model of batch) {
          try {
            if (!model.provider || !model.provider.name) {
              logger.warn(`Skipping model ${model.model_slug} (ID: ${model.id}) - missing provider information`);
              results.errors.push({
                type: 'missing_provider',
                model: model.model_slug,
                modelId: model.id,
                timestamp: new Date().toISOString()
              });
              continue;
            }
            
            const providerName = model.provider.name;
            logger.debug(`Processing model: ${model.model_slug} (Provider: ${providerName})`);
            
            // Initialize provider summary if not exists
            if (!results.summaryByProvider[providerName]) {
              results.summaryByProvider[providerName] = { 
                models: 0, 
                linksCreated: 0, 
                errors: 0 
              };
            }
            
            // Get capabilities for this model
            const modelCapabilities = await getCapabilitiesForModel(model.model_slug, providerName, model.id);
            logger.debug(`Retrieved ${modelCapabilities.length} capabilities for model ${model.model_slug}`);
            
            const capabilityIds = new Set();

            // Map capability names to database capability IDs
            for (const capabilityName of modelCapabilities) {
              if (capabilityMap[capabilityName]) {
                capabilityIds.add(capabilityMap[capabilityName]);
                logger.debug(`Mapped capability "${capabilityName}" to ID ${capabilityMap[capabilityName]}`);
              } else {
                results.missingCapabilities.add(capabilityName);
                logger.warn(`Missing capability in database: "${capabilityName}" for model ${model.model_slug}`);
              }
            }

            // Create links for this model using transaction
            let linksCreated = 0;
            let modelErrors = 0;
            
            await withTransaction(db.sequelize, async (transaction) => {
              for (const capabilityId of capabilityIds) {
                try {
                  const [, wasCreated] = await withRetry(
                    async () => {
                      return ModelsModelsCapability.findOrCreate({
                        where: {
                          id_model: model.id,
                          id_capability: capabilityId
                        },
                        defaults: {
                          id_model: model.id,
                          id_capability: capabilityId
                        },
                        transaction
                      });
                    },
                    {
                      maxRetries: 3,
                      initialDelay: 500,
                      maxDelay: 5000,
                      factor: 2,
                      onRetry: (error, attempt) => {
                        logger.warn(`Link creation attempt ${attempt}/3 failed for model ${model.model_slug}, capability ${capabilityId}: ${error.message}`);
                      }
                    }
                  );

                  if (wasCreated) {
                    linksCreated++;
                    results.totalLinksCreated++;
                    logger.debug(`Created link: model ${model.model_slug} (ID: ${model.id}) -> capability ID ${capabilityId}`);
                  } else {
                    logger.debug(`Link already exists: model ${model.model_slug} (ID: ${model.id}) -> capability ID ${capabilityId}`);
                  }
                } catch (error) {
                  logger.error(`Error creating link for model ${model.model_slug}, capability ${capabilityId}`, error);
                  modelErrors++;
                  results.errors.push({
                    type: 'link_creation',
                    model: model.model_slug,
                    modelId: model.id,
                    capabilityId,
                    error: error.message,
                    timestamp: new Date().toISOString()
                  });
                }
              }
            });

            // Update summary statistics
            results.summaryByProvider[providerName].models++;
            results.summaryByProvider[providerName].linksCreated += linksCreated;
            results.summaryByProvider[providerName].errors += modelErrors;
            results.modelsProcessed++;
            
            if (linksCreated > 0) {
              logger.info(`Created ${linksCreated} capability links for model ${model.model_slug}`);
            } else {
              logger.debug(`No new capability links needed for model ${model.model_slug}`);
            }

          } catch (error) {
            logger.error(`Error processing model ${model.model_slug || 'unknown'}`, error);
            results.errors.push({
              type: 'model_processing',
              model: model.model_slug || 'unknown',
              modelId: model.id,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
        }
      },
      {
        batchSize: 20,
        delayBetweenBatches: 100,
        onBatchComplete: (batchResults, batchNumber, totalBatches) => {
          logger.debug(`Completed batch ${batchNumber}/${totalBatches}`);
        }
      }
    );

    results.endTime = new Date();
    
    // Generate summary report
    logger.success('\n📋 SUMMARY REPORT');
    logger.info('================');
    logger.info(`⏱️  Duration: ${Math.round((results.endTime - results.startTime) / 1000)}s`);
    logger.info(`📊 Models processed: ${results.modelsProcessed}`);
    logger.info(`🔗 Total links created: ${results.totalLinksCreated}`);
    logger.info(`❌ Errors: ${results.errors.length}`);
    
    logger.info('\n📊 Summary by provider:');
    Object.keys(results.summaryByProvider).sort().forEach(provider => {
      const stats = results.summaryByProvider[provider];
      logger.info(`  ${provider}: ${stats.models} models, ${stats.linksCreated} links created${stats.errors > 0 ? `, ${stats.errors} errors` : ''}`);
    });
    
    if (results.missingCapabilities.size > 0) {
      logger.warn('\n⚠️  Missing capabilities (not found in database):');
      Array.from(results.missingCapabilities).sort().forEach(cap => {
        logger.warn(`  - ${cap}`);
      });
    }
    
    if (results.errors.length > 0) {
      logger.warn('\n❌ Error summary:');
      const errorTypes = {};
      results.errors.forEach(error => {
        errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
      });
      
      Object.entries(errorTypes).forEach(([type, count]) => {
        logger.warn(`  ${type}: ${count} errors`);
      });
    }
    
    logger.success('\n🎉 Models-capabilities links population completed!');
    
    // Only close database and exit if running as standalone script
    if (require.main === module) {
      await db.close();
      logger.info('Database connection closed');
      process.exit(0);
    }
    
    return results;

  } catch (error) {
    results.endTime = new Date();
    logger.error('Fatal error during models-capabilities links population', error);
    
    // Only close database and exit if running as standalone script
    if (require.main === module) {
      try {
        await db.close();
        logger.info('Database connection closed');
      } catch (closeError) {
        logger.error('Error closing database connection', closeError);
      }
      process.exit(1);
    } else {
      throw error; // Re-throw for parent script to handle
    }
  }
};

// Run if called directly
if (require.main === module) {
  populateModelsCapabilities();
}

module.exports = { 
  populateModelsCapabilities,
  getCapabilitiesForModel
};