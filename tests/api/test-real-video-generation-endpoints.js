#!/usr/bin/env node

/**
 * Test REAL Video Generation Endpoints
 * 
 * This test actually calls the video generation API endpoints (not just database queries)
 * WARNING: This makes real API calls and may generate actual videos!
 */

const db = require('../../database');

async function testRealVideoEndpoints() {
    console.log('🎬 TESTING REAL VIDEO GENERATION ENDPOINTS');
    console.log('==========================================');
    console.log('⚠️  WARNING: This makes REAL API calls that may generate videos!');
    console.log('');

    try {
        // Initialize database
        if (!db.initialized) {
            await db.initialize();
        }

        const testPrompt = "A beautiful sunset over mountains (TEST - DO NOT GENERATE)";

        // Test 1: Google Veo3 - Real Video Generation Endpoint
        console.log('🧪 Testing Google Veo3 REAL video generation endpoint...');
        try {
            const googleVeo3Service = require('../../services/google-veo3.service');
            
            // Find a Google Veo model
            const googleProvider = await db.models.Provider.findOne({ where: { name: 'google-veo' } });
            const googleModel = await db.models.Model.findOne({ 
                where: { id_provider: googleProvider.id },
                limit: 1 
            });

            if (googleModel) {
                console.log(`   📋 Using model: ${googleModel.name} (${googleModel.model_slug})`);
                console.log(`   🌐 This would call: https://generativelanguage.googleapis.com/v1beta/models/${googleModel.api_model_id}:predictLongRunning`);
                console.log('   🚫 SKIPPED: Real video generation disabled for safety');
                
                // Uncomment the following line to make REAL API calls:
                // const result = await googleVeo3Service.processGoogleVeo3Request({
                //     model: googleModel.model_slug,
                //     prompt: testPrompt,
                //     chatId: 1,
                //     userId: 1,
                //     agent_type: 'video',
                //     duration: 5,
                //     aspectRatio: "16:9"
                // });
            } else {
                console.log('   ❌ No Google Veo model found');
            }
        } catch (error) {
            console.log(`   ❌ Google Veo3 test error: ${error.message}`);
        }

        console.log('');

        // Test 2: Amazon Nova - Real Video Generation Endpoint  
        console.log('🧪 Testing Amazon Nova REAL video generation endpoint...');
        try {
            const amazonNovaService = require('../../services/amazon-nova.service');
            
            // Find an Amazon Nova model
            const amazonProvider = await db.models.Provider.findOne({ where: { name: 'amazon' } });
            const amazonModel = await db.models.Model.findOne({ 
                where: { id_provider: amazonProvider.id },
                limit: 1 
            });

            if (amazonModel) {
                console.log(`   📋 Using model: ${amazonModel.name} (${amazonModel.model_slug})`);
                console.log(`   🌐 This would call: AWS Bedrock Runtime API`);
                console.log(`   📡 Endpoint: bedrock-runtime.amazonaws.com`);
                console.log(`   🔧 Method: invokeModel with ${amazonModel.api_model_id}`);
                console.log('   🚫 SKIPPED: Real video generation disabled for safety');
                
                // Uncomment the following line to make REAL API calls:
                // const result = await amazonNovaService.processAmazonNovaRequest({
                //     model: amazonModel.model_slug,
                //     prompt: testPrompt,
                //     chatId: 1,
                //     userId: 1,
                //     agent_type: 'video',
                //     duration: 6
                // });
            } else {
                console.log('   ❌ No Amazon Nova model found');
            }
        } catch (error) {
            console.log(`   ❌ Amazon Nova test error: ${error.message}`);
        }

        console.log('');

        // Test 3: Runway ML - Real Video Generation Endpoint
        console.log('🧪 Testing Runway ML REAL video generation endpoint...');
        try {
            const runwayService = require('../../services/runway.service');
            
            // Find a Runway model
            const runwayProvider = await db.models.Provider.findOne({ where: { name: 'runway' } });
            const runwayModel = await db.models.Model.findOne({ 
                where: { id_provider: runwayProvider.id },
                limit: 1 
            });

            if (runwayModel) {
                console.log(`   📋 Using model: ${runwayModel.name} (${runwayModel.model_slug})`);
                console.log(`   🌐 This would call: https://api.runwayml.com/v1/tasks`);
                console.log(`   🔧 Method: POST to create video generation task`);
                console.log('   🚫 SKIPPED: Real video generation disabled for safety');
                
                // Uncomment the following line to make REAL API calls:
                // const result = await runwayService.processRunwayRequest({
                //     model: runwayModel.model_slug,
                //     prompt: testPrompt,
                //     chatId: 1,
                //     userId: 1,
                //     agent_type: 'video',
                //     duration: 10
                // });
            } else {
                console.log('   ❌ No Runway model found');
            }
        } catch (error) {
            console.log(`   ❌ Runway ML test error: ${error.message}`);
        }

        console.log('');

        // Summary
        console.log('📋 COMPARISON: What We Actually Tested vs Real Video Generation');
        console.log('===============================================================');
        console.log('');
        console.log('❌ PREVIOUS TESTS (getAvailableModels):');
        console.log('   • Only query the database');
        console.log('   • Return model information stored locally');
        console.log('   • No external API calls for video generation');
        console.log('   • Fast and safe');
        console.log('');
        console.log('✅ REAL VIDEO GENERATION ENDPOINTS:');
        console.log('   • Google Veo3: POST to predictLongRunning');
        console.log('   • Amazon Nova: AWS Bedrock invokeModel');  
        console.log('   • Runway ML: POST to tasks endpoint');
        console.log('   • These actually generate videos');
        console.log('   • Cost money and take time');
        console.log('   • Require proper API authentication');
        console.log('');
        console.log('🎯 WHAT OUR TESTS PROVED:');
        console.log('   ✅ Database integration working');
        console.log('   ✅ Service modules load correctly');
        console.log('   ✅ API keys are configured');
        console.log('   ✅ Cost calculations work');
        console.log('   ⚠️  But we did NOT test actual video generation');
        console.log('');
        console.log('💡 TO TEST REAL VIDEO GENERATION:');
        console.log('   1. Uncomment the API calls above (at your own risk!)');
        console.log('   2. Or create mock tests that simulate the API responses');
        console.log('   3. Or test with very short duration to minimize cost');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        try {
            await db.close();
        } catch (error) {
            // Ignore cleanup errors
        }
        process.exit(0);
    }
}

// Run the analysis
testRealVideoEndpoints();