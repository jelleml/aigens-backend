const { Op } = require('sequelize');

/**
 * Servizio per la gestione dei messaggi incompleti e il loro recupero
 */
class MessageRecoveryService {
    constructor() {
        this.logger = console; // In futuro si può sostituire con un logger più sofisticato
    }

    /**
     * Ottiene i modelli del database
     * @returns {Object} Modelli del database
     */
    getModels() {
        const db = require('../database');
        // Assicurati che il database sia inizializzato
        if (!db.initialized) {
            throw new Error('Database non inizializzato. Chiamare db.initialize() prima di utilizzare i modelli.');
        }
        return db.models;
    }

    /**
     * Marca un messaggio come incompleto
     * @param {number} messageId - ID del messaggio
     * @param {string} error - Errore che ha causato l'incompletezza
     * @returns {Promise<Object>} Messaggio aggiornato
     */
    async markMessageAsIncomplete(messageId, error = null) {
        try {
            const { Message } = this.getModels();
            const message = await Message.findByPk(messageId);
            if (!message) {
                throw new Error(`Messaggio con ID ${messageId} non trovato`);
            }

            await message.update({
                is_complete: false,
                content: error ? `[ERRORE: ${error}]` : message.content
            });

            this.logger.warn(`Messaggio ${messageId} marcato come incompleto: ${error}`);
            return message;
        } catch (error) {
            this.logger.error(`Errore nel marcare messaggio ${messageId} come incompleto:`, error);
            throw error;
        }
    }

    /**
     * Marca un messaggio come completo
     * @param {number} messageId - ID del messaggio
     * @param {string} content - Contenuto del messaggio
     * @returns {Promise<Object>} Messaggio aggiornato
     */
    async markMessageAsComplete(messageId, content) {
        try {
            const { Message } = this.getModels();
            const message = await Message.findByPk(messageId);
            if (!message) {
                throw new Error(`Messaggio con ID ${messageId} non trovato`);
            }

            await message.update({
                is_complete: true,
                content: content
            });

            this.logger.info(`Messaggio ${messageId} marcato come completo`);
            return message;
        } catch (error) {
            this.logger.error(`Errore nel marcare messaggio ${messageId} come completo:`, error);
            throw error;
        }
    }

    /**
     * Recupera tutti i messaggi incompleti di un utente
     * @param {number} userId - ID dell'utente
     * @param {number} limit - Limite di risultati
     * @returns {Promise<Array>} Array di messaggi incompleti
     */
    async getIncompleteMessages(userId, limit = 50) {
        try {
            const { Message, Chat, Attachment } = this.getModels();
            const messages = await Message.findAll({
                include: [
                    {
                        model: Chat,
                        where: { user_id: userId },
                        attributes: ['id', 'title']
                    },
                    {
                        model: Attachment,
                        attributes: ['id', 'original_name', 'file_path', 'mime_type']
                    }
                ],
                where: {
                    is_complete: false,
                    role: 'user' // Solo messaggi utente possono essere re-runned
                },
                order: [['created_at', 'DESC']],
                limit: limit
            });

            return messages;
        } catch (error) {
            this.logger.error(`Errore nel recuperare messaggi incompleti per utente ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Recupera un messaggio incompleto specifico con tutti i dettagli
     * @param {number} messageId - ID del messaggio
     * @param {number} userId - ID dell'utente (per sicurezza)
     * @returns {Promise<Object>} Messaggio con dettagli completi
     */
    async getIncompleteMessage(messageId, userId) {
        try {
            const { Message, Chat, Attachment, MessageCost } = this.getModels();

            // Prima verifica se il messaggio esiste
            const message = await Message.findByPk(messageId);
            if (!message) {
                throw new Error(`Messaggio con ID ${messageId} non trovato`);
            }

            // Verifica se il messaggio appartiene a una chat dell'utente
            const chat = await Chat.findByPk(message.chat_id);
            if (!chat || chat.user_id !== userId) {
                throw new Error(`Messaggio ${messageId} non appartiene all'utente ${userId}`);
            }

            // Verifica se è un messaggio utente
            if (message.role !== 'user') {
                throw new Error(`Il messaggio ${messageId} è un messaggio dell'assistente (role: ${message.role}). Solo i messaggi utente possono essere re-runned.`);
            }

            // Verifica se è incompleto
            if (message.is_complete) {
                throw new Error(`Il messaggio ${messageId} è già completo e non può essere re-runned.`);
            }

            // Ora recupera il messaggio con tutti i dettagli
            const incompleteMessage = await Message.findOne({
                include: [
                    {
                        model: Chat,
                        where: { user_id: userId },
                        attributes: ['id', 'title', 'user_id']
                    },
                    {
                        model: Attachment,
                        attributes: ['id', 'original_name', 'file_path', 'mime_type', 'file_size']
                    },
                    {
                        model: MessageCost,
                        attributes: ['id', 'total_cost', 'input_tokens', 'output_tokens']
                    }
                ],
                where: {
                    id: messageId,
                    is_complete: false,
                    role: 'user'
                }
            });

            if (!incompleteMessage) {
                throw new Error(`Messaggio incompleto ${messageId} non trovato per l'utente ${userId}`);
            }

            return incompleteMessage;
        } catch (error) {
            this.logger.error(`Errore nel recuperare messaggio incompleto ${messageId}:`, error);
            throw error;
        }
    }

