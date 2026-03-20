const express = require('express');
const router = express.Router();
const messageRecovery = require('../../services/message-recovery.service');
const authMiddleware = require('../../middlewares/auth.middleware');
const { body, param, query, validationResult } = require('express-validator');

/**
 * @swagger
 * /api/v1/message-recovery/incomplete:
 *   get:
 *     summary: Ottiene la lista dei messaggi incompleti dell'utente
 *     tags: [Message Recovery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Numero massimo di messaggi da restituire
 *     responses:
 *       200:
 *         description: Lista dei messaggi incompleti
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       chat_id:
 *                         type: integer
 *                       role:
 *                         type: string
 *                       content:
 *                         type: string
 *                       is_complete:
 *                         type: boolean
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       Chat:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           title:
 *                             type: string
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get('/incomplete',
    authMiddleware.authenticate,
    [
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit deve essere tra 1 e 100')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const userId = req.user.id;
            const limit = parseInt(req.query.limit) || 50;

            const incompleteMessages = await messageRecovery.getIncompleteMessages(userId, limit);

            res.json({
                success: true,
                data: incompleteMessages.map(msg => ({
                    id: msg.id,
                    chat_id: msg.chat_id,
                    role: msg.role,
                    content: msg.content,
                    is_complete: msg.is_complete,
                    created_at: msg.created_at,
                    Chat: msg.Chat ? {
                        id: msg.Chat.id,
                        title: msg.Chat.title
                    } : null
                }))
            });
        } catch (error) {
            console.error('Errore nel recuperare messaggi incompleti:', error);
            res.status(500).json({
                success: false,
                error: 'Errore interno del server',
                details: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/v1/message-recovery/incomplete/{messageId}:
 *   get:
 *     summary: Recupera dettagli di un messaggio incompleto specifico
 *     tags: [Message Recovery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del messaggio incompleto
 *     responses:
 *       200:
 *         description: Dettagli del messaggio incompleto
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Messaggio non trovato
 *       500:
 *         description: Errore del server
 */
router.get('/incomplete/:messageId',
    authMiddleware.authenticate,
    [
        param('messageId').isInt().withMessage('ID messaggio deve essere un numero intero')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const userId = req.user.id;
            const messageId = parseInt(req.params.messageId);

            const message = await messageRecovery.getIncompleteMessage(messageId, userId);

            res.json({
                success: true,
                data: message
            });
        } catch (error) {
            if (error.message.includes('non trovato')) {
                return res.status(404).json({
                    success: false,
                    error: 'Messaggio incompleto non trovato'
                });
            }

            console.error('Errore nel recuperare messaggio incompleto:', error);
            res.status(500).json({
                success: false,
                error: 'Errore interno del server'
            });
        }
    }
);

/**
 * @swagger
 * /api/v1/message-recovery/rerun/{messageId}:
 *   post:
 *     summary: Esegue il re-run di un messaggio utente incompleto
 *     description: |
 *       Esegue il re-run di un messaggio utente incompleto per ottenere una nuova risposta dall'AI.
 *       Solo i messaggi utente (role: 'user') che sono marcati come incompleti possono essere re-runned.
 *     tags: [Message Recovery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del messaggio utente incompleto da re-runnare
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               model:
 *                 type: string
 *                 description: Modello AI da utilizzare per il re-run (opzionale)
 *     responses:
 *       200:
 *         description: Re-run completato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     messageId:
 *                       type: integer
 *                       description: ID del nuovo messaggio assistente generato
 *                     content:
 *                       type: string
 *                       description: Contenuto della risposta dell'AI
 *                     cost:
 *                       type: number
 *                       description: Costo dell'operazione
 *                     usage:
 *                       type: object
 *                       description: Statistiche di utilizzo dei token
 *                     rerunFrom:
 *                       type: integer
 *                       description: ID del messaggio utente originale re-runnato
 *       400:
 *         description: Richiesta non valida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Tipo di messaggio non valido"
 *                 details:
 *                   type: string
 *                   example: "Il messaggio 3 è un messaggio dell'assistente (role: assistant). Solo i messaggi utente possono essere re-runned."
 *       401:
 *         description: Non autorizzato
 *       403:
 *         description: Accesso negato
 *       404:
 *         description: Messaggio non trovato
 *       500:
 *         description: Errore del server
 */
