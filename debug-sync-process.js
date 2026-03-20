#!/usr/bin/env node

/**
 * Debug script to understand the sync process
 */

const db = require('./database');
const { IDEOGRAM_MODELS_AND_PRICING } = require('./scripts/update-models-info/update-ideogram-models');

async function debugSyncProcess() {
  try {
    console.log('🔍 Debugging Sync Process...\n');
    
    // Initialize database
    await db.initialize();
    console.log('✅ Database initialized');
    
    const { Model, Provider } = db.models;
    
    // Find Ideogram provider
    const provider = await Provider.findOne({ where: { name: 'ideogram' } });
    if (!provider) {
      console.log('❌ Ideogram provider not found');
      return;
    }
    console.log(`✅ Found Ideogram provider (ID: ${provider.id})`);
    
    // Show configuration models
    console.log('\n📋 Configuration Models:');
    console.log('========================');
    IDEOGRAM_MODELS_AND_PRICING.forEach((model, index) => {
      console.log(`${index + 1}. ${model.display_name} (${model.model_slug})`);
      console.log(`   API ID: ${model.api_model_id}`);
      console.log(`   Generate: $${model.generate}`);
    });
    
    // Show database models
    console.log('\n📊 Database Models:');
    console.log('===================');
    const models = await Model.findAll({ 
      where: { id_provider: provider.id },
      order: [['model_slug', 'ASC']]
    });
    
    if (models.length === 0) {
      console.log('❌ No Ideogram models found in database');
    } else {
      models.forEach((model, index) => {
        console.log(`${index + 1}. ${model.display_name} (${model.model_slug})`);
        console.log(`   API ID: ${model.api_model_id}`);
        console.log(`   Active: ${model.is_active}`);
      });
    }
    
    // Compare configuration vs database
    console.log('\n🔄 Comparison:');
    console.log('==============');
    const dbModelSlugs = new Set(models.map(m => m.model_slug));
    const configModelSlugs = new Set(IDEOGRAM_MODELS_AND_PRICING.map(m => m.model_slug));
    
    console.log(`Configuration models: ${configModelSlugs.size}`);
    console.log(`Database models: ${dbModelSlugs.size}`);
    
    const missingInDb = [...configModelSlugs].filter(slug => !dbModelSlugs.has(slug));
    const extraInDb = [...dbModelSlugs].filter(slug => !configModelSlugs.has(slug));
    
    if (missingInDb.length > 0) {
      console.log('\n❌ Missing in database:');
      missingInDb.forEach(slug => console.log(`   - ${slug}`));
    }
    
    if (extraInDb.length > 0) {
      console.log('\n⚠️  Extra in database:');
      extraInDb.forEach(slug => console.log(`   - ${slug}`));
    }
    
    if (missingInDb.length === 0 && extraInDb.length === 0) {
      console.log('✅ Configuration and database models match');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    try {
      await db.close();
      console.log('\n✅ Database connection closed');
    } catch (closeError) {
      console.error('Error closing database:', closeError);
    }
  }
}

// Run the debug
if (require.main === module) {
  debugSyncProcess()
    .then(() => {
      console.log('\n✅ Debug completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Debug failed:', error);
      process.exit(1);
    });
}

module.exports = { debugSyncProcess };