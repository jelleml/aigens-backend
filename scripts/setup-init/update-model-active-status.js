#!/usr/bin/env node

/**
 * UPDATE MODEL STATUS SCRIPT
 * Updates the is_active field in the models table based on relations in models_models_stats_aa table
 * 
 * Logic:
 * - If a model has relations in models_models_stats_aa -> is_active = true
 * - If a model has no relations in models_models_stats_aa -> is_active = false
 * - EXCEPTION: Models from 'together' and 'openrouter' providers are always kept active
 * 
 * Usage:
 *   node scripts/update-model-active-status.js
 */

const db = require('../../database');

/**
 * Updates model status based on stats AA relations
 */
const updateModelStatus = async () => {
  try {
    console.log('=== UPDATING MODEL STATUS BASED ON STATS AA RELATIONS ===');
    
    // Initialize database
    if (!db.initialized) {
      await db.initialize();
    }
    
    const { Model, ModelModelStatsAA, Provider } = db.sequelize.models;
    
    if (!Model || !ModelModelStatsAA || !Provider) {
      throw new Error('Required models not found');
    }

    // Get provider IDs for 'together', 'openrouter', and 'ideogram'
    const [togetherProvider, openrouterProvider, ideogramProvider] = await Promise.all([
      Provider.findOne({ where: { name: 'together' } }),
      Provider.findOne({ where: { name: 'openrouter' } }),
      Provider.findOne({ where: { name: 'ideogram' } })
    ]);

    console.log('🔍 Special providers:');
    console.log(`  Together AI: ${togetherProvider ? `ID ${togetherProvider.id}` : 'NOT FOUND'}`);
    console.log(`  OpenRouter: ${openrouterProvider ? `ID ${openrouterProvider.id}` : 'NOT FOUND'}`);
    console.log(`  Ideogram: ${ideogramProvider ? `ID ${ideogramProvider.id}` : 'NOT FOUND'}`);

    const alwaysActiveProviderIds = [
      togetherProvider?.id,
      openrouterProvider?.id,
      ideogramProvider?.id
    ].filter(Boolean);

    // Get all models with provider information
    const allModels = await Model.findAll({
      attributes: ['id', 'name', 'model_slug', 'is_active', 'id_provider'],
      include: [{
        model: Provider,
        as: 'provider',
        attributes: ['name']
      }],
      order: [['name', 'ASC']]
    });

    console.log(`📋 Found ${allModels.length} models to process`);

    // Get all model IDs that have relations in models_models_stats_aa
    const modelsWithStats = await ModelModelStatsAA.findAll({
      attributes: ['id_model'],
      group: ['id_model']
    });

    const modelIdsWithStats = new Set(modelsWithStats.map(relation => relation.id_model));
    
    console.log(`📊 Found ${modelIdsWithStats.size} models with stats AA relations`);

    let activatedCount = 0;
    let deactivatedCount = 0;
    let unchangedCount = 0;
    let alwaysActiveCount = 0;

    // Process each model
    for (const model of allModels) {
      const hasStats = modelIdsWithStats.has(model.id);
      const isSpecialProvider = alwaysActiveProviderIds.includes(model.id_provider);
      const shouldBeActive = hasStats || isSpecialProvider;
      
      if (model.is_active !== shouldBeActive) {
        // Update the model status
        await model.update({ is_active: shouldBeActive });
        
        if (shouldBeActive) {
          const reason = isSpecialProvider ? 
            `(${model.provider?.name} - always active)` : 
            '(has stats)';
          console.log(`  ✅ Activated: ${model.name} (${model.model_slug}) ${reason}`);
          activatedCount++;
        } else {
          console.log(`  ❌ Deactivated: ${model.name} (${model.model_slug}) - no stats`);
          deactivatedCount++;
        }
      } else {
        // Status is already correct
        const status = model.is_active ? 'active' : 'inactive';
        const reason = isSpecialProvider && model.is_active ? 
          `(${model.provider?.name} - always active)` : 
          hasStats && model.is_active ? '(has stats)' : '';
        console.log(`  ⚪ Unchanged: ${model.name} (${model.model_slug}) - already ${status} ${reason}`);
        unchangedCount++;
        
        if (isSpecialProvider && model.is_active) {
          alwaysActiveCount++;
        }
      }
    }

    console.log(`\n📊 Update Summary:`);
    console.log(`  Activated: ${activatedCount}`);
    console.log(`  Deactivated: ${deactivatedCount}`);
    console.log(`  Unchanged: ${unchangedCount}`);
    console.log(`  Always active (together/openrouter/ideogram): ${alwaysActiveCount}`);
    console.log(`  Total processed: ${allModels.length}`);

    // Show final statistics
    const finalStats = await Model.findAll({
      attributes: [
        'is_active',
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
      ],
      group: ['is_active']
    });

    console.log(`\n📈 Final Model Status:`);
    finalStats.forEach(stat => {
      const status = stat.is_active ? 'Active' : 'Inactive';
      console.log(`  ${status}: ${stat.dataValues.count} models`);
    });

    if (activatedCount > 0 || deactivatedCount > 0) {
      console.log(`\n✅ Successfully updated ${activatedCount + deactivatedCount} models`);
    } else {
      console.log(`\n✅ All models already have correct status`);
    }

  } catch (error) {
    console.error('❌ Error updating model status:', error);
    throw error;
  }
};

/**
 * Main execution function
 */
const main = async () => {
  try {
    await updateModelStatus();
    
    // Only close database and exit if running as standalone script
    if (require.main === module) {
      await db.close();
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    if (require.main === module) {
      process.exit(1);
    } else {
      throw error;
    }
  }
};

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { updateModelStatus };