    /**
     * Prepara i dati per il re-run di un messaggio incompleto
     * @param {number} messageId - ID del messaggio incompleto
     * @param {number} userId - ID dell'utente
     * @returns {Promise<Object>} Dati per il re-run
     */
    async prepareMessageForRerun(messageId, userId) {
        try {
            const { Message, Attachment } = this.getModels();

            // Trova il messaggio utente incompleto
            const userMessage = await this.getIncompleteMessage(messageId, userId);

            // Trova il messaggio assistente corrispondente (se esiste)
            const assistantMessage = await Message.findOne({
                where: {
                    chat_id: userMessage.chat_id,
                    role: 'assistant',
                    created_at: {
                        [Op.gt]: userMessage.created_at
                    }
                },
                include: [
                    {
                        model: Attachment,
                        attributes: ['id', 'original_name', 'file_path', 'mime_type', 'file_size']
                    }
                ],
                order: [['created_at', 'ASC']],
                limit: 1
            });

            return {
                userMessage,
                assistantMessage, // Potrebbe essere null se non c'è ancora una risposta
                chatId: userMessage.chat_id,
                userId: userId,
                prompt: userMessage.content,
                attachments: userMessage.Attachments || [],
                model: userMessage.agent_model || 'gpt-3.5-turbo',
                agentType: userMessage.agent_type || 'chat'
            };
        } catch (error) {
            this.logger.error(`Errore nella preparazione re-run per messaggio ${messageId}:`, error);
            throw error;
        }
    }

    /**
     * Pulisce i messaggi incompleti vecchi (più di 7 giorni)
     * @param {number} daysOld - Numero di giorni per considerare un messaggio vecchio
     * @returns {Promise<number>} Numero di messaggi puliti
     */
    async cleanupOldIncompleteMessages(daysOld = 7) {
        try {
            const { Message } = this.getModels();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const result = await Message.update(
                {
                    is_complete: true,
                    content: '[MESSAGGIO PULITO - Troppo vecchio per il re-run]'
                },
                {
                    where: {
                        is_complete: false,
                        role: 'user',
                        created_at: {
                            [Op.lt]: cutoffDate
                        }
                    }
                }
            );

            const cleanedCount = result[0];
            this.logger.info(`Puliti ${cleanedCount} messaggi incompleti vecchi (più di ${daysOld} giorni)`);

            return cleanedCount;
        } catch (error) {
            this.logger.error('Errore nella pulizia messaggi incompleti vecchi:', error);
            throw error;
        }
    }

    /**
     * Ottiene statistiche sui messaggi incompleti
     * @returns {Promise<Object>} Statistiche
     */
    async getIncompleteMessagesStats() {
        try {
            const { Message } = this.getModels();
            const stats = await Message.findAll({
                attributes: [
                    [Message.sequelize.fn('COUNT', Message.sequelize.col('id')), 'total_incomplete'],
                    [Message.sequelize.fn('COUNT',
                        Message.sequelize.literal('CASE WHEN created_at < DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 END')
                    ), 'incomplete_older_than_1_day'],
                    [Message.sequelize.fn('COUNT',
                        Message.sequelize.literal('CASE WHEN created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END')
                    ), 'incomplete_older_than_7_days']
                ],
                where: {
                    is_complete: false,
                    role: 'user'
                }
            });

            return {
                totalIncomplete: parseInt(stats[0].dataValues.total_incomplete) || 0,
                incompleteOlderThan1Day: parseInt(stats[0].dataValues.incomplete_older_than_1_day) || 0,
                incompleteOlderThan7Days: parseInt(stats[0].dataValues.incomplete_older_than_7_days) || 0
            };
        } catch (error) {
            this.logger.error('Errore nel recuperare statistiche messaggi incompleti:', error);
            throw error;
        }
    }
}

module.exports = new MessageRecoveryService(); 