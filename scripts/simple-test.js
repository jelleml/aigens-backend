/**
 * Test semplificato per le utility di migrazione
 */

console.log('🧪 Inizio test utility di migrazione');

try {
    // Test importazione utility
    const helpers = require('../utils/migration-helpers');

    console.log('✅ Importazione utility riuscita');
    console.log('   Funzioni disponibili:', Object.keys(helpers));

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
        console.log('✅ Tutte le funzioni richieste sono presenti');
    } else {
        console.error('❌ Funzioni mancanti:', missingFunctions);
        process.exit(1);
    }

    // Test delle funzioni di logging
    console.log('🧪 Test funzioni di logging');
    helpers.logMigrationStep('Test step', { test: true });
    helpers.logMigrationSuccess('Test success');
    helpers.logMigrationError('Test error', new Error('Test error message'));

    console.log('✅ Test funzioni di logging completato');

    // Test template
    console.log('🧪 Test template di migrazione');
    const templates = require('../utils/migration-template');
    console.log('✅ Importazione template riuscita');
    console.log('   Template disponibili:', Object.keys(templates));

    // Test script
    console.log('🧪 Test script di utilità');
    const verifyScript = require('./verify-migration-state');
    const cleanupScript = require('./cleanup-duplicate-indexes');
    console.log('✅ Importazione script riuscita');

    // Test documentazione
    console.log('🧪 Test documentazione');
    const fs = require('fs');
    const path = require('path');
    const docsPath = path.join(__dirname, '../docs/migration-safety-guide.md');

    if (fs.existsSync(docsPath)) {
        console.log('✅ File di documentazione presente');
        const content = fs.readFileSync(docsPath, 'utf8');
        console.log('   Dimensione file:', content.length, 'caratteri');
    } else {
        console.error('❌ File di documentazione mancante');
        process.exit(1);
    }

    console.log('🎉 Tutti i test sono passati! Il sistema di migrazione sicura è pronto.');
    process.exit(0);

} catch (error) {
    console.error('❌ Errore durante il test:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
} 