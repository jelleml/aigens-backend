/**
 * Setup script for GitHub OAuth
 * Run this script to verify and test your GitHub OAuth configuration
 */

require('dotenv').config();
const config = require('./config/config');

// Load environment variables or use defaults
const envConfig = {
    // Development credentials
    GITHUB_CLIENT_ID_DEV: process.env.GITHUB_CLIENT_ID_DEV || 'Ov23liVEiHK6RtsL0U6A',
    GITHUB_CLIENT_SECRET_DEV: process.env.GITHUB_CLIENT_SECRET_DEV || '8b840cd48535a82fa73284738f284f3d19f5da72',

    // Production credentials
    GITHUB_CLIENT_ID_PROD: process.env.GITHUB_CLIENT_ID_PROD || 'Ov23lie0BBf7sEZA9Xzh',
    GITHUB_CLIENT_SECRET_PROD: process.env.GITHUB_CLIENT_SECRET_PROD || 'd6762eece6a7bc673bc7d7b97839d418ae1f66b',

    // Other configs
    NODE_ENV: process.env.NODE_ENV || 'development',
    APP_URL: process.env.APP_URL || 'http://localhost:5555',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL || '/api/v1/auth/github/callback'
};

// Select appropriate credentials based on environment
const GITHUB_CLIENT_ID = envConfig.NODE_ENV === 'production'
    ? envConfig.GITHUB_CLIENT_ID_PROD
    : envConfig.GITHUB_CLIENT_ID_DEV;

const GITHUB_CLIENT_SECRET = envConfig.NODE_ENV === 'production'
    ? envConfig.GITHUB_CLIENT_SECRET_PROD
    : envConfig.GITHUB_CLIENT_SECRET_DEV;

// Override config for testing
config.oauth.github.clientID = GITHUB_CLIENT_ID;
config.oauth.github.clientSecret = GITHUB_CLIENT_SECRET;
config.oauth.github.callbackURL = envConfig.GITHUB_CALLBACK_URL;

console.log('\n=== GitHub OAuth Configuration ===');
console.log(`Environment: ${envConfig.NODE_ENV}`);
console.log(`Client ID: ${GITHUB_CLIENT_ID}`);
console.log(`Client Secret is set: ${!!GITHUB_CLIENT_SECRET}`);
console.log(`Callback URL: ${envConfig.GITHUB_CALLBACK_URL}`);
console.log(`App URL: ${envConfig.APP_URL}`);
console.log(`Frontend URL: ${envConfig.FRONTEND_URL}`);
console.log('================================');

console.log('\nConfiguration in config.js (after override):');
console.log('Client ID:', config.oauth.github.clientID);
console.log('Client Secret is set:', !!config.oauth.github.clientSecret);
console.log('Callback URL:', config.oauth.github.callbackURL);

console.log('\nFull redirect URL that should be configured in GitHub:');
console.log(`${envConfig.APP_URL}${envConfig.GITHUB_CALLBACK_URL}`); 