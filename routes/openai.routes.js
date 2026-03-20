/**
 * Router per le API di OpenAI
 * @module routes/openai.routes
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const openaiService = require('../services/openai.service');

/**
 * @swagger
 * tags:
 *   name: OpenAI
 *   description: API per interagire con i servizi OpenAI
 */

/**
 * @swagger
 * /api/v1/openai/models:
 *   get:
 *     summary: Ottiene i modelli disponibili di OpenAI
 *     tags: [OpenAI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista di modelli disponibili
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       maxTokens:
 *                         type: integer
 *                       inputPricePerMillion:
 *                         type: number
 *                       outputPricePerMillion:
 *                         type: number
 *                       capabilities:
 *                         type: array
 *                         items:
 *                           type: string
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get('/models', authMiddleware.authenticate, async (req, res) => {
  try {
    const models = await openaiService.getAvailableModels();
    
    res.status(200).json({
      success: true,
      data: models
    });
  } catch (error) {
    console.error('Errore nel recupero dei modelli OpenAI:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero dei modelli OpenAI'
    });
  }
});

module.exports = router; 