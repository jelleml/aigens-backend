const express = require('express');
const router = express.Router();
const deepseekController = require('../controllers/deepseek.controller');
const authMiddleware = require('../middlewares/auth.middleware');

/**
 * @swagger
 * tags:
 *   name: Deepseek
 *   description: API per interagire con i modelli di Deepseek
 */

/**
 * @swagger
 * /api/v1/deepseek/request:
 *   post:
 *     summary: Invia una richiesta a Deepseek
 *     tags: [Deepseek]
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
 *               - messages
 *             properties:
 *               model:
 *                 type: string
 *                 description: Il modello di Deepseek da utilizzare
 *                 example: deepseek-chat
 *               messages:
 *                 type: array
 *                 description: Array di messaggi per la conversazione
 *                 items:
 *                   type: object
 *                   required:
 *                     - role
 *                     - content
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant, system]
 *                       description: Il ruolo del messaggio
 *                     content:
 *                       type: string
 *                       description: Il contenuto del messaggio
 *               max_tokens:
 *                 type: integer
 *                 description: Numero massimo di token da generare
 *                 example: 1000
 *               temperature:
 *                 type: number
 *                 description: Temperatura per la generazione del testo
 *                 example: 0.7
 *     responses:
 *       200:
 *         description: Risposta generata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: ID della risposta
 *                 choices:
 *                   type: array
 *                   description: Array di scelte generate
 *                   items:
 *                     type: object
 *                     properties:
 *                       message:
 *                         type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                           content:
 *                             type: string
 *                 usage:
 *                   type: object
 *                   properties:
 *                     prompt_tokens:
 *                       type: integer
 *                     completion_tokens:
 *                       type: integer
 *                     total_tokens:
 *                       type: integer
 *       400:
 *         description: Parametri della richiesta non validi
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.post('/request', authMiddleware.authenticate, deepseekController.handleRequest);

/**
 * @swagger
 * /api/v1/deepseek/estimate-cost:
 *   post:
 *     summary: Calcola una stima del costo di una richiesta
 *     tags: [Deepseek]
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
 *               - input_tokens
 *               - output_tokens
 *             properties:
 *               model:
 *                 type: string
 *                 description: Il modello di Deepseek da utilizzare
 *                 example: deepseek-chat
 *               input_tokens:
 *                 type: integer
 *                 description: Numero di token in input
 *                 example: 500
 *               output_tokens:
 *                 type: integer
 *                 description: Numero stimato di token in output
 *                 example: 1000
 *     responses:
 *       200:
 *         description: Stima del costo calcolata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 estimated_cost:
 *                   type: number
 *                   description: Costo stimato in USD
 *                 input_cost:
 *                   type: number
 *                   description: Costo dei token in input
 *                 output_cost:
 *                   type: number
 *                   description: Costo dei token in output
 *       400:
 *         description: Parametri della richiesta non validi
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.post('/estimate-cost', authMiddleware.authenticate, deepseekController.estimateCost);

/**
 * @swagger
 * /api/v1/deepseek/check-funds:
 *   post:
 *     summary: Verifica se l'utente ha fondi sufficienti per una richiesta
 *     tags: [Deepseek]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - estimated_cost
 *             properties:
 *               estimated_cost:
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
 *                 has_sufficient_funds:
 *                   type: boolean
 *                   description: Indica se l'utente ha fondi sufficienti
 *                 current_balance:
 *                   type: number
 *                   description: Saldo attuale dell'utente
 *                 required_amount:
 *                   type: number
 *                   description: Importo richiesto per la transazione
 *       400:
 *         description: Parametri della richiesta non validi
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.post('/check-funds', authMiddleware.authenticate, deepseekController.checkFunds);

module.exports = router; 