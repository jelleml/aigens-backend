/**
 * Script per configurare le credenziali OAuth di Google
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

// Aggiungi le credenziali Google OAuth
envConfig.GOOGLE_CLIENT_ID = '266919451306-cl8221ii9khqr44l1opd8q2obv1d58v2.apps.googleusercontent.com';
envConfig.GOOGLE_CLIENT_SECRET = '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';
envConfig.GOOGLE_CALLBACK_URL = '/api/v1/auth/google/callback';

// Aggiungere APP_URL se non presente
if (!envConfig.APP_URL) {
    envConfig.APP_URL = 'http://localhost:5555';
}

// Aggiungere FRONTEND_URL se non presente
if (!envConfig.FRONTEND_URL) {
    envConfig.FRONTEND_URL = 'http://localhost:5173';
}

// Converti l'oggetto di configurazione in formato stringa per .env
const envContent = Object.keys(envConfig)
    .map(key => `${key}=${envConfig[key]}`)
    .join('\n');

// Salva nel file .env
fs.writeFileSync(envPath, envContent);

console.log('Credenziali Google OAuth configurate con successo!');
console.log(`GOOGLE_CLIENT_ID=${envConfig.GOOGLE_CLIENT_ID}`);
console.log(`GOOGLE_CLIENT_SECRET=******`);
console.log(`GOOGLE_CALLBACK_URL=${envConfig.GOOGLE_CALLBACK_URL}`);
console.log(`APP_URL=${envConfig.APP_URL}`);
console.log(`FRONTEND_URL=${envConfig.FRONTEND_URL}`);
console.log('\nNOTA IMPORTANTE: È necessario registrare questo URL di callback nel Google Cloud Console:');
console.log(`${envConfig.APP_URL}${envConfig.GOOGLE_CALLBACK_URL}`); 