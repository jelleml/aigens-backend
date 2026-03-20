#!/usr/bin/env node

/**
 * POPULATE MODEL FAMILIES SCRIPT
 * Updates model_family field in models table based on pattern matching rules
 * 
 * This script reads model family rules from uploads/model_family_rules.json
 * and applies them to existing models to populate the model_family field.
 * 
 * Usage:
 *   node populate-model-families.js                 # Only process models without family (default)
 *   node populate-model-families.js --only-unset    # Only process models without family
 *   node populate-model-families.js --force         # Update ALL models (overwrite existing)
 *   node populate-model-families.js --all           # Process all models (no force overwrite)
 */

const fs = require('fs');
const path = require('path');
const db = require('../../database');
const { createLogger, withRetry, processBatches, withTransaction } = require('../../scripts/utils/error-handler');

// Initialize logger
const logger = createLogger('populate-model-families');

// Path to the rules file
const RULES_FILE_PATH = path.join(__dirname, '../../uploads/model_family_rules.json');

/**
 * Load model family rules from JSON file
 */
async function loadModelFamilyRules() {
  try {
    if (!fs.existsSync(RULES_FILE_PATH)) {
      throw new Error(`Rules file not found at: ${RULES_FILE_PATH}`);
    }
    
    const rulesData = fs.readFileSync(RULES_FILE_PATH, 'utf8');
    const rules = JSON.parse(rulesData);
    
    logger.info(`Loaded ${rules.rules.length} model family rules`);
    return rules;
  } catch (error) {
    logger.error('Error loading model family rules:', error);
    throw error;
  }
}

/**
 * Determine model family based on rules
 */
function determineModelFamily(modelName, modelSlug, rules) {
  const searchText = `${modelName} ${modelSlug}`.toLowerCase();
  
  // Sort rules by specificity (longer patterns first for better matching)
  const sortedRules = [...rules.rules].sort((a, b) => {
    const aMaxLength = Math.max(...a.patterns.map(p => p.length));
    const bMaxLength = Math.max(...b.patterns.map(p => p.length));
    return bMaxLength - aMaxLength;
  });
  
  for (const rule of sortedRules) {
    for (const pattern of rule.patterns) {
      const searchPattern = rules.matching_strategy.case_sensitive ? pattern : pattern.toLowerCase();
      
      if (searchText.includes(searchPattern)) {
        logger.debug(`Matched "${modelName}" -> "${rule.family}" (pattern: "${pattern}")`);
        return rule.family;
      }
    }
  }
  
  return rules.fallback.family;
}

/**
 * Process a single model
 */
async function processModel(model, rules, options = {}) {
  try {
    const currentFamily = model.model_family;
    const determinedFamily = determineModelFamily(model.name, model.model_slug, rules);
    
    // Skip if family is already set and matches determined family (unless force mode)
    if (!options.force && currentFamily === determinedFamily) {
      return {
        processed: false,
        model: model.name,
        family: currentFamily,
        action: 'skipped (already set)'
      };
    }
    
    // Skip if family is already set and we're only processing unset models
    if (options.onlyUnset && currentFamily !== null && currentFamily !== '') {
      return {
        processed: false,
        model: model.name,
        family: currentFamily,
        action: 'skipped (already set)'
      };
    }
    
    // Update the model family
    await db.models.Model.update(
      { model_family: determinedFamily },
      { where: { id: model.id } }
    );
    
    const action = currentFamily ? 'updated' : 'set';
    logger.info(`${action.charAt(0).toUpperCase() + action.slice(1)} family for "${model.name}": "${currentFamily}" -> "${determinedFamily}"`);
    
    return {
      processed: true,
      model: model.name,
      family: determinedFamily,
      previousFamily: currentFamily,
      action
    };
    
  } catch (error) {
    logger.error(`Error processing model ${model.name}:`, error);
    return {
      processed: false,
      model: model.name,
      error: error.message,
      action: 'error'
    };
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const options = {
      force: args.includes('--force'),
      onlyUnset: args.includes('--only-unset') || (!args.includes('--force') && !args.includes('--all'))
    };
    
    if (options.force) {
      logger.info('Starting model family population (FORCE mode - will update all models)...');
    } else if (options.onlyUnset) {
      logger.info('Starting model family population (only unset models)...');
    } else {
      logger.info('Starting model family population...');
    }
    
    // Initialize database
    if (!db.initialized) {
      await db.initialize();
      logger.info('Database initialized successfully');
    }
    
    // Load rules
    const rules = await loadModelFamilyRules();
    
    // Get all models
    const models = await db.models.Model.findAll({
      attributes: ['id', 'name', 'model_slug', 'model_family'],
      order: [['name', 'ASC']]
    });
    
    logger.info(`Found ${models.length} models to process`);
    
    // Process models
    const results = [];
    for (let i = 0; i < models.length; i++) {
      logger.debug(`Processing model ${i + 1}/${models.length}: ${models[i].name}`);
      const result = await processModel(models[i], rules, options);
      results.push(result);
    }
    
    // Generate summary
    const processed = results.filter(r => r.processed);
    const skipped = results.filter(r => r.action === 'skipped (already set)');
    const errors = results.filter(r => r.action === 'error');
    const updated = results.filter(r => r.action === 'updated');
    const newlySet = results.filter(r => r.action === 'set');
    
    // Group by family
    const familyGroups = {};
    processed.forEach(result => {
      if (result.family) {
        if (!familyGroups[result.family]) {
          familyGroups[result.family] = [];
        }
        familyGroups[result.family].push(result.model);
      }
    });
    
    logger.info('='.repeat(60));
    logger.info('SUMMARY:');
    logger.info(`Total models: ${models.length}`);
    logger.info(`Processed: ${processed.length}`);
    logger.info(`  - Newly set: ${newlySet.length}`);
    logger.info(`  - Updated: ${updated.length}`);
    logger.info(`Skipped (already set): ${skipped.length}`);
    logger.info(`Errors: ${errors.length}`);
    
    if (Object.keys(familyGroups).length > 0) {
      logger.info('');
      logger.info('MODELS BY FAMILY:');
      Object.entries(familyGroups)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([family, models]) => {
          logger.info(`  ${family}: ${models.length} models`);
          models.forEach(model => {
            logger.info(`    - ${model}`);
          });
        });
    }
    
    if (errors.length > 0) {
      logger.warn('');
      logger.warn('ERRORS:');
      errors.forEach(result => {
        logger.warn(`  - ${result.model}: ${result.error}`);
      });
    }
    
    logger.info('');
    logger.info('Model family population completed successfully!');
    
  } catch (error) {
    logger.error('Script failed:', error);
    process.exit(1);
  } finally {
    await db.sequelize.close();
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