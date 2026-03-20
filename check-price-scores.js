#!/usr/bin/env node

const db = require('./database');

/**
 * Validates JSON structure in price_image field
 * @param {string} priceImageJson - JSON string from price_image field
 * @returns {Object} - Validation result with isValid flag and parsed data
 */
function validatePriceImageJson(priceImageJson) {
  try {
    if (!priceImageJson) {
      return { isValid: false, error: 'Empty price_image field', data: null };
    }

    const parsed = JSON.parse(priceImageJson);
    
    if (typeof parsed !== 'object' || parsed === null) {
      return { isValid: false, error: 'price_image is not a valid object', data: null };
    }

    // Check for expected operation types
    const expectedOperations = ['Generate', 'Remix', 'Edit', 'Reframe', 'Replace BG'];
    const availableOperations = Object.keys(parsed);
    
    if (availableOperations.length === 0) {
      return { isValid: false, error: 'No operations found in price_image', data: parsed };
    }

    // Validate that all values are numeric strings or numbers
    const invalidOperations = [];
    for (const [operation, price] of Object.entries(parsed)) {
      if (price !== null && price !== undefined) {
        const numPrice = parseFloat(price);
        if (isNaN(numPrice) || numPrice < 0) {
          invalidOperations.push(`${operation}: ${price}`);
        }
      }
    }

    if (invalidOperations.length > 0) {
      return { 
        isValid: false, 
        error: `Invalid price values: ${invalidOperations.join(', ')}`, 
        data: parsed 
      };
    }

    return { isValid: true, data: parsed, operations: availableOperations };
  } catch (error) {
    return { isValid: false, error: `JSON parse error: ${error.message}`, data: null };
  }
}

/**
 * Checks if a model is an image model by examining its pricing structure
 * @param {Object} record - Database record from models_price_score
 * @returns {boolean} - True if it's an image model
 */
function isImageModel(record) {
  return record.price_image !== null && record.price_image !== undefined;
}

/**
 * Checks if a model is a text model by examining its pricing structure
 * @param {Object} record - Database record from models_price_score
 * @returns {boolean} - True if it's a text model
 */
function isTextModel(record) {
  return (record.price_1m_input_tokens !== null && record.price_1m_input_tokens !== undefined) ||
         (record.price_1m_output_tokens !== null && record.price_1m_output_tokens !== undefined);
}

/**
 * Validates text model pricing
 * @param {Object} record - Database record
 * @returns {Object} - Validation result
 */
function validateTextModelPricing(record) {
  const issues = [];
  
  if (record.price_1m_input_tokens === null || record.price_1m_input_tokens === undefined) {
    issues.push('Missing input token pricing');
  } else if (record.price_1m_input_tokens < 0) {
    issues.push('Invalid input token pricing (negative)');
  }
  
  if (record.price_1m_output_tokens === null || record.price_1m_output_tokens === undefined) {
    issues.push('Missing output token pricing');
  } else if (record.price_1m_output_tokens < 0) {
    issues.push('Invalid output token pricing (negative)');
  }
  
  return {
    isValid: issues.length === 0,
    issues: issues
  };
}

/**
 * Validates image model pricing
 * @param {Object} record - Database record
 * @returns {Object} - Validation result
 */
function validateImageModelPricing(record) {
  const validation = validatePriceImageJson(record.price_image);
  
  return {
    isValid: validation.isValid,
    issues: validation.isValid ? [] : [validation.error],
    operations: validation.operations || [],
    data: validation.data
  };
}

