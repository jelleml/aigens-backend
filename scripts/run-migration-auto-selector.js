#!/usr/bin/env node

/**
 * Script per eseguire la migrazione che aggiunge i campi use_auto_selector e user_like/user_dislike
 */

const { sequelize } = require('../database');
const path = require('path');
const { getLogger } = require('../services/logging');
const logger = getLogger('run-migration-auto-selector', 'script');

async function runMigration() {
    try {
        logger.info('🚀 Avvio migrazione per aggiungere campi auto-selector e feedback...');

        // Importa la migrazione
        const migration = require('../migrations/20250115000000-add-auto-selector-and-feedback-fields');

        // Esegui la migrazione
        await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize);

        logger.info('✅ Migrazione completata con successo!');
        logger.info('📝 Campi aggiunti:');
        logger.info('   - chats.use_auto_selector (BOOLEAN, default: false)');
        logger.info('   - messages.user_like (BOOLEAN, nullable)');
        logger.info('   - messages.user_dislike (BOOLEAN, nullable)');

    } catch (error) {
        logger.error('❌ Errore durante la migrazione:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

// Esegui lo script
runMigration(); 