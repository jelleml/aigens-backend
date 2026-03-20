#!/usr/bin/env node

/**
 * Quick Video API Test
 * 
 * Simple script to check OK/Not OK status for all video model APIs
 */

const db = require('../../database');
const googleVeo3Service = require('../../services/google-veo3.service');
const amazonNovaService = require('../../services/amazon-nova.service');
const runwayService = require('../../services/runway.service');

// Test configuration
const VIDEO_PROVIDERS = [
    {
        name: 'Google Veo3',
        service: googleVeo3Service,
        providerName: 'google-veo',
        apiKey: process.env.GOOGLE_GEMINI_KEY
    },
    {
        name: 'Amazon Nova',
        service: amazonNovaService,
        providerName: 'amazon',
        apiKey: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    },
    {
        name: 'Runway ML',
        service: runwayService,
        providerName: 'runway',
        apiKey: process.env.RUNWAY_API_KEY
    }
];

async function quickTest() {
    console.log('🚀 Quick Video API Status Check');
    console.log('================================\n');

    try {
        // Initialize database
        if (!db.initialized) {
            await db.initialize();
        }

        const results = {};

        // Test each provider
        for (const provider of VIDEO_PROVIDERS) {
            console.log(`🧪 Testing ${provider.name}...`);
            
            try {
                // Check API configuration
                const hasApiKey = !!provider.apiKey;
                console.log(`   🔑 API Key: ${hasApiKey ? '✅ Present' : '❌ Missing'}`);

                // Check database integration
                const dbProvider = await db.models.Provider.findOne({ 
                    where: { name: provider.providerName }
                });
                console.log(`   🗄️  Database: ${dbProvider ? '✅ Found' : '❌ Not Found'}`);

                // Check models in database
                const dbModels = dbProvider ? await db.models.Model.findAll({
                    where: { id_provider: dbProvider.id }
                }) : [];
                console.log(`   📊 Models: ${dbModels.length} found`);

                // Test API connectivity (only if API key present)
                let apiStatus = 'SKIP';
                let modelCount = 0;
                
                if (hasApiKey) {
                    try {
                        const models = await provider.service.getAvailableModels();
                        modelCount = models.length;
                        apiStatus = modelCount > 0 ? 'OK' : 'NO_MODELS';
                        console.log(`   🌐 API: ✅ ${apiStatus} (${modelCount} models)`);
                    } catch (error) {
                        apiStatus = `ERROR: ${error.message.substring(0, 50)}...`;
                        console.log(`   🌐 API: ❌ ${apiStatus}`);
                    }
                } else {
                    console.log(`   🌐 API: ⏭️  SKIPPED (no API key)`);
                }

                // Test cost calculation (only if we have models)
                let costStatus = 'SKIP';
                if (dbModels.length > 0) {
                    try {
                        const cost = await provider.service.calculateCost(dbModels[0].id, 5, 'Generate');
                        costStatus = `OK (${cost.estimatedCost} ${cost.currency})`;
                        console.log(`   💰 Cost: ✅ ${costStatus}`);
                    } catch (error) {
                        costStatus = `ERROR: ${error.message.substring(0, 30)}...`;
                        console.log(`   💰 Cost: ❌ ${costStatus}`);
                    }
                } else {
                    console.log(`   💰 Cost: ⏭️  SKIPPED (no models)`);
                }

                results[provider.name] = {
                    apiKey: hasApiKey,
                    database: !!dbProvider,
                    modelCount: dbModels.length,
                    apiStatus: apiStatus,
                    costStatus: costStatus,
                    overall: (hasApiKey || apiStatus === 'SKIP') && dbProvider && dbModels.length > 0 ? 'OK' : 'ISSUES'
                };

            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
                results[provider.name] = {
                    apiKey: false,
                    database: false,
                    modelCount: 0,
                    apiStatus: `ERROR: ${error.message}`,
                    costStatus: 'ERROR',
                    overall: 'ERROR'
                };
            }
            console.log('');
        }

        // Summary
        console.log('📋 SUMMARY');
        console.log('==========');
        
        const headers = ['Provider', 'API Key', 'Database', 'Models', 'API Status', 'Overall'];
        const rows = [];
        
        Object.entries(results).forEach(([name, result]) => {
            const row = [
                name,
                result.apiKey ? '✅' : '❌',
                result.database ? '✅' : '❌',
                result.modelCount.toString(),
                result.apiStatus.includes('OK') ? '✅' : result.apiStatus.includes('SKIP') ? '⏭️' : '❌',
                result.overall === 'OK' ? '✅' : result.overall === 'ISSUES' ? '⚠️' : '❌'
            ];
            rows.push(row);
        });

        // Print table
        console.log(headers.join('\t'));
        console.log('-'.repeat(80));
        rows.forEach(row => console.log(row.join('\t\t')));

        console.log('\n🔍 DETAILED STATUS:');
        Object.entries(results).forEach(([name, result]) => {
            console.log(`${name}: ${result.overall}`);
            if (result.overall !== 'OK') {
                if (!result.apiKey && !result.apiStatus.includes('SKIP')) {
                    console.log(`  - Missing API key`);
                }
                if (!result.database) {
                    console.log(`  - Provider not in database`);
                }
                if (result.modelCount === 0) {
                    console.log(`  - No models in database`);
                }
                if (result.apiStatus.includes('ERROR')) {
                    console.log(`  - API connectivity issue`);
                }
            }
        });

        console.log('\n✨ Test Complete!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    } finally {
        try {
            await db.close();
        } catch (error) {
            // Ignore cleanup errors
        }
        process.exit(0);
    }
}

// Run the test
quickTest();