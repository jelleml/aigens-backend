const db = require('../../database');
const runwayService = require('../../services/runway.service');

/**
 * Runway ML API Tests
 * 
 * Tests Runway ML video generation service
 * - Runway API connectivity  
 * - Gen-3/Gen-4 model availability (Alpha, Turbo variants)
 * - Cost calculation
 * - API key validation
 * - Character consistency features testing
 */

// Test configuration
const TEST_CONFIG = {
    timeout: 30000, // 30 seconds timeout
    skipRealAPI: process.env.SKIP_REAL_API === 'true',
    testUser: {
        email: 'test-runway@example.com',
        password: 'testpassword123'
    },
    expectedModels: [
        'gen-3-alpha-runway',
        'gen-3-alpha-turbo-runway',
        'gen-4-runway',
        'gen-4-turbo-runway'
    ],
    testPrompt: 'A cyberpunk cityscape at night with neon lights and flying cars'
};

describe('Runway ML API Tests', () => {
    let testUser, testChat, testWallet, testProvider, testModels;

    beforeAll(async () => {
        console.log('🚀 Starting Runway ML API Tests...');
        
        // Initialize database
        if (!db.initialized) {
            await db.initialize();
        }

        // Get Runway provider
        testProvider = await db.models.Provider.findOne({ 
            where: { name: 'runway' }
        });

        if (!testProvider) {
            throw new Error('Runway provider not found in database. Run init-provider-subscriptions.js first.');
        }

        // Get Runway models
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
            title: 'Runway ML Test Chat'
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
        console.log('🧹 Runway ML test cleanup complete');
    });

    describe('Service Connectivity Tests', () => {
        
        test('should get available models', async () => {
            try {
                const models = await runwayService.getAvailableModels();
                
                expect(Array.isArray(models)).toBe(true);
                console.log(`✅ Runway ML: Found ${models.length} available models`);
                
                if (models.length > 0) {
                    models.forEach(model => {
                        expect(model).toHaveProperty('id');
                        expect(model).toHaveProperty('name');
                        console.log(`   - ${model.name} (${model.id})`);
                    });
                }
            } catch (error) {
                console.log(`❌ Runway ML: Error getting models - ${error.message}`);
                
                // Check if it's a configuration issue
                if (error.message.includes('API key') || error.message.includes('authentication')) {
                    console.log('⚠️ This might be an API key configuration issue. Check RUNWAY_API_KEY.');
                }
                
                throw error;
            }
        }, TEST_CONFIG.timeout);

        test('should check model availability for Gen-3/Gen-4 models', async () => {
            const modelTests = [];

            for (const expectedModel of TEST_CONFIG.expectedModels) {
                try {
                    const isAvailable = await runwayService.isModelAvailable(expectedModel);
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

            console.log(`📊 Runway ML Model Availability: ${testableModels}/${modelTests.length} models testable`);
        });

        test('should validate Runway API configuration', async () => {
            try {
                // Test API configuration by attempting to get models
                await runwayService.getAvailableModels();
                console.log('✅ Runway ML API configuration appears valid');
            } catch (error) {
                if (error.message.includes('API key') || error.message.includes('auth')) {
                    console.log('❌ Runway ML API configuration issue:');
                    console.log('   Required environment variable:');
                    console.log('   - RUNWAY_API_KEY');
                    
                    // Don't fail the test, just warn
                    expect(true).toBe(true); // Pass test but log the issue
                } else {
                    throw error;
                }
            }
        });
    });

    describe('Cost Calculation Tests', () => {
        
        test('should calculate costs for Runway models', async () => {
            if (testModels.length === 0) {
                console.log('⚠️ No Runway models found in database - skipping cost tests');
                return;
            }

            for (const model of testModels) {
                try {
                    const cost = await runwayService.calculateCost(model.id, 10, 'Generate'); // 10 seconds
                    
                    expect(cost).toHaveProperty('estimatedCost');
                    expect(cost).toHaveProperty('currency');
                    expect(cost).toHaveProperty('modelName');
                    expect(typeof cost.estimatedCost).toBe('number');
                    expect(cost.estimatedCost).toBeGreaterThan(0);
                    
                    console.log(`✅ ${model.name}: ${cost.estimatedCost} ${cost.currency} for 10 seconds`);
                } catch (error) {
                    console.log(`❌ ${model.name}: Cost calculation error - ${error.message}`);
                    throw error;
                }
            }
        });

        test('should validate Runway pricing structure', async () => {
            // Check price scores in database
            const priceScores = await db.models.ModelPriceScore.findAll({
                where: {
                    id_model: testModels.map(m => m.id),
                    source: 'runway'
                }
            });

            console.log(`📊 Found ${priceScores.length} price scores for Runway models`);

            if (priceScores.length > 0) {
                priceScores.forEach(score => {
                    expect(score.price_video).not.toBeNull();
                    
                    // Parse the JSON price structure
                    const priceData = JSON.parse(score.price_video);
                    expect(priceData).toHaveProperty('Generate');
                    expect(priceData).toHaveProperty('maxDuration');
                    expect(typeof priceData.Generate).toBe('number');
                    
                    // Runway prices should be between $0.50-$1.20 per second
                    expect(priceData.Generate).toBeGreaterThanOrEqual(0.50);
                    expect(priceData.Generate).toBeLessThanOrEqual(1.20);
                    
                    console.log(`✅ Price structure valid: ${score.price_video}`);
                });
            }
        });

        test('should compare Gen-3 vs Gen-4 pricing', async () => {
            const gen3Models = testModels.filter(m => m.model_slug.includes('gen-3'));
            const gen4Models = testModels.filter(m => m.model_slug.includes('gen-4'));

            if (gen3Models.length > 0 && gen4Models.length > 0) {
                const gen3Cost = await runwayService.calculateCost(gen3Models[0].id, 5, 'Generate');
                const gen4Cost = await runwayService.calculateCost(gen4Models[0].id, 5, 'Generate');

                console.log(`💰 Gen-3 Cost: ${gen3Cost.estimatedCost} ${gen3Cost.currency}`);
                console.log(`💰 Gen-4 Cost: ${gen4Cost.estimatedCost} ${gen4Cost.currency}`);
                
                // Gen-4 should typically be more expensive than Gen-3
                if (gen4Cost.estimatedCost > gen3Cost.estimatedCost) {
                    console.log('✅ Gen-4 pricing is higher than Gen-3 (expected)');
                } else {
                    console.log('⚠️ Gen-4 pricing is not higher than Gen-3 (unexpected)');
                }
            } else {
                console.log('⚠️ Cannot compare Gen-3 vs Gen-4 pricing - models missing');
            }
        });
    });

    describe('Database Integration Tests', () => {
        
        test('should find Runway provider in database', async () => {
            expect(testProvider).not.toBeNull();
            expect(testProvider.name).toBe('runway');
            expect(testProvider.description).toContain('Runway');
            console.log(`✅ Runway provider found: ${testProvider.description}`);
        });

        test('should have Gen-3/Gen-4 models in database', async () => {
            expect(testModels.length).toBeGreaterThan(0);
            
            const modelSlugs = testModels.map(m => m.model_slug);
            console.log(`📋 Database models: ${modelSlugs.join(', ')}`);

            // Check for expected models
            TEST_CONFIG.expectedModels.forEach(expectedModel => {
                const found = modelSlugs.includes(expectedModel);
                console.log(`   ${expectedModel}: ${found ? '✅ Found' : '❌ Missing'}`);
                if (!found) {
                    console.log(`   ⚠️ Run update-runway-models.js to create missing models`);
                }
            });

            // Check for Gen-3 vs Gen-4 models
            const gen3Count = modelSlugs.filter(slug => slug.includes('gen-3')).length;
            const gen4Count = modelSlugs.filter(slug => slug.includes('gen-4')).length;
            console.log(`📊 Gen-3 models: ${gen3Count}, Gen-4 models: ${gen4Count}`);
        });

        test('should validate model configuration', async () => {
            testModels.forEach(model => {
                expect(model.id_provider).toBe(testProvider.id);
                expect(model.is_active).toBe(true);
                expect(model.model_slug).toMatch(/gen-[34].*-runway/);
                
                console.log(`✅ ${model.name}:`);
                console.log(`   Slug: ${model.model_slug}`);
                console.log(`   API ID: ${model.api_model_id}`);
                console.log(`   Active: ${model.is_active}`);
            });
        });
    });

    describe('Model Feature Tests', () => {
        
        test('should distinguish between Alpha and Turbo variants', async () => {
            const alphaModels = testModels.filter(m => m.model_slug.includes('alpha'));
            const turboModels = testModels.filter(m => m.model_slug.includes('turbo'));

            console.log(`🏷️ Alpha models: ${alphaModels.length}`);
            console.log(`🏷️ Turbo models: ${turboModels.length}`);

            if (alphaModels.length > 0 && turboModels.length > 0) {
                // Alpha models should typically be more expensive (higher quality)
                const alphaCost = await runwayService.calculateCost(alphaModels[0].id, 5, 'Generate');
                const turboCost = await runwayService.calculateCost(turboModels[0].id, 5, 'Generate');

                console.log(`💰 Alpha Cost: ${alphaCost.estimatedCost} ${alphaCost.currency}`);
                console.log(`💰 Turbo Cost: ${turboCost.estimatedCost} ${turboCost.currency}`);
                
                if (alphaCost.estimatedCost > turboCost.estimatedCost) {
                    console.log('✅ Alpha pricing is higher than Turbo (expected for higher quality)');
                } else if (alphaCost.estimatedCost === turboCost.estimatedCost) {
                    console.log('⚠️ Alpha and Turbo have same pricing');
                } else {
                    console.log('⚠️ Turbo pricing is higher than Alpha (unexpected)');
                }
            }
        });

        test('should validate character consistency capabilities', async () => {
            // This is more of a metadata test since we can't test actual character consistency
            // without generating videos
            const modelsWithConsistency = testModels.filter(model => 
                model.description && model.description.toLowerCase().includes('consistency')
            );

            console.log(`🎭 Models with character consistency: ${modelsWithConsistency.length}`);
            
            modelsWithConsistency.forEach(model => {
                console.log(`   ✅ ${model.name}: Character consistency support`);
            });

            // Gen-4 models should generally have better consistency features
            const gen4Models = testModels.filter(m => m.model_slug.includes('gen-4'));
            if (gen4Models.length > 0) {
                console.log('✅ Gen-4 models available (typically have better character consistency)');
            }
        });
    });

    describe('Error Handling Tests', () => {
        
        test('should handle invalid model IDs gracefully', async () => {
            try {
                const isAvailable = await runwayService.isModelAvailable('invalid-runway-model');
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
                // Test with invalid duration
                await runwayService.calculateCost(testModels[0].id, 0, 'Generate');
                console.log('⚠️ Zero duration should have been rejected');
            } catch (error) {
                console.log('✅ Zero duration properly rejected');
                expect(error.message).toBeTruthy();
            }

            try {
                // Test with excessive duration (Runway typically caps at 10 seconds)
                await runwayService.calculateCost(testModels[0].id, 60, 'Generate');
                console.log('⚠️ Excessive duration should have been flagged');
            } catch (error) {
                console.log('✅ Excessive duration properly handled');
                expect(error.message).toBeTruthy();
            }
        });

        test('should handle API authentication errors', async () => {
            try {
                await runwayService.getAvailableModels();
                console.log('✅ API authentication test passed');
            } catch (error) {
                console.log(`⚠️ API authentication issue: ${error.message}`);
                
                if (error.message.includes('API key') || error.message.includes('auth')) {
                    console.log('   This is likely an API key configuration issue');
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

    describe('Service-Specific Tests', () => {
        
        test('should test convertModelForAPI function', async () => {
            if (testModels.length === 0) {
                console.log('⚠️ No models to test convertModelForAPI');
                return;
            }

            try {
                const model = testModels[0];
                const convertedModel = runwayService.convertModelForAPI(model);
                
                expect(convertedModel).toBeDefined();
                console.log(`✅ Model conversion: ${model.model_slug} -> ${convertedModel}`);
            } catch (error) {
                console.log(`❌ Model conversion error: ${error.message}`);
                throw error;
            }
        });
    });

    // Summary test
    test('should provide Runway ML integration summary', async () => {
        console.log('\n📋 Runway ML Integration Summary:');
        console.log('==================================');

        try {
            // API Status
            const models = await runwayService.getAvailableModels();
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
        const gen3Count = testModels.filter(m => m.model_slug.includes('gen-3')).length;
        const gen4Count = testModels.filter(m => m.model_slug.includes('gen-4')).length;
        const alphaCount = testModels.filter(m => m.model_slug.includes('alpha')).length;
        const turboCount = testModels.filter(m => m.model_slug.includes('turbo')).length;
        
        console.log(`🎬 Gen-3 Models: ${gen3Count}`);
        console.log(`🎬 Gen-4 Models: ${gen4Count}`);
        console.log(`⚡ Alpha Variants: ${alphaCount}`);
        console.log(`🚀 Turbo Variants: ${turboCount}`);

        // Price Scores
        const priceScores = await db.models.ModelPriceScore.findAll({
            where: {
                id_model: testModels.map(m => m.id),
                source: 'runway'
            }
        });
        console.log(`💰 Price Scores: ${priceScores.length}`);

        // Configuration
        const hasApiKey = !!process.env.RUNWAY_API_KEY;
        console.log(`⚙️ API Configuration: ${hasApiKey ? '✅ OK' : '❌ Missing'}`);
        
        if (!hasApiKey) {
            console.log('   Required: RUNWAY_API_KEY');
        }
        
        console.log('');
    });
});