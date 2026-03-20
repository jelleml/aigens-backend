#!/usr/bin/env node

/**
 * Script per eseguire la sincronizzazione forzata del database
 * ⚠️ ATTENZIONE: Questo script eliminerà TUTTI i dati dal database
 * Usare SOLO in caso di emergenza o in ambiente di sviluppo
 */

const { initializeDatabase } = require('../config/database');
const db = require('../database');

const forceSync = async () => {
    try {
        console.log('🚨 ATTENZIONE: Avvio sincronizzazione FORZATA del database...');
        console.log('⚠️  Questo eliminerà TUTTI i dati dal database!');

        // Richiedi conferma all'utente
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const answer = await new Promise((resolve) => {
            rl.question('Sei SICURO di voler procedere? Scrivi "SI" per confermare: ', resolve);
        });

        rl.close();

        if (answer !== 'SI') {
            console.log('❌ Operazione annullata dall\'utente.');
            process.exit(0);
        }

        console.log('🚀 Procedo con la sincronizzazione forzata...');

        // Inizializza la connessione al database
        await db.initialize();

        // Esegui la sincronizzazione forzata
        console.log('📊 Esecuzione sincronizzazione forzata...');
        const result = await initializeDatabase(true, true, true, { confirmed: true }); // force=true, createModels=true, enableSync=true, confirmed=true

        if (result) {
            console.log('✅ Sincronizzazione forzata completata con successo!');
            console.log('🗑️  Tutti i dati sono stati eliminati e le tabelle ricreate.');
        } else {
            console.error('❌ Errore durante la sincronizzazione forzata del database.');
            process.exit(1);
        }

        // Chiudi la connessione al database
        await db.close();
        console.log('🔒 Connessione al database chiusa.');

    } catch (error) {
        console.error('💥 Errore durante l\'esecuzione dello script:', error);
        process.exit(1);
    }
};

// Esegui lo script
forceSync(); 