#!/usr/bin/env node

/**
 * OpenRouter Capabilities Update Script
 * 
 * This script extracts capabilities from OpenRouter model architecture data
 * and updates our capabilities table with new modalities.
 * 
 * Features:
 * - Extracts input and output modalities from OpenRouter architecture data
 * - Maps modalities to capability names
 * - Merges with existing capabilities to avoid duplicates
 * - Updates the capabilities table with new entries
 * - Handles text, image, audio, video, and other modality types
 */

const axios = require('axios');
const db = require('../../database');
const config = require('../../config/config');
const { createLogger, withRetry, validateResponseData, processBatches, withTransaction } = require('../../scripts/utils/error-handler');

// Initialize logger
const logger = createLogger('update-capabilities-list');

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
    
    // Log architecture data availability for debugging
    const modelsWithArchitecture = models.filter(model => model.architecture).length;
    logger.debug(`Models with architecture data: ${modelsWithArchitecture}/${models.length}`);
    
    return models;
  } catch (error) {
    logger.error('Failed to fetch OpenRouter models', error);
    throw new Error(`Failed to fetch OpenRouter models: ${error.message}`);
  }
}

/**
 * Extracts capabilities from OpenRouter architecture data
 * @param {Object} architectureData - Architecture data from OpenRouter model
 * @returns {Array} Array of extracted modalities with type (input/output)
 */
function extractCapabilitiesFromArchitecture(architectureData) {
  try {
    // Validate input
    if (!architectureData) {
      logger.debug('No architecture data provided, returning empty array');
      return [];
    }

    const extractedModalities = [];

    // Process input modalities
    if (architectureData.input_modalities && Array.isArray(architectureData.input_modalities)) {
      architectureData.input_modalities.forEach(modality => {
        if (modality) {
          extractedModalities.push({
            modality,
            type: 'input'
          });
          logger.debug(`Extracted input modality: ${modality}`);
        }
      });
    }

    // Process output modalities
    if (architectureData.output_modalities && Array.isArray(architectureData.output_modalities)) {
      architectureData.output_modalities.forEach(modality => {
        if (modality) {
          extractedModalities.push({
            modality,
            type: 'output'
          });
          logger.debug(`Extracted output modality: ${modality}`);
        }
      });
    }

    // If no structured modalities are available, try to parse from modality string
    if (extractedModalities.length === 0 && architectureData.modality) {
      logger.debug(`Attempting to parse modalities from string: "${architectureData.modality}"`);
      try {
        // Parse formats like "text+image->text" or "text->text"
        const modalityParts = architectureData.modality.split('->');
        
        if (modalityParts.length === 2) {
          // Process input modalities (left side of ->)
          const inputModalitiesStr = modalityParts[0];
          const inputModalities = inputModalitiesStr.split('+');
          
          inputModalities.forEach(modality => {
            const trimmedModality = modality.trim();
            if (trimmedModality) {
              extractedModalities.push({
                modality: trimmedModality,
                type: 'input'
              });
              logger.debug(`Parsed input modality from string: ${trimmedModality}`);
            }
          });
          
          // Process output modalities (right side of ->)
          const outputModalitiesStr = modalityParts[1];
          const outputModalities = outputModalitiesStr.split('+');
          
          outputModalities.forEach(modality => {
            const trimmedModality = modality.trim();
            if (trimmedModality) {
              extractedModalities.push({
                modality: trimmedModality,
                type: 'output'
              });
              logger.debug(`Parsed output modality from string: ${trimmedModality}`);
            }
          });
        }
      } catch (error) {
        logger.error(`Error parsing modality string "${architectureData.modality}"`, error);
      }
    }

    logger.debug(`Extracted ${extractedModalities.length} total modalities`);
    return extractedModalities;
  } catch (error) {
    logger.error('Error extracting capabilities from architecture data', error);
    return [];
  }
}

/**
 * Maps modality to capability name
 * @param {string} modality - Modality name from OpenRouter
 * @param {string} type - Type of modality (input/output)
 * @returns {Object|null} Capability object or null if mapping not found
 */
function mapModalityToCapability(modality, type) {
  try {
    // Handle null or undefined modality
    if (!modality) {
      logger.debug('Null or undefined modality provided to mapModalityToCapability');
      return null;
    }
    
    // Normalize modality name
    const normalizedModality = modality.toLowerCase().trim();
    
    // If normalized modality is empty, return null
    if (!normalizedModality) {
      logger.debug('Empty modality after normalization');
      return null;
    }
    
    // Define mapping for input modalities
    const inputModalityMap = {
      'text': {
        name: 'Text input',
        type: 'input',
        description: 'Accettazione input testuale'
      },
      'image': {
        name: 'Image input',
        type: 'input',
        description: 'Accettazione input immagine'
      },
      'audio': {
        name: 'Audio input',
        type: 'input',
        description: 'Accettazione input audio'
      },
      'video': {
        name: 'Video input',
        type: 'input',
        description: 'Accettazione input video'
      },
      'file': {
        name: 'File input',
        type: 'input',
        description: 'Accettazione file (PDF, JSON, ecc.)'
      },
      'code': {
        name: 'Code input',
        type: 'input',
        description: 'Accettazione input di codice sorgente'
      }
    };
    
    // Define mapping for output modalities
    const outputModalityMap = {
      'text': {
        name: 'Text output',
        type: 'output',
        description: 'Generazione output testuale'
      },
      'image': {
        name: 'Image output',
        type: 'output',
        description: 'Generazione output immagine'
      },
      'audio': {
        name: 'Audio output',
        type: 'output',
        description: 'Generazione audio (text-to-speech)'
      },
      'video': {
        name: 'Video output',
        type: 'output',
        description: 'Generazione output video'
      },
      'code': {
        name: 'Code output',
        type: 'output',
        description: 'Generazione output di codice sorgente'
      }
    };
    
    // Select the appropriate map based on type
    const modalityMap = type === 'input' ? inputModalityMap : outputModalityMap;
    
    // Return the mapped capability or null if not found
    const result = modalityMap[normalizedModality];
    
    if (result) {
      logger.debug(`Successfully mapped ${type} modality "${normalizedModality}" to capability "${result.name}"`);
    } else {
      logger.debug(`No mapping found for ${type} modality "${normalizedModality}"`);
    }
    
    return result;
  } catch (error) {
    logger.error(`Error mapping modality "${modality}" with type "${type}"`, error);
    return null;
  }
}

/**
 * Merges new capabilities with existing ones to avoid duplicates
 * @param {Array} newCapabilities - Array of new capability objects
 * @param {Array} existingCapabilities - Array of existing capability objects from database
 * @returns {Array} Array of unique capabilities to be added
 */
function mergeWithExistingCapabilities(newCapabilities, existingCapabilities) {
  try {
    // Handle null or undefined inputs
    if (!newCapabilities) {
      logger.debug('No new capabilities provided to merge, returning empty array');
      return [];
    }
    
    if (!existingCapabilities) {
      logger.debug('No existing capabilities provided, treating as empty array');
      existingCapabilities = [];
    }
    
    logger.debug(`Merging ${newCapabilities.length} new capabilities with ${existingCapabilities.length} existing capabilities`);
    
    // Create a set of existing capability names for quick lookup
    const existingCapabilityNames = new Set();
    existingCapabilities.forEach(cap => {
      if (cap && cap.name) {
        existingCapabilityNames.add(cap.name);
        logger.debug(`Registered existing capability: ${cap.name}`);
      }
    });
    
    // Create a set to track unique capability names in the new capabilities
    const uniqueNewCapabilityNames = new Set();
    
    // Filter out capabilities that already exist and remove duplicates
    const uniqueCapabilities = [];
    const duplicates = [];
    
    newCapabilities.forEach(cap => {
      if (!cap || !cap.name) {
        logger.debug('Skipping invalid capability object (null or missing name)');
        return;
      }
      
      if (existingCapabilityNames.has(cap.name)) {
        logger.debug(`Skipping existing capability: ${cap.name}`);
        duplicates.push(cap.name);
        return;
      }
      
      if (uniqueNewCapabilityNames.has(cap.name)) {
        logger.debug(`Skipping duplicate new capability: ${cap.name}`);
        return;
      }
      
      uniqueNewCapabilityNames.add(cap.name);
      uniqueCapabilities.push(cap);
      logger.debug(`Added unique new capability: ${cap.name}`);
    });
    
    logger.info(`Merged capabilities: ${uniqueCapabilities.length} unique new, ${duplicates.length} duplicates skipped`);
    return uniqueCapabilities;
  } catch (error) {
    logger.error('Error merging capabilities', error);
    return [];
  }
}

