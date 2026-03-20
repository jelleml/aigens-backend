/**
 * Router per la gestione dei prompt
 * @module api/v1/prompts
 */

const express = require('express');
const router = express.Router();
const { Prompt } = require('../../database').sequelize.models;
const authMiddleware = require('../../middlewares/auth.middleware');
const { Op } = require('sequelize');

/**
 * @swagger
 * tags:
 *   name: Prompts
 *   description: API per la gestione dei template di prompt
 */

/**
 * @swagger
 * /api/v1/prompts:
 *   get:
 *     summary: Ottiene tutti i template di prompt dell'utente
 *     tags: [Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numero di pagina
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Numero di elementi per pagina
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Termine di ricerca per filtrare i prompt
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filtra per categoria
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: created_at
 *         description: Campo per ordinare i risultati
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Ordine dei risultati (ascendente o discendente)
 *     responses:
 *       200:
 *         description: Lista dei prompt recuperata con successo
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
 *                     prompts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           user_id:
 *                             type: integer
 *                           title:
 *                             type: string
 *                           content:
 *                             type: string
 *                           category:
 *                             type: string
 *                           is_public:
 *                             type: boolean
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get('/', authMiddleware.authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', category = '', sort = 'created_at', order = 'DESC' } = req.query;
    const offset = (page - 1) * limit;
    
    // Costruisci le condizioni di ricerca
    const whereConditions = {
      [Op.or]: [
        { user_id: req.user.id },
        { is_public: true }
      ]
    };
    
    if (search) {
      whereConditions[Op.and] = [
        {
          [Op.or]: [
            { title: { [Op.like]: `%${search}%` } },
            { content: { [Op.like]: `%${search}%` } }
          ]
        }
      ];
    }
    
    if (category) {
      if (!whereConditions[Op.and]) {
        whereConditions[Op.and] = [];
      }
      whereConditions[Op.and].push({ category });
    }
    
    // Ottieni i prompt con paginazione
    const { count, rows: prompts } = await Prompt.findAndCountAll({
      where: whereConditions,
      order: [[sort, order]],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.status(200).json({
      success: true,
      data: {
        prompts,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Errore nel recupero dei prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero dei prompt'
    });
  }
});

/**
 * @swagger
 * /api/v1/prompts/{id}:
 *   get:
 *     summary: Ottiene un template di prompt specifico
 *     tags: [Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del prompt
 *     responses:
 *       200:
 *         description: Prompt recuperato con successo
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
 *                     id:
 *                       type: integer
 *                     user_id:
 *                       type: integer
 *                     title:
 *                       type: string
 *                     content:
 *                       type: string
 *                     category:
 *                       type: string
 *                     is_public:
 *                       type: boolean
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Prompt non trovato
 *       500:
 *         description: Errore del server
 */
router.get('/:id', authMiddleware.authenticate, async (req, res) => {
  try {
    const prompt = await Prompt.findOne({
      where: {
        id: req.params.id,
        [Op.or]: [
          { user_id: req.user.id },
          { is_public: true }
        ]
      }
    });
    
    if (!prompt) {
      return res.status(404).json({
        success: false,
        error: 'Prompt non trovato'
      });
    }
    
    res.status(200).json({
      success: true,
      data: prompt
    });
  } catch (error) {
    console.error('Errore nel recupero del prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero del prompt'
    });
  }
});

