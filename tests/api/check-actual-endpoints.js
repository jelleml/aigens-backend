#!/usr/bin/env node

/**
 * Check Actual API Endpoints
 * This script examines what endpoints our services are actually calling
 */

const fs = require('fs');
const path = require('path');

function analyzeServiceEndpoints() {
    console.log('🔍 ANALYZING ACTUAL API ENDPOINTS');
    console.log('=================================\n');

    const services = [
        {
            name: 'Google Veo3',
            file: '../../services/google-veo3.service.js'
        },
        {
            name: 'Amazon Nova',
            file: '../../services/amazon-nova.service.js'
        },
        {
            name: 'Runway ML',
            file: '../../services/runway.service.js'
        }
    ];

    services.forEach(service => {
        console.log(`📋 ${service.name}:`);
        console.log('─'.repeat(20));

        try {
            const serviceCode = fs.readFileSync(path.join(__dirname, service.file), 'utf8');

            // Find API URLs
            const apiUrls = serviceCode.match(/https?:\/\/[^\s"']+/g) || [];
            console.log(`   🌐 API Endpoints Found: ${apiUrls.length}`);
            apiUrls.forEach(url => {
                console.log(`       - ${url}`);
            });

            // Check what getAvailableModels does
            const getAvailableMatch = serviceCode.match(/const getAvailableModels[\s\S]*?};/);
            if (getAvailableMatch) {
                const funcBody = getAvailableMatch[0];
                
                if (funcBody.includes('axios.') || funcBody.includes('fetch(') || funcBody.includes('bedrockRuntime.')) {
                    console.log(`   📡 getAvailableModels: Makes external API calls`);
                } else if (funcBody.includes('findAll') || funcBody.includes('database') || funcBody.includes('Model.')) {
                    console.log(`   🗄️  getAvailableModels: Queries database only`);
                } else {
                    console.log(`   ❓ getAvailableModels: Unknown behavior`);
                }
            }

            // Check for actual video generation functions
            const videoGenFunctions = [
                'processGoogleVeo3Request',
                'processAmazonNovaRequest', 
                'processRunwayRequest',
                'sendRequest'
            ];

            videoGenFunctions.forEach(funcName => {
                if (serviceCode.includes(funcName)) {
                    const funcMatch = serviceCode.match(new RegExp(`${funcName}[\\s\\S]*?(?=const|function|$)`, 'i'));
                    if (funcMatch && (funcMatch[0].includes('axios.post') || funcMatch[0].includes('bedrockRuntime.invoke') || funcMatch[0].includes('fetch('))) {
                        console.log(`   🎬 ${funcName}: Makes actual video generation API calls`);
                    }
                }
            });

        } catch (error) {
            console.log(`   ❌ Error reading service file: ${error.message}`);
        }

        console.log('');
    });

    // Summary
    console.log('📋 SUMMARY:');
    console.log('===========');
    console.log('Our tests are calling getAvailableModels() which:');
    console.log('   • For most services: Only queries the database');
    console.log('   • Does NOT make actual video generation API calls');
    console.log('   • Does NOT generate actual videos');
    console.log('');
    console.log('Actual video generation happens in:');
    console.log('   • processGoogleVeo3Request() - calls predictLongRunning endpoint');
    console.log('   • processAmazonNovaRequest() - calls AWS Bedrock invoke');
    console.log('   • processRunwayRequest() - calls Runway API tasks endpoint');
    console.log('');
    console.log('🎯 RECOMMENDATION:');
    console.log('To test REAL video generation API calls, we should create tests that:');
    console.log('   1. Call the actual video generation functions');
    console.log('   2. Mock the responses to avoid generating real videos');
    console.log('   3. Or create a test mode that makes API calls but cancels them');
}

// Run the analysis
analyzeServiceEndpoints();