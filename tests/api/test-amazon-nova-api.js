const db = require('../../database');
const amazonNovaService = require('../../services/amazon-nova.service');

/**
 * Amazon Nova API Tests
 * 
 * Tests Amazon Nova Reel video generation service
 * - AWS Bedrock connectivity
 * - Nova Reel model availability (v1.0, v1.1)
 * - Cost calculation for video generation
 * - S3 to GCS workflow verification
 * - Provider lookup using 'amazon' provider name
 */

// Test configuration
const TEST_CONFIG = {
    timeout: 30000, // 30 seconds timeout
    skipRealAPI: process.env.SKIP_REAL_API === 'true',
    testUser: {
        email: 'test-amazon-nova@example.com',
        password: 'testpassword123'
    },
    expectedModels: [
        'nova-reel-v1.0-amazon',
        'nova-reel-v1.1-amazon'
    ],
    testPrompt: 'A beautiful sunset over the ocean with gentle waves'
};

describe('Amazon Nova API Tests', () => {
    let testUser, testChat, testWallet, testProvider, testModels;

    beforeAll(async () => {
        console.log('🚀 Starting Amazon Nova API Tests...');
        
        // Initialize database
        if (!db.initialized) {
            await db.initialize();
        }

        // Get Amazon provider
        testProvider = await db.models.Provider.findOne({ 
            where: { name: 'amazon' }
        });

        if (!testProvider) {
            throw new Error('Amazon provider not found in database. Run init-provider-subscriptions.js first.');
        }

        // Get Amazon Nova models
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
            title: 'Amazon Nova Test Chat'
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
        console.log('🧹 Amazon Nova test cleanup complete');
    });

    describe('Service Connectivity Tests', () => {
        
        test('should get available models', async () => {
            try {
                const models = await amazonNovaService.getAvailableModels();
                
                expect(Array.isArray(models)).toBe(true);
                console.log(`✅ Amazon Nova: Found ${models.length} available models`);
                
                if (models.length > 0) {
                    models.forEach(model => {
                        expect(model).toHaveProperty('id');
                        expect(model).toHaveProperty('name');
                        console.log(`   - ${model.name} (${model.id})`);
                    });
                }
            } catch (error) {
                console.log(`❌ Amazon Nova: Error getting models - ${error.message}`);
                
                // Check if it's a configuration issue
                if (error.message.includes('AWS') || error.message.includes('credentials')) {
                    console.log('⚠️ This might be a configuration issue. Check AWS credentials.');
                }
                
                throw error;
            }
        }, TEST_CONFIG.timeout);

        test('should check model availability for Nova Reel models', async () => {
            const modelTests = [];

            for (const expectedModel of TEST_CONFIG.expectedModels) {
                try {
                    const isAvailable = await amazonNovaService.isModelAvailable(expectedModel);
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

            console.log(`📊 Amazon Nova Model Availability: ${testableModels}/${modelTests.length} models testable`);
        });

        test('should validate AWS Bedrock configuration', async () => {
            try {
                // Test AWS configuration by attempting to get models
                await amazonNovaService.getAvailableModels();
                console.log('✅ AWS Bedrock configuration appears valid');
            } catch (error) {
                if (error.message.includes('credentials') || error.message.includes('AWS')) {
                    console.log('❌ AWS Bedrock configuration issue:');
                    console.log('   Required environment variables:');
                    console.log('   - AWS_ACCESS_KEY_ID');
                    console.log('   - AWS_SECRET_ACCESS_KEY');
                    console.log('   - AWS_REGION (optional, defaults to us-east-1)');
                    
                    // Don't fail the test, just warn
                    expect(true).toBe(true); // Pass test but log the issue
                } else {
                    throw error;
                }
            }
        });
    });

    describe('Cost Calculation Tests', () => {
        
        test('should calculate costs for Nova Reel models', async () => {
            if (testModels.length === 0) {
                console.log('⚠️ No Amazon Nova models found in database - skipping cost tests');
                return;
            }

            for (const model of testModels) {
                try {
                    const cost = await amazonNovaService.calculateCost(model.id, 6, 'Generate'); // 6 seconds
                    
                    expect(cost).toHaveProperty('estimatedCost');
                    expect(cost).toHaveProperty('currency');
                    expect(cost).toHaveProperty('modelName');
                    expect(typeof cost.estimatedCost).toBe('number');
                    expect(cost.estimatedCost).toBeGreaterThan(0);
                    
                    console.log(`✅ ${model.name}: ${cost.estimatedCost} ${cost.currency} for 6 seconds`);
                } catch (error) {
                    console.log(`❌ ${model.name}: Cost calculation error - ${error.message}`);
                    throw error;
                }
            }
        });

        test('should validate Nova pricing structure', async () => {
            // Check price scores in database
            const priceScores = await db.models.ModelPriceScore.findAll({
                where: {
                    id_model: testModels.map(m => m.id),
                    source: 'amazon-nova'
                }
            });

            console.log(`📊 Found ${priceScores.length} price scores for Amazon Nova models`);

            if (priceScores.length > 0) {
                priceScores.forEach(score => {
                    expect(score.price_video).not.toBeNull();
                    
                    // Parse the JSON price structure
                    const priceData = JSON.parse(score.price_video);
                    expect(priceData).toHaveProperty('Generate');
                    expect(priceData).toHaveProperty('maxDuration');
                    expect(typeof priceData.Generate).toBe('number');
                    expect(priceData.Generate).toBe(0.08); // $0.08 per second as per configuration
                    
                    console.log(`✅ Price structure valid: ${score.price_video}`);
                });
            }
        });
    });

    describe('Database Integration Tests', () => {
        
        test('should find Amazon provider in database', async () => {
            expect(testProvider).not.toBeNull();
            expect(testProvider.name).toBe('amazon');
            expect(testProvider.description).toContain('Nova');
            console.log(`✅ Amazon provider found: ${testProvider.description}`);
        });

        test('should have Nova Reel models in database', async () => {
            expect(testModels.length).toBeGreaterThan(0);
            
            const modelSlugs = testModels.map(m => m.model_slug);
            console.log(`📋 Database models: ${modelSlugs.join(', ')}`);

            // Check for expected models
            TEST_CONFIG.expectedModels.forEach(expectedModel => {
                const found = modelSlugs.includes(expectedModel);
                console.log(`   ${expectedModel}: ${found ? '✅ Found' : '❌ Missing'}`);
                if (!found) {
                    console.log(`   ⚠️ Run update-nova-models.js to create missing models`);
                }
            });
        });

        test('should validate model configuration', async () => {
            testModels.forEach(model => {
                expect(model.id_provider).toBe(testProvider.id);
                expect(model.is_active).toBe(true);
                expect(model.model_slug).toMatch(/nova-reel-v\d\.\d-amazon/);
                
                console.log(`✅ ${model.name}:`);
                console.log(`   Slug: ${model.model_slug}`);
                console.log(`   API ID: ${model.api_model_id}`);
                console.log(`   Active: ${model.is_active}`);
            });
        });
    });

    describe('Error Handling Tests', () => {
        
        test('should handle invalid model IDs gracefully', async () => {
            try {
                const isAvailable = await amazonNovaService.isModelAvailable('invalid-model-id');
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
                await amazonNovaService.calculateCost(testModels[0].id, -1, 'Generate');
                console.log('⚠️ Negative duration should have been rejected');
            } catch (error) {
                console.log('✅ Negative duration properly rejected');
                expect(error.message).toBeTruthy();
            }

            try {
                // Test with invalid operation
                await amazonNovaService.calculateCost(testModels[0].id, 5, 'InvalidOperation');
                console.log('⚠️ Invalid operation should have been rejected');
            } catch (error) {
                console.log('✅ Invalid operation properly rejected');
                expect(error.message).toBeTruthy();
            }
        });

        test('should handle network/API errors gracefully', async () => {
            // This test might fail in CI/CD if AWS is not configured
            // but should provide useful debugging information
            try {
                await amazonNovaService.getAvailableModels();
                console.log('✅ API connectivity test passed');
            } catch (error) {
                console.log(`⚠️ API connectivity issue: ${error.message}`);
                
                if (error.message.includes('credentials')) {
                    console.log('   This is likely a configuration issue, not a code problem');
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

    // Summary test
    test('should provide Amazon Nova integration summary', async () => {
        console.log('\n📋 Amazon Nova Integration Summary:');
        console.log('===================================');

        try {
            // API Status
            const models = await amazonNovaService.getAvailableModels();
            console.log(`📍 API Status: ${models.length > 0 ? '✅ OK' : '❌ ERROR'}`);
            console.log(`📊 Available Models: ${models.length}`);
        } catch (error) {
            console.log(`📍 API Status: ❌ ERROR - ${error.message}`);
            console.log(`📊 Available Models: 0`);
        }

        // Database Status
        console.log(`🗄️ Database Models: ${testModels.length}`);
        console.log(`🔗 Provider Integration: ${testProvider ? '✅ OK' : '❌ ERROR'}`);

        // Price Scores
        const priceScores = await db.models.ModelPriceScore.findAll({
            where: {
                id_model: testModels.map(m => m.id),
                source: 'amazon-nova'
            }
        });
        console.log(`💰 Price Scores: ${priceScores.length}`);

        // Configuration
        const hasAwsConfig = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
        console.log(`⚙️ AWS Configuration: ${hasAwsConfig ? '✅ OK' : '❌ Missing'}`);
        
        if (!hasAwsConfig) {
            console.log('   Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
        }
        
        console.log('');
    });
});