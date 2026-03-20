/**
 * Script per esportare la documentazione Swagger in un file JSON statico
 * Questo file può essere servito a un frontend o pubblicato come documentazione statica
 * 
 * Esecuzione: node scripts/export-swagger.js
 */

const fs = require('fs');
const path = require('path');
const { swaggerSpec } = require('../config/swagger');
const { getLogger } = require('../services/logging');
const logger = getLogger('export-swagger', 'script');

// Directory di destinazione per il file JSON
const outputDir = path.join(__dirname, '../public/swagger');
const outputFile = path.join(outputDir, 'swagger.json');

// Assicurati che la directory esista
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    logger.info(`Directory creata: ${outputDir}`);
}

// Scrivi il file JSON
fs.writeFileSync(
    outputFile,
    JSON.stringify(swaggerSpec, null, 2),
    'utf8'
);

logger.info(`Documentazione Swagger esportata in: ${outputFile}`);
logger.info(`URL per accedere al file: /swagger/swagger.json`);

// Crea anche un semplice file HTML per visualizzare la documentazione
const htmlContent = `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>AIGens API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui.css">
  <script src="https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui-bundle.js"></script>
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; padding: 0; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: "./swagger.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        docExpansion: 'none',
        tagsSorter: 'alpha'
      });
      window.ui = ui;
    };
  </script>
</body>
</html>
`;

const htmlFile = path.join(outputDir, 'index.html');
fs.writeFileSync(htmlFile, htmlContent, 'utf8');
logger.info(`Pagina HTML per visualizzare la documentazione creata in: ${htmlFile}`);
logger.info(`URL per accedere alla documentazione: /swagger/`); 