/**
 * @swagger
 * /api/v1/prompts:
 *   post:
 *     summary: Crea un nuovo template di prompt
 *     tags: [Prompts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 description: Titolo del prompt
 *               content:
 *                 type: string
 *                 description: Contenuto del prompt
 *               category:
 *                 type: string
 *                 description: Categoria del prompt
 *               is_public:
 *                 type: boolean
 *                 description: Indica se il prompt è pubblico
 *                 default: false
 *     responses:
 *       201:
 *         description: Prompt creato con successo
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
 *                     id:
 *                       type: integer
 *                     user_id:
 *                       type: integer
 *                     title:
 *                       type: string
 *                     content:
 *                       type: string
 *                     category:
 *                       type: string
 *                     is_public:
 *                       type: boolean
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Dati non validi
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.post('/', authMiddleware.authenticate, async (req, res) => {
  try {
    const { title, content, category, is_public = false } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Titolo e contenuto sono obbligatori'
      });
    }
    
    const prompt = await Prompt.create({
      user_id: req.user.id,
      title,
      content,
      category: category || 'Generale',
      is_public
    });
    
    res.status(201).json({
      success: true,
      data: prompt
    });
  } catch (error) {
    console.error('Errore nella creazione del prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella creazione del prompt'
    });
  }
});

/**
 * @swagger
 * /api/v1/prompts/{id}:
 *   put:
 *     summary: Aggiorna un template di prompt esistente
 *     tags: [Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del prompt
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Titolo del prompt
 *               content:
 *                 type: string
 *                 description: Contenuto del prompt
 *               category:
 *                 type: string
 *                 description: Categoria del prompt
 *               is_public:
 *                 type: boolean
 *                 description: Indica se il prompt è pubblico
 *     responses:
 *       200:
 *         description: Prompt aggiornato con successo
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
 *                     id:
 *                       type: integer
 *                     user_id:
 *                       type: integer
 *                     title:
 *                       type: string
 *                     content:
 *                       type: string
 *                     category:
 *                       type: string
 *                     is_public:
 *                       type: boolean
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Prompt non trovato
 *       500:
 *         description: Errore del server
 */
router.put('/:id', authMiddleware.authenticate, async (req, res) => {
  try {
    const { title, content, category, is_public } = req.body;
    
    // Trova il prompt
    const prompt = await Prompt.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    });
    
    if (!prompt) {
      return res.status(404).json({
        success: false,
        error: 'Prompt non trovato'
      });
    }
    
    // Aggiorna i campi
    if (title !== undefined) prompt.title = title;
    if (content !== undefined) prompt.content = content;
    if (category !== undefined) prompt.category = category;
    if (is_public !== undefined) prompt.is_public = is_public;
    
    await prompt.save();
    
    res.status(200).json({
      success: true,
      data: prompt
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento del prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'aggiornamento del prompt'
    });
  }
});

/**
 * @swagger
 * /api/v1/prompts/{id}:
 *   delete:
 *     summary: Elimina un template di prompt
 *     tags: [Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del prompt
 *     responses:
 *       200:
 *         description: Prompt eliminato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Prompt eliminato con successo
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Prompt non trovato
 *       500:
 *         description: Errore del server
 */
router.delete('/:id', authMiddleware.authenticate, async (req, res) => {
  try {
    // Trova il prompt
    const prompt = await Prompt.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    });
    
    if (!prompt) {
      return res.status(404).json({
        success: false,
        error: 'Prompt non trovato'
      });
    }
    
    // Elimina il prompt
    await prompt.destroy();
    
    res.status(200).json({
      success: true,
      message: 'Prompt eliminato con successo'
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione del prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'eliminazione del prompt'
    });
  }
});

/**
 * @swagger
 * /api/v1/prompts/categories:
 *   get:
 *     summary: Ottiene le categorie dei template di prompt
 *     tags: [Prompts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Categorie recuperate con successo
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
 *                     type: string
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get('/categories', authMiddleware.authenticate, async (req, res) => {
  try {
    // Ottieni tutte le categorie uniche
    const categories = await Prompt.findAll({
      attributes: ['category'],
      where: {
        [Op.or]: [
          { user_id: req.user.id },
          { is_public: true }
        ]
      },
      group: ['category']
    });
    
    const categoryList = categories.map(cat => cat.category);
    
    res.status(200).json({
      success: true,
      data: categoryList
    });
  } catch (error) {
    console.error('Errore nel recupero delle categorie:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero delle categorie'
    });
  }
});

module.exports = router; 