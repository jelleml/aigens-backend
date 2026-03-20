#!/usr/bin/env node

/**
 * CAPABILITIES POPULATION SCRIPT
 * Populates the models_capabilities table with all possible capabilities
 * 
 * IMPORTANT: This is STEP 2 of a 5-step process. For complete setup, use:
 *   node scripts/setup-models-complete.js
 * 
 * Or run individual steps in order:
 *   1. node scripts/init-all-models-unified.js
 *   2. node scripts/populate-capabilities.js          (this script)
 *   3. node scripts/populate-models-capabilities.js
 *   4. node scripts/populate-aggregator-pricing-tiers.js
 *   5. node scripts/populate-model-subscriptions.js
 * 
 * This script creates 41 standard capabilities that models can have.
 */

const db = require('../../database');

/**
 * Capabilities data
 */
const capabilitiesData = [
  { id: 1, name: 'Text generation', visible: false, type: 'text', description: 'Generazione di testo libero su richiesta' },
  { id: 2, name: 'Text completion', visible: false, type: 'text', description: 'Completamento di un testo a partire da un input parziale' },
  { id: 3, name: 'Summarization', visible: true, type: 'text', description: 'Riassunto di testi lunghi' },
  { id: 4, name: 'Translation', visible: true, type: 'text', description: 'Traduzione da una lingua a un\'altra' },
  { id: 5, name: 'Sentiment analysis', visible: true, type: 'text', description: 'Riconoscimento del tono emotivo di un testo' },
  { id: 6, name: 'Named entity recognition', visible: true, type: 'text', description: 'Identificazione di entità nominate (persone, luoghi, ecc.)' },
  { id: 7, name: 'Text classification', visible: true, type: 'text', description: 'Classificazione di un testo in categorie' },
  { id: 8, name: 'Grammar correction', visible: true, type: 'text', description: 'Correzione di errori grammaticali' },
  { id: 9, name: 'Style transfer', visible: true, type: 'text', description: 'Adattamento dello stile di scrittura' },
  { id: 10, name: 'Code generation', visible: true, type: 'text/code', description: 'Generazione di codice sorgente in vari linguaggi' },
  { id: 11, name: 'Code explanation', visible: true, type: 'text/code', description: 'Spiegazione di codice' },
  { id: 12, name: 'Logical reasoning', visible: true, type: 'cognitive', description: 'Ragionamento logico su problemi o scenari' },
  { id: 13, name: 'Mathematical reasoning', visible: true, type: 'cognitive', description: 'Risoluzione di problemi matematici' },
  { id: 14, name: 'Commonsense reasoning', visible: true, type: 'cognitive', description: 'Ragionamento basato sul senso comune' },
  { id: 15, name: 'Chain-of-thought reasoning', visible: true, type: 'cognitive', description: 'Ragionamento passo-passo esplicitato' },
  { id: 16, name: 'Multi-step problem solving', visible: true, type: 'cognitive', description: 'Risoluzione di problemi in più fasi' },
  { id: 17, name: 'Planning', visible: true, type: 'cognitive', description: 'Capacità di generare piani o checklist' },
  { id: 18, name: 'Memory usage', visible: true, type: 'cognitive', description: 'Uso di memoria persistente o temporanea' },
  { id: 19, name: 'Image understanding', visible: true, type: 'vision', description: 'Interpretazione e descrizione di immagini' },
  { id: 20, name: 'Image generation', visible: true, type: 'vision', description: 'Creazione di immagini a partire da un prompt testuale' },
  { id: 21, name: 'Image editing', visible: true, type: 'vision', description: 'Modifica immagini su richiesta' },
  { id: 22, name: 'Diagram interpretation', visible: true, type: 'vision', description: 'Lettura e comprensione di diagrammi' },
  { id: 23, name: 'OCR', visible: true, type: 'vision', description: 'Lettura di testo da immagini' },
  { id: 24, name: 'Video understanding', visible: true, type: 'vision', description: 'Comprensione di contenuti video' },
  { id: 25, name: 'Audio transcription', visible: true, type: 'audio', description: 'Conversione di audio in testo' },
  { id: 26, name: 'Text input', visible: false, type: 'input', description: 'Accettazione input testuale' },
  { id: 27, name: 'Image input', visible: true, type: 'input', description: 'Accettazione input immagine' },
  { id: 28, name: 'Audio input', visible: true, type: 'input', description: 'Accettazione input audio' },
  { id: 29, name: 'Video input', visible: true, type: 'input', description: 'Accettazione input video' },
  { id: 30, name: 'File input', visible: true, type: 'input', description: 'Accettazione file (PDF, JSON, ecc.)' },
  { id: 31, name: 'Text output', visible: true, type: 'output', description: 'Generazione output testuale' },
  { id: 32, name: 'Image output', visible: true, type: 'output', description: 'Generazione output immagine' },
  { id: 33, name: 'Audio output', visible: true, type: 'output', description: 'Generazione audio (text-to-speech)' },
  { id: 34, name: 'Structured output', visible: true, type: 'output', description: 'Produzione output in formato JSON, XML, ecc.' },
  { id: 35, name: 'API calling', visible: true, type: 'tool_use', description: 'Chiamata di API esterne o strumenti' },
  { id: 36, name: 'Function calling', visible: true, type: 'tool_use', description: 'Output strutturato per funzioni/API' },
  { id: 37, name: 'Web browsing', visible: true, type: 'tool_use', description: 'Accesso e lettura contenuti web' },
  { id: 38, name: 'Code interpreter', visible: true, type: 'tool_use', description: 'Esecuzione di codice e calcoli' },
  { id: 39, name: 'Retrieval-augmented generation', visible: true, type: 'tool_use', description: 'Generazione supportata da un sistema di recupero dati' },
  { id: 40, name: 'Data visualization', visible: true, type: 'tool_use', description: 'Creazione di grafici o tabelle' },
  { id: 41, name: 'Personalization / memory', visible: true, type: 'tool_use', description: 'Uso di memoria per personalizzare le risposte' },
  { id: 42, name: 'open_weight', visible: true, type: 'llm_type', description: 'Modello open weight (pesi aperti)' },
  { id: 43, name: 'trained', visible: true, type: 'llm_type', description: 'Modello addestrato/fine-tuned' },
  { id: 44, name: 'closed', visible: true, type: 'llm_type', description: 'Modello proprietario/chiuso' },
  { id: 45, name: 'Video output', visible: true, type: 'output', description: 'Generazione video (text-to-video)' }
];

