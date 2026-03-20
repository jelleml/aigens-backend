/**
 * This script sets the Microsoft client secret in the environment
 * Doesn't modify the config file to prevent nodemon infinite loops
 */

// Microsoft OAuth credentials
const MICROSOFT_CLIENT_ID = '58eef7aa-5940-4306-9820-946dd9d04164';
const MICROSOFT_TENANT_ID = 'common';
const MICROSOFT_CALLBACK_URL = '/api/v1/auth/microsoft/callback';

// Production and development secrets
const PROD_SECRET_ID = process.env.PROD_SECRET_ID;
const PROD_SECRET_VALUE = process.env.PROD_SECRET_VALUE;
const DEV_SECRET_VALUE = process.env.DEV_SECRET_VALUE;

// Use the appropriate secret based on environment
const isProduction = process.env.NODE_ENV === 'production';
const MICROSOFT_CLIENT_SECRET = isProduction ? PROD_SECRET_VALUE : DEV_SECRET_VALUE;

// Set environment variables only
process.env.MICROSOFT_CLIENT_ID = MICROSOFT_CLIENT_ID;
process.env.MICROSOFT_TENANT_ID = MICROSOFT_TENANT_ID;
process.env.MICROSOFT_CALLBACK_URL = MICROSOFT_CALLBACK_URL;
process.env.MICROSOFT_CLIENT_SECRET = MICROSOFT_CLIENT_SECRET;

// Only show logs when script is run directly
if (require.main === module) {
    console.log('\n=== Microsoft OAuth Configuration ===');
    console.log('Environment:', isProduction ? 'PRODUCTION' : 'DEVELOPMENT');
    console.log('Client ID:', MICROSOFT_CLIENT_ID);
    console.log('Tenant ID:', MICROSOFT_TENANT_ID);
    console.log('Callback URL:', MICROSOFT_CALLBACK_URL);
    console.log('Secret ID (prod):', PROD_SECRET_ID);
    console.log('Client Secret is set:', !!MICROSOFT_CLIENT_SECRET);
    console.log('===================================');

    if (!MICROSOFT_CLIENT_SECRET) {
        console.log('\n🚨 IMPORTANT: Microsoft OAuth client secret is not properly configured.');
        console.log('\nFor DEVELOPMENT:');
        console.log('Use the test login endpoint: /api/v1/auth/microsoft-test-login');
        console.log('This will bypass the Microsoft OAuth flow and create a test user account.');

        console.log('\nFor PRODUCTION:');
        console.log('1. Register your app in the Azure Portal (https://portal.azure.com/)');
        console.log('2. Go to App Registrations > Your App > Certificates & secrets');
        console.log('3. Create a new client secret');
        console.log('4. Copy the VALUE (not the ID) of the secret');
        console.log('5. Set it as MICROSOFT_CLIENT_SECRET in your .env file or server environment');
        console.log('6. Make sure your Redirect URI is correctly configured in Azure Portal:');
        console.log(`   ${process.env.APP_URL || 'http://localhost:5555'}${MICROSOFT_CALLBACK_URL}`);
        console.log('7. Ensure "Supported account types" is set to "Accounts in any organizational directory and personal Microsoft accounts"');
    }
}

// Export the function to be used by server.js
module.exports = {
    setMicrosoftClientSecret: () => {
        process.env.MICROSOFT_CLIENT_ID = MICROSOFT_CLIENT_ID;
        process.env.MICROSOFT_TENANT_ID = MICROSOFT_TENANT_ID;
        process.env.MICROSOFT_CALLBACK_URL = MICROSOFT_CALLBACK_URL;
        process.env.MICROSOFT_CLIENT_SECRET = MICROSOFT_CLIENT_SECRET;

        return {
            clientID: MICROSOFT_CLIENT_ID,
            tenantID: MICROSOFT_TENANT_ID,
            callbackURL: MICROSOFT_CALLBACK_URL,
            clientSecret: MICROSOFT_CLIENT_SECRET
        };
    }
}; 