router.post('/rerun/:messageId',
    authMiddleware.authenticate,
    [
        param('messageId').isInt().withMessage('ID messaggio deve essere un numero intero'),
        body('model').optional().isString().withMessage('Modello deve essere una stringa')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const userId = req.user.id;
            const messageId = parseInt(req.params.messageId);
            const { model } = req.body;

            // Prepara i dati per il re-run
            const rerunData = await messageRecovery.prepareMessageForRerun(messageId, userId);

            // Se è stato specificato un nuovo modello, usalo
            if (model) {
                rerunData.model = model;
            }

            // Importa il servizio appropriato in base al modello
            let service;
            if (rerunData.model.includes('deepseek')) {
                service = require('../../services/deepseek.service');
            } else if (rerunData.model.includes('claude')) {
                service = require('../../services/anthropic.service');
            } else if (rerunData.model.includes('gpt')) {
                service = require('../../services/openai.service');
            } else {
                // Default a OpenRouter per modelli sconosciuti
                service = require('../../services/openrouter.service');
            }

            // Esegui il re-run
            const result = await service.sendRequest(
                rerunData.prompt,
                rerunData.model,
                rerunData.userId,
                rerunData.chatId,
                rerunData.agentType,
                rerunData.attachments
            );

            res.json({
                success: true,
                data: {
                    messageId: result.messageId,
                    content: result.content,
                    cost: result.cost,
                    usage: result.usage,
                    rerunFrom: messageId
                }
            });
        } catch (error) {
            console.error('Errore nel re-run del messaggio:', error);

            // Gestione specifica degli errori
            if (error.message.includes('non trovato')) {
                return res.status(404).json({
                    success: false,
                    error: 'Messaggio non trovato',
                    details: error.message
                });
            }

            if (error.message.includes('non appartiene all\'utente')) {
                return res.status(403).json({
                    success: false,
                    error: 'Accesso negato',
                    details: error.message
                });
            }

            if (error.message.includes('è un messaggio dell\'assistente')) {
                return res.status(400).json({
                    success: false,
                    error: 'Tipo di messaggio non valido',
                    details: error.message
                });
            }

            if (error.message.includes('è già completo')) {
                return res.status(400).json({
                    success: false,
                    error: 'Messaggio già completo',
                    details: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Errore interno del server durante il re-run',
                details: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/v1/message-recovery/stats:
 *   get:
 *     summary: Ottiene statistiche sui messaggi incompleti
 *     tags: [Message Recovery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistiche sui messaggi incompleti
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalIncomplete:
 *                       type: integer
 *                     incompleteOlderThan1Day:
 *                       type: integer
 *                     incompleteOlderThan7Days:
 *                       type: integer
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get('/stats',
    authMiddleware.authenticate,
    async (req, res) => {
        try {
            const stats = await messageRecovery.getIncompleteMessagesStats();

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Errore nel recuperare statistiche:', error);
            res.status(500).json({
                success: false,
                error: 'Errore interno del server'
            });
        }
    }
);

/**
 * @swagger
 * /api/v1/message-recovery/cleanup:
 *   post:
 *     summary: Pulisce i messaggi incompleti vecchi
 *     tags: [Message Recovery]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               daysOld:
 *                 type: integer
 *                 default: 7
 *                 description: Numero di giorni per considerare un messaggio vecchio
 *     responses:
 *       200:
 *         description: Pulizia completata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     cleanedCount:
 *                       type: integer
 *       400:
 *         description: Richiesta non valida
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.post('/cleanup',
    authMiddleware.authenticate,
    [
        body('daysOld').optional().isInt({ min: 1, max: 30 }).withMessage('DaysOld deve essere tra 1 e 30')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const daysOld = parseInt(req.body.daysOld) || 7;
            const cleanedCount = await messageRecovery.cleanupOldIncompleteMessages(daysOld);

            res.json({
                success: true,
                data: {
                    cleanedCount,
                    daysOld
                }
            });
        } catch (error) {
            console.error('Errore nella pulizia messaggi:', error);
            res.status(500).json({
                success: false,
                error: 'Errore interno del server'
            });
        }
    }
);

module.exports = router; 