#!/usr/bin/env node

/**
 * Simple API Status Check
 * Basic OK/Not OK test for video model APIs
 */

const db = require('../../database');

async function simpleTest() {
    console.log('🚀 Simple Video API Status Check');
    console.log('==================================');

    try {
        // Initialize database
        if (!db.initialized) {
            await db.initialize();
        }
        console.log('✅ Database connected');

        // Check providers in database
        const providers = ['google-veo', 'amazon', 'runway'];
        const results = {};

        for (const providerName of providers) {
            console.log(`\n📋 Checking ${providerName}...`);
            
            // Check if provider exists
            const provider = await db.models.Provider.findOne({ 
                where: { name: providerName }
            });
            
            if (!provider) {
                console.log(`❌ Provider '${providerName}' not found in database`);
                results[providerName] = 'NOT_IN_DB';
                continue;
            }
            
            console.log(`✅ Provider found: ${provider.description}`);
            
            // Check models
            const models = await db.models.Model.findAll({
                where: { id_provider: provider.id }
            });
            
            console.log(`📊 Models found: ${models.length}`);
            
            if (models.length === 0) {
                results[providerName] = 'NO_MODELS';
            } else {
                // List some models
                models.slice(0, 3).forEach(model => {
                    console.log(`   - ${model.name} (${model.model_slug})`);
                });
                if (models.length > 3) {
                    console.log(`   ... and ${models.length - 3} more`);
                }
                results[providerName] = 'OK';
            }
        }

        // Summary
        console.log('\n📋 FINAL STATUS:');
        console.log('================');
        Object.entries(results).forEach(([provider, status]) => {
            const icon = status === 'OK' ? '✅' : '❌';
            console.log(`${icon} ${provider}: ${status}`);
        });

        // Overall assessment
        const okCount = Object.values(results).filter(status => status === 'OK').length;
        console.log(`\n🎯 Overall: ${okCount}/${providers.length} providers ready`);

        if (okCount === providers.length) {
            console.log('🎉 All video providers are properly integrated!');
        } else {
            console.log('⚠️  Some providers need attention:');
            Object.entries(results).forEach(([provider, status]) => {
                if (status !== 'OK') {
                    if (status === 'NOT_IN_DB') {
                        console.log(`   - ${provider}: Run init-provider-subscriptions.js`);
                    } else if (status === 'NO_MODELS') {
                        console.log(`   - ${provider}: Run update-${provider === 'google-veo' ? 'veo3' : provider === 'amazon' ? 'nova' : 'runway'}-models.js`);
                    }
                }
            });
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        try {
            await db.close();
            console.log('\n🔌 Database connection closed');
        } catch (error) {
            // Ignore cleanup errors
        }
        process.exit(0);
    }
}

// Run the test
simpleTest();