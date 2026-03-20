/**
 * Entry point dell'applicazione
 * @module server
 */

// Carica variabili d'ambiente PRIMA di tutto
require('dotenv').config();

// Carica configurazione per ottenere le API keys
const appConfig = require('./config/config');

// Imposta le variabili d'ambiente per l'AI SDK se non sono già impostate
if (!process.env.OPENAI_API_KEY && appConfig.openai?.apiKey) {
  process.env.OPENAI_API_KEY = appConfig.openai.apiKey;
  console.log('✅ OPENAI_API_KEY impostata da configurazione');
}

if (!process.env.ANTHROPIC_API_KEY && appConfig.anthropic?.apiKey) {
  process.env.ANTHROPIC_API_KEY = appConfig.anthropic.apiKey;
  console.log('✅ ANTHROPIC_API_KEY impostata da configurazione');
}

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const db = require('./database');
const stripeService = require('./services/stripe.service');
const fs = require('fs');
// COMMENTATO: Sistema di logging centralizzato
// const {
//   initializeLogging,
//   replaceConsole,
//   correlationMiddleware,
//   requestLoggerMiddleware,
//   errorLoggerMiddleware
// } = require('./services/logging');

// Microsoft OAuth Configuration
let microsoftAuth;
try {
  microsoftAuth = require('./set-microsoft-secret').setMicrosoftClientSecret();

  // Only show warning if client secret is missing
  if (!microsoftAuth.clientSecret && process.env.NODE_ENV !== 'production') {
    console.log('\n⚠️ Microsoft client secret is NOT set.');
    console.log('For development, use the test endpoint:');
    console.log('/api/v1/auth/microsoft-test-login');
  }
} catch (err) {
  console.error('❌ Error setting Microsoft OAuth configuration:', err.message);
  microsoftAuth = {
    clientID: '58eef7aa-5940-4306-9820-946dd9d04164',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    callbackURL: '/api/v1/auth/microsoft/callback',
    tenantID: 'common',
  };
}

// Importazione delle configurazioni
const { corsMiddleware } = require('./config/cors');
const { setupBodyParser } = require('./config/bodyParser');
const { initializeDatabase } = require('./config/database');
const { setupRouter } = require('./config/router');
const { setupSwagger } = require('./config/swagger');
const { handleMulterError } = require('./config/multer');
const config = require('./config/config');

// Microsoft OAuth configuration
config.oauth.microsoft = microsoftAuth;

// Set default scopes if not defined
if (!config.oauth.microsoft.scopes) {
  config.oauth.microsoft.scopes = ['user.read', 'openid', 'profile', 'email'];
}

// Configurazione OAuth Alby corretta
config.oauth.alby = {
  clientID: process.env.ALBY_CLIENT_ID,
  clientSecret: process.env.ALBY_CLIENT_SECRET,
  callbackURL: process.env.ALBY_CALLBACK_URL || '/api/v1/auth/alby/callback',
  scope: ['account:read', 'balance:read'],
  authorizationURL: 'https://getalby.com/oauth',
  tokenURL: 'https://api.getalby.com/oauth/token',
  userProfileURL: 'https://api.getalby.com/user/me'
};

// CORREZIONE: GitHub OAuth config senza segreti hardcoded
config.oauth.github = {
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: process.env.GITHUB_CALLBACK_URL,
  scope: ['user:email']
};

// Verifica che i segreti GitHub siano configurati
if (!config.oauth.github.clientID || !config.oauth.github.clientSecret) {
  console.warn('⚠️ GitHub OAuth credentials not properly configured');
}

// Importazione dei middleware
const { error: errorMiddleware, rateLimiter: rateLimiterMiddleware } = require('./middlewares');

// COMMENTATO: Inizializzazione logging centralizzato
// const logging = initializeLogging();
// replaceConsole(logging.logger);
// const appLogger = logging.logger;

// Porta del server (usa variabile d'ambiente o fallback)
const PORT = process.env.PORT;

/**
 * @swagger
 * components:
 *   schemas:
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Messaggio di errore
 *         status:
 *           type: integer
 *           description: Codice di stato HTTP
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: Timestamp dell'errore
 */

/**
 * Inizializza l'applicazione Express
 * @returns {Express} - Istanza dell'applicazione Express configurata
 */
