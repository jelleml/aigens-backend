#!/usr/bin/env node

/**
 * Test script to verify Ideogram capability mapping implementation
 */

const db = require('../../database');
const { ideogram_capabilities } = require('../../scripts/update-models-info/update-ideogram-models');

async function testCapabilityMapping() {
  try {
    console.log('🧪 Testing Ideogram capability mapping...\n');
    
    await db.initialize();
    
    // Test 1: Verify capabilities configuration
    console.log('1. ✅ Testing capabilities configuration:');
    console.log(`   - Capabilities count: ${ideogram_capabilities.length}`);
    ideogram_capabilities.forEach((cap, index) => {
      console.log(`   ${index + 1}. ${cap.name} (${cap.type})`);
      if (cap.description) {
        console.log(`      Description: ${cap.description}`);
      }
    });
    
    // Test 2: Check if capabilities exist in database
    console.log('\n2. ✅ Checking capabilities in database:');
    const { ModelsCapability } = db.models;
    
    for (const cap of ideogram_capabilities) {
      const existing = await ModelsCapability.findOne({
        where: {
          name: cap.name,
          type: cap.type
        }
      });
      
      if (existing) {
        console.log(`   ✅ "${cap.name}" (${cap.type}) exists (ID: ${existing.id})`);
      } else {
        console.log(`   ❌ "${cap.name}" (${cap.type}) not found`);
      }
    }
    
    // Test 3: Check Ideogram provider and models
    console.log('\n3. ✅ Checking Ideogram models and their capabilities:');
    const { Provider, Model } = db.models;
    
    const ideogramProvider = await Provider.findOne({
      where: { name: 'ideogram' }
    });
    
    if (!ideogramProvider) {
      console.log('   ❌ Ideogram provider not found');
      return;
    }
    
    console.log(`   ✅ Ideogram provider found (ID: ${ideogramProvider.id})`);
    
    const ideogramModels = await Model.findAll({
      where: { id_provider: ideogramProvider.id },
      include: [{
        model: ModelsCapability,
        as: 'modelsCapabilities',
        through: { attributes: [] }
      }]
    });
    
    console.log(`   - Found ${ideogramModels.length} Ideogram models`);
    
    for (const model of ideogramModels) {
      console.log(`\n   📋 Model: ${model.display_name} (${model.model_slug})`);
      console.log(`      API ID: ${model.api_model_id}`);
      console.log(`      Active: ${model.is_active}`);
      console.log(`      Capabilities: ${model.modelsCapabilities?.length || 0}`);
      
      if (model.modelsCapabilities && model.modelsCapabilities.length > 0) {
        model.modelsCapabilities.forEach(cap => {
          console.log(`        ✅ ${cap.name} (${cap.type})`);
        });
      } else {
        console.log('        ❌ No capabilities assigned');
      }
    }
    
    // Test 4: Test the createCapabilityRelationships function
    console.log('\n4. ✅ Testing capability relationship creation logic:');
    
    if (ideogramModels.length > 0) {
      const testModel = ideogramModels[0];
      console.log(`   Testing with model: ${testModel.model_slug}`);
      
      // Check if all expected capabilities are assigned
      const expectedCapabilities = ideogram_capabilities.map(c => `${c.name}:${c.type}`);
      const actualCapabilities = (testModel.modelsCapabilities || []).map(c => `${c.name}:${c.type}`);
      
      console.log(`   Expected capabilities: ${expectedCapabilities.length}`);
      console.log(`   Actual capabilities: ${actualCapabilities.length}`);
      
      const missingCapabilities = expectedCapabilities.filter(exp => !actualCapabilities.includes(exp));
      const extraCapabilities = actualCapabilities.filter(act => !expectedCapabilities.includes(act));
      
      if (missingCapabilities.length === 0 && extraCapabilities.length === 0) {
        console.log('   ✅ All capabilities correctly assigned');
      } else {
        if (missingCapabilities.length > 0) {
          console.log(`   ❌ Missing capabilities: ${missingCapabilities.join(', ')}`);
        }
        if (extraCapabilities.length > 0) {
          console.log(`   ⚠️  Extra capabilities: ${extraCapabilities.join(', ')}`);
        }
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
testCapabilityMapping();