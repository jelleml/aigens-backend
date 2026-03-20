/**
 * Router per la gestione dei modelli AI disponibili
 * @module api/v1/models
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const anthropicService = require('../../services/anthropic.service');
const deepseekService = require('../../services/deepseek.service');
const openaiService = require('../../services/openai.service');
const modelService = require('../../services/model.service');

/**
 * Converte le capabilities da stringa ad array
 * @param {string|Array} capabilities - Stringa o array delle capabilities
 * @returns {Array} Array delle capabilities
 */
const parseCapabilities = (capabilities) => {
  if (!capabilities) return [];

  // Se è già un array, lo restituiamo
  if (Array.isArray(capabilities)) return capabilities;

  // Se è un oggetto, lo convertiamo in stringa
  const capString = typeof capabilities === 'object' ?
    JSON.stringify(capabilities) : String(capabilities);

  try {
    // Prova a fare il parse come JSON
    return JSON.parse(capString);
  } catch (e) {
    // Se il parse fallisce, dividi la stringa per virgola
    return capString.split(',').map(cap => cap.trim()).filter(Boolean);
  }
};

/**
 * @swagger
 * tags:
 *   name: Models
 *   description: API per la gestione dei modelli AI disponibili
 */

/**
 * @swagger
 * /api/v1/models/frontend:
 *   get:
 *     summary: Ottiene tutti i modelli AI con informazioni complete per il frontend
 *     tags: [Models]
 *     responses:
 *       200:
 *         description: Lista di modelli con informazioni complete
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
 *                         type: integer
 *                       name:
 *                         type: string
 *                       display_name:
 *                         type: string
 *                       slug:
 *                         type: string
 *                       description:
 *                         type: string
 *                       provider:
 *                         type: string
 *                       capabilities:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             name:
 *                               type: string
 *                             type:
 *                               type: string
 *                             description:
 *                               type: string
 *                       pricing:
 *                         type: object
 *                         properties:
 *                           inputPricePerMillion:
 *                             type: number
 *                           outputPricePerMillion:
 *                             type: number
 *       500:
 *         description: Errore del server
 */
router.get('/frontend', async (req, res) => {
  try {
    // Ottieni i modelli unificati senza duplicati
    const models = await modelService.getUnifiedModels();

    // Mappa i modelli per il frontend
    const frontendModels = models.map(model => {
      const result = {
        id: model.id,
        name: model.name,
        display_name: model.display_name,
        model_name: model.model_name,
        slug: model.slug,
        description: model.description,
        provider: model.provider,
        capabilities: model.capabilities.map(cap => ({
          id: cap.id,
          name: cap.name,
          type: cap.type,
          visible: cap.visible,
          description: cap.description
        })),
        pricing: {
          inputPricePerMillion: model.pricing.cost_input,
          outputPricePerMillion: model.pricing.cost_output
        },
        is_aggregated: model.is_aggregated
      };

      // Add aggregator provider if applicable
      if (model.is_aggregated && model.aggregator_provider) {
        result.aggregator_provider = model.aggregator_provider;
      }

      return result;
    });

    res.status(200).json({
      success: true,
      data: frontendModels
    });
  } catch (error) {
    console.error('Errore nel recupero dei modelli per il frontend:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero dei modelli per il frontend'
    });
  }
});

/**
 * @swagger
 * /api/v1/models/public:
 *   get:
 *     summary: Ottiene tutti i modelli AI attivi (endpoint pubblico)
 *     tags: [Models]
 *     responses:
 *       200:
 *         description: Lista di modelli attivi
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
 *                       display_name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       provider:
 *                         type: string
 *                       capabilities:
 *                         type: array
 *                         items:
 *                           type: string
 *       500:
 *         description: Errore del server
 */
router.get('/public', async (req, res) => {
  try {
    // Ottieni i modelli unificati senza duplicati
    const models = await modelService.getUnifiedModels();

    // Mappa i modelli per includere solo le informazioni pubbliche
    const publicModels = models.map(model => {
      const result = {
        id: model.id,
        name: model.name,
        display_name: model.display_name,
        model_name: model.model_name,
        slug: model.slug,
        description: model.description,
        provider: model.provider,
        capabilities: model.capabilities.map(cap => cap.name),
        is_aggregated: model.is_aggregated
      };

      // Add aggregator provider if applicable
      if (model.is_aggregated && model.aggregator_provider) {
        result.aggregator_provider = model.aggregator_provider;
      }

      return result;
    });

    res.status(200).json({
      success: true,
      data: publicModels
    });
  } catch (error) {
    console.error('Errore nel recupero dei modelli pubblici:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero dei modelli pubblici'
    });
  }
});

