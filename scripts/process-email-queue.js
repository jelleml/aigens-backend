#!/usr/bin/env node

require('dotenv').config();
const EmailerService = require('../services/emailer.service');

/**
 * Script per processare le email in coda
 * Uso: node scripts/process-email-queue.js
 */

async function processEmailQueue() {
    try {
        console.log('🔄 Avvio processamento coda email...');

        const emailer = new EmailerService({
            enableFallback: true,
            enableQueue: true
        });

        // Mostra statistiche iniziali
        const initialStats = await emailer.getQueueStats();
        console.log('📊 Statistiche iniziali:', initialStats);

        if (initialStats.totalQueued === 0) {
            console.log('✅ Nessuna email in coda da processare');
            return;
        }

        // Processa le email in coda
        const results = await emailer.processQueuedEmails();

        console.log(`📧 Processate ${results.length} email dalla coda`);

        // Mostra risultati
        let successCount = 0;
        let failureCount = 0;

        results.forEach(result => {
            if (result.success) {
                successCount++;
                console.log(`✅ ${result.queueId}: ${result.message}`);
            } else {
                failureCount++;
                console.log(`❌ ${result.queueId}: ${result.message || result.error}`);
            }
        });

        console.log(`\n📊 Risultati finali:`);
        console.log(`✅ Successi: ${successCount}`);
        console.log(`❌ Fallimenti: ${failureCount}`);

        // Mostra statistiche finali
        const finalStats = await emailer.getQueueStats();
        console.log('📊 Statistiche finali:', finalStats);

    } catch (error) {
        console.error('❌ Errore durante il processamento della coda:', error.message);
        process.exit(1);
    }
}

// Esegui se chiamato direttamente
if (require.main === module) {
    processEmailQueue();
}

module.exports = { processEmailQueue }; 