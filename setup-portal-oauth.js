/**
 * Script to bootstrap your .env with Portal configuration.
 *
 * Options:
 *   option A: import local TS client in services/portal.service.js
 *   const { PortalClient } = require('../../lib/rest/clients/ts');
 *
 *   Option B: import from npm once published
 *   const { PortalClient } = require('portal-sdk');
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

// Aggiungi le credenziali Portal OAuth
envConfig.PORTAL_SERVER_URL = envConfig.PORTAL_SERVER_URL || 'http://localhost:3000';
envConfig.PORTAL_AUTH_TOKEN = envConfig.PORTAL_AUTH_TOKEN || '';
envConfig.NWC_URL = envConfig.NWC_URL || '';
envConfig.PORTAL_CALLBACK_URI = envConfig.PORTAL_CALLBACK_URI || '/api/v1/auth/portal/callback';

// Aggiungere APP_URL se non presente
if (!envConfig.APP_URL) {
    envConfig.APP_URL = 'http://localhost:5555';
}

// Aggiungere FRONTEND_URL se non presente
if (!envConfig.FRONTEND_URL) {
    envConfig.FRONTEND_URL = 'http://localhost:5173';
}

// Converti l'oggetto di configurazione in formato stringa per .env
const fileContent = Object.entries(envConfig)
    .map(([key, val]) => `${key}=${val}`)
    .join('\n');

// Salva nel file .env
fs.writeFileSync(envPath, fileContent);

console.log('Credenziali Portal OAuth configurate!');
console.log(`PORTAL_SERVER_URL=${envConfig.PORTAL_SERVER_URL}`);
console.log(`PORTAL_AUTH_TOKEN=${envConfig.PORTAL_AUTH_TOKEN ? '***' : ''}`);
console.log(`NWC_URL=${envConfig.NWC_URL}`);
console.log(`PORTAL_CALLBACK_URI=${envConfig.PORTAL_CALLBACK_URI}`);
console.log(`APP_URL=${envConfig.APP_URL}`);
console.log(`FRONTEND_URL=${envConfig.FRONTEND_URL}`);
console.log('\nℹNOTA IMPORTANTE: È necessario registrare questo URL di callback nel Portal Developer Console:');
console.log(`${envConfig.APP_URL}${envConfig.PORTAL_CALLBACK_URI}`);
