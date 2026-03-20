/**
 * Script per configurare e verificare le credenziali OAuth di Alby
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Carica le variabili d'ambiente esistenti se presenti
const envPath = path.resolve(process.cwd(), '.env');
let envConfig = {};

if (fs.existsSync(envPath)) {
    const existingEnv = dotenv.parse(fs.readFileSync(envPath));
    envConfig = { ...existingEnv };
}

// Configurazione per produzione
const productionConfig = {
    ALBY_CLIENT_ID: 'uTEOij1b7t',
    ALBY_CLIENT_SECRET: 'scjGcEbGJi6qbP0ICL29',
    ALBY_CALLBACK_URL: '/api/v1/auth/alby/callback'
};

// Configurazione per sviluppo
const developmentConfig = {
    ALBY_CLIENT_ID: 'lefOMpV1ms',
    ALBY_CLIENT_SECRET: '2GEW4Z9f7Bfw8aha5F4n',
    ALBY_CALLBACK_URL: '/api/v1/auth/alby/callback'
};

// Determina l'ambiente
const isProduction = process.env.NODE_ENV === 'production';
const config = isProduction ? productionConfig : developmentConfig;

console.log(`\n🔧 Configurazione Alby OAuth per ambiente: ${isProduction ? 'PRODUZIONE' : 'SVILUPPO'}`);
console.log('='.repeat(50));

// Aggiorna la configurazione
Object.keys(config).forEach(key => {
    envConfig[key] = config[key];
    console.log(`${key}: ${key.includes('SECRET') ? '***' : config[key]}`);
});

// Aggiungere APP_URL se non presente
if (!envConfig.APP_URL) {
    envConfig.APP_URL = process.env.APP_URL;
    console.log(`APP_URL: ${envConfig.APP_URL}`);
}

// Aggiungere FRONTEND_URL se non presente
if (!envConfig.FRONTEND_URL) {
    envConfig.FRONTEND_URL = process.env.FRONTEND_URL;
    console.log(`FRONTEND_URL: ${envConfig.FRONTEND_URL}`);
}

// Converti l'oggetto di configurazione in formato stringa per .env
const envContent = Object.keys(envConfig)
    .map(key => `${key}=${envConfig[key]}`)
    .join('\n');

// Salva nel file .env
fs.writeFileSync(envPath, envContent);

console.log('\n✅ Configurazione salvata nel file .env');
console.log('\n📋 Informazioni importanti:');
console.log(`- Client ID: ${config.ALBY_CLIENT_ID}`);
console.log(`- Callback URL completo: ${envConfig.APP_URL}${config.ALBY_CALLBACK_URL}`);
console.log(`- Frontend URL: ${envConfig.FRONTEND_URL}`);

console.log('\n🔗 URL di test:');
console.log(`- OAuth completo: ${envConfig.APP_URL}/api/v1/auth/alby`);
console.log(`- Test login (solo sviluppo): ${envConfig.APP_URL}/api/v1/auth/alby-test-login`);

console.log('\n⚠️  Assicurati che il callback URL sia configurato correttamente nell\'app Alby OAuth!');
console.log(`   Callback URL da configurare: ${envConfig.APP_URL}${config.ALBY_CALLBACK_URL}`);

// Verifica se le credenziali sono presenti
if (!config.ALBY_CLIENT_ID || !config.ALBY_CLIENT_SECRET) {
    console.error('\n❌ ERRORE: Credenziali Alby mancanti!');
    process.exit(1);
}

console.log('\n✅ Configurazione completata con successo!');
