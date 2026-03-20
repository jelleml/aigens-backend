#!/usr/bin/env node

/**
 * Test script to verify Ideogram capability mapping implementation
 */

const db = require('../../database');
const { IDEOGRAM_MODELS_AND_PRICING, ideogram_capabilities } = require('../../scripts/update-models-info/update-ideogram-models');

async function testIdeogramCapabilities() {
  try {
    console.log('Testing Ideogram capability mapping...');
    
    // Test 1: Verify configuration is loaded correctly
    console.log('\n1. Testing configuration loading:');
    console.log(`   - Models count: ${IDEOGRAM_MODELS_AND_PRICING.length}`);
    console.log(`   - Capabilities count: ${ideogram_capabilities.length}`);
    console.log('   - Capabilities:', ideogram_capabilities.map(c => `${c.name} (${c.type})`).join(', '));
    
    // Test 2: Verify database connection
    console.log('\n2. Testing database connection:');
    await db.sequelize.authenticate();
    console.log('   ✓ Database connection successful');
    
    // Test 3: Check if Ideogram provider exists
    console.log('\n3. Checking Ideogram provider:');
    await db.initialize();
    const { Provider } = db.models;
    const ideogramProvider = await Provider.findOne({
      where: { name: 'ideogram' }
    });
    
    if (ideogramProvider) {
      console.log(`   ✓ Ideogram provider found (ID: ${ideogramProvider.id})`);
    } else {
      console.log('   ⚠ Ideogram provider not found in database');
    }
    
    // Test 4: Check existing capabilities in database
    console.log('\n4. Checking existing capabilities:');
    const { ModelsCapability } = db.models;
    const existingCapabilities = await ModelsCapability.findAll();
    console.log(`   - Total capabilities in database: ${existingCapabilities.length}`);
    
    // Check if Ideogram-specific capabilities exist
    for (const cap of ideogram_capabilities) {
      const existing = existingCapabilities.find(ec => ec.name === cap.name && ec.type === cap.type);
      if (existing) {
        console.log(`   ✓ Capability "${cap.name}" (${cap.type}) exists`);
      } else {
        console.log(`   - Capability "${cap.name}" (${cap.type}) not found`);
      }
    }
    
    // Test 5: Check existing Ideogram models and their capabilities
    console.log('\n5. Checking existing Ideogram models:');
    const { Model, ModelsModelsCapability } = db.models;
    const ideogramModels = await Model.findAll({
      where: { id_provider: ideogramProvider?.id },
      include: [{
        model: ModelsCapability,
        as: 'capabilities',
        through: { attributes: [] }
      }]
    });
    
    console.log(`   - Ideogram models in database: ${ideogramModels.length}`);
    for (const model of ideogramModels) {
      console.log(`   - Model: ${model.model_slug} (${model.capabilities?.length || 0} capabilities)`);
      if (model.capabilities && model.capabilities.length > 0) {
        model.capabilities.forEach(cap => {
          console.log(`     * ${cap.name} (${cap.type})`);
        });
      }
    }
    
    console.log('\n✓ Test completed successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.sequelize.close();
  }
}

// Run the test
testIdeogramCapabilities();