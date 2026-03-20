#!/usr/bin/env node

/**
 * Real API Test - Tests actual API connectivity with API keys
 */

const db = require('../../database');
const config = require('../../config/config');

async function testRealApis() {
    console.log('🚀 Real API Connectivity Test');
    console.log('=============================\n');

    try {
        // Initialize database
        if (!db.initialized) {
            await db.initialize();
        }

        const results = {};

        // Test Google Veo3
        console.log('🧪 Testing Google Veo3...');
        try {
            const googleVeo3Service = require('../../services/google-veo3.service');
            
            const startTime = Date.now();
            const models = await googleVeo3Service.getAvailableModels();
            const responseTime = Date.now() - startTime;
            
            results['Google Veo3'] = {
                status: 'OK',
                models: models.length,
                responseTime: `${responseTime}ms`,
                details: `Found ${models.length} models`
            };
            
            console.log(`   ✅ OK - ${models.length} models (${responseTime}ms)`);
            
            // Test model availability
            if (models.length > 0) {
                const available = await googleVeo3Service.isModelAvailable(models[0].id);
                console.log(`   ✅ Model availability check: ${available ? 'OK' : 'Not Available'}`);
            }
            
        } catch (error) {
            results['Google Veo3'] = {
                status: 'ERROR',
                error: error.message.substring(0, 100) + '...',
                models: 0,
                responseTime: 'N/A'
            };
            console.log(`   ❌ ERROR: ${error.message}`);
        }

        // Test Amazon Nova
        console.log('\n🧪 Testing Amazon Nova...');
        try {
            const amazonNovaService = require('../../services/amazon-nova.service');
            
            const startTime = Date.now();
            const models = await amazonNovaService.getAvailableModels();
            const responseTime = Date.now() - startTime;
            
            results['Amazon Nova'] = {
                status: 'OK',
                models: models.length,
                responseTime: `${responseTime}ms`,
                details: `Found ${models.length} models`
            };
            
            console.log(`   ✅ OK - ${models.length} models (${responseTime}ms)`);
            
            // Test model availability
            if (models.length > 0) {
                const available = await amazonNovaService.isModelAvailable(models[0].id);
                console.log(`   ✅ Model availability check: ${available ? 'OK' : 'Not Available'}`);
            }
            
        } catch (error) {
            results['Amazon Nova'] = {
                status: 'ERROR',
                error: error.message.substring(0, 100) + '...',
                models: 0,
                responseTime: 'N/A'
            };
            console.log(`   ❌ ERROR: ${error.message}`);
        }

        // Test Runway ML
        console.log('\n🧪 Testing Runway ML...');
        try {
            const runwayService = require('../../services/runway.service');
            
            const startTime = Date.now();
            const models = await runwayService.getAvailableModels();
            const responseTime = Date.now() - startTime;
            
            results['Runway ML'] = {
                status: 'OK',
                models: models.length,
                responseTime: `${responseTime}ms`,
                details: `Found ${models.length} models`
            };
            
            console.log(`   ✅ OK - ${models.length} models (${responseTime}ms)`);
            
            // Test model availability
            if (models.length > 0) {
                const available = await runwayService.isModelAvailable(models[0].id);
                console.log(`   ✅ Model availability check: ${available ? 'OK' : 'Not Available'}`);
            }
            
        } catch (error) {
            results['Runway ML'] = {
                status: 'ERROR',
                error: error.message.substring(0, 100) + '...',
                models: 0,
                responseTime: 'N/A'
            };
            console.log(`   ❌ ERROR: ${error.message}`);
        }

        // Test Cost Calculations
        console.log('\n💰 Testing Cost Calculations...');
        for (const providerName of ['google-veo', 'amazon', 'runway']) {
            try {
                const provider = await db.models.Provider.findOne({ where: { name: providerName } });
                if (!provider) continue;
                
                const model = await db.models.Model.findOne({ where: { id_provider: provider.id } });
                if (!model) continue;

                const serviceName = providerName === 'google-veo' ? 'google-veo3' : providerName === 'amazon' ? 'amazon-nova' : 'runway';
                const service = require(`../../services/${serviceName}.service`);
                
                const cost = await service.calculateCost(model.id, 5, 'Generate');
                console.log(`   ✅ ${providerName}: ${cost.estimatedCost} ${cost.currency} for 5 seconds`);
                
            } catch (error) {
                console.log(`   ❌ ${providerName}: Cost calculation failed - ${error.message}`);
            }
        }

        // Final Summary
        console.log('\n📋 REAL API TEST SUMMARY:');
        console.log('==========================');
        
        let okCount = 0;
        let totalCount = 0;
        
        Object.entries(results).forEach(([provider, result]) => {
            totalCount++;
            const icon = result.status === 'OK' ? '✅' : '❌';
            console.log(`${icon} ${provider}: ${result.status}`);
            
            if (result.status === 'OK') {
                okCount++;
                console.log(`   Models: ${result.models}, Response: ${result.responseTime}`);
            } else {
                console.log(`   Error: ${result.error}`);
            }
        });

        console.log(`\n🎯 Overall Result: ${okCount}/${totalCount} APIs working`);
        
        if (okCount === totalCount) {
            console.log('🎉 All video APIs are working perfectly!');
        } else {
            console.log('⚠️  Some APIs need attention - check API keys and network connectivity');
        }

        // Environment Check (from config.js)
        console.log('\n⚙️ Configuration Check:');
        console.log(`Google API Key: ${config.google_veo?.apiKey ? '✅ Present' : '❌ Missing'}`);
        console.log(`AWS Access Key: ${config.amazon_bedrock?.aws_access_key_id ? '✅ Present' : '❌ Missing'}`);
        console.log(`AWS Bearer Token: ${config.amazon_bedrock?.apiKey ? '✅ Present' : '❌ Missing'}`);
        console.log(`AWS Region: ${config.amazon_bedrock?.aws_region || '❌ Missing'}`);
        console.log(`Runway API Key: ${config.runway?.apiKey ? '✅ Present' : '❌ Missing'}`);

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

// Set timeout and run
setTimeout(() => {
    console.log('\n⏰ Test timeout reached');
    process.exit(1);
}, 45000); // 45 second timeout

testRealApis();