const initializeApp = () => {
  const app = express();

  // View engine setup - SPOSTATO ALL'INIZIO
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'hbs');

  // ============================================
  // WEBHOOK ROUTES CON RAW BODY PARSING
  // IMPORTANTE: Questi DEVONO venire prima di setupBodyParser()
  // ============================================

  // PATCH: monta SOLO la route webhook Stripe con body raw
  app.post(
    '/api/v1/stripe/webhook',
    express.raw({ type: 'application/json' }),
    stripeService.handleWebhook
  );

  // PATCH: monta la route webhook BTCPay con body raw
  app.use('/api/v1/payments/btcpay/webhook', express.raw({
    type: 'application/json',
    limit: '10mb'
  }));

  // Middleware di sicurezza
  app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        "img-src": ["'self'", "data:", "https:"]
      }
    }
  }));

  // COMMENTATO: Logging centralizzato
  // app.use(correlationMiddleware());
  // app.use(requestLoggerMiddleware());

  // Gestione centralizzata delle richieste OPTIONS con il middleware CORS
  app.options('*', corsMiddleware);

  // Handle favicon requests to prevent 404 errors
  app.use('/favicon.ico', (req, res) => {
    res.status(204).end();
  });

  // Handle apple-touch-icon requests to prevent 404 errors
  app.use('/apple-touch-icon.png', (req, res) => {
    res.status(204).end();
  });

  app.use('/apple-touch-icon-precomposed.png', (req, res) => {
    res.status(204).end();
  });

  // Handle incorrect favicon URLs that might include host
  app.use(/\/http.*\/favicon\.ico$/, (req, res) => {
    res.status(204).end();
  });

  // CORS per altre richieste non-OPTIONS
  app.use(corsMiddleware);

  // Cookie parser
  app.use(cookieParser());

  // Sessione
  app.use(session({
    secret: config.session.secret,
    cookie: config.session.cookie,
    name: config.session.name,
    resave: config.session.resave,
    saveUninitialized: config.session.saveUninitialized
  }));

  // Body parser - UNA SOLA VOLTA
  // IMPORTANTE: Questo viene dopo i webhook che necessitano di raw body
  setupBodyParser(app);

  // Limiter globale per le API con caricamento utente
  app.use('/api', rateLimiterMiddleware.apiLimiterWithUser);

  // CSRF protection (escluse le API che richiedono token)
  const csrfProtection = csurf({ cookie: true });
  app.use((req, res, next) => {
    // Esclude le rotte che utilizzano JWT o altre forme di autenticazione API
    const excludePaths = [
      '/api/v1/auth/login',
      '/api/v1/auth/login/passwordless',
      '/api/v1/auth/register',
      '/api/v1/auth/refresh-token',
      '/api/v1/auth/alby/callback',
      '/api/v1/auth/google/callback',
      '/api/v1/auth/microsoft/callback',
      '/api/v1/auth/github/callback',
      '/api/v1/waitlist/subscribe'
    ];

    if (req.path.startsWith('/api/') && (req.method !== 'GET' || excludePaths.includes(req.path))) {
      return next();
    }
    csrfProtection(req, res, next);
  });

  // Gestione degli errori di Multer
  app.use(handleMulterError);

  // Cartella statica per i file pubblici - UNA SOLA VOLTA
  app.use(express.static(path.join(__dirname, 'public')));

  // Configurazione di Swagger
  setupSwagger(app);

  // Configurazione del router
  setupRouter(app);

  // Middleware per gestire le rotte non trovate
  app.use(errorMiddleware.notFound);

  // Middleware per errori specifici
  app.use(errorMiddleware.csrfError);
  app.use(errorMiddleware.authError);
  app.use(errorMiddleware.validationError);

  // Middleware per la gestione centralizzata degli errori
  app.use(errorMiddleware.errorHandler);

  // COMMENTATO: Logging errori centralizzato
  // app.use(errorLoggerMiddleware());

  return app;
};

/**
 * Avvia il server sull'indirizzo e porta specificati
 */
const startServer = async () => {
  try {
    // Ensure models are loaded before any DB-dependent logic
    await db.initialize();

    // Inizializza il database (con opzioni sicure: mai force=true)
    console.log('Inizializzazione del database...');
    const dbInitResult = await initializeDatabase(false, true, false);

    if (!dbInitResult) {
      console.error('Errore durante l\'inizializzazione del database. Avvio del server interrotto.');
      process.exit(1);
    }

    console.log('Database inizializzato con successo.');

    // Crea l'app Express
    const app = initializeApp();

    // Require setupPassport only after db.initialize()
    const { setupPassport } = require('./config/passport');
    setupPassport(app, db.models);

    // Avvia il server
    const server = app.listen(PORT, () => {
      console.log('Server in ascolto sulla porta', PORT);
      console.log('Ambiente', process.env.NODE_ENV || 'development');
      console.log('URL dell\'applicazione', config.appUrl);
      console.log('✅ BTCPay webhook configurato per raw body parsing su /api/v1/payments/btcpay/webhook');
    });

    // Configura timeout più lunghi per le connessioni
    server.timeout = 120000; // 2 minuti
    server.keepAliveTimeout = 65000; // Poco più di 60 secondi
    server.headersTimeout = 66000; // Leggermente più del keepAliveTimeout

    // Gestione graziosa della chiusura
    process.on('SIGTERM', () => {
      console.log('SIGTERM ricevuto. Chiusura del server in corso...');
      server.close(() => {
        console.log('Server chiuso.');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT ricevuto. Chiusura del server in corso...');
      server.close(() => {
        console.log('Server chiuso.');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Errore durante l\'avvio del server', error);
    process.exit(1);
  }
};

// Aumenta il limite dei listener per evitare MaxListenersExceededWarning
process.setMaxListeners(20);

// Gestione centralizzata degli errori non catturati
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (reason instanceof Error) {
    console.error('Stack:', reason.stack);
  }
  process.exit(1);
});

// Avvia il server
startServer();

module.exports = {
  initializeApp
};