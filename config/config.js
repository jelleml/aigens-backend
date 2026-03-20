/**
 * Configurazione centralizzata dell'applicazione
 * @module config/config
 */

// Carica le variabili d'ambiente
require('dotenv').config();

// Configurazione generale
const config = {
  env: process.env.NODE_ENV,
  port: process.env.PORT || 5555,
  appUrl: process.env.APP_URL || 'http://localhost:5555',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Configurazione del database
  database: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dialect: 'mysql',
    logging: false
  },

  // Configurazione JWT
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '24h'
  },

  // Configurazione upload file
  upload: {
    maxSize: process.env.UPLOAD_MAX_SIZE,
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
  },

  // Configurazione email
  email: {
    templatesPath: './templates/emails',
    sendGridApiKey: process.env.SENDGRID_API_KEY,
    defaultFrom: 'noreply@aigens.io',
    cacheEnabled: true,
    enableFallback: true,
    fallbackEmail: process.env.FALLBACK_EMAIL || 'admin@aigens.io',
    enableQueue: true,
    queuePath: './temp/email-queue'
  },

  // Configurazione Vbout
  vbout: {
    apiKey: process.env.VBOUT_API_KEY || '3013166457266121535428555',
    waitingListId: process.env.VBOUT_WAITING_LIST_ID || '159023',
    waitingListName: process.env.VBOUT_WAITING_LIST_NAME || 'Aigens.io Waiting List'
  },

  // Configurazione sessione
  session: {
    secret: process.env.SESSION_SECRET || 'default-session-secret',
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 ore
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax'
    },
    name: 'aigens.sid',
    resave: false,
    saveUninitialized: false
  },

  // Configurazione Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhook: process.env.STRIPE_WEBHOOK_SECRET,
  },

  // Configurazione BTCPay
  btcpay: {
    url: process.env.BTCPAY_URL,
    webhookSecret: process.env.BTCPAY_WEBHOOK_SECRET,
    storeId: process.env.BTCPAY_STORE_ID,
    apiKey: process.env.BTCPAY_API_KEY,
  },

  // Configurazione OAuth
  oauth: {
    alby: {
      clientID: process.env.ALBY_CLIENT_ID,
      clientSecret: process.env.ALBY_CLIENT_SECRET,
      callbackURL: process.env.ALBY_CALLBACK_URL || '/api/v1/auth/alby/callback',
      scope: (process.env.ALBY_SCOPE || 'account:read balance:read').split(' ')
    },
    // // Portal (Nostr) REST/WebSocket daemon
    // portal: {
    //   serverUrl: process.env.PORTAL_SERVER_URL || 'http://localhost:3000',
    //   authToken: process.env.PORTAL_AUTH_TOKEN,
    //   callbackURL: process.env.PORTAL_CALLBACK_URI || '/api/v1/auth/portal/callback',
    // },
    google: {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/v1/auth/google/callback'
    },
    microsoft: {
      // Uses the client ID and secret set by set-microsoft-secret.js based on environment
      clientID: process.env.MICROSOFT_CLIENT_ID || '58eef7aa-5940-4306-9820-946dd9d04164',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      callbackURL: process.env.MICROSOFT_CALLBACK_URL || '/api/v1/auth/microsoft/callback',
      tenantID: process.env.MICROSOFT_TENANT_ID || 'common',
      cloudInstance: 'https://login.microsoftonline.com/',
      scopes: ['user.read', 'openid', 'profile', 'email']
    },
    github: {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL || '/api/v1/auth/github/callback',
      scope: ['user:email']
    }
  },

  googleCloud: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    bucketName: process.env.GOOGLE_CLOUD_STORAGE_BUCKET,
    credentials: {
      type: process.env.GOOGLE_CLOUD_TYPE,
      project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
      private_key_id: process.env.GOOGLE_CLOUD_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLOUD_CLIENT_ID,
      auth_uri: process.env.GOOGLE_CLOUD_AUTH_URI,
      token_uri: process.env.GOOGLE_CLOUD_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.GOOGLE_CLOUD_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.GOOGLE_CLOUD_CLIENT_X509_CERT_URL,
      universe_domain: process.env.GOOGLE_CLOUD_UNIVERSE_DOMAIN
    },
    storage: {
      defaultFolder: 'uploads',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/csv'
      ],
      signedUrlExpiration: 15 * 60 * 1000, // 15 minutes
      publicRead: false
    }
  },
};

// Configurazione per Anthropic
config.anthropic = {
  apiKey: process.env.ANTHROPIC_API_KEY || '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',
};

// Configurazione per Deepseek
config.deepseek = {
  apiKey: process.env.DEEPSEEK_API_KEY || 'sk-90756f42bf7543d98c58b56155dbc11c',
};

// Configurazione per OpenAI
config.openai = {
  apiKey: process.env.OPENAI_API_KEY || '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',
};

// Configurazione per Together AI
config.together = {
  apiKey: process.env.TOGETHER_API_KEY || '23275623eaf54d204a3ed7bf983e38f3975d0529d329feaac488e06a03a27615',
};
config.ideogram = {
  apiKey: process.env.IDEOGRAM_API_KEY || 'zY5qEfMHvCF52DpLqaXrRzoqZCqmdYcpi4P1fV6q0v4t2mbXqEYlBK8C5Hh3iLh6QtvkeWv9jFzw5NvDLCrqGg',
};

// Configurazione per OpenRouter
config.openrouter = {
  apiKey: process.env.OPENROUTER_API_KEY || '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',
};

// Configurazione per Runaway
config.runway = {
  apiKey: process.env.RUNWAY_API_KEY || 'key_48f8d40df33f58d8a3ca4bab59815e1303e81936c1c5b8fc1b1e2a22aeff06eb50ca3b10b57754eb45b01117e9b47829cc017f09ebaf6feb62f426725f91ff8f',
};

// Configurazione per Google-Veo/Gemini/VertexAI
config.google_veo = {
  apiKey: process.env.GOOGLE_GEMINI_KEY || 'AIzaSyCzUi_X6nL9i7uzXaeaTQWE0FvuXvEibHA',
};

// Configurazione per Amazon Bedrock (Amazon Nova models)
config.amazon_bedrock = {
  aws_region: process.env.AWS_REGION || 'eu-north-1',
  aws_access_key_id: process.env.AWS_ACCESS_KEY_ID || 'BedrockAPIKey-gaor-at-593793042446',
  apiKey: process.env.AWS_BEARER_TOKEN_BEDROCK || 'ABSKQmVkcm9ja0FQSUtleS1nYW9yLWF0LTU5Mzc5MzA0MjQ0NjpnT09rZHhQTjBmWmlUUmdha0Y3bkwxeXhGUlE2U1N4NFZ6UnQydU1hSVBhS2dIVWNnWDlPRVZxd1RvVT0=',
  aws_s3_bucket: process.env.AWS_S3_BUCKET || 'i-0db594e0f05f02994',
};

// Configurazione per il recupero del contesto delle chat
config.chatContextConfig = {
  // Numero di messaggi da recuperare per il contesto
  maxMessages: parseInt(process.env.CHAT_CONTEXT_MAX_MESSAGES) || 5,
  
  // Numero massimo di token per il contesto (alternativa ai messaggi)
  maxTokens: parseInt(process.env.CHAT_CONTEXT_MAX_TOKENS) || 2000,
  
  // Prefisso per il contesto delle chat
  contextPrefix: process.env.CHAT_CONTEXT_PREFIX || "chat context and history with the user (only last X messages or token are retrieved, if the user ask you you can say that): ",
  
  // Formato dei messaggi nel contesto
  messageFormat: {
    user: process.env.CHAT_CONTEXT_USER_FORMAT || "USER",
    assistant: process.env.CHAT_CONTEXT_ASSISTANT_FORMAT || "ASSISTANT"
  },
  
  // Abilita/disabilita il recupero del contesto
  enabled: process.env.CHAT_CONTEXT_ENABLED !== 'false', // Default: true
  
  // Modelli per cui abilitare il contesto (solo text-to-text)
  enabledProviders: (process.env.CHAT_CONTEXT_ENABLED_PROVIDERS || 'anthropic,openai,deepseek,together,openrouter').split(','),
  
  // Separatore tra messaggi nel contesto
  messageSeparator: process.env.CHAT_CONTEXT_MESSAGE_SEPARATOR || '\n',
  
  // Abilita logging per debug
  debug: process.env.CHAT_CONTEXT_DEBUG === 'true'
};

// Configurazione per Python Addons
config.pythonAddons = {
  // Modello di default per i Python addons
  defaultModel: process.env.DEFAULT_MODEL_PYTHON_ADDONS || 'x-ai/grok-3-mini-openrouter'
};

module.exports = config; 
