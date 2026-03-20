/**
 * Comprehensive OAuth debugging script for production
 */

require('dotenv').config();
const config = require('./config/config');

console.log('🔍 OAuth Production Debug Report');
console.log('================================\n');

// Environment check
console.log('📋 Environment Variables:');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`APP_URL: ${process.env.APP_URL}`);
console.log(`FRONTEND_URL: ${process.env.FRONTEND_URL}`);
console.log(`GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID}`);
console.log(`GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? '***SET***' : '***NOT SET***'}`);
console.log(`GOOGLE_CALLBACK_URL: ${process.env.GOOGLE_CALLBACK_URL}`);

console.log('\n🔧 Parsed Configuration:');
console.log(`config.appUrl: ${config.appUrl}`);
console.log(`config.frontendUrl: ${config.frontendUrl}`);
console.log(`config.oauth.google.clientID: ${config.oauth.google.clientID}`);
console.log(`config.oauth.google.clientSecret: ${config.oauth.google.clientSecret ? '***SET***' : '***NOT SET***'}`);
console.log(`config.oauth.google.callbackURL: ${config.oauth.google.callbackURL}`);

console.log('\n🌐 Full URLs:');
const fullCallbackUrl = `${config.appUrl}${config.oauth.google.callbackURL}`;
console.log(`Full callback URL: ${fullCallbackUrl}`);
console.log(`Frontend redirect URL: ${config.frontendUrl}/login`);

console.log('\n🔒 Session Configuration:');
console.log(`Session secret set: ${!!config.session.secret}`);
console.log(`Cookie secure: ${config.session.cookie.secure}`);
console.log(`Cookie httpOnly: ${config.session.cookie.httpOnly}`);
console.log(`Cookie sameSite: ${config.session.cookie.sameSite}`);

console.log('\n⚠️  Common Issues to Check:');
console.log('1. Environment variable formatting:');
console.log('   - Make sure there are no extra quotes or spaces');
console.log('   - Each variable should be on its own line');
console.log('   - No concatenation like APP_URL="..."FRONTEND_URL="..."');

console.log('\n2. Google Cloud Console Configuration:');
console.log('   Authorized JavaScript origins:');
console.log(`   ✓ ${config.appUrl}`);
console.log(`   ✓ ${config.frontendUrl}`);
console.log('   Authorized redirect URIs:');
console.log(`   ✓ ${fullCallbackUrl}`);

console.log('\n3. SSL/TLS Issues:');
console.log('   - Ensure your production server has valid SSL certificate');
console.log('   - Check if there are any proxy/load balancer issues');
console.log('   - Verify HTTPS is properly configured');

console.log('\n4. Network/Firewall Issues:');
console.log('   - Check if Google can reach your callback URL');
console.log('   - Test the callback URL directly in browser');
console.log('   - Verify no firewall is blocking OAuth traffic');

console.log('\n🧪 Test Commands:');
console.log(`curl -I "${fullCallbackUrl}"`);
console.log(`curl -X GET "${config.appUrl}/api/v1/auth/google"`);

console.log('\n📝 Next Steps:');
console.log('1. Fix any environment variable formatting issues');
console.log('2. Test the callback URL directly');
console.log('3. Check server logs during OAuth attempt');
console.log('4. Verify Google Cloud Console settings match exactly');

// Check for common environment variable issues
console.log('\n🚨 Potential Issues Detected:');
let issuesFound = false;

if (!config.appUrl.startsWith('https://')) {
    console.log('❌ APP_URL is not HTTPS in production');
    issuesFound = true;
}

if (!config.frontendUrl.startsWith('https://')) {
    console.log('❌ FRONTEND_URL is not HTTPS in production');
    issuesFound = true;
}

if (!config.oauth.google.clientID) {
    console.log('❌ Google Client ID is not set');
    issuesFound = true;
}

if (!config.oauth.google.clientSecret) {
    console.log('❌ Google Client Secret is not set');
    issuesFound = true;
}

if (process.env.NODE_ENV !== 'production') {
    console.log('⚠️  NODE_ENV is not set to "production"');
    issuesFound = true;
}

// Check for environment variable concatenation issue
const envContent = process.env.APP_URL + process.env.FRONTEND_URL;
if (envContent && !envContent.includes('undefined') && envContent.length > 50 && !envContent.includes('http')) {
    console.log('❌ Possible environment variable concatenation detected');
    console.log('   Check your .env file for proper line breaks');
    issuesFound = true;
}

if (!issuesFound) {
    console.log('✅ No obvious configuration issues detected');
    console.log('   The 403 error might be due to:');
    console.log('   - Google Cloud Console configuration mismatch');
    console.log('   - Network/SSL issues');
    console.log('   - Server-side session/cookie problems');
}