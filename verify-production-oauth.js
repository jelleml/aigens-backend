/**
 * Script to verify OAuth configuration for production
 */

require('dotenv').config();
const config = require('./config/config');

console.log('=== OAuth Configuration Verification ===\n');

console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('App URL:', config.appUrl);
console.log('Frontend URL:', config.frontendUrl);

console.log('\n=== Google OAuth Configuration ===');
console.log('Client ID:', config.oauth.google.clientID);
console.log('Client Secret:', config.oauth.google.clientSecret ? '***SET***' : '***NOT SET***');
console.log('Callback URL Path:', config.oauth.google.callbackURL);
console.log('Full Callback URL:', `${config.appUrl}${config.oauth.google.callbackURL}`);

console.log('\n=== Required Google Cloud Console Settings ===');
console.log('Authorized JavaScript origins:');
console.log(`  - ${config.appUrl}`);
console.log(`  - ${config.frontendUrl}`);
console.log('\nAuthorized redirect URIs:');
console.log(`  - ${config.appUrl}${config.oauth.google.callbackURL}`);

console.log('\n=== Production Checklist ===');
const checks = [
    {
        name: 'APP_URL is HTTPS',
        status: config.appUrl.startsWith('https://'),
        expected: 'https://api.aigens.io'
    },
    {
        name: 'Google Client ID is set',
        status: !!config.oauth.google.clientID,
        expected: 'Should be set'
    },
    {
        name: 'Google Client Secret is set',
        status: !!config.oauth.google.clientSecret,
        expected: 'Should be set'
    },
    {
        name: 'Callback URL is relative path',
        status: config.oauth.google.callbackURL.startsWith('/'),
        expected: '/api/v1/auth/google/callback'
    }
];

checks.forEach(check => {
    const status = check.status ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${check.name}: ${check.expected}`);
});

if (process.env.NODE_ENV === 'production') {
    console.log('\n=== Production Environment Detected ===');
    if (!config.appUrl.startsWith('https://')) {
        console.log('🚨 CRITICAL: APP_URL must be HTTPS in production!');
        console.log('   Current:', config.appUrl);
        console.log('   Expected: https://api.aigens.io');
    }
}