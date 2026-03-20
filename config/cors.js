/**
 * Configurazione CORS per l'applicazione
 * @module config/cors
 */

const cors = require('cors');

/**
 * Gestione dell'origin per CORS
 * @param {string|string[]} origin - L'origin della richiesta
 * @param {Function} callback - Callback da chiamare
 */
const corsOriginHandler = (origin, callback) => {
  // Lista di domini consentiti
  const allowedOrigins = [
    'https://aigens.io',
    'https://www.aigens.io',
    'https://api.aigens.io',
    'https://app.aigens.io',
    'https://analytics.aigens.io',
    'https://payments.aigens.io'
  ];

  // In ambiente di sviluppo, consentire richieste senza origine (es. Postman)
  if (process.env.NODE_ENV !== 'production') {
    return callback(null, true);
  }

  if (allowedOrigins.includes(origin) || !origin) {
    callback(null, true);
  } else {
    callback(new Error(`Origin ${origin} non consentito da CORS`));
  }
};

/**
 * Opzioni di configurazione per CORS
 * @type {Object}
 */
const corsOptions = {
  origin: corsOriginHandler,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 24 ore
};

/**
 * Middleware CORS configurato
 * @type {Function}
 */
const corsMiddleware = cors(corsOptions);

module.exports = {
  corsOptions,
  corsMiddleware
};