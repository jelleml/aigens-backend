const express = require('express');
const router = express.Router();
const OpenRouterController = require('../controllers/openrouter.controller');

/**
 * @swagger
 * /openrouter/chat:
 *   post:
 *     summary: Invia una richiesta chat a OpenRouter
 *     tags: [OpenRouter]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               model:
 *                 type: string
 *               prompt:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *               chatId:
 *                 type: integer
 *               userId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Risposta generata dal modello OpenRouter
 *       400:
 *         description: Parametri mancanti o modello non supportato
 *       402:
 *         description: Fondi insufficienti
 *       500:
 *         description: Errore interno
 */
router.post('/chat', OpenRouterController.handleRequest);

/**
 * @swagger
 * /openrouter/estimate-cost:
 *   post:
 *     summary: Stima il costo di una richiesta OpenRouter
 *     tags: [OpenRouter]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               model:
 *                 type: string
 *               prompt:
 *                 type: string
 *     responses:
 *       200:
 *         description: Dettagli del costo stimato
 *       400:
 *         description: Parametri mancanti
 *       500:
 *         description: Errore interno
 */
router.post('/estimate-cost', OpenRouterController.estimateCost);

/**
 * @swagger
 * /openrouter/check-funds:
 *   post:
 *     summary: Verifica se l'utente ha fondi sufficienti per una richiesta OpenRouter
 *     tags: [OpenRouter]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: integer
 *               estimatedCost:
 *                 type: number
 *     responses:
 *       200:
 *         description: Esito della verifica fondi
 *       400:
 *         description: Parametri mancanti
 *       500:
 *         description: Errore interno
 */
router.post('/check-funds', OpenRouterController.checkFunds);

module.exports = router; 