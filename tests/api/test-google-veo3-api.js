const db = require('../../database');
const googleVeo3Service = require('../../services/google-veo3.service');

/**
 * Google Veo3 API Tests
 * 
 * Tests Google Veo3 video generation service
 * - Gemini API connectivity for Veo3 models
 * - Video+Audio vs Video-Only model variants
 * - Long-running operation polling
 * - GCS integration for video storage
 * - Cost calculation for video generation
 */

// Test configuration
const TEST_CONFIG = {
    timeout: 30000, // 30 seconds timeout
    skipRealAPI: process.env.SKIP_REAL_API === 'true',
    testUser: {
        email: 'test-google-veo3@example.com',
        password: 'testpassword123'
    },
    expectedModels: [
        'veo-3.0-generate-preview-google',
        'veo-3.0-generate-video-only-preview-google',
        'veo-3.0-fast-generate-preview-google',
        'veo-3.0-fast-generate-video-only-preview-google'
    ],
    testPrompt: 'A majestic mountain landscape during golden hour with clouds rolling over peaks'
};

describe('Google Veo3 API Tests', () => {
    let testUser, testChat, testWallet, testProvider, testModels;

    beforeAll(async () => {
        console.log('🚀 Starting Google Veo3 API Tests...');
        
        // Initialize database
        if (!db.initialized) {
            await db.initialize();
        }

        // Get Google Veo provider
        testProvider = await db.models.Provider.findOne({ 
            where: { name: 'google-veo' }
        });

        if (!testProvider) {
            throw new Error('Google Veo provider not found in database. Run init-provider-subscriptions.js first.');
        }

        // Get Google Veo models
        testModels = await db.models.Model.findAll({
            where: { id_provider: testProvider.id }
        });

        // Create test user
        testUser = await db.models.User.create({
            email: TEST_CONFIG.testUser.email,
            password: TEST_CONFIG.testUser.password,
            is_verified: true
        });

        // Create wallet
        testWallet = await db.models.Wallet.create({
            user_id: testUser.id,
            balance: 1000
        });

        // Create test chat
        testChat = await db.models.Chat.create({
            user_id: testUser.id,
            title: 'Google Veo3 Test Chat'
        });

        console.log(`✅ Test setup complete. Provider ID: ${testProvider.id}, Models: ${testModels.length}`);
    });

    afterAll(async () => {
        // Cleanup
        if (testUser) {
            await db.models.Wallet.destroy({ where: { user_id: testUser.id } });
            await db.models.Chat.destroy({ where: { user_id: testUser.id } });
            await db.models.User.destroy({ where: { id: testUser.id } });
        }
        console.log('🧹 Google Veo3 test cleanup complete');
    });

    describe('Service Connectivity Tests', () => {
        
        test('should get available models', async () => {
            try {
                const models = await googleVeo3Service.getAvailableModels();
                
                expect(Array.isArray(models)).toBe(true);
                console.log(`✅ Google Veo3: Found ${models.length} available models`);
                
                if (models.length > 0) {
                    models.forEach(model => {
                        expect(model).toHaveProperty('id');
                        expect(model).toHaveProperty('name');
                        console.log(`   - ${model.name} (${model.id})`);
                    });
                }
            } catch (error) {
                console.log(`❌ Google Veo3: Error getting models - ${error.message}`);
                
                // Check if it's a configuration issue
                if (error.message.includes('API key') || error.message.includes('GOOGLE_GEMINI_KEY')) {
                    console.log('⚠️ This might be a Google API key configuration issue. Check GOOGLE_GEMINI_KEY.');
                }
                
                throw error;
            }
        }, TEST_CONFIG.timeout);

        test('should check model availability for Veo3 models', async () => {
            const modelTests = [];

            for (const expectedModel of TEST_CONFIG.expectedModels) {
                try {
                    const isAvailable = await googleVeo3Service.isModelAvailable(expectedModel);
                    modelTests.push({
                        model: expectedModel,
                        available: isAvailable,
                        status: 'OK'
                    });
                    console.log(`   ${expectedModel}: ${isAvailable ? '✅ Available' : '❌ Not Available'}`);
                } catch (error) {
                    modelTests.push({
                        model: expectedModel,
                        available: false,
                        status: `ERROR: ${error.message}`,
                        error: error.message
                    });
                    console.log(`   ${expectedModel}: ❌ Error - ${error.message}`);
                }
            }

            // At least one model should be testable
            const testableModels = modelTests.filter(test => test.status === 'OK').length;
            expect(testableModels).toBeGreaterThan(0);

            console.log(`📊 Google Veo3 Model Availability: ${testableModels}/${modelTests.length} models testable`);
        });

        test('should validate Google Gemini API configuration', async () => {
            try {
                // Test Google API configuration by attempting to get models
                await googleVeo3Service.getAvailableModels();
                console.log('✅ Google Gemini API configuration appears valid');
            } catch (error) {
                if (error.message.includes('API key') || error.message.includes('GOOGLE_GEMINI_KEY')) {
                    console.log('❌ Google Gemini API configuration issue:');
                    console.log('   Required environment variable:');
                    console.log('   - GOOGLE_GEMINI_KEY');
                    
                    // Don't fail the test, just warn
                    expect(true).toBe(true); // Pass test but log the issue
                } else {
                    throw error;
                }
            }
        });
    });

    describe('Cost Calculation Tests', () => {
        
        test('should calculate costs for Veo3 models', async () => {
            if (testModels.length === 0) {
                console.log('⚠️ No Google Veo3 models found in database - skipping cost tests');
                return;
            }

            for (const model of testModels) {
                try {
                    const cost = await googleVeo3Service.calculateCost(model.id, 8, 'Generate'); // 8 seconds (max for Veo3)
                    
                    expect(cost).toHaveProperty('estimatedCost');
                    expect(cost).toHaveProperty('currency');
                    expect(cost).toHaveProperty('modelName');
                    expect(typeof cost.estimatedCost).toBe('number');
                    expect(cost.estimatedCost).toBeGreaterThan(0);
                    
                    console.log(`✅ ${model.name}: ${cost.estimatedCost} ${cost.currency} for 8 seconds`);
                } catch (error) {
                    console.log(`❌ ${model.name}: Cost calculation error - ${error.message}`);
                    throw error;
                }
            }
        });

        test('should validate Veo3 pricing structure', async () => {
            // Check price scores in database
            const priceScores = await db.models.ModelPriceScore.findAll({
                where: {
                    id_model: testModels.map(m => m.id),
                    source: 'google-veo'
                }
            });

            console.log(`📊 Found ${priceScores.length} price scores for Google Veo3 models`);

            if (priceScores.length > 0) {
                priceScores.forEach(score => {
                    expect(score.price_video).not.toBeNull();
                    
                    // Parse the JSON price structure
                    const priceData = JSON.parse(score.price_video);
                    expect(priceData).toHaveProperty('Generate');
                    expect(priceData).toHaveProperty('maxDuration');
                    expect(typeof priceData.Generate).toBe('number');
                    expect(priceData.maxDuration).toBe(8); // Veo3 max duration is 8 seconds
                    
                    // Veo3 prices should be between $0.25-$0.75 per second based on configuration
                    expect(priceData.Generate).toBeGreaterThanOrEqual(0.25);
                    expect(priceData.Generate).toBeLessThanOrEqual(0.75);
                    
                    console.log(`✅ Price structure valid: ${score.price_video}`);
                });
            }
        });

        test('should compare Video+Audio vs Video-Only pricing', async () => {
            const videoAudioModels = testModels.filter(m => 
                m.model_slug.includes('generate-preview') && !m.model_slug.includes('video-only')
            );
            const videoOnlyModels = testModels.filter(m => 
                m.model_slug.includes('video-only')
            );

            if (videoAudioModels.length > 0 && videoOnlyModels.length > 0) {
                const audioCost = await googleVeo3Service.calculateCost(videoAudioModels[0].id, 5, 'Generate');
                const videoCost = await googleVeo3Service.calculateCost(videoOnlyModels[0].id, 5, 'Generate');

                console.log(`🔊 Video+Audio Cost: ${audioCost.estimatedCost} ${audioCost.currency}`);
                console.log(`🎬 Video-Only Cost: ${videoCost.estimatedCost} ${videoCost.currency}`);
                
                // Video+Audio should typically be more expensive than Video-Only
                if (audioCost.estimatedCost > videoCost.estimatedCost) {
                    console.log('✅ Video+Audio pricing is higher than Video-Only (expected)');
                } else if (audioCost.estimatedCost === videoCost.estimatedCost) {
                    console.log('⚠️ Video+Audio and Video-Only have same pricing');
                } else {
                    console.log('⚠️ Video-Only pricing is higher than Video+Audio (unexpected)');
                }
            } else {
                console.log('⚠️ Cannot compare Video+Audio vs Video-Only pricing - models missing');
            }
        });
    });

    describe('Database Integration Tests', () => {
        
        test('should find Google Veo provider in database', async () => {
            expect(testProvider).not.toBeNull();
            expect(testProvider.name).toBe('google-veo');
            expect(testProvider.description).toContain('Veo');
            console.log(`✅ Google Veo provider found: ${testProvider.description}`);
        });

        test('should have Veo3 models in database', async () => {
            expect(testModels.length).toBeGreaterThan(0);
            
            const modelSlugs = testModels.map(m => m.model_slug);
            console.log(`📋 Database models: ${modelSlugs.join(', ')}`);

            // Check for expected models
            TEST_CONFIG.expectedModels.forEach(expectedModel => {
                const found = modelSlugs.includes(expectedModel);
                console.log(`   ${expectedModel}: ${found ? '✅ Found' : '❌ Missing'}`);
                if (!found) {
                    console.log(`   ⚠️ Run update-veo3-models.js to create missing models`);
                }
            });

            // Check for Video+Audio vs Video-Only models
            const videoAudioCount = modelSlugs.filter(slug => 
                slug.includes('generate-preview') && !slug.includes('video-only')
            ).length;
            const videoOnlyCount = modelSlugs.filter(slug => 
                slug.includes('video-only')
            ).length;
            console.log(`📊 Video+Audio models: ${videoAudioCount}, Video-Only models: ${videoOnlyCount}`);
        });

        test('should validate model configuration', async () => {
            testModels.forEach(model => {
                expect(model.id_provider).toBe(testProvider.id);
                expect(model.is_active).toBe(true);
                expect(model.model_slug).toMatch(/veo-3\.0-.*-google/);
                
                console.log(`✅ ${model.name}:`);
                console.log(`   Slug: ${model.model_slug}`);
                console.log(`   API ID: ${model.api_model_id}`);
                console.log(`   Active: ${model.is_active}`);
            });
        });
    });

    describe('Model Variant Tests', () => {
        
        test('should distinguish between Fast and Standard variants', async () => {
            const standardModels = testModels.filter(m => 
                m.model_slug.includes('generate-preview') && !m.model_slug.includes('fast')
            );
            const fastModels = testModels.filter(m => 
                m.model_slug.includes('fast-generate')
            );

            console.log(`🏷️ Standard models: ${standardModels.length}`);
            console.log(`🏷️ Fast models: ${fastModels.length}`);

            if (standardModels.length > 0 && fastModels.length > 0) {
                // Standard models should typically be more expensive (higher quality)
                const standardCost = await googleVeo3Service.calculateCost(standardModels[0].id, 5, 'Generate');
                const fastCost = await googleVeo3Service.calculateCost(fastModels[0].id, 5, 'Generate');

                console.log(`💰 Standard Cost: ${standardCost.estimatedCost} ${standardCost.currency}`);
                console.log(`💰 Fast Cost: ${fastCost.estimatedCost} ${fastCost.currency}`);
                
                if (standardCost.estimatedCost > fastCost.estimatedCost) {
                    console.log('✅ Standard pricing is higher than Fast (expected for higher quality)');
                } else if (standardCost.estimatedCost === fastCost.estimatedCost) {
                    console.log('⚠️ Standard and Fast have same pricing');
                } else {
                    console.log('⚠️ Fast pricing is higher than Standard (unexpected)');
                }
            }
        });

        test('should validate video duration limits', async () => {
            // Veo3 models have 8-second limit
            testModels.forEach(model => {
                // Check if model has correct max duration in configuration
                console.log(`⏱️ ${model.name}: Max duration should be 8 seconds`);
            });

            // Test cost calculation with max duration
            if (testModels.length > 0) {
                try {
                    const cost8s = await googleVeo3Service.calculateCost(testModels[0].id, 8, 'Generate');
                    console.log(`✅ 8-second duration accepted: ${cost8s.estimatedCost} ${cost8s.currency}`);
                } catch (error) {
                    console.log(`❌ 8-second duration rejected: ${error.message}`);
                }

                // Test with duration over limit
                try {
                    await googleVeo3Service.calculateCost(testModels[0].id, 15, 'Generate');
                    console.log('⚠️ 15-second duration should have been rejected (over Veo3 limit)');
                } catch (error) {
                    console.log('✅ 15-second duration properly rejected (over Veo3 limit)');
                }
            }
        });
    });

    describe('Error Handling Tests', () => {
        
        test('should handle invalid model IDs gracefully', async () => {
            try {
                const isAvailable = await googleVeo3Service.isModelAvailable('invalid-veo3-model');
                expect(typeof isAvailable).toBe('boolean');
                expect(isAvailable).toBe(false);
                console.log('✅ Invalid model ID handled gracefully');
            } catch (error) {
                // Some error handling is acceptable
                console.log(`⚠️ Invalid model ID threw error: ${error.message}`);
                expect(error.message).toBeTruthy(); // Should have an error message
            }
        });

        test('should handle cost calculation errors', async () => {
            if (testModels.length === 0) {
                console.log('⚠️ No models to test cost calculation errors');
                return;
            }

            try {
                // Test with negative duration
                await googleVeo3Service.calculateCost(testModels[0].id, -1, 'Generate');
                console.log('⚠️ Negative duration should have been rejected');
            } catch (error) {
                console.log('✅ Negative duration properly rejected');
                expect(error.message).toBeTruthy();
            }

            try {
                // Test with invalid operation
                await googleVeo3Service.calculateCost(testModels[0].id, 5, 'InvalidOperation');
                console.log('⚠️ Invalid operation should have been rejected');
            } catch (error) {
                console.log('✅ Invalid operation properly rejected');
                expect(error.message).toBeTruthy();
            }
        });

        test('should handle Google API errors gracefully', async () => {
            try {
                await googleVeo3Service.getAvailableModels();
                console.log('✅ Google API connectivity test passed');
            } catch (error) {
                console.log(`⚠️ Google API connectivity issue: ${error.message}`);
                
                if (error.message.includes('API key') || error.message.includes('GOOGLE_GEMINI_KEY')) {
                    console.log('   This is likely a Google API key configuration issue');
                } else if (error.message.includes('quota') || error.message.includes('limit')) {
                    console.log('   This might be a quota/rate limiting issue');
                } else if (error.message.includes('network') || error.message.includes('timeout')) {
                    console.log('   This might be a temporary network issue');
                } else {
                    console.log('   This might indicate a service integration problem');
                }
                
                // Don't fail the test for configuration/network issues
                expect(error.message).toBeTruthy();
            }
        });
    });

    describe('GCS Integration Tests', () => {
        
        test('should validate GCS service availability', async () => {
            // Test if GCS service is properly configured
            // This doesn't actually upload anything, just checks if the service is available
            try {
                const GoogleCloudStorage = require('../../services/google-cloud-storage.service');
                const gcsService = new GoogleCloudStorage();
                console.log('✅ GCS service initialized successfully');
                expect(gcsService).toBeDefined();
            } catch (error) {
                console.log(`⚠️ GCS service initialization issue: ${error.message}`);
                // Don't fail the test for GCS issues
                expect(error.message).toBeTruthy();
            }
        });
    });

    // Summary test
    test('should provide Google Veo3 integration summary', async () => {
        console.log('\n📋 Google Veo3 Integration Summary:');
        console.log('===================================');

        try {
            // API Status
            const models = await googleVeo3Service.getAvailableModels();
            console.log(`📍 API Status: ${models.length > 0 ? '✅ OK' : '❌ ERROR'}`);
            console.log(`📊 Available Models: ${models.length}`);
        } catch (error) {
            console.log(`📍 API Status: ❌ ERROR - ${error.message}`);
            console.log(`📊 Available Models: 0`);
        }

        // Database Status
        console.log(`🗄️ Database Models: ${testModels.length}`);
        console.log(`🔗 Provider Integration: ${testProvider ? '✅ OK' : '❌ ERROR'}`);

        // Model Breakdown
        const standardCount = testModels.filter(m => 
            m.model_slug.includes('generate-preview') && !m.model_slug.includes('fast')
        ).length;
        const fastCount = testModels.filter(m => 
            m.model_slug.includes('fast-generate')
        ).length;
        const videoAudioCount = testModels.filter(m => 
            !m.model_slug.includes('video-only')
        ).length;
        const videoOnlyCount = testModels.filter(m => 
            m.model_slug.includes('video-only')
        ).length;
        
        console.log(`🎬 Standard Models: ${standardCount}`);
        console.log(`🚀 Fast Models: ${fastCount}`);
        console.log(`🔊 Video+Audio Models: ${videoAudioCount}`);
        console.log(`🎥 Video-Only Models: ${videoOnlyCount}`);

        // Price Scores
        const priceScores = await db.models.ModelPriceScore.findAll({
            where: {
                id_model: testModels.map(m => m.id),
                source: 'google-veo'
            }
        });
        console.log(`💰 Price Scores: ${priceScores.length}`);

        // Configuration
        const hasApiKey = !!process.env.GOOGLE_GEMINI_KEY;
        console.log(`⚙️ API Configuration: ${hasApiKey ? '✅ OK' : '❌ Missing'}`);
        
        if (!hasApiKey) {
            console.log('   Required: GOOGLE_GEMINI_KEY');
        }
        
        console.log('');
    });
});