#!/usr/bin/env node

/**
 * Script to clean up old Ideogram models and prepare for new sync
 */

const db = require('../../database');

async function cleanupOldIdeogramModels() {
  try {
    console.log('🧹 Cleaning up old Ideogram models...\n');
    
    await db.initialize();
    
    const { Provider, Model, ModelPriceScore, ModelsModelsCapability } = db.models;
    
    // Find Ideogram provider
    const ideogramProvider = await Provider.findOne({
      where: { name: 'ideogram' }
    });
    
    if (!ideogramProvider) {
      console.log('❌ Ideogram provider not found');
      return;
    }
    
    console.log(`✅ Found Ideogram provider (ID: ${ideogramProvider.id})`);
    
    // Find all Ideogram models
    const ideogramModels = await Model.findAll({
      where: { id_provider: ideogramProvider.id }
    });
    
    console.log(`📊 Found ${ideogramModels.length} Ideogram models to clean up:`);
    
    const transaction = await db.sequelize.transaction();
    
    try {
      for (const model of ideogramModels) {
        console.log(`\n🗑️  Removing model: ${model.display_name} (${model.model_slug})`);
        
        // Remove capability relationships
        const capabilityCount = await ModelsModelsCapability.destroy({
          where: { id_model: model.id },
          transaction
        });
        console.log(`   - Removed ${capabilityCount} capability relationships`);
        
        // Remove pricing data
        const pricingCount = await ModelPriceScore.destroy({
          where: { id_model: model.id },
          transaction
        });
        console.log(`   - Removed ${pricingCount} pricing records`);
        
        // Remove the model itself
        await model.destroy({ transaction });
        console.log(`   ✅ Model removed successfully`);
      }
      
      await transaction.commit();
      console.log(`\n🎉 Successfully cleaned up ${ideogramModels.length} old Ideogram models`);
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.sequelize.close();
  }
}

// Run the cleanup
cleanupOldIdeogramModels();