/**
 * Main function to populate capabilities
 */
const populateCapabilities = async () => {
  try {
    console.log('=== POPULATING CAPABILITIES ===');
    
    // Initialize database
    await db.initialize();
    const { ModelsCapability } = db.models;

    let created = 0;
    let updated = 0;
    let errors = 0;
    const summaryByType = {};

    for (const capabilityData of capabilitiesData) {
      try {
        const [capability, wasCreated] = await ModelsCapability.findOrCreate({
          where: { name: capabilityData.name },
          defaults: capabilityData
        });

        if (wasCreated) {
          created++;
        } else {
          // Update existing capability
          await capability.update({
            type: capabilityData.type,
            visible: capabilityData.visible,
            description: capabilityData.description
          });
          updated++;
        }

        // Track by type for summary
        if (!summaryByType[capabilityData.type]) {
          summaryByType[capabilityData.type] = { created: 0, updated: 0, total: 0 };
        }
        if (wasCreated) {
          summaryByType[capabilityData.type].created++;
        } else {
          summaryByType[capabilityData.type].updated++;
        }
        summaryByType[capabilityData.type].total++;

      } catch (error) {
        console.error(`❌ Error processing capability ${capabilityData.name}:`, error.message);
        errors++;
      }
    }

    console.log(`\n✅ Capabilities population completed:`);
    console.log(`  Created: ${created}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Total capabilities: ${capabilitiesData.length}`);
    
    console.log(`\n📊 Summary by capability type:`);
    Object.keys(summaryByType).sort().forEach(type => {
      const stats = summaryByType[type];
      console.log(`  ${type}: ${stats.total} capabilities (${stats.created} new, ${stats.updated} updated)`);
    });
    
    // Only close database and exit if running as standalone script
    if (require.main === module) {
      await db.close();
      process.exit(0);
    }

  } catch (error) {
    console.error('Error during capabilities population:', error);
    if (require.main === module) {
      process.exit(1);
    } else {
      throw error; // Re-throw for parent script to handle
    }
  }
};

// Run if called directly
if (require.main === module) {
  populateCapabilities();
}

module.exports = { populateCapabilities };