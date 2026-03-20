#!/usr/bin/env node

/**
 * Script per eseguire la sincronizzazione manuale del database
 * Questo script permette di aggiornare gli indici e la struttura delle tabelle
 * senza dover riavviare il server
 */

const { initializeDatabase } = require('../config/database');
const db = require('../database');

const startSync = async () => {
    try {
        console.log('🚀 Avvio sincronizzazione manuale del database...');

        // Inizializza la connessione al database
        await db.initialize();

        // Esegui la sincronizzazione con alter=true per aggiornare indici e struttura
        console.log('📊 Esecuzione sincronizzazione con alter=true...');
        const result = await initializeDatabase(false, true, true); // force=false, createModels=true, enableSync=true

        if (result) {
            console.log('✅ Sincronizzazione completata con successo!');
            console.log('📝 Gli indici e la struttura delle tabelle sono stati aggiornati.');
        } else {
            console.error('❌ Errore durante la sincronizzazione del database.');
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
startSync(); 