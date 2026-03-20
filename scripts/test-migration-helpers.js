/**
 * Script di test per le utility di migrazione
 * Verifica che le utility funzionino correttamente senza connessione al database
 */

const { getLogger } = require('../services/logging');

const logger = getLogger('migration', 'test');

/**
 * Test delle utility di migrazione
 */
const testMigrationHelpers = () => {
    logger.info('🧪 Inizio test utility di migrazione');

    try {
        // Test importazione utility
        const helpers = require('../utils/migration-helpers');

        logger.info('✅ Importazione utility riuscita');
        logger.info('   Funzioni disponibili:', Object.keys(helpers));

        // Verifica che tutte le funzioni necessarie siano presenti
        const requiredFunctions = [
            'checkIndexExists',
            'safeCreateIndex',
            'checkColumnExists',
            'safeAddColumn',
            'checkTableExists',
            'safeCreateTable',
            'checkForeignKeyExists',
            'safeAddForeignKey',
            'logMigrationStep',
            'logMigrationError',
            'logMigrationSuccess'
        ];

        const missingFunctions = requiredFunctions.filter(fn => !helpers[fn]);

        if (missingFunctions.length === 0) {
            logger.info('✅ Tutte le funzioni richieste sono presenti');
        } else {
            logger.error('❌ Funzioni mancanti:', missingFunctions);
            return false;
        }

        // Test delle funzioni di logging
        logger.info('🧪 Test funzioni di logging');
        helpers.logMigrationStep('Test step', { test: true });
        helpers.logMigrationSuccess('Test success');
        helpers.logMigrationError('Test error', new Error('Test error message'));

        logger.info('✅ Test funzioni di logging completato');

        return true;

    } catch (error) {
        logger.error('❌ Errore durante il test:', error.message);
        return false;
    }
};

/**
 * Test del template di migrazione
 */
const testMigrationTemplate = () => {
    logger.info('🧪 Inizio test template di migrazione');

    try {
        // Test importazione template
        const templates = require('../utils/migration-template');

        logger.info('✅ Importazione template riuscita');
        logger.info('   Template disponibili:', Object.keys(templates));

        // Verifica che tutti i template necessari siano presenti
        const requiredTemplates = [
            'createTableTemplate',
            'addColumnTemplate',
            'addIndexTemplate',
            'addForeignKeyTemplate',
            'complexMigrationTemplate'
        ];

        const missingTemplates = requiredTemplates.filter(template => !templates[template]);

        if (missingTemplates.length === 0) {
            logger.info('✅ Tutti i template richiesti sono presenti');
        } else {
            logger.error('❌ Template mancanti:', missingTemplates);
            return false;
        }

        // Test struttura template
        for (const [name, template] of Object.entries(templates)) {
            if (typeof template.up !== 'function') {
                logger.error(`❌ Template ${name} manca della funzione up`);
                return false;
            }
            if (typeof template.down !== 'function') {
                logger.error(`❌ Template ${name} manca della funzione down`);
                return false;
            }
        }

        logger.info('✅ Test struttura template completato');
        return true;

    } catch (error) {
        logger.error('❌ Errore durante il test template:', error.message);
        return false;
    }
};

/**
 * Test degli script di utilità
 */
const testUtilityScripts = () => {
    logger.info('🧪 Inizio test script di utilità');

    try {
        // Test script di verifica
        const verifyScript = require('./verify-migration-state');

        logger.info('✅ Importazione script di verifica riuscita');
        logger.info('   Funzioni disponibili:', Object.keys(verifyScript));

        // Test script di pulizia
        const cleanupScript = require('./cleanup-duplicate-indexes');

        logger.info('✅ Importazione script di pulizia riuscita');
        logger.info('   Funzioni disponibili:', Object.keys(cleanupScript));

        return true;

    } catch (error) {
        logger.error('❌ Errore durante il test script:', error.message);
        return false;
    }
};

/**
 * Test della documentazione
 */
const testDocumentation = () => {
    logger.info('🧪 Inizio test documentazione');

    try {
        const fs = require('fs');
        const path = require('path');

        // Verifica esistenza file di documentazione
        const docsPath = path.join(__dirname, '../docs/migration-safety-guide.md');

        if (fs.existsSync(docsPath)) {
            logger.info('✅ File di documentazione presente');

            const content = fs.readFileSync(docsPath, 'utf8');
            const hasExamples = content.includes('```javascript');
            const hasBestPractices = content.includes('Best Practices');
            const hasTroubleshooting = content.includes('Troubleshooting');

            if (hasExamples && hasBestPractices && hasTroubleshooting) {
                logger.info('✅ Documentazione completa');
            } else {
                logger.warn('⚠️ Documentazione incompleta');
            }
        } else {
            logger.error('❌ File di documentazione mancante');
            return false;
        }

        return true;

    } catch (error) {
        logger.error('❌ Errore durante il test documentazione:', error.message);
        return false;
    }
};

/**
 * Funzione principale per l'esecuzione di tutti i test
 */
const main = async () => {
    logger.info('🚀 Avvio test completi per il sistema di migrazione sicura');

    const results = {
        helpers: testMigrationHelpers(),
        template: testMigrationTemplate(),
        scripts: testUtilityScripts(),
        documentation: testDocumentation()
    };

    logger.info('📊 Risultati test:');
    logger.info(`   - Utility di migrazione: ${results.helpers ? '✅' : '❌'}`);
    logger.info(`   - Template di migrazione: ${results.template ? '✅' : '❌'}`);
    logger.info(`   - Script di utilità: ${results.scripts ? '✅' : '❌'}`);
    logger.info(`   - Documentazione: ${results.documentation ? '✅' : '❌'}`);

    const allPassed = Object.values(results).every(result => result === true);

    if (allPassed) {
        logger.info('🎉 Tutti i test sono passati! Il sistema di migrazione sicura è pronto.');
        process.exit(0);
    } else {
        logger.error('❌ Alcuni test sono falliti. Controllare i log per i dettagli.');
        process.exit(1);
    }
};

// Esegui i test se chiamato direttamente
if (require.main === module) {
    main().catch(error => {
        logger.error('❌ Errore fatale durante i test:', error);
        process.exit(1);
    });
}

module.exports = {
    testMigrationHelpers,
    testMigrationTemplate,
    testUtilityScripts,
    testDocumentation
}; 