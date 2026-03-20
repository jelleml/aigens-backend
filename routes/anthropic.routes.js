const express = require('express');
const router = express.Router();
const anthropicController = require('../controllers/anthropic.controller');
const authMiddleware = require('../middlewares/auth.middleware');

/**
 * @swagger
 * tags:
 *   name: Anthropic
 *   description: API per interagire con i modelli di Anthropic
 */

/**
 * @swagger
 * /api/v1/anthropic/request:
 *   post:
 *     summary: Invia una richiesta ad Anthropic
 *     tags: [Anthropic]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - model
 *               - prompt
 *               - chatId
 *               - userId
 *             properties:
 *               model:
 *                 type: string
 *                 description: Il modello di Anthropic da utilizzare
 *                 example: claude-3-haiku-20240307
 *               prompt:
 *                 type: string
 *                 description: Il testo della richiesta da inviare al modello
 *               chatId:
 *                 type: string
 *                 description: ID della chat corrente
 *               userId:
 *                 type: string
 *                 description: ID dell'utente che effettua la richiesta
 *               attachments:
 *                 type: array
 *                 description: Array di allegati (opzionale)
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Risposta generata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       400:
 *         description: Parametri della richiesta non validi
 *       401:
 *         description: Non autorizzato
 *       402:
 *         description: Fondi insufficienti
 *       500:
 *         description: Errore del server
 */
router.post('/request', authMiddleware.authenticate, anthropicController.handleRequest);

/**
 * @swagger
 * /api/v1/anthropic/estimate-cost:
 *   post:
 *     summary: Calcola una stima del costo di una richiesta
 *     tags: [Anthropic]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - model
 *               - prompt
 *             properties:
 *               model:
 *                 type: string
 *                 description: Il modello di Anthropic da utilizzare
 *                 example: claude-3-haiku-20240307
 *               prompt:
 *                 type: string
 *                 description: Il testo della richiesta per cui stimare il costo
 *     responses:
 *       200:
 *         description: Stima del costo calcolata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     estimated_tokens:
 *                       type: integer
 *                       description: Stima del numero di token nel prompt
 *                     cost_details:
 *                       type: object
 *                       description: Dettagli sul costo stimato
 *       400:
 *         description: Parametri della richiesta non validi
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.post('/estimate-cost', authMiddleware.authenticate, anthropicController.estimateCost);

/**
 * @swagger
 * /api/v1/anthropic/check-funds:
 *   post:
 *     summary: Verifica se l'utente ha fondi sufficienti per una richiesta
 *     tags: [Anthropic]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - estimatedCost
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID dell'utente di cui verificare i fondi
 *               estimatedCost:
 *                 type: number
 *                 description: Costo stimato della richiesta
 *                 example: 0.05
 *     responses:
 *       200:
 *         description: Verifica completata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     has_sufficient_funds:
 *                       type: boolean
 *                       description: Indica se l'utente ha fondi sufficienti
 *       400:
 *         description: Parametri della richiesta non validi
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.post('/check-funds', authMiddleware.authenticate, anthropicController.checkFunds);

module.exports = router; 