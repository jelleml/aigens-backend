#!/usr/bin/env node

/**
 * UPDATE API MODEL IDs SCRIPT
 * Updates existing models to populate api_model_id field where it's NULL
 * 
 * This script sets api_model_id to the model_slug without the provider suffix
 * using regex /-[^-]+$/ to remove the last dash and everything after it.
 */

const db = require('../../database');

/**
 * Update models with NULL api_model_id values
 */
const updateApiModelIds = async () => {
  try {
    console.log('=== UPDATING API MODEL IDs ===');
    
    // Initialize database
    await db.initialize();
    const { Model, Provider } = db.models;

    // Find all models with NULL api_model_id
    const modelsToUpdate = await Model.findAll({
      where: {
        api_model_id: null
      },
      include: [{
        model: Provider,
        as: 'provider',
        attributes: ['name']
      }]
    });

    console.log(`Found ${modelsToUpdate.length} models with NULL api_model_id`);

    let updatedCount = 0;

    for (const model of modelsToUpdate) {
      const modelSlug = model.model_slug;
      const providerName = model.provider.name;

      // Set api_model_id to model_slug without provider suffix
      const apiModelId = modelSlug.replace(/-[^-]+$/, '');
      
      console.log(`🔄 Setting api_model_id for ${modelSlug}: ${apiModelId}`);

      // Update the model
      try {
        await model.update({ api_model_id: apiModelId });
        console.log(`✅ Updated ${modelSlug}: api_model_id = ${apiModelId}`);
        updatedCount++;
      } catch (error) {
        console.error(`❌ Failed to update ${modelSlug}:`, error.message);
      }
    }

    console.log(`\n=== UPDATE COMPLETE ===`);
    console.log(`Models updated: ${updatedCount}`);
    console.log(`Total processed: ${modelsToUpdate.length}`);

    // Close database connection
    await db.close();
    process.exit(0);

  } catch (error) {
    console.error('Error during API model ID update:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  updateApiModelIds();
}

module.exports = { updateApiModelIds };