/**
 * @swagger
 * /api/v1/models:
 *   get:
 *     summary: Ottiene tutti i modelli AI disponibili
 *     tags: [Models]
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
 *                       display_name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       provider:
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
 *                       price_image:
 *                         type: number
 *                         nullable: true
 *                         description: Prezzo per generazione immagine
 *                       price_video:
 *                         type: number
 *                         nullable: true
 *                         description: Prezzo per generazione video
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get('/', authMiddleware.authenticate, async (req, res) => {
  try {
    // Ottieni tutti i modelli unificati senza duplicati
    const models = await modelService.getUnifiedModels();

    // Mappa i modelli nel formato di risposta
    const formattedModels = models.map(model => {
      const result = {
        id: model.id,
        name: model.name,
        display_name: model.display_name,
        model_name: model.model_name,
        slug: model.slug,
        description: model.description,
        provider: model.provider,
        maxTokens: model.max_tokens,
        inputPricePerMillion: model.pricing.cost_input,
        outputPricePerMillion: model.pricing.cost_output,
        capabilities: model.capabilities.map(cap => cap.name),
        is_aggregated: model.is_aggregated,
        price_image: model.price_image,
        price_video: model.price_video
      };

      // Add aggregator provider if applicable
      if (model.is_aggregated && model.aggregator_provider) {
        result.aggregator_provider = model.aggregator_provider;
      }

      return result;
    });

    res.status(200).json({
      success: true,
      data: formattedModels
    });
  } catch (error) {
    console.error('Errore nel recupero dei modelli:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero dei modelli'
    });
  }
});

/**
 * @swagger
 * /api/v1/models/anthropic:
 *   get:
 *     summary: Ottiene i modelli AI disponibili di Anthropic
 *     tags: [Models]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista di modelli Anthropic disponibili
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
 *                       display_name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       provider:
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
router.get('/anthropic', authMiddleware.authenticate, async (req, res) => {
  try {
    const models = await anthropicService.getAvailableModels();

    res.status(200).json({
      success: true,
      data: models
    });
  } catch (error) {
    console.error('Errore nel recupero dei modelli Anthropic:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero dei modelli Anthropic'
    });
  }
});

/**
 * @swagger
 * /api/v1/models/deepseek:
 *   get:
 *     summary: Ottiene i modelli AI disponibili di Deepseek
 *     tags: [Models]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista di modelli Deepseek disponibili
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
 *                       display_name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       provider:
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
router.get('/deepseek', authMiddleware.authenticate, async (req, res) => {
  try {
    const models = await deepseekService.getAvailableModels();

    res.status(200).json({
      success: true,
      data: models
    });
  } catch (error) {
    console.error('Errore nel recupero dei modelli Deepseek:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero dei modelli Deepseek'
    });
  }
});

/**
 * @swagger
 * /api/v1/models/openai:
 *   get:
 *     summary: Ottiene i modelli AI disponibili di OpenAI
 *     tags: [Models]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista di modelli OpenAI disponibili
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
 *                       display_name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       provider:
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
router.get('/openai', authMiddleware.authenticate, async (req, res) => {
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

/**
 * @swagger
 * /api/v1/models/selection:
 *   get:
 *     summary: Ottiene i modelli AI con informazioni essenziali per la selezione
 *     tags: [Models]
 *     responses:
 *       200:
 *         description: Lista di modelli con informazioni essenziali per la selezione
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
 *                       name:
 *                         type: string
 *                       display_name:
 *                         type: string
 *                       provider:
 *                         type: string
 *                       capabilities:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             name:
 *                               type: string
 *                             type:
 *                               type: string
 *                             description:
 *                               type: string
 *       500:
 *         description: Errore del server
 */
router.get('/selection', async (req, res) => {
  try {
    const models = await modelService.getUnifiedModels();

    const selectionModels = models.map(model => ({
      name: model.name,
      display_name: model.display_name,
      provider: model.provider,
      capabilities: model.capabilities.filter(cap => cap.type === 'input').map(cap => ({
        id: cap.id,
        name: cap.name,
        type: cap.type,
        description: cap.description
      }))
    }));

    res.status(200).json({
      success: true,
      data: selectionModels
    });
  } catch (error) {
    console.error('Errore nel recupero dei modelli per la selezione:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero dei modelli per la selezione'
    });
  }
});

module.exports = router;