async function checkPriceScores() {
  try {
    await db.initialize();
    
    const count = await db.sequelize.query('SELECT COUNT(*) as count FROM models_price_score', {
      type: db.sequelize.QueryTypes.SELECT
    });
    
    console.log('=== PRICE SCORES ANALYSIS ===');
    console.log(`Total models_price_score records: ${count[0].count}`);
    
    if (count[0].count === 0) {
      console.log('No records found in models_price_score table.');
      await db.close();
      return;
    }

    // Get all records with model and provider information
    const allRecords = await db.sequelize.query(`
      SELECT mps.*, m.model_slug, m.api_model_id, p.name as provider_name
      FROM models_price_score mps 
      JOIN models m ON mps.id_model = m.id 
      JOIN providers p ON m.id_provider = p.id 
      ORDER BY p.name, m.model_slug
    `, {
      type: db.sequelize.QueryTypes.SELECT
    });

    // Separate models by type
    const imageModels = [];
    const textModels = [];
    const hybridModels = [];

    allRecords.forEach(record => {
      const hasImagePricing = isImageModel(record);
      const hasTextPricing = isTextModel(record);
      
      if (hasImagePricing && hasTextPricing) {
        hybridModels.push(record);
      } else if (hasImagePricing) {
        imageModels.push(record);
      } else if (hasTextPricing) {
        textModels.push(record);
      }
    });

    console.log('\n=== MODEL TYPE BREAKDOWN ===');
    console.log(`Image models: ${imageModels.length}`);
    console.log(`Text models: ${textModels.length}`);
    console.log(`Hybrid models: ${hybridModels.length}`);
    console.log(`Total classified: ${imageModels.length + textModels.length + hybridModels.length}`);

    // Initialize counters
    let validImageModels = 0;
    let invalidImageModels = 0;
    let validTextModels = 0;
    let invalidTextModels = 0;

    // Analyze image models
    if (imageModels.length > 0) {
      console.log('\n=== IMAGE MODELS ANALYSIS ===');
      
      const imageValidationIssues = [];

      imageModels.forEach(record => {
        const validation = validateImageModelPricing(record);
        
        if (validation.isValid) {
          validImageModels++;
        } else {
          invalidImageModels++;
          imageValidationIssues.push({
            model: `${record.model_slug} (${record.provider_name})`,
            issues: validation.issues
          });
        }
      });

      console.log(`Valid image models: ${validImageModels}`);
      console.log(`Invalid image models: ${invalidImageModels}`);
      
      if (invalidImageModels > 0) {
        console.log('\nImage models with pricing issues:');
        imageValidationIssues.forEach(issue => {
          console.log(`  ❌ ${issue.model}`);
          issue.issues.forEach(problemDesc => {
            console.log(`     - ${problemDesc}`);
          });
        });
      }

      // Show sample valid image models
      const validSamples = imageModels.filter(record => 
        validateImageModelPricing(record).isValid
      ).slice(0, 5);

      if (validSamples.length > 0) {
        console.log('\nSample valid image models:');
        validSamples.forEach(record => {
          const validation = validateImageModelPricing(record);
          console.log(`  ✅ ${record.model_slug} (${record.provider_name})`);
          console.log(`     Operations: ${validation.operations.join(', ')}`);
          
          // Show pricing details
          if (validation.data) {
            const prices = Object.entries(validation.data)
              .filter(([_, price]) => price !== null && price !== undefined)
              .map(([op, price]) => `${op}: $${price}`)
              .join(', ');
            console.log(`     Pricing: ${prices}`);
          }
        });
      }
    }

    // Analyze text models
    if (textModels.length > 0) {
      console.log('\n=== TEXT MODELS ANALYSIS ===');
      
      const textValidationIssues = [];

      textModels.forEach(record => {
        const validation = validateTextModelPricing(record);
        
        if (validation.isValid) {
          validTextModels++;
        } else {
          invalidTextModels++;
          textValidationIssues.push({
            model: `${record.model_slug} (${record.provider_name})`,
            issues: validation.issues
          });
        }
      });

      console.log(`Valid text models: ${validTextModels}`);
      console.log(`Invalid text models: ${invalidTextModels}`);
      
      if (invalidTextModels > 0) {
        console.log('\nText models with pricing issues:');
        textValidationIssues.slice(0, 10).forEach(issue => {
          console.log(`  ❌ ${issue.model}`);
          issue.issues.forEach(problemDesc => {
            console.log(`     - ${problemDesc}`);
          });
        });
        
        if (textValidationIssues.length > 10) {
          console.log(`     ... and ${textValidationIssues.length - 10} more`);
        }
      }
    }

    // Analyze hybrid models
    if (hybridModels.length > 0) {
      console.log('\n=== HYBRID MODELS ANALYSIS ===');
      console.log('Models with both text and image pricing:');
      
      hybridModels.forEach(record => {
        const textValidation = validateTextModelPricing(record);
        const imageValidation = validateImageModelPricing(record);
        
        const status = (textValidation.isValid && imageValidation.isValid) ? '✅' : '❌';
        console.log(`  ${status} ${record.model_slug} (${record.provider_name})`);
        
        if (!textValidation.isValid) {
          textValidation.issues.forEach(issue => {
            console.log(`     - Text: ${issue}`);
          });
        }
        
        if (!imageValidation.isValid) {
          imageValidation.issues.forEach(issue => {
            console.log(`     - Image: ${issue}`);
          });
        }
      });
    }

    // Check by source
    const bySource = await db.sequelize.query(`
      SELECT source, COUNT(*) as count 
      FROM models_price_score 
      WHERE source IS NOT NULL 
      GROUP BY source
      ORDER BY count DESC
    `, {
      type: db.sequelize.QueryTypes.SELECT
    });
    
    console.log('\n=== RECORDS BY SOURCE ===');
    bySource.forEach(record => {
      console.log(`  ${record.source}: ${record.count} records`);
    });

    // Summary
    console.log('\n=== SUMMARY ===');
    const totalValid = validImageModels + validTextModels + 
      hybridModels.filter(r => 
        validateTextModelPricing(r).isValid && validateImageModelPricing(r).isValid
      ).length;
    const totalInvalid = invalidImageModels + invalidTextModels + 
      hybridModels.filter(r => 
        !validateTextModelPricing(r).isValid || !validateImageModelPricing(r).isValid
      ).length;
    
    console.log(`Total models with valid pricing: ${totalValid}`);
    console.log(`Total models with pricing issues: ${totalInvalid}`);
    console.log(`Pricing completeness: ${((totalValid / allRecords.length) * 100).toFixed(1)}%`);
    
    await db.close();
  } catch (error) {
    console.error('Error:', error);
    await db.close();
  }
}

checkPriceScores();

// Export functions for testing
module.exports = {
  validatePriceImageJson,
  isImageModel,
  isTextModel,
  validateTextModelPricing,
  validateImageModelPricing,
  checkPriceScores
};