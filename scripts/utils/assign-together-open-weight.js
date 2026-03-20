#!/usr/bin/env node

/**
 * ASSIGN OPEN WEIGHT CAPABILITY TO TOGETHER AI MODELS
 * This script assigns the 'open_weight' llm_type capability to all Together AI models
 * 
 * Run after capabilities are populated:
 *   node scripts/assign-together-open-weight.js
 */

const db = require('../database');

/**
 * Main function to assign open_weight capability to Together AI models
 */
const assignTogetherOpenWeight = async () => {
  try {
    console.log('=== ASSIGNING OPEN_WEIGHT CAPABILITY TO TOGETHER AI MODELS ===');
    
    // Initialize database
    await db.initialize();
    const { Model, Provider, ModelsCapability, ModelsModelsCapability } = db.models;

    // Find Together AI provider
    const togetherProvider = await Provider.findOne({
      where: { name: 'together' }
    });

    if (!togetherProvider) {
      console.error('❌ Together AI provider not found');
      return;
    }

    console.log(`✅ Found Together AI provider (ID: ${togetherProvider.id})`);

    // Find all Together AI models
    const togetherModels = await Model.findAll({
      where: { id_provider: togetherProvider.id },
      attributes: ['id', 'name', 'model_slug']
    });

    console.log(`📋 Found ${togetherModels.length} Together AI models`);

    if (togetherModels.length === 0) {
      console.log('No Together AI models found');
      return;
    }

    // Find the open_weight capability
    const openWeightCapability = await ModelsCapability.findOne({
      where: { name: 'open_weight', type: 'llm_type' }
    });

    if (!openWeightCapability) {
      console.error('❌ open_weight capability not found. Please run populate-capabilities.js first');
      return;
    }

    console.log(`✅ Found open_weight capability (ID: ${openWeightCapability.id})`);

    let assigned = 0;
    let alreadyAssigned = 0;
    let errors = 0;

    // Assign open_weight capability to each Together AI model
    for (const model of togetherModels) {
      try {
        const [relation, wasCreated] = await ModelsModelsCapability.findOrCreate({
          where: {
            id_model: model.id,
            id_capability: openWeightCapability.id
          },
          defaults: {
            id_model: model.id,
            id_capability: openWeightCapability.id
          }
        });

        if (wasCreated) {
          console.log(`  ✅ Assigned open_weight to: ${model.name} (${model.model_slug})`);
          assigned++;
        } else {
          console.log(`  ⚠️  Already assigned: ${model.name} (${model.model_slug})`);
          alreadyAssigned++;
        }

      } catch (error) {
        console.error(`  ❌ Error assigning to ${model.name}:`, error.message);
        errors++;
      }
    }

    console.log(`\n📊 Assignment Summary:`);
    console.log(`  Newly assigned: ${assigned}`);
    console.log(`  Already assigned: ${alreadyAssigned}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Total Together AI models: ${togetherModels.length}`);
    
    if (assigned > 0) {
      console.log(`\n✅ Successfully assigned open_weight capability to ${assigned} Together AI models`);
    }

    // Verify the assignments
    const assignedModelIds = await ModelsModelsCapability.findAll({
      attributes: ['id_model'],
      where: { id_capability: openWeightCapability.id }
    });

    const togetherModelIds = togetherModels.map(m => m.id);
    const assignedTogetherCount = assignedModelIds.filter(rel => 
      togetherModelIds.includes(rel.id_model)
    ).length;

    console.log(`\n🔍 Verification: ${assignedTogetherCount} Together AI models now have open_weight capability`);

    // Only close database and exit if running as standalone script
    if (require.main === module) {
      await db.close();
      process.exit(0);
    }

  } catch (error) {
    console.error('Error during open_weight assignment:', error);
    if (require.main === module) {
      process.exit(1);
    } else {
      throw error; // Re-throw for parent script to handle
    }
  }
};

// Run if called directly
if (require.main === module) {
  assignTogetherOpenWeight();
}

module.exports = { assignTogetherOpenWeight };