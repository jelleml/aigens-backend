/**
 * Setup script for Microsoft OAuth
 * Run this script to verify and test your Microsoft OAuth configuration
 */

require('dotenv').config();
const config = require('./config/config');

// Set environment variables for testing
process.env.MICROSOFT_CLIENT_ID = '58eef7aa-5940-4306-9820-946dd9d04164';
process.env.MICROSOFT_TENANT_ID = '3a93c5ae-2ed2-44a5-b507-2ca64ffa861e';
process.env.MICROSOFT_CALLBACK_URL = '/api/v1/auth/microsoft/callback';

// You'll need to provide a valid client secret here
if (!process.env.MICROSOFT_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET === 'your_client_secret_here') {
    console.log('\n⚠️  WARNING: Microsoft Client Secret is not set correctly!');
    console.log('Please update the MICROSOFT_CLIENT_SECRET environment variable with your actual client secret\n');
    process.env.MICROSOFT_CLIENT_SECRET = ''; // Clear it if it's the placeholder
}

console.log('================================');
console.log('Microsoft OAuth Configuration:');
console.log('================================');
console.log('Client ID:', process.env.MICROSOFT_CLIENT_ID);
console.log('Tenant ID:', process.env.MICROSOFT_TENANT_ID);
console.log('Callback URL:', process.env.MICROSOFT_CALLBACK_URL);
console.log('Client Secret is set:', !!process.env.MICROSOFT_CLIENT_SECRET);
console.log('================================');

// Override config for testing
config.oauth.microsoft.clientID = process.env.MICROSOFT_CLIENT_ID;
config.oauth.microsoft.tenantID = process.env.MICROSOFT_TENANT_ID;
config.oauth.microsoft.callbackURL = process.env.MICROSOFT_CALLBACK_URL;
config.oauth.microsoft.clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

console.log('\nConfiguration in config.js (after override):');
console.log('Microsoft Client ID:', config.oauth.microsoft.clientID);
console.log('Microsoft Client Secret is set:', !!config.oauth.microsoft.clientSecret);
console.log('Microsoft Callback URL:', config.oauth.microsoft.callbackURL);
console.log('Microsoft Tenant ID:', config.oauth.microsoft.tenantID);
console.log('================================');

console.log('\nComplete Auth URL that will be used:');
console.log(`${config.appUrl}${config.oauth.microsoft.callbackURL}`);
console.log('================================');

console.log('\nMicrosoft Authentication URLs:');
const tenantID = config.oauth.microsoft.tenantID;
console.log(`Authorization URL: https://login.microsoftonline.com/${tenantID}/oauth2/v2.0/authorize`);
console.log(`Token URL: https://login.microsoftonline.com/${tenantID}/oauth2/v2.0/token`);
console.log('================================');

console.log('\nTo fix the Microsoft OAuth error:');
console.log('1. Make sure you have set a valid MICROSOFT_CLIENT_SECRET in your .env file');
console.log('2. Verify that the application ID (58eef7aa-5940-4306-9820-946dd9d04164) is registered in the Azure Portal');
console.log('3. Confirm that the redirect URI in Azure matches your callback URL:');
console.log(`   ${config.appUrl}${config.oauth.microsoft.callbackURL}`);
console.log('4. Ensure the tenant ID (3a93c5ae-2ed2-44a5-b507-2ca64ffa861e) is correct');
console.log('5. Check that the application has the required permissions (user.read, openid, profile, email)');
console.log('================================'); 