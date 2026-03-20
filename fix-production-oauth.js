/**
 * Script to fix OAuth configuration for production
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing OAuth configuration for production...\n');

// Production environment variables
const productionEnv = {
    NODE_ENV: 'production',
    APP_URL: 'https://api.aigens.io',
    FRONTEND_URL: 'https://app.aigens.io', // Adjust if different
    GOOGLE_CALLBACK_URL: '/api/v1/auth/google/callback',
    MICROSOFT_CALLBACK_URL: '/api/v1/auth/microsoft/callback',
    GITHUB_CALLBACK_URL: '/api/v1/auth/github/callback'
};

console.log('Production environment variables to set:');
Object.entries(productionEnv).forEach(([key, value]) => {
    console.log(`${key}=${value}`);
});

console.log('\n📋 Manual steps required:');
console.log('1. Set these environment variables in your production deployment');
console.log('2. Restart your production server');
console.log('3. Verify Google Cloud Console has these callback URLs:');
console.log(`   - ${productionEnv.APP_URL}${productionEnv.GOOGLE_CALLBACK_URL}`);
console.log(`   - ${productionEnv.APP_URL}${productionEnv.MICROSOFT_CALLBACK_URL}`);
console.log(`   - ${productionEnv.APP_URL}${productionEnv.GITHUB_CALLBACK_URL}`);

console.log('\n🔍 To verify configuration after deployment, run:');
console.log('NODE_ENV=production node verify-production-oauth.js');