/**
 * Updates the capabilities table with new capabilities
 * @param {Array} capabilities - Array of capability objects to add
 * @returns {Promise<Object>} Result object with counts of created capabilities
 */
async function updateCapabilitiesTable(capabilities) {
  const { ModelsCapability } = db.models;
  const results = {
    created: 0,
    skipped: 0,
    errors: 0,
    details: []
  };
  
  // Validate input
  if (!capabilities || !Array.isArray(capabilities)) {
    logger.warn('Invalid capabilities array provided to updateCapabilitiesTable');
    return results;
  }
  
  if (capabilities.length === 0) {
    logger.info('No capabilities to update');
    return results;
  }
  
  logger.info(`Updating capabilities table with ${capabilities.length} new capabilities`);
  
  // Process capabilities in batches to avoid overwhelming the database
  await processBatches(
    capabilities,
    async (batch, batchNumber, totalBatches) => {
      logger.debug(`Processing capability batch ${batchNumber}/${totalBatches} (${batch.length} capabilities)`);
      
      for (const capability of batch) {
        try {
          // Validate capability object
          if (!capability || !capability.name) {
            logger.warn('Skipping invalid capability (missing name)');
            results.skipped++;
            continue;
          }
          
          // Use withRetry for database operations
          const [newCapability, created] = await withRetry(
            async () => {
              return ModelsCapability.findOrCreate({
                where: { name: capability.name },
                defaults: capability
              });
            },
            {
              maxRetries: 3,
              initialDelay: 500,
              maxDelay: 5000,
              factor: 2,
              onRetry: (error, attempt) => {
                logger.warn(`Database operation attempt ${attempt}/3 failed for capability ${capability.name}: ${error.message}`);
              }
            }
          );
          
          if (created) {
            results.created++;
            results.details.push({
              name: capability.name,
              type: capability.type,
              status: 'created',
              id: newCapability.id
            });
            logger.success(`Created new capability: ${capability.name} (${capability.type})`);
          } else {
            results.skipped++;
            logger.debug(`Capability already exists: ${capability.name} (${capability.type})`);
          }
        } catch (error) {
          results.errors++;
          results.details.push({
            name: capability.name,
            type: capability.type,
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
          });
          logger.error(`Error creating capability ${capability.name}`, error);
        }
      }
      
      return results;
    },
    {
      batchSize: 20,
      delayBetweenBatches: 100
    }
  );
  
  logger.info(`Capabilities table update complete: ${results.created} created, ${results.skipped} skipped, ${results.errors} errors`);
  return results;
}

/**
 * Main function to update capabilities from OpenRouter
 */
async function updateCapabilitiesFromOpenRouter() {
  logger.info('Starting OpenRouter capabilities update process...');
  
  const results = {
    startTime: new Date(),
    endTime: null,
    modelsProcessed: 0,
    modalitiesExtracted: 0,
    capabilitiesMapped: 0,
    capabilitiesCreated: 0,
    modelsWithArchitecture: 0,
    modelsWithoutArchitecture: 0,
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
    
    // Fetch models from OpenRouter API
    const openRouterModels = await fetchOpenRouterModels();
    results.modelsProcessed = openRouterModels.length;
    
    // Get existing capabilities from database
    const { ModelsCapability } = db.models;
    const existingCapabilities = await withRetry(
      async () => await ModelsCapability.findAll(),
      {
        maxRetries: 3,
        initialDelay: 500,
        maxDelay: 5000,
        factor: 2,
        onRetry: (error, attempt) => {
          logger.warn(`Database query attempt ${attempt}/3 failed: ${error.message}`);
        }
      }
    );
    
    logger.info(`Found ${existingCapabilities.length} existing capabilities in database`);
    
    // Extract modalities from all models
    logger.info('Extracting modalities from OpenRouter models...');
    const extractedModalities = [];
    
    for (const model of openRouterModels) {
      try {
        if (model.architecture) {
          results.modelsWithArchitecture++;
          const modalities = extractCapabilitiesFromArchitecture(model.architecture);
          extractedModalities.push(...modalities);
          results.modalitiesExtracted += modalities.length;
          
          if (modalities.length > 0) {
            logger.debug(`Extracted ${modalities.length} modalities from model ${model.id || 'unknown'}`);
          }
        } else {
          results.modelsWithoutArchitecture++;
          logger.debug(`Model ${model.id || 'unknown'} has no architecture data`);
        }
      } catch (error) {
        logger.error(`Error processing architecture data for model ${model.id || 'unknown'}`, error);
        results.errors.push({
          type: 'architecture_extraction',
          model: model.id || 'unknown',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    logger.info(`Extracted ${results.modalitiesExtracted} modalities from ${results.modelsWithArchitecture} models with architecture data`);
    
    // Map modalities to capabilities
    logger.info('Mapping modalities to capabilities...');
    const mappedCapabilities = [];
    const unmappedModalities = [];
    
    for (const { modality, type } of extractedModalities) {
      try {
        const capability = mapModalityToCapability(modality, type);
        if (capability) {
          mappedCapabilities.push(capability);
          results.capabilitiesMapped++;
        } else {
          unmappedModalities.push({ modality, type });
        }
      } catch (error) {
        logger.error(`Error mapping modality ${modality} (${type})`, error);
        results.errors.push({
          type: 'modality_mapping',
          modality,
          modalityType: type,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    logger.info(`Mapped ${results.capabilitiesMapped} modalities to capabilities (${unmappedModalities.length} unmapped)`);
    
    if (unmappedModalities.length > 0) {
      logger.debug('Unmapped modalities:', unmappedModalities);
    }
    
    // Merge with existing capabilities to avoid duplicates
    const uniqueCapabilities = mergeWithExistingCapabilities(mappedCapabilities, existingCapabilities);
    logger.info(`Found ${uniqueCapabilities.length} new unique capabilities to add`);
    
    // Update capabilities table
    if (uniqueCapabilities.length > 0) {
      logger.info('Updating capabilities table...');
      
      // Use transaction for database operations
      await withTransaction(db.sequelize, async (transaction) => {
        const updateResults = await updateCapabilitiesTable(uniqueCapabilities);
        results.capabilitiesCreated = updateResults.created;
        
        if (updateResults.errors > 0) {
          results.errors.push({
            type: 'capability_creation',
            count: updateResults.errors,
            message: `${updateResults.errors} errors occurred during capability creation`,
            details: updateResults.details.filter(d => d.status === 'error'),
            timestamp: new Date().toISOString()
          });
        }
      });
    } else {
      logger.success('No new capabilities to add');
    }
    
    results.endTime = new Date();
    
    // Generate summary report
    logger.info('\n📋 SUMMARY REPORT');
    logger.info('================');
    logger.info(`⏱️  Duration: ${Math.round((results.endTime - results.startTime) / 1000)}s`);
    logger.info(`📊 Models processed: ${results.modelsProcessed}`);
    logger.info(`🏗️  Models with architecture data: ${results.modelsWithArchitecture}`);
    logger.info(`🔍 Modalities extracted: ${results.modalitiesExtracted}`);
    logger.info(`🔄 Capabilities mapped: ${results.capabilitiesMapped}`);
    logger.info(`➕ New capabilities created: ${results.capabilitiesCreated}`);
    logger.info(`❌ Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      logger.warn('\n❌ ERRORS:');
      results.errors.forEach(error => {
        if (typeof error === 'string') {
          logger.warn(`   ${error}`);
        } else {
          logger.warn(`   ${error.type}: ${error.message || error.error}`);
        }
      });
    }
    
    logger.success('\n🎉 OpenRouter capabilities update completed!');
    
    return results;
    
  } catch (error) {
    results.endTime = new Date();
    const errorMsg = `Fatal error during OpenRouter capabilities update: ${error.message}`;
    logger.error(errorMsg, error);
    results.errors.push({
      type: 'fatal',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    throw error;
  } finally {
    // Close database connection
    try {
      await db.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection', error);
    }
  }
}

// Run the script if executed directly
if (require.main === module) {
  updateCapabilitiesFromOpenRouter()
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
  updateCapabilitiesFromOpenRouter,
  extractCapabilitiesFromArchitecture,
  mapModalityToCapability,
  mergeWithExistingCapabilities,
  updateCapabilitiesTable,
  CONFIG
};