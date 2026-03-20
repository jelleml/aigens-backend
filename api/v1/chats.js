/**
 * Router per la gestione delle chat
 * @module api/v1/chats
 */

const express = require('express');
const router = express.Router();
const db = require('../../database');
const { Chat, Message, Attachment, MessageCost, Folder } = db.models;
const authMiddleware = require('../../middlewares/auth.middleware');
const { Op } = require('sequelize');
const messagesRouter = require('./messages');

// Registra il router dei messaggi come router annidato
router.use('/:chatId/messages', messagesRouter);

/**
 * @swagger
 * /api/v1/chats:
 *   get:
 *     summary: Ottiene tutte le chat dell'utente autenticato
 *     tags: [Chats]
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
 *         description: Termine di ricerca per filtrare le chat
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: last_message_at
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
 *         description: Lista delle chat recuperata con successo
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
 *                     chats:
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
 *                           agent_type:
 *                             type: string
 *                           agent_model:
 *                             type: string
 *                           is_active:
 *                             type: boolean
 *                           last_message_at:
 *                             type: string
 *                             format: date-time
 *                           Messages:
 *                             type: array
 *                             items:
 *                               type: object
 *                           folder:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                               parent_id:
 *                                 type: string
 *                                 format: uuid
 *                                 nullable: true
 *                           is_pinned:
 *                             type: boolean
 *                           models_providers:
 *                             type: array
 *                             description: Array dei modelli distinti utilizzati in questa specifica chat
 *                             items:
 *                               type: object
 *                               properties:
 *                                 model_id:
 *                                   type: integer
 *                                   description: ID del modello
 *                                 model_name:
 *                                   type: string
 *                                   description: Nome del modello
 *                                 model_slug:
 *                                   type: string
 *                                   description: Slug del modello
 *                                 provider_id:
 *                                   type: integer
 *                                   description: ID del provider
 *                                 provider_name:
 *                                   type: string
 *                                   description: Nome del provider
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
    // console.log('Contenuto di req.user in chats.js:', req.user);

    const { page = 1, limit = 10, search = '', sort = 'last_message_at', order = 'DESC' } = req.query;
    const offset = (page - 1) * limit;

    // Costruisci le condizioni di ricerca
    const whereConditions = {
      user_id: req.user.id,
      is_active: true
    };

    if (search) {
      whereConditions.title = {
        [Op.like]: `%${search}%`
      };
    }

    // Ottieni le chat con paginazione
    const { count, rows: chats } = await Chat.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: Message,
          as: 'Messages',
          limit: 1,
          order: [['created_at', 'DESC']],
          attributes: [
            'id', 'chat_id', 'role', 'content', 'agent_type', 'agent_model',
            'tokens_used', 'cost', 'media_url', 'media_type', 'created_at',
            'updated_at', 'is_complete', 'user_like', 'user_dislike'
          ],
          include: [
            {
              model: Attachment,
              attributes: ['id', 'file_type', 'file_name', 'file_path']
            }
          ]
        },
        {
          association: 'sharedUsers',
          attributes: [],
          through: {
            attributes: ['is_pinned'],
            where: { user_id: req.user.id }
          },
          required: false
        },
        {
          model: Folder,
          attributes: ['id', 'name', 'parent_id'],
          through: {
            attributes: []
          },
          required: false
        }
      ],
      order: [[sort, order]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    // Ottieni i modelli e provider per ogni chat
    const chatIds = chats.map(chat => chat.id);
    let chatModelsProviders = {};

    if (chatIds.length > 0) {
      const modelsProvidersResult = await db.sequelize.query(`
        SELECT DISTINCT 
          c.id as chat_id,
          m.id as model_id,
          m.name as model_name,
          m.model_slug,
          p.id as provider_id,
          p.name as provider_name
        FROM chats c
        INNER JOIN messages msg ON c.id = msg.chat_id
        INNER JOIN message_costs mc ON msg.id = mc.message_id
        INNER JOIN models m ON mc.model_id = m.id
        INNER JOIN providers p ON m.id_provider = p.id
        WHERE c.id IN (:chatIds)
          AND c.user_id = :userId 
          AND c.is_active = true
        ORDER BY c.id, p.name, m.name
      `, {
        replacements: { chatIds, userId: req.user.id },
        type: db.sequelize.QueryTypes.SELECT
      });

      // Raggruppa i risultati per chat_id
      modelsProvidersResult.forEach(row => {
        if (!chatModelsProviders[row.chat_id]) {
          chatModelsProviders[row.chat_id] = [];
        }
        chatModelsProviders[row.chat_id].push({
          model_id: row.model_id,
          model_name: row.model_name,
          model_slug: row.model_slug,
          provider_id: row.provider_id,
          provider_name: row.provider_name
        });
      });
    }

    // Ottieni lo stato del pin per tutte le chat
    const userChatsModel = require('../../database').sequelize.models.user_chats;
    const pinnedChats = await userChatsModel.findAll({
      where: {
        user_id: req.user.id,
        chat_id: chatIds,
        is_pinned: true
      },
      attributes: ['chat_id']
    });

    const pinnedChatIds = new Set(pinnedChats.map(pc => pc.chat_id));

    // Add is_pinned, folder info and models_providers to each chat
    const chatsWithPinned = chats.map(chat => {
      const chatJson = chat.toJSON();
      return {
        ...chatJson,
        is_pinned: pinnedChatIds.has(chat.id),
        folder: chatJson.Folders && chatJson.Folders.length > 0 ? chatJson.Folders[0] : null,
        models_providers: chatModelsProviders[chat.id] || []
      };
    });

    // ORDINA: pinned alfabetico, poi unpinned alfabetico
    chatsWithPinned.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
    });

    res.status(200).json({
      success: true,
      data: {
        chats: chatsWithPinned,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Errore nel recupero delle chat:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero delle chat'
    });
  }
});

/**
 * @swagger
 * /api/v1/chats/{id}:
 *   get:
 *     summary: Ottiene una chat specifica
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *     responses:
 *       200:
 *         description: Chat recuperata con successo
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
 *                     agent_type:
 *                       type: string
 *                     agent_model:
 *                       type: string
 *                     is_active:
 *                       type: boolean
 *                     last_message_at:
 *                       type: string
 *                       format: date-time
 *                     Messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           chat_id:
 *                             type: integer
 *                           role:
 *                             type: string
 *                           content:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                           user_like:
 *                             type: boolean
 *                             nullable: true
 *                             description: "User feedback: true for like, false for dislike, null for no feedback"
 *                           user_dislike:
 *                             type: boolean
 *                             nullable: true
 *                             description: "User feedback: true for dislike, false for like, null for no feedback"
 *                           Attachments:
 *                             type: array
 *                             items:
 *                               type: object
 *                     is_pinned:
 *                       type: boolean
 *                     id_last_model_used:
 *                       type: integer
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Chat non trovata
 *       500:
 *         description: Errore del server
 */
router.get('/:id', authMiddleware.authenticate, async (req, res) => {
  try {
    const chat = await Chat.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id
      },
      include: [
        {
          model: Message,
          as: 'Messages',
          limit: 20,
          order: [['created_at', 'DESC']],
          attributes: [
            'id', 'chat_id', 'role', 'content', 'agent_type', 'agent_model',
            'tokens_used', 'cost', 'media_url', 'media_type', 'created_at',
            'updated_at', 'is_complete', 'user_like', 'user_dislike'
          ],
          include: [
            {
              model: Attachment,
              attributes: ['id', 'file_type', 'file_name', 'file_path']
            }
          ]
        },
        {
          association: 'sharedUsers',
          attributes: [],
          through: {
            attributes: ['is_pinned'],
            where: { user_id: req.user.id }
          },
          required: false
        }
      ]
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'Chat non trovata'
      });
    }

    // Ottieni lo stato del pin per questa chat
    const userChatsModel = require('../../database').sequelize.models.user_chats;
    const pinnedChat = await userChatsModel.findOne({
      where: {
        user_id: req.user.id,
        chat_id: req.params.id,
        is_pinned: true
      }
    });

    const isPinned = !!pinnedChat;

    res.status(200).json({
      success: true,
      data: { ...chat.toJSON(), is_pinned: isPinned, id_last_model_used: chat.id_last_model_used }
    });
  } catch (error) {
    console.error('Errore nel recupero della chat:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero della chat'
    });
  }
});

/**
 * @swagger
 * /api/v1/chats/{id}:
 *   put:
 *     summary: Aggiorna una chat esistente
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Nuovo titolo della chat
 *               description:
 *                 type: string
 *                 description: Nuova descrizione della chat
 *               use_auto_selector:
 *                 type: boolean
 *                 description: Indica se l'utente sta usando l'auto-selector per la selezione del modello
 *     responses:
 *       200:
 *         description: Chat aggiornata con successo
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
 *                     description:
 *                       type: string
 *                     use_auto_selector:
 *                       type: boolean
 *                     is_active:
 *                       type: boolean
 *                     last_message_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Dati non validi
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Chat non trovata
 *       500:
 *         description: Errore del server
 */
router.put('/:id', authMiddleware.authenticate, async (req, res) => {
  try {
    const { title, description, use_auto_selector } = req.body;

    // Trova la chat
    const chat = await Chat.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'Chat non trovata'
      });
    }

    // Prepara i campi da aggiornare
    const updateFields = {};
    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (use_auto_selector !== undefined) updateFields.use_auto_selector = use_auto_selector;

    // Aggiorna la chat
    await chat.update(updateFields);

    res.status(200).json({
      success: true,
      data: chat
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento della chat:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'aggiornamento della chat'
    });
  }
});

/**
 * @swagger
 * /api/v1/chats:
 *   post:
 *     summary: Crea una nuova chat
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Titolo della chat
 *               use_auto_selector:
 *                 type: boolean
 *                 description: Indica se l'utente sta usando l'auto-selector per la selezione del modello
 *     responses:
 *       201:
 *         description: Chat creata con successo
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
 *                     is_active:
 *                       type: boolean
 *                     last_message_at:
 *                       type: string
 *                       format: date-time
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
    // console.log('Contenuto di req.user in POST /chats:', req.user);
    const { title } = req.body;

    const chat = await Chat.create({
      user_id: req.user.id,
      title: title || 'Nuova Chat',
      is_active: true,
      use_auto_selector: req.body.use_auto_selector || false,
      last_message_at: new Date()
    });

    res.status(201).json({
      success: true,
      data: chat
    });
  } catch (error) {
    console.error('Errore nella creazione della chat:', error);
    console.error('Stack trace completo:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Errore nella creazione della chat'
    });
  }
});

/**
 * @swagger
 * /api/v1/chats/{id}:
 *   delete:
 *     summary: Elimina una chat (soft delete)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *     responses:
 *       200:
 *         description: Chat eliminata con successo
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
 *                   example: Chat eliminata con successo
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Chat non trovata
 *       500:
 *         description: Errore del server
 */
router.delete('/:id', authMiddleware.authenticate, async (req, res) => {
  try {
    // Trova la chat
    const chat = await Chat.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'Chat non trovata'
      });
    }

    // Soft delete (imposta is_active a false)
    chat.is_active = false;
    await chat.save();

    res.status(200).json({
      success: true,
      message: 'Chat eliminata con successo'
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione della chat:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'eliminazione della chat'
    });
  }
});


/**
 * @swagger
 * /api/v1/chats/{id}/pin:
 *   post:
 *     summary: Pin a chat for the authenticated user
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the chat to pin
 *     responses:
 *       200:
 *         description: Chat pinned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Server error
 *   delete:
 *     summary: Unpin a chat for the authenticated user
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the chat to unpin
 *     responses:
 *       200:
 *         description: Chat unpinned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Server error
 */
router.post('/:id/pin', authMiddleware.authenticate, async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.user.id;

    // Ensure chat exists and user has access (either as owner or shared user)
    const chat = await Chat.findOne({
      where: { id: chatId },
      include: [
        { association: 'sharedUsers', where: { id: userId }, required: false }
      ]
    });

    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found or not accessible' });
    }

    // Check if user is owner or has access to shared chat
    const isOwner = chat.user_id === userId;
    const isSharedUser = chat.sharedUsers && chat.sharedUsers.length > 0;

    if (!isOwner && !isSharedUser) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Upsert user_chats row and set is_pinned true
    const userChatsModel = require('../../database').sequelize.models.user_chats;
    await userChatsModel.upsert({ user_id: userId, chat_id: chatId, is_pinned: true });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error pinning chat:', error);
    res.status(500).json({ success: false, error: 'Error pinning chat' });
  }
});

router.delete('/:id/pin', authMiddleware.authenticate, async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.user.id;

    // Ensure chat exists and user has access (either as owner or shared user)
    const chat = await Chat.findOne({
      where: { id: chatId },
      include: [
        { association: 'sharedUsers', where: { id: userId }, required: false }
      ]
    });

    if (!chat) {
      return res.status(404).json({ success: false, error: 'Chat not found or not accessible' });
    }

    // Check if user is owner or has access to shared chat
    const isOwner = chat.user_id === userId;
    const isSharedUser = chat.sharedUsers && chat.sharedUsers.length > 0;

    if (!isOwner && !isSharedUser) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Update user_chats row and set is_pinned false
    const userChatsModel = require('../../database').sequelize.models.user_chats;
    const [affectedRows] = await userChatsModel.update(
      { is_pinned: false },
      { where: { user_id: userId, chat_id: chatId } }
    );
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error unpinning chat:', error);
    res.status(500).json({ success: false, error: 'Error unpinning chat' });
  }
});

module.exports = router; 