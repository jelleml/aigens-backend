'use strict';

const { getLogger } = require('../services/logging');
const logger = getLogger('add-auto-selector-fields', 'migration');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Verifica se il campo use_auto_selector esiste già nella tabella chats
        try {
            await queryInterface.addColumn('chats', 'use_auto_selector', {
                type: Sequelize.BOOLEAN,
                defaultValue: false,
                allowNull: false,
                comment: 'Indicates if the user is using auto-selector for model selection in this chat'
            });
            logger.info('✅ Campo use_auto_selector aggiunto alla tabella chats');
        } catch (error) {
            if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
                logger.info('ℹ️  Campo use_auto_selector già presente nella tabella chats');
            } else {
                throw error;
            }
        }

        // Verifica se il campo user_like esiste già nella tabella messages
        try {
            await queryInterface.addColumn('messages', 'user_like', {
                type: Sequelize.BOOLEAN,
                allowNull: true,
                comment: 'User feedback: true for like, false for dislike, null for no feedback'
            });
            logger.info('✅ Campo user_like aggiunto alla tabella messages');
        } catch (error) {
            if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
                logger.info('ℹ️  Campo user_like già presente nella tabella messages');
            } else {
                throw error;
            }
        }

        // Verifica se il campo user_dislike esiste già nella tabella messages
        try {
            await queryInterface.addColumn('messages', 'user_dislike', {
                type: Sequelize.BOOLEAN,
                allowNull: true,
                comment: 'User feedback: true for dislike, false for like, null for no feedback'
            });
            logger.info('✅ Campo user_dislike aggiunto alla tabella messages');
        } catch (error) {
            if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
                logger.info('ℹ️  Campo user_dislike già presente nella tabella messages');
            } else {
                throw error;
            }
        }
    },

    down: async (queryInterface, Sequelize) => {
        // Rimuovi i campi aggiunti (solo se esistono)
        try {
            await queryInterface.removeColumn('chats', 'use_auto_selector');
            logger.info('✅ Campo use_auto_selector rimosso dalla tabella chats');
        } catch (error) {
            logger.info('ℹ️  Campo use_auto_selector non trovato nella tabella chats');
        }

        try {
            await queryInterface.removeColumn('messages', 'user_like');
            logger.info('✅ Campo user_like rimosso dalla tabella messages');
        } catch (error) {
            logger.info('ℹ️  Campo user_like non trovato nella tabella messages');
        }

        try {
            await queryInterface.removeColumn('messages', 'user_dislike');
            logger.info('✅ Campo user_dislike rimosso dalla tabella messages');
        } catch (error) {
            logger.info('ℹ️  Campo user_dislike non trovato nella tabella messages');
        }
    }
}; 