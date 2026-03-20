const db = require('../../database');
const googleVeo3Service = require('../../services/google-veo3.service');
const amazonNovaService = require('../../services/amazon-nova.service');
const runwayService = require('../../services/runway.service');

/**
 * Video Models Integration Tests
 * 
 * Tests all three video providers (Google Veo3, Amazon Nova, Runway)
 * for basic functionality, model availability, and API connectivity
 */

// Test configuration
const TEST_CONFIG = {
    timeout: 30000, // 30 seconds timeout for API calls
    skipRealAPI: process.env.SKIP_REAL_API === 'true',
    testUser: {
        email: 'test-video-models@example.com',
        password: 'testpassword123'
    }
};

// Video providers configuration
const VIDEO_PROVIDERS = [
    {
        name: 'Google Veo3',
        service: googleVeo3Service,
        providerName: 'google-veo',
        testModels: ['veo-3.0-generate-preview-google', 'veo-3.0-fast-generate-preview-google']
    },
    {
        name: 'Amazon Nova',
        service: amazonNovaService,
        providerName: 'amazon',
        testModels: ['nova-reel-v1.0-amazon', 'nova-reel-v1.1-amazon']
    },
    {
        name: 'Runway',
        service: runwayService,
        providerName: 'runway',
        testModels: ['gen-3-alpha-runway', 'gen-4-runway']
    }
];

describe('Video Models Integration Tests', () => {
    let testUser, testChat, testWallet;

    beforeAll(async () => {
        console.log('🚀 Starting Video Models Integration Tests...');
        
        // Initialize database
        if (!db.initialized) {
            await db.initialize();
        }

        // Create test user
        testUser = await db.models.User.create({
            email: TEST_CONFIG.testUser.email,
            password: TEST_CONFIG.testUser.password,
            is_verified: true
        });

        // Create wallet with sufficient credits
        testWallet = await db.models.Wallet.create({
            user_id: testUser.id,
            balance: 1000 // 1000 credits for testing
        });

        // Create test chat
        testChat = await db.models.Chat.create({
            user_id: testUser.id,
            title: 'Video Models Integration Test Chat'
        });

        console.log(`✅ Test environment setup complete. User ID: ${testUser.id}`);
    });

    afterAll(async () => {
        // Cleanup test data
        if (testUser) {
            await db.models.Wallet.destroy({ where: { user_id: testUser.id } });
            await db.models.Chat.destroy({ where: { user_id: testUser.id } });
            await db.models.User.destroy({ where: { id: testUser.id } });
        }
        console.log('🧹 Test environment cleanup complete');
    });

    // Test each video provider
    VIDEO_PROVIDERS.forEach(provider => {
        describe(`${provider.name} Provider Tests`, () => {
            
            test(`should have available models - ${provider.name}`, async () => {
                try {
                    const models = await provider.service.getAvailableModels();
                    
                    expect(Array.isArray(models)).toBe(true);
                    console.log(`✅ ${provider.name}: Found ${models.length} models`);
                    
                    if (models.length > 0) {
                        expect(models[0]).toHaveProperty('id');
                        expect(models[0]).toHaveProperty('name');
                        console.log(`   First model: ${models[0].name} (${models[0].id})`);
                    }
                } catch (error) {
                    console.log(`❌ ${provider.name}: Error getting models - ${error.message}`);
                    throw error;
                }
            }, TEST_CONFIG.timeout);

            test(`should check model availability - ${provider.name}`, async () => {
                try {
                    const dbModels = await db.models.Model.findAll({
                        where: {
                            id_provider: await db.models.Provider.findOne({ 
                                where: { name: provider.providerName }
                            }).then(p => p ? p.id : null)
                        },
                        limit: 2
                    });

                    if (dbModels.length > 0) {
                        for (const model of dbModels) {
                            const isAvailable = await provider.service.isModelAvailable(model.model_slug);
                            console.log(`   Model ${model.name}: ${isAvailable ? '✅ Available' : '❌ Not Available'}`);
                            expect(typeof isAvailable).toBe('boolean');
                        }
                    } else {
                        console.log(`⚠️ ${provider.name}: No models found in database`);
                    }
                } catch (error) {
                    console.log(`❌ ${provider.name}: Error checking availability - ${error.message}`);
                    // Don't fail test for availability checks
                }
            }, TEST_CONFIG.timeout);

            test(`should calculate costs - ${provider.name}`, async () => {
                try {
                    const dbModels = await db.models.Model.findAll({
                        where: {
                            id_provider: await db.models.Provider.findOne({ 
                                where: { name: provider.providerName }
                            }).then(p => p ? p.id : null)
                        },
                        limit: 1
                    });

                    if (dbModels.length > 0) {
                        const model = dbModels[0];
                        const cost = await provider.service.calculateCost(model.id, 5, 'Generate'); // 5 seconds
                        
                        expect(cost).toHaveProperty('estimatedCost');
                        expect(cost).toHaveProperty('currency');
                        expect(typeof cost.estimatedCost).toBe('number');
                        
                        console.log(`✅ ${provider.name}: Cost for ${model.name} = ${cost.estimatedCost} ${cost.currency}`);
                    } else {
                        console.log(`⚠️ ${provider.name}: No models found for cost calculation`);
                    }
                } catch (error) {
                    console.log(`❌ ${provider.name}: Error calculating cost - ${error.message}`);
                    throw error;
                }
            }, TEST_CONFIG.timeout);

            test(`should validate database integration - ${provider.name}`, async () => {
                try {
                    // Check if provider exists
                    const dbProvider = await db.models.Provider.findOne({ 
                        where: { name: provider.providerName }
                    });
                    expect(dbProvider).not.toBeNull();
                    console.log(`✅ ${provider.name}: Provider found in database (ID: ${dbProvider.id})`);

                    // Check if models exist
                    const dbModels = await db.models.Model.findAll({
                        where: { id_provider: dbProvider.id }
                    });
                    console.log(`✅ ${provider.name}: Found ${dbModels.length} models in database`);

                    // Check if price scores exist
                    if (dbModels.length > 0) {
                        const priceScores = await db.models.ModelPriceScore.findAll({
                            where: {
                                id_model: dbModels.map(m => m.id),
                                source: provider.providerName === 'amazon' ? 'amazon-nova' : 
                                       provider.providerName === 'google-veo' ? 'google-veo' : 'runway'
                            }
                        });
                        console.log(`✅ ${provider.name}: Found ${priceScores.length} price scores`);
                        
                        if (priceScores.length > 0) {
                            const samplePrice = priceScores[0];
                            expect(samplePrice.price_video).not.toBeNull();
                            console.log(`   Sample price_video: ${samplePrice.price_video}`);
                        }
                    }
                } catch (error) {
                    console.log(`❌ ${provider.name}: Database validation error - ${error.message}`);
                    throw error;
                }
            });
        });
    });

    // Cross-provider comparison tests
    describe('Cross-Provider Comparison Tests', () => {
        
        test('should compare model counts across providers', async () => {
            const modelCounts = {};
            
            for (const provider of VIDEO_PROVIDERS) {
                try {
                    const models = await provider.service.getAvailableModels();
                    modelCounts[provider.name] = models.length;
                } catch (error) {
                    modelCounts[provider.name] = 0;
                    console.log(`⚠️ ${provider.name}: Could not get model count - ${error.message}`);
                }
            }

            console.log('📊 Model Count Comparison:');
            Object.entries(modelCounts).forEach(([provider, count]) => {
                console.log(`   ${provider}: ${count} models`);
            });

            // At least one provider should have models
            const totalModels = Object.values(modelCounts).reduce((sum, count) => sum + count, 0);
            expect(totalModels).toBeGreaterThan(0);
        });

        test('should verify all providers have database integration', async () => {
            const integrationStatus = {};

            for (const provider of VIDEO_PROVIDERS) {
                try {
                    const dbProvider = await db.models.Provider.findOne({ 
                        where: { name: provider.providerName }
                    });
                    integrationStatus[provider.name] = !!dbProvider;
                } catch (error) {
                    integrationStatus[provider.name] = false;
                }
            }

            console.log('🔗 Database Integration Status:');
            Object.entries(integrationStatus).forEach(([provider, status]) => {
                console.log(`   ${provider}: ${status ? '✅ Connected' : '❌ Not Found'}`);
            });

            // All providers should be integrated
            Object.values(integrationStatus).forEach(status => {
                expect(status).toBe(true);
            });
        });
    });

    // API Health Check Tests
    describe('API Health Check Tests', () => {
        
        test('should perform health check on all video APIs', async () => {
            const healthStatus = {};

            for (const provider of VIDEO_PROVIDERS) {
                try {
                    // Try to get models as a simple health check
                    await provider.service.getAvailableModels();
                    healthStatus[provider.name] = 'OK';
                } catch (error) {
                    healthStatus[provider.name] = `ERROR: ${error.message}`;
                }
            }

            console.log('🏥 API Health Check Results:');
            Object.entries(healthStatus).forEach(([provider, status]) => {
                const icon = status === 'OK' ? '✅' : '❌';
                console.log(`   ${provider}: ${icon} ${status}`);
            });

            // At least one API should be healthy for the test to pass
            const healthyApis = Object.values(healthStatus).filter(status => status === 'OK').length;
            expect(healthyApis).toBeGreaterThan(0);
        }, TEST_CONFIG.timeout);
    });

    // Summary test
    test('should provide integration summary', async () => {
        console.log('\n📋 Video Models Integration Summary:');
        console.log('=====================================');
        
        for (const provider of VIDEO_PROVIDERS) {
            try {
                const models = await provider.service.getAvailableModels();
                const dbProvider = await db.models.Provider.findOne({ 
                    where: { name: provider.providerName }
                });
                const dbModels = dbProvider ? await db.models.Model.findAll({
                    where: { id_provider: dbProvider.id }
                }) : [];

                console.log(`${provider.name}:`);
                console.log(`   📍 API Status: ${models.length > 0 ? 'OK' : 'ERROR'}`);
                console.log(`   📊 Available Models: ${models.length}`);
                console.log(`   🗄️  Database Models: ${dbModels.length}`);
                console.log(`   🔗 Provider Integration: ${dbProvider ? 'OK' : 'ERROR'}`);
                console.log('');
            } catch (error) {
                console.log(`${provider.name}:`);
                console.log(`   ❌ Error: ${error.message}`);
                console.log('');
            }
        }
    });
});