/**
 * Simple test script to verify OAuth callback URL accessibility
 */

const https = require('https');
const http = require('http');
const config = require('../../config/config');

const testUrl = `${config.appUrl}${config.oauth.google.callbackURL}`;

console.log(`🧪 Testing OAuth callback URL: ${testUrl}\n`);

const client = testUrl.startsWith('https://') ? https : http;

const options = {
    method: 'GET',
    timeout: 10000,
    headers: {
        'User-Agent': 'OAuth-Test-Script/1.0'
    }
};

const req = client.request(testUrl, options, (res) => {
    console.log(`✅ Response received:`);
    console.log(`   Status: ${res.statusCode} ${res.statusMessage}`);
    console.log(`   Headers:`, res.headers);
    
    if (res.statusCode === 403) {
        console.log('\n🚨 403 Forbidden Error Detected!');
        console.log('   This suggests the URL is reachable but access is denied');
        console.log('   Possible causes:');
        console.log('   - Server-side authentication/authorization issue');
        console.log('   - CORS policy blocking the request');
        console.log('   - Middleware rejecting the request');
        console.log('   - Missing or invalid session data');
    } else if (res.statusCode === 302) {
        console.log('\n✅ 302 Redirect - This is expected for OAuth callbacks');
        console.log(`   Redirecting to: ${res.headers.location}`);
    } else if (res.statusCode === 404) {
        console.log('\n❌ 404 Not Found - Route not properly configured');
    } else if (res.statusCode >= 500) {
        console.log('\n❌ Server Error - Check server logs');
    }
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        if (data) {
            console.log('\n📄 Response body:');
            console.log(data.substring(0, 500)); // First 500 chars
        }
    });
});

req.on('error', (error) => {
    console.log(`❌ Request failed: ${error.message}`);
    
    if (error.code === 'ENOTFOUND') {
        console.log('   DNS resolution failed - check domain configuration');
    } else if (error.code === 'ECONNREFUSED') {
        console.log('   Connection refused - server might be down');
    } else if (error.code === 'CERT_HAS_EXPIRED') {
        console.log('   SSL certificate has expired');
    } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        console.log('   SSL certificate verification failed');
    }
});

req.on('timeout', () => {
    console.log('❌ Request timed out');
    req.destroy();
});

req.end();

// Also test the main auth endpoint
setTimeout(() => {
    console.log('\n' + '='.repeat(50));
    const authUrl = `${config.appUrl}/api/v1/auth/google`;
    console.log(`🧪 Testing Google auth initiation URL: ${authUrl}\n`);
    
    const authReq = client.request(authUrl, options, (res) => {
        console.log(`✅ Auth endpoint response:`);
        console.log(`   Status: ${res.statusCode} ${res.statusMessage}`);
        
        if (res.statusCode === 302) {
            console.log(`   Redirecting to: ${res.headers.location}`);
            if (res.headers.location && res.headers.location.includes('accounts.google.com')) {
                console.log('   ✅ Correctly redirecting to Google OAuth');
            } else {
                console.log('   ❌ Not redirecting to Google OAuth');
            }
        }
    });
    
    authReq.on('error', (error) => {
        console.log(`❌ Auth endpoint test failed: ${error.message}`);
    });
    
    authReq.end();
}, 2000);