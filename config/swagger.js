/**
 * Configurazione Swagger per la documentazione delle API
 * @module config/swagger
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Opzioni di base per Swagger
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AIGens API Documentation',
      version: '1.0.0',
      description: 'Documentazione delle API per la piattaforma AIGens',
      contact: {
        name: 'Supporto AIGens',
        email: 'support@aigens.io',
        url: 'https://aigens.io/support'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:5555',
        description: 'Server di sviluppo locale'
      },
      {
        url: 'https://api.aigens.io',
        description: 'Server di produzione'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  // Percorsi dei file che contengono annotazioni JSDoc per Swagger e i nuovi file YAML
  apis: [
    './api-docs/*.yaml',
    './api/v1/anthropic/*.js',
    './api/v1/deepseek/*.js',
    './api/v1/*.js',
    './routes/*.js',
    './middlewares/*.js'
  ]
};

// Genera la specifica Swagger
const swaggerSpec = swaggerJsdoc(options);

// Funzione per configurare Swagger nell'app Express
const setupSwagger = (app) => {
  // Endpoint per ottenere la documentazione in formato JSON
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // Configura l'interfaccia Swagger UI
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'AIGens API Documentation',
      customfavIcon: '/favicon.ico',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        tagsSorter: 'alpha'
      }
    })
  );

  console.log('Swagger UI disponibile su /api-docs');
};

module.exports = {
  swaggerSpec,
  setupSwagger
}; 