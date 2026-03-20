#!/usr/bin/env node

/**
 * POPULATE MODEL METADATA FROM JSON SCRIPT
 * Updates model metadata from ai_models_descriptions_edo.json
 * 
 * This script:
 * 1. Matches models by name between JSON file and database
 * 2. Verifies provider information
 * 3. Updates model descriptions
 * 4. Updates/adds output_capabilities
 * 5. Adds tags, best_for, and ideal_users as capabilities
 */

const fs = require('fs');
const path = require('path');
const db = require('../../database');
const { createLogger, withRetry, processBatches, withTransaction } = require('../../scripts/utils/error-handler');

// Initialize logger
const logger = createLogger('populate-model-metadata-from-json');

// Path to the JSON file
const JSON_FILE_PATH = path.join(__dirname, '../../uploads/ai_models_descriptions_edo.json');

/**
 * Load and parse the JSON file
 */
async function loadModelDescriptions() {
  try {
    if (!fs.existsSync(JSON_FILE_PATH)) {
      throw new Error(`JSON file not found at: ${JSON_FILE_PATH}`);
    }
    
    const jsonData = fs.readFileSync(JSON_FILE_PATH, 'utf8');
    const models = JSON.parse(jsonData);
    
    logger.info(`Loaded ${models.length} models from JSON file`);
    
    // Debug: Check first few models
    if (models.length > 0) {
      logger.debug('First model structure:', models[0]);
      // Check for any undefined models
      const invalidModels = models.filter(m => !m || !m.model_name);
      if (invalidModels.length > 0) {
        logger.warn(`Found ${invalidModels.length} invalid models in JSON`);
      }
    }
    
    return models;
  } catch (error) {
    logger.error('Error loading JSON file:', error);
    throw error;
  }
}

/**
 * Normalize model name for matching
 */
function normalizeModelName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find matching database model for JSON model
 */
async function findMatchingModel(jsonModel) {
  const normalizedJsonName = normalizeModelName(jsonModel.model_name);
  
  // Get all models from database
  const dbModels = await db.models.Model.findAll({
    include: [{
      model: db.models.Provider,
      as: 'provider',
      attributes: ['name']
    }],
    attributes: ['id', 'name', 'model_slug', 'api_model_id', 'id_provider']
  });
  
  // Try exact match first
  let match = dbModels.find(model => 
    normalizeModelName(model.name) === normalizedJsonName
  );
  
  // Try partial matches if no exact match
  if (!match) {
    match = dbModels.find(model => {
      const normalizedDbName = normalizeModelName(model.name);
      return normalizedDbName.includes(normalizedJsonName) || 
             normalizedJsonName.includes(normalizedDbName);
    });
  }
  
  return match;
}

/**
 * Verify provider matches
 */
function verifyProvider(jsonModel, dbModel) {
  if (!jsonModel.provider || !dbModel.provider || !dbModel.provider.name) {
    return false;
  }
  
  const jsonProvider = jsonModel.provider.toLowerCase();
  const dbProvider = dbModel.provider.name.toLowerCase();
  
  // Handle provider name variations
  const providerMap = {
    'openai': ['openai'],
    'anthropic': ['anthropic'],
    'google deepmind': ['google', 'google deepmind', 'gemini'],
    'google': ['google', 'google deepmind', 'gemini'],
    'meta': ['meta', 'facebook'],
    'microsoft': ['microsoft'],
    'mistral ai': ['mistral', 'mistral ai'],
    'mistral': ['mistral', 'mistral ai'],
    'deepseek': ['deepseek'],
    'nvidia': ['nvidia'],
    'alibaba cloud': ['alibaba', 'alibaba cloud', 'qwen']
  };
  
  // Check if providers match based on mapping
  for (const [key, variations] of Object.entries(providerMap)) {
    if (variations.includes(jsonProvider) && variations.includes(dbProvider)) {
      return true;
    }
  }
  
  return jsonProvider === dbProvider;
}

/**
 * Update model description
 */
async function updateModelDescription(dbModel, jsonModel) {
  if (jsonModel.description && jsonModel.description.trim()) {
    await db.models.Model.update(
      { description: jsonModel.description },
      { where: { id: dbModel.id } }
    );
    logger.info(`Updated description for model: ${dbModel.name}`);
  }
}

/**
 * Get or create capability
 */
async function getOrCreateCapability(name, type, description = null) {
  const [capability, created] = await db.models.ModelsCapability.findOrCreate({
    where: { name, type },
    defaults: { name, type, description }
  });
  
  if (created) {
    logger.debug(`Created new capability: ${name} (${type})`);
  }
  
  return capability;
}

/**
 * Add capability to model if not exists
 */
async function addCapabilityToModel(modelId, capabilityId) {
  const [relation, created] = await db.models.ModelsModelsCapability.findOrCreate({
    where: { 
      id_model: modelId, 
      id_capability: capabilityId 
    },
    defaults: { 
      id_model: modelId, 
      id_capability: capabilityId 
    }
  });
  
  return created;
}

/**
 * Update output capabilities
 */
async function updateOutputCapabilities(dbModel, jsonModel) {
  if (!jsonModel.output_capabilities || !Array.isArray(jsonModel.output_capabilities)) {
    return;
  }
  
  for (const outputCap of jsonModel.output_capabilities) {
    const capability = await getOrCreateCapability(
      outputCap, 
      'output', 
      `Output capability: ${outputCap}`
    );
    
    const created = await addCapabilityToModel(dbModel.id, capability.id);
    if (created) {
      logger.debug(`Added output capability '${outputCap}' to model: ${dbModel.name}`);
    }
  }
}

/**
 * Add tags as capabilities
 */
async function addTagsCapabilities(dbModel, jsonModel) {
  if (!jsonModel.tags || !Array.isArray(jsonModel.tags)) {
    return;
  }
  
  for (const tag of jsonModel.tags) {
    const capability = await getOrCreateCapability(
      tag, 
      'tags', 
      `Tag: ${tag}`
    );
    
    const created = await addCapabilityToModel(dbModel.id, capability.id);
    if (created) {
      logger.debug(`Added tag '${tag}' to model: ${dbModel.name}`);
    }
  }
}

/**
 * Add best_for as capabilities
 */
async function addBestForCapabilities(dbModel, jsonModel) {
  if (!jsonModel.best_for || !Array.isArray(jsonModel.best_for)) {
    return;
  }
  
  for (const bestFor of jsonModel.best_for) {
    const capability = await getOrCreateCapability(
      bestFor, 
      'best_for', 
      `Best for: ${bestFor}`
    );
    
    const created = await addCapabilityToModel(dbModel.id, capability.id);
    if (created) {
      logger.debug(`Added best_for '${bestFor}' to model: ${dbModel.name}`);
    }
  }
}

/**
 * Add ideal_users as capabilities
 */
async function addIdealUsersCapabilities(dbModel, jsonModel) {
  if (!jsonModel.ideal_users || !Array.isArray(jsonModel.ideal_users)) {
    return;
  }
  
  for (const idealUser of jsonModel.ideal_users) {
    const capability = await getOrCreateCapability(
      idealUser, 
      'ideal_users', 
      `Ideal for: ${idealUser}`
    );
    
    const created = await addCapabilityToModel(dbModel.id, capability.id);
    if (created) {
      logger.debug(`Added ideal_users '${idealUser}' to model: ${dbModel.name}`);
    }
  }
}

/**
 * Process a single model
 */
async function processModel(jsonModel) {
  try {
    // Validate jsonModel
    if (!jsonModel || !jsonModel.model_name) {
      logger.error('Invalid JSON model:', jsonModel);
      return { matched: false, model: 'invalid', error: 'Invalid model data' };
    }
    
    // Find matching database model
    const dbModel = await findMatchingModel(jsonModel);
    
    if (!dbModel) {
      logger.warn(`No matching database model found for: ${jsonModel.model_name}`);
      return { matched: false, model: jsonModel.model_name };
    }
    
    logger.info(`Processing model: ${jsonModel.model_name} -> ${dbModel.name}`);
    
    // Verify provider
    const providerMatches = verifyProvider(jsonModel, dbModel);
    if (!providerMatches) {
      logger.warn(`Provider mismatch for ${jsonModel.model_name}: JSON=${jsonModel.provider}, DB=${dbModel.provider.name}`);
    }
    
    // Update model metadata
    await updateModelDescription(dbModel, jsonModel);
    await updateOutputCapabilities(dbModel, jsonModel);
    await addTagsCapabilities(dbModel, jsonModel);
    await addBestForCapabilities(dbModel, jsonModel);
    await addIdealUsersCapabilities(dbModel, jsonModel);
    
    return { 
      matched: true, 
      model: jsonModel.model_name, 
      dbModel: dbModel.name,
      dbModelSlug: dbModel.model_slug,
      providerMatch: providerMatches 
    };
    
  } catch (error) {
    const modelName = jsonModel?.model_name || 'unknown';
    logger.error(`Error processing model ${modelName}:`, error);
    return { matched: false, model: modelName, error: error.message };
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    logger.info('Starting model metadata population from JSON...');
    
    // Initialize database
    if (!db.initialized) {
      await db.initialize();
      logger.info('Database initialized successfully');
    }
    
    // Load JSON data
    const jsonModels = await loadModelDescriptions();
    
    // Process models in batches
    logger.info(`About to process ${jsonModels.length} models`);
    
    const results = [];
    for (let i = 0; i < jsonModels.length; i++) {
      logger.debug(`Processing model ${i + 1}/${jsonModels.length}: ${jsonModels[i]?.model_name}`);
      const result = await processModel(jsonModels[i]);
      results.push(result);
    }
    
    // Generate summary
    const matched = results.filter(r => r.matched);
    const unmatched = results.filter(r => !r.matched);
    const providerMismatches = matched.filter(r => !r.providerMatch);
    
    logger.info('='.repeat(50));
    logger.info('SUMMARY:');
    logger.info(`Total models in JSON: ${jsonModels.length}`);
    logger.info(`Successfully matched: ${matched.length}`);
    logger.info(`Unmatched: ${unmatched.length}`);
    logger.info(`Provider mismatches: ${providerMismatches.length}`);
    
    if (matched.length > 0) {
      logger.info('✅ MATCHED MODELS:');
      matched.forEach(result => {
        const providerStatus = result.providerMatch ? '✅' : '⚠️';
        logger.info(`  ${providerStatus} "${result.model}" -> "${result.dbModel}"`);
      });
    }
    
    if (unmatched.length > 0) {
      logger.warn('❌ UNMATCHED MODELS:');
      unmatched.forEach(result => {
        logger.warn(`  - "${result.model}"`);
      });
    }
    
    if (providerMismatches.length > 0) {
      logger.warn('⚠️ PROVIDER MISMATCHES:');
      providerMismatches.forEach(result => {
        logger.warn(`  - "${result.model}" -> "${result.dbModel}"`);
      });
    }
    
    // Update JSON file with model_slug_match field
    logger.info('Updating JSON file with model_slug_match field...');
    await updateJsonWithMatches(jsonModels, results);
    
    logger.info('Model metadata population completed successfully!');
    
  } catch (error) {
    logger.error('Script failed:', error);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

/**
 * Update JSON file with model_slug_match field
 */
async function updateJsonWithMatches(jsonModels, results) {
  try {
    // Create a map of model names to their database matches
    const matchMap = {};
    results.forEach(result => {
      if (result.matched && result.dbModel) {
        // Find the database model to get its slug
        matchMap[result.model] = result.dbModelSlug || '';
      } else {
        matchMap[result.model] = '';
      }
    });
    
    // Update each JSON model with model_slug_match field
    const updatedJsonModels = jsonModels.map(model => ({
      ...model,
      model_slug_match: matchMap[model.model_name] || ''
    }));
    
    // Write updated JSON back to file
    const updatedJsonData = JSON.stringify(updatedJsonModels, null, 2);
    fs.writeFileSync(JSON_FILE_PATH, updatedJsonData, 'utf8');
    
    logger.info('JSON file updated with model_slug_match field');
    
  } catch (error) {
    logger.error('Error updating JSON file:', error);
  }
}

// Run script if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

module.exports = main;