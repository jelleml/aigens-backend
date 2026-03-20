#!/usr/bin/env node

/**
 * Direct test of the sync engine for Ideogram models
 */

const db = require('../../database');
const { ModelSyncEngine } = require('../../services/model-management/automation/sync-engine');

async function testSyncEngineDirect() {
  try {
    console.log('🧪 Testing Sync Engine directly...\n');
    
    await db.initialize();
    
    // Find Ideogram provider
    const { Provider } = db.models;
    const ideogramProvider = await Provider.findOne({
      where: { name: 'ideogram' }
    });
    
    if (!ideogramProvider) {
      console.log('❌ Ideogram provider not found');
      return;
    }
    
    console.log(`✅ Found Ideogram provider (ID: ${ideogramProvider.id})`);
    
    // Create sync engine instance
    const mockMonitoring = {
      getLogger: () => ({
        info: console.log,
        debug: console.log,
        warn: console.warn,
        error: console.error
      }),
      getMetrics: () => ({
        startTimer: () => ({ end: () => {} }),
        endTimer: () => {},
        increment: () => {}
      })
    };
    
    const syncEngine = new ModelSyncEngine({ monitoring: mockMonitoring });
    await syncEngine.initialize();
    
    console.log('✅ Sync engine initialized');
    
    // Test the sync process
    console.log('\n🔄 Starting sync process...');
    const result = await syncEngine.syncProvider(ideogramProvider, {
      syncType: 'update',
      correlationId: 'test-sync-' + Date.now()
    });
    
    console.log('\n📊 Sync result:', result);
    
    // Verify the results
    console.log('\n🔍 Verifying sync results...');
    const { Model, ModelsCapability } = db.models;
    
    const ideogramModels = await Model.findAll({
      where: { id_provider: ideogramProvider.id },
      include: [{
        model: ModelsCapability,
        as: 'modelsCapabilities',
        through: { attributes: [] }
      }]
    });
    
    console.log(`✅ Found ${ideogramModels.length} Ideogram models after sync:`);
    
    for (const model of ideogramModels) {
      console.log(`\n📋 Model: ${model.display_name} (${model.model_slug})`);
      console.log(`   API ID: ${model.api_model_id}`);
      console.log(`   Active: ${model.is_active}`);
      console.log(`   Capabilities: ${model.modelsCapabilities?.length || 0}`);
      
      if (model.modelsCapabilities && model.modelsCapabilities.length > 0) {
        model.modelsCapabilities.forEach(cap => {
          console.log(`     ✅ ${cap.name} (${cap.type})`);
        });
      }
    }
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.sequelize.close();
  }
}

// Run the test
testSyncEngineDirect();