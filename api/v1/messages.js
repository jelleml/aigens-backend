/**
 * Router per la gestione dei messaggi
 * @module api/v1/messages
 */

const express = require("express");
const router = express.Router({ mergeParams: true }); // Importante per accedere ai parametri del router padre
const db = require("../../database");
const { Message, Chat, Attachment, MessageCost, Model, Wallet, ModelStatsUsage } = db.sequelize.models;
const authMiddleware = require("../../middlewares/auth.middleware");
const anthropicService = require("../../services/anthropic.service");
const deepseekService = require("../../services/deepseek.service");
const openaiService = require("../../services/openai.service");
const togetherService = require("../../services/together.service");
const ideogramService = require("../../services/ideogram.service");
const openrouterService = require("../../services/openrouter.service");
const pythonAddonService = require("../../services/python-addon.service");
const googleVeoService = require("../../services/google-veo.service");
const modelService = require("../../services/model.service");
const CostCalculator = require("../../services/cost-calculator.service");
const GoogleCloudStorage = require("../../services/google-cloud-storage.service");
const { creditsToEur } = require("../../services/credit-conversion.service");
const { preparePromptWithContext } = require("../../utils/chat-context");
const config = require("../../config/config");

// Initialize Google Cloud Storage service for attachment URL processing
const gcsService = new GoogleCloudStorage();

/**
 * Process attachments to generate appropriate URLs for frontend consumption
 * @param {Array} attachments - Array of attachment objects from database
 * @returns {Promise<Array>} Array of processed attachments with proper URLs
 */
async function processAttachmentsForFrontend(attachments) {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  const processedAttachments = await Promise.all(
    attachments.map(async (attachment) => {
      const processed = {
        id: attachment.id,
        file_type: attachment.file_type,
        file_name: attachment.file_name,
        file_path: attachment.file_path,
        mime_type: attachment.mime_type,
        file_size: attachment.file_size
      };

      // Check if file is stored in Google Cloud Storage
      if (attachment.file_path && attachment.file_path.startsWith('gs://')) {
        try {
          // Parse GCS path: gs://bucket-name/path/to/file
          const gcsPath = attachment.file_path.replace('gs://', '');
          const [bucketName, ...pathParts] = gcsPath.split('/');
          const filePath = pathParts.join('/');

          // Generate signed URL for frontend access
          const signedUrl = await gcsService.getSignedUrl(filePath, {
            action: 'read',
            expires: Date.now() + (15 * 60 * 1000), // 15 minutes expiration
            contentType: attachment.mime_type // Include content type nella firma
          });

          processed.downloadUrl = signedUrl;
          processed.accessUrl = signedUrl; // For backward compatibility
          processed.isGcsFile = true;
          processed.bucket = bucketName;
          processed.gcsPath = filePath;
        } catch (error) {
          console.error(`Error generating signed URL for attachment ${attachment.id}:`, error);
          // Fallback: use file_path as-is
          processed.downloadUrl = attachment.file_path;
          processed.accessUrl = attachment.file_path;
          processed.isGcsFile = true;
          processed.error = 'Could not generate access URL';
        }
      } else {
        // For local files, construct URL for uploads endpoint
        if (attachment.file_type === 'image' && attachment.file_name) {
          processed.downloadUrl = `/api/v1/uploads/images/${attachment.file_name}`;
          processed.accessUrl = `/api/v1/uploads/images/${attachment.file_name}`;
          processed.isGcsFile = false;
        } else {
          // For other local files, use file_path as-is
          processed.downloadUrl = attachment.file_path;
          processed.accessUrl = attachment.file_path;
          processed.isGcsFile = false;
        }
      }

      return processed;
    })
  );

  return processedAttachments;
}

const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const { v4: uuidv4 } = require("uuid");
const { sequelize } = require("../../database");
const GoogleCloudBlobStorage = require("../../services/google-cloud-storage.service");
const cloudStorage = new GoogleCloudBlobStorage();
const util = require("util");
const readFile = util.promisify(fs.readFile);
const unlink = util.promisify(fs.unlink);

/**
 * Determina il tipo di file basato sul MIME type
 */
function getFileTypeFromMimeType(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('application/pdf') ||
    mimeType.startsWith('application/msword') ||
    mimeType.startsWith('application/vnd.openxmlformats-officedocument') ||
    mimeType.startsWith('text/')) return 'document';
  return 'other';
}

/**
 * Extract aggregation names from categorization data for usage stats
 * @param {Object} categorization - Categorization data from Python addon
 * @returns {Array<string>} List of aggregation names
 */
function extractAggregationNames(categorization) {
  const names = [];

  // Add primary categorization types
  if (categorization?.task_type?.length > 0) {
    names.push(...categorization.task_type);
  }

  if (categorization?.anthropic_categories?.length > 0) {
    names.push(...categorization.anthropic_categories);
  }

  if (categorization?.task_topic?.length > 0) {
    names.push(...categorization.task_topic);
  }

  // Add default aggregation names
  names.push('daily_usage', 'weekly_usage', 'monthly_usage');

  return [...new Set(names)]; // Remove duplicates
}

/**
 * Report user usage statistics to Python addon endpoint
 * @param {string} userToken - User authentication token
 * @param {string} userId - User ID
 * @param {Object} messageData - Message data for stats
 * @param {Object} categorization - Categorization data from Python addon
 */
async function reportUserUsageStats(userToken, userId, messageData, categorization) {
  try {
    // Define complete aggregation names list as required by the API
    const aggregationNames = [
      "model_usage",
      "message_count", 
      "category_usage",
      "user_expenses",
      "user_savings",
      "trendline_usage_credits"
    ];

    // Prepare message impact data
    const messageImpact = {
      user_id: userId,
      input_length: messageData.inputLength,
      output_length: messageData.outputLength,
      model_used: messageData.modelUsed,
      cost: messageData.cost,
      response_time: messageData.responseTime,
      has_attachments: messageData.hasAttachments,
      categories: categorization?.anthropic_categories || [],
      task_types: categorization?.task_type || [],
      task_topics: categorization?.task_topic || []
    };

    await pythonAddonService.reportUsageStats(userToken, aggregationNames, messageImpact, "today", true);
    console.log('Messages API: Usage stats reported successfully to Python addon for user:', userId);
  } catch (error) {
    console.error('Messages API: Failed to report usage stats to Python addon:', {
      error: error.message,
      userId: userId,
      messageData: messageData
    });
    // Don't throw - this is a background operation
  }
}

/**
 * Save usage statistics to the database
 * @param {Object} params - Statistics parameters
 * @param {number} params.modelId - Model ID
 * @param {number} params.messageId - Message ID
 * @param {number} params.inputLength - Input text length
 * @param {number} params.outputLength - Output text length
 * @param {Object} params.categorization - Categorization data from Python addon
 * @param {number} params.responseTime - Response time in seconds
 * @param {number} params.expectedCost - Expected cost from estimation
 * @param {number} params.effectiveCost - Actual cost charged
 * @param {boolean} params.hasAttachments - Whether message has attachments
 */
async function saveUsageStatistics({
  modelId,
  messageId,
  inputLength,
  outputLength,
  categorization,
  responseTime,
  expectedCost,
  effectiveCost,
  hasAttachments
}) {
  try {
    console.log('Messages API: Saving usage statistics for message:', messageId);

    // Extract categories from categorization data
    const anthropicCategories = categorization?.anthropic_categories || [];
    const taskTopics = categorization?.task_topic || [];
    const taskTypes = categorization?.task_type || [];

    // Map categories to database fields with proper priority:
    // task_category1: First task_type (TEXT, VIDEO, IMAGE, etc.)
    // task_category2: Second task_type or first anthropic_category
    // task_category3: Third task_type or second anthropic_category or first task_topic
    // task_category4: Fourth task_type or third anthropic_category or second task_topic
    const allCategories = [
      ...taskTypes,           // Priority 1: Task types (TEXT, VIDEO, IMAGE)
      ...anthropicCategories, // Priority 2: Anthropic categories
      ...taskTopics          // Priority 3: Task topics
    ];

    console.log('Messages API: Usage statistics data:', {
      messageId,
      modelId,
      inputLength,
      outputLength,
      taskTypes: taskTypes,
      anthropicCategories: anthropicCategories,
      taskTopics: taskTopics,
      totalCategories: allCategories.length,
      responseTime,
      expectedCost,
      effectiveCost,
      hasAttachments
    });

    await ModelStatsUsage.create({
      model_id: modelId,
      id_message: messageId,
      input_length: inputLength,
      output_length: outputLength,
      task_category1: allCategories[0] || null,
      task_category2: allCategories[1] || null,
      task_category3: allCategories[2] || null,
      task_category4: allCategories[3] || null,
      aigens_response_time: responseTime,
      expected_cost: expectedCost,
      effective_cost: effectiveCost,
      has_attachments: hasAttachments
    });

    console.log('Messages API: Usage statistics saved successfully for message:', messageId);
  } catch (error) {
    console.error('Messages API: Error saving usage statistics:', {
      error: error.message,
      messageId,
      modelId,
      stack: error.stack
    });
    // Don't throw - this is a background operation
  }
}

// Configurazione di multer per il caricamento dei file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../../uploads");
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueFilename = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueFilename);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    // Accetta immagini, documenti, PDF e altri tipi di file comuni
    const allowedMimeTypes = [
      // Immagini
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      // Documenti
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Testo
      'text/plain', 'text/csv', 'text/html',
      // JSON
      'application/json',
      // Altri
      'application/zip', 'application/x-zip-compressed'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(`Tipo di file non supportato: ${file.mimetype}. Tipi supportati: ${allowedMimeTypes.join(', ')}`),
        false
      );
    }
  },
});

/**
 * @swagger
 * tags:
 *   name: Messages
 *   description: API per la gestione dei messaggi
 */

/**
 * @route POST /api/v1/messages/estimate-cost
 * @description Stima il costo di un messaggio prima di inviarlo
 * @access Private
 */
const estimateCostHandler = async (req, res) => {
  try {
    const { prompt, model } = req.body;

    if (!prompt || !model) {
      return res.status(400).json({
        success: false,
        error: "Prompt e model sono obbligatori",
      });
    }

    // Stima approssimativa dei token
    const estimatedTokens = Math.ceil(prompt.length / 4);

    // Determina quale servizio utilizzare in base al modello
    let costEstimate;

    if (model.startsWith("claude-")) {
      // Passa true per includere la stima dei token di output
      costEstimate = await anthropicService.calculateCost(
        model,
        estimatedTokens,
        0,
        true
      );
    } else if (model.startsWith("deepseek-")) {
      costEstimate = await deepseekService.calculateCost(
        model,
        estimatedTokens,
        0,
        true
      );
    } else if (model.startsWith("meta-llama/") || model.startsWith("mistralai/") || model.startsWith("Qwen/")) {
      costEstimate = await togetherService.calculateCost(
        model,
        estimatedTokens,
        0,
        true
      );
    } else if (model.startsWith("gpt-")) {
      costEstimate = await openaiService.calculateCost(
        model,
        estimatedTokens,
        0,
        true
      );
    } else {
      return res.status(400).json({
        success: false,
        error: `Modello non supportato: ${model}`,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        estimated_input_tokens: estimatedTokens,
        estimated_output_tokens: costEstimate.outputTokens,
        estimated_total_tokens: costEstimate.totalTokens,
        cost_details: costEstimate,
      },
    });
  } catch (error) {
    console.error("Errore durante la stima del costo:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Errore durante la stima del costo",
    });
  }
};

router.post("/estimate-cost", authMiddleware.authenticate, estimateCostHandler);

/**
 * @swagger
 * /api/v1/messages:
 *   get:
 *     summary: Ottiene i messaggi recenti per il componente "recent activity"
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Messaggi recuperati con successo
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
 *                       date:
 *                         type: string
 *                         format: date-time
 *                       model_name:
 *                         type: string
 *                       provider:
 *                         type: string
 *                       category:
 *                         type: string
 *                       total_cost:
 *                         type: number
 *                         format: float
 *                       chat_name:
 *                         type: string
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get("/", authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const chatId = req.params.chatId;

    // If chatId is provided, return messages for that specific chat
    if (chatId) {
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      // Verify chat exists and belongs to user
      const chat = await Chat.findOne({
        where: {
          id: chatId,
          user_id: userId
        }
      });

      if (!chat) {
        return res.status(404).json({
          success: false,
          error: 'Chat non trovata'
        });
      }

      // Get messages with pagination
      const { count, rows: messages } = await Message.findAndCountAll({
        where: {
          chat_id: chatId
        },
        attributes: [
          'id', 'chat_id', 'role', 'content', 'agent_type', 'agent_model',
          'tokens_used', 'cost', 'media_url', 'media_type', 'created_at',
          'updated_at', 'is_complete', 'user_like', 'user_dislike'
        ],
        include: [
          {
            model: Attachment,
            attributes: ['id', 'file_type', 'file_name', 'file_path']
          },
          {
            model: MessageCost,
            attributes: ['input_tokens', 'output_tokens', 'total_tokens', 'base_cost', 'total_markup', 'total_cost', 'model_used'],
            include: [
              {
                model: db.sequelize.models.Model,
                attributes: ['name'],
                include: [
                  {
                    model: db.sequelize.models.Provider,
                    as: 'provider',
                    attributes: ['name']
                  }
                ]
              }
            ]
          }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      // Process attachments to generate proper URLs for frontend
      const processedMessages = await Promise.all(
        messages.map(async (message) => {
          const messageObj = message.toJSON();
          if (messageObj.Attachments && messageObj.Attachments.length > 0) {
            messageObj.Attachments = await processAttachmentsForFrontend(messageObj.Attachments);
          }
          return messageObj;
        })
      );

      return res.status(200).json({
        success: true,
        data: {
          messages: processedMessages,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / limit)
          }
        }
      });
    }

    // If no chatId, return general message overview (existing behavior)
    const messages = await Message.findAll({
      attributes: [
        'id',
        'created_at',
        'agent_type',
        'agent_model'
      ],
      include: [
        {
          model: Chat,
          attributes: ['title'],
          where: {
            user_id: userId
          }
        },
        {
          model: MessageCost,
          attributes: ['total_cost', 'model_used'],
          include: [
            {
              model: db.sequelize.models.Model,
              attributes: ['name'],
              include: [
                {
                  model: db.sequelize.models.Provider,
                  as: 'provider',
                  attributes: ['name']
                }
              ]
            }
          ]
        }
      ],
      order: [['created_at', 'DESC']],
      limit: 100
    });

    const formattedMessages = await Promise.all(messages.map(async (message) => {
      let providerName = 'Unknown';
      let modelName = message.MessageCost?.Model?.name || message.agent_model || 'Unknown';

      // First try to get provider from MessageCost
      if (message.MessageCost?.Model?.provider?.name) {
        providerName = message.MessageCost.Model.provider.name;
        
        // If the model name doesn't match agent_model, it means we used a different model
        // In that case, show the requested model but look up its provider
        if (message.agent_model && message.MessageCost.Model.api_model_id !== message.agent_model) {
          modelName = message.agent_model;
          
          try {
            const requestedModel = await db.sequelize.models.Model.findOne({
              where: { api_model_id: message.agent_model },
              include: [{
                model: db.sequelize.models.Provider,
                as: 'provider',
                attributes: ['name']
              }]
            });
            
            if (requestedModel?.provider?.name) {
              providerName = requestedModel.provider.name;
            }
          } catch (error) {
            console.error('Error looking up provider for agent_model:', message.agent_model, error);
          }
        }
      } else if (message.agent_model) {
        // If no MessageCost provider, lookup provider for the requested model
        modelName = message.agent_model;
        
        try {
          const requestedModel = await db.sequelize.models.Model.findOne({
            where: { api_model_id: message.agent_model },
            include: [{
              model: db.sequelize.models.Provider,
              as: 'provider',
              attributes: ['name']
            }]
          });
          
          if (requestedModel?.provider?.name) {
            providerName = requestedModel.provider.name;
          }
        } catch (error) {
          console.error('Error looking up provider for agent_model:', message.agent_model, error);
        }
      }

      return {
        id: message.id,
        date: message.created_at,
        model_name: modelName,
        provider: providerName,
        category: message.agent_type,
        total_cost: message.MessageCost?.total_cost || 0,
        chat_name: message.Chat?.title || 'Unknown Chat'
      };
    }));

    res.status(200).json({
      success: true,
      data: formattedMessages
    });
  } catch (error) {
    console.error("Errore nel recupero dei messaggi:", error);
    res.status(500).json({
      success: false,
      error: "Errore nel recupero dei messaggi"
    });
  }
});

/**
 * @swagger
 * /api/v1/chats/{chatId}/messages/{id}:
 *   get:
 *     summary: Ottiene un messaggio specifico
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del messaggio
 *     responses:
 *       200:
 *         description: Messaggio recuperato con successo
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
 *                     chat_id:
 *                       type: integer
 *                     role:
 *                       type: string
 *                     content:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     user_like:
 *                       type: boolean
 *                       nullable: true
 *                       description: User feedback like status
 *                     user_dislike:
 *                       type: boolean
 *                       nullable: true
 *                       description: User feedback dislike status
 *                     Attachments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           file_type:
 *                             type: string
 *                           file_name:
 *                             type: string
 *                           file_path:
 *                             type: string
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Messaggio non trovato
 *       500:
 *         description: Errore del server
 */
router.get("/:id", authMiddleware.authenticate, async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const messageId = req.params.id;

    const message = await Message.findOne({
      where: {
        id: messageId,
        chat_id: chatId,
      },
      attributes: [
        'id', 'chat_id', 'role', 'content', 'agent_type', 'agent_model',
        'tokens_used', 'cost', 'media_url', 'media_type', 'created_at',
        'updated_at', 'is_complete', 'user_like', 'user_dislike'
      ],
      include: [
        {
          model: Chat,
          where: {
            user_id: req.user.id,
          },
          attributes: ["id", "title", "agent_model"],
        },
        {
          model: Attachment,
          attributes: ["id", "file_type", "file_name", "file_path"],
        },
      ],
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: "Messaggio non trovato",
      });
    }

    // Process attachments to generate proper URLs for frontend
    const messageObj = message.toJSON();
    if (messageObj.Attachments && messageObj.Attachments.length > 0) {
      messageObj.Attachments = await processAttachmentsForFrontend(messageObj.Attachments);
    }

    res.status(200).json({
      success: true,
      data: messageObj,
    });
  } catch (error) {
    console.error("Errore nel recupero del messaggio:", error);
    res.status(500).json({
      success: false,
      error: "Errore nel recupero del messaggio",
    });
  }
});

/**
 * @swagger
 * /api/v1/chats/{chatId}/messages:
 *   post:
 *     summary: Invia un nuovo messaggio in una chat
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *               - id_model
 *             properties:
 *               content:
 *                 type: string
 *                 description: Contenuto del messaggio
 *               agent_type:
 *                 type: string
 *                 enum: [chat, image, video]
 *                 default: chat
 *                 description: Tipo di agente
 *               id_model:
 *                 type: integer
 *                 description: ID del modello da utilizzare
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: File da allegare al messaggio (max 5)
 *               image_options:
 *                 type: object
 *                 properties:
 *                   count:
 *                     type: integer
 *                     default: 1
 *                   style:
 *                     type: string
 *                     default: natural
 *                   aspect_ratio:
 *                     type: string
 *                     default: 1:1
 *     responses:
 *       201:
 *         description: Messaggio inviato con successo
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
 *                     userMessage:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         chat_id:
 *                           type: integer
 *                         role:
 *                           type: string
 *                           example: user
 *                         content:
 *                           type: string
 *                         agent_type:
 *                           type: string
 *                           example: chat
 *                         agent_model:
 *                           type: string
 *                           example: claude-3-opus
 *                         user_like:
 *                           type: boolean
 *                           nullable: true
 *                           description: "User feedback: true for like, false for dislike, null for no feedback"
 *                         user_dislike:
 *                           type: boolean
 *                           nullable: true
 *                           description: "User feedback: true for dislike, false for like, null for no feedback"
 *                     assistantMessage:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         chat_id:
 *                           type: integer
 *                         role:
 *                           type: string
 *                           example: assistant
 *                         content:
 *                           type: string
 *                         agent_type:
 *                           type: string
 *                           example: chat
 *                         agent_model:
 *                           type: string
 *                           example: claude-3-opus
 *                         user_like:
 *                           type: boolean
 *                           nullable: true
 *                           description: "User feedback: true for like, false for dislike, null for no feedback"
 *                         user_dislike:
 *                           type: boolean
 *                           nullable: true
 *                           description: "User feedback: true for dislike, false for like, null for no feedback"
 *                     cost:
 *                       type: object
 *                       description: Dettagli del costo del messaggio
 *                       properties:
 *                         input_tokens:
 *                           type: integer
 *                           description: Numero di token di input utilizzati
 *                           example: 150
 *                         output_tokens:
 *                           type: integer
 *                           description: Numero di token di output generati
 *                           example: 300
 *                         total_tokens:
 *                           type: integer
 *                           description: Totale dei token utilizzati
 *                           example: 450
 *                         price_1m_input_tokens:
 *                           type: number
 *                           format: float
 *                           description: Prezzo per 1 milione di token di input
 *                           example: 15.00
 *                         price_1m_output_tokens:
 *                           type: number
 *                           format: float
 *                           description: Prezzo per 1 milione di token di output
 *                           example: 75.00
 *                         fixed_markup_perc:
 *                           type: number
 *                           format: float
 *                           description: Percentuale di markup fisso applicata
 *                           example: 0.05
 *                         fixed_markup_value:
 *                           type: number
 *                           format: float
 *                           description: Valore del markup fisso in dollari
 *                           example: 0.001
 *                         markup_perc_value:
 *                           type: number
 *                           format: float
 *                           description: Percentuale di markup variabile applicata
 *                           example: 0.10
 *                         total_markup_value:
 *                           type: number
 *                           format: float
 *                           description: Totale del markup applicato
 *                           example: 0.003
 *                         total_cost_for_user_credits:
 *                           type: number
 *                           format: float
 *                           description: Costo totale per l'utente in crediti
 *                           example: 0.033
 *                         total_cost_for_user_money:
 *                           type: number
 *                           format: float
 *                           description: Costo totale per l'utente in euro
 *                           example: 0.0003
 *                         total_cost_aigens:
 *                           type: number
 *                           format: float
 *                           description: Costo totale per Aigens
 *                           example: 0.030
 *                         total_margin_value:
 *                           type: number
 *                           format: float
 *                           description: Margine totale generato
 *                           example: 0.003
 *                         new_balance:
 *                           type: number
 *                           format: float
 *                           description: Nuovo bilancio dell'utente dopo la transazione
 *                           example: 99.967
 *       400:
 *         description: Dati non validi
 *       401:
 *         description: Non autorizzato
 *       402:
 *         description: Fondi insufficienti
 *       404:
 *         description: Chat o modello non trovato
 *       500:
 *         description: Errore del server
 */
router.post(
  "/",
  authMiddleware.authenticate,
  upload.array("attachments", 5),
  async (req, res) => {
    let responseSent = false; // <--- AGGIUNTA
    try {
      const chat_id = req.params.chatId;
      const { content, agent_type = 'chat', id_model, image_options, clientMessageId } = req.body;
      const userId = req.user.id;
      let sendEvent = () => { };

      const requestId = Date.now() + '-' + Math.random();
      console.log('MESSAGES API: Nuova richiesta', { requestId, body: req.body });

      console.log(`Messages API: Request started - Chat: ${chat_id}, User: ${userId}, Model: ${id_model}, Files: ${req.files?.length || 0}`);

      // 1. Controlli minimi
      if (!chat_id || !content || !id_model) {
        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            await fs.unlink(file.path).catch(err =>
              console.error(`Error removing file ${file.path}:`, err)
            );
          }
        }
        const errorMsg = !chat_id
          ? "ID chat è obbligatorio"
          : !content
            ? "Contenuto è obbligatorio"
            : "L'ID del modello è obbligatorio";
        res.status(400).json({ success: false, error: errorMsg });
        responseSent = true;
        return;
      }

      // Verifica che la chat esista e appartenga all'utente
      const chat = await Chat.findOne({ where: { id: chat_id, user_id: userId } });
      if (!chat) {
        if (req.files && req.files.length > 0) {
          req.files.forEach((file) => { fs.unlink(file.path); });
        }
        res.status(404).json({ success: false, error: "Chat non trovata" });
        responseSent = true;
        return;
      }

      // Aggiorna l'ultimo modello usato nella chat
      await Chat.update({
        id_last_model_used: id_model
      }, {
        where: {
          id: chat_id
        }
      });

      // Recupera l'istanza del modello tramite id_model
      const modelInstance = await Model.findOne({
        where: { id: id_model },
        include: [{
          model: db.sequelize.models.Provider,
          as: 'provider',
          attributes: ['id', 'name']
        }]
      });
      if (!modelInstance) {
        res.status(404).json({ success: false, error: "Modello non trovato" });
        responseSent = true;
        return;
      }
      const model_id = modelInstance.api_model_id || modelInstance.model_slug;

      if (!model_id) {
        res.status(400).json({ success: false, error: "ID modello non valido" });
        responseSent = true;
        return;
      }

      // Recupera il wallet dell'utente per calcolare il nuovo bilancio
      const wallet = await Wallet.findOne({ where: { user_id: userId } });
      if (!wallet) {
        res.status(404).json({ success: false, error: "Wallet non trovato" });
        responseSent = true;
        return;
      }
      // Service-specific cost estimation
      try {
        const numberOfAttachments = req.files ? req.files.length : 0;
        console.log(`Messages API: Starting cost estimation for user ${userId}, model ${model_id}, attachments: ${numberOfAttachments}`);

        let totalCostTokens = 0;

        // Prepara il contenuto con contesto PRIMA del calcolo costi
        let finalContent = content;
        if (modelInstance.provider?.name && 
            !['ideogram', 'google-veo'].includes(modelInstance.provider.name)) {
          try {
            finalContent = await prepareContentWithContext(
              content, 
              chat_id, 
              modelInstance.provider.name,
              modelInstance
            );
            console.log(`Messages API: Added chat context for cost calculation - provider ${modelInstance.provider.name}`);
          } catch (contextError) {
            console.error('Messages API: Error preparing chat context for cost calculation:', contextError);
            // In caso di errore, usa il contenuto originale
            finalContent = content;
          }
        }

        // Check if it's an Ideogram model (image generation)
        if (modelInstance.provider?.name === 'ideogram') {
          const imageCount = 1; // Default image count, could be from request parameters
          const ideogramCost = await ideogramService.calculateCost(modelInstance.id, imageCount, 'Generate');
          // Convert dollar cost to tokens (1 EUR = 1000 tokens, assuming 1 USD ≈ 1 EUR)
          totalCostTokens = Math.ceil(ideogramCost.totalCost * 1000);
        } else if (modelInstance.provider?.name === 'google-veo') {
          // Google Veo models - use built-in cost calculation (skip Python addon)
          const videoCost = await googleVeoService.calculateCost(modelInstance.id, 1, 'Generate');
          // Convert dollar cost to tokens (1 EUR = 1000 tokens, assuming 1 USD ≈ 1 EUR)
          totalCostTokens = Math.ceil(videoCost.totalCost * 1000);
        } else {
          // Use Python addon for text models - usa finalContent invece di content
          const costEstimation = await pythonAddonService.getExpectedCost(
            finalContent, // ✅ Usa finalContent (con contesto) invece di content
            model_id,
            'categories',
            config.pythonAddons.defaultModel,
            numberOfAttachments,
            false
          );
          totalCostTokens = pythonAddonService.extractTotalCostTokens(costEstimation);
        }

        console.log(`Messages API: Cost estimation completed - estimated cost: ${totalCostTokens} tokens, user balance: ${wallet.balance}`);

        // Check user balance against Python addon cost estimate
        if (!wallet || wallet.balance < totalCostTokens) {
          console.warn(`Messages API: Insufficient funds for user ${userId} - required: ${totalCostTokens}, available: ${wallet.balance}`);

          if (req.files && req.files.length > 0) {
            for (const file of req.files) {
              await fs.unlink(file.path).catch(err =>
                console.error(`Error removing file ${file.path}:`, err)
              );
            }
          }
          res.status(402).json({
            success: false,
            error: 'Fondi insufficienti',
            details: `Costo stimato: ${totalCostTokens} crediti`
          });
          responseSent = true;
          return;
        }

        console.log(`Messages API: Balance check passed for user ${userId}`);
      } catch (err) {
        console.error('Messages API: Python addon cost estimation failed:', {
          error: err.message,
          userId: userId,
          modelId: model_id,
          contentLength: content?.length || 0,
          attachments: req.files?.length || 0
        });

        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            await fs.unlink(file.path).catch(err =>
              console.error(`Error removing file ${file.path}:`, err)
            );
          }
        }

        // Return specific error message or generic fallback
        const errorMessage = err.message.includes('not found in database') ? err.message : 'Errore controllo credito';
        res.status(500).json({
          success: false,
          error: errorMessage
        });
        responseSent = true;
        return;
      }

      // 2. Se SSE, gestisci lo streaming
      // Usa SSE solo se il frontend lo richiede esplicitamente
      const useStreaming = req.headers.accept === 'text/event-stream' || req.headers['x-streaming'] === 'true';
      console.log(`Messages API: Request mode - Streaming: ${useStreaming}, Files count: ${req.files?.length || 0}`);
      if (useStreaming) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        sendEvent = (type, data) => {
          if (!res.finished) {
            res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
          }
        };
        sendEvent('process_started', { message: 'Inizializzazione della richiesta...' });

        // Prepara il contenuto con contesto PRIMA del controllo credito (FIX BUG)
        let finalContent = content;
        if (modelInstance.provider?.name && 
            !['ideogram', 'google-veo'].includes(modelInstance.provider.name)) {
          try {
            finalContent = await prepareContentWithContext(
              content, 
              chat_id, 
              modelInstance.provider.name,
              modelInstance
            );
            console.log(`Messages API: Added chat context for streaming - provider ${modelInstance.provider.name}`);
          } catch (contextError) {
            console.error('Messages API: Error preparing chat context for streaming:', contextError);
            // In caso di errore, usa il contenuto originale
            finalContent = content;
          }
        }

        // 3. Controllo credito PRIMA di streammare (service-specific)
        try {
          const numberOfAttachments = req.files ? req.files.length : 0;
          let totalCostTokens = 0;

          // Check if it's an Ideogram model (image generation)
          if (modelInstance.provider?.name === 'ideogram') {
            const imageCount = 1; // Default image count, could be from request parameters
            const ideogramCost = await ideogramService.calculateCost(modelInstance.id, imageCount, 'Generate');
            // Convert dollar cost to tokens (1 EUR = 1000 tokens, assuming 1 USD ≈ 1 EUR)
            totalCostTokens = Math.ceil(ideogramCost.totalCost * 1000);
          } else if (modelInstance.provider?.name === 'google-veo') {
            // Google Veo models - use built-in cost calculation (skip Python addon)
            const videoCost = await googleVeoService.calculateCost(modelInstance.id, 1, 'Generate');
            // Convert dollar cost to tokens (1 EUR = 1000 tokens, assuming 1 USD ≈ 1 EUR)
            totalCostTokens = Math.ceil(videoCost.totalCost * 1000);
          } else {
            // Use Python addon for text models - usa finalContent invece di content (FIX BUG)
            const costEstimation = await pythonAddonService.getExpectedCost(
              finalContent, // ✅ Usa finalContent (con contesto) invece di content
              model_id,
              'categories',
              config.pythonAddons.defaultModel,
              numberOfAttachments,
              false
            );
            totalCostTokens = pythonAddonService.extractTotalCostTokens(costEstimation);
          }

          // Enhanced balance check: if cost estimation returns 0, it might indicate missing pricing
          if (totalCostTokens === 0) {
            console.warn(`Messages API: Cost estimation returned 0 for model ${model_id}, this may indicate missing pricing data`);
            // Try to verify model has pricing in CostCalculator first
            try {
              const costCalculator = new CostCalculator();
              await costCalculator.calculateCost({
                provider: modelInstance.provider?.name || 'anthropic',
                modelId: modelInstance.id,
                apiModelId: model_id,
                inputTokens: 100, // Small test amount
                outputTokens: 100
              });
            } catch (pricingError) {
              console.error(`Messages API: Model ${model_id} has no pricing data:`, pricingError.message);
              sendEvent('error', {
                error: 'Modello non disponibile',
                details: `Il modello ${model_id} non ha dati di pricing configurati. Contatta il supporto.`
              });
              res.end();
              responseSent = true;
              return;
            }
          }

          // Check credito - anche per 0 credits, l'utente non può continuare se ha balance 0
          if (!wallet || wallet.balance <= 0) {
            console.warn(`Messages API: User ${userId} has insufficient funds - balance: ${wallet?.balance || 0}`);
            sendEvent('error', {
              error: 'Fondi insufficienti',
              details: `Saldo attuale: ${wallet?.balance || 0} crediti. Ricarica il tuo account per continuare.`
            });
            res.end();
            responseSent = true;
            return;
          }

          // Additional check: if we have a real cost estimate, verify sufficient balance
          if (totalCostTokens > 0 && wallet.balance < totalCostTokens) {
            console.warn(`Messages API: User ${userId} has insufficient funds - required: ${totalCostTokens}, available: ${wallet.balance}`);
            sendEvent('error', {
              error: 'Fondi insufficienti',
              details: `Costo stimato: ${totalCostTokens} crediti. Saldo disponibile: ${wallet.balance} crediti`
            });
            res.end();
            responseSent = true;
            return;
          }
        } catch (err) {
          console.error('Messages API: Error during credit check:', err);
          sendEvent('error', { error: err.message || 'Errore controllo credito', details: err.message });
          res.end();
          responseSent = true;
          return;
        }

        // 4. Streaming AI
        let fullText = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let cost = null;
        let finalCost = null; // Spostato qui per essere accessibile ovunque
        let userMessageId = null;
        let assistantMessageId = null;
        let attachments = req.files || [];
        let streamInterrupted = false;
        let aiService;
        try {
          console.log(`Messages API: Starting attachment processing flow...`);

          // === STEP 1: CREATE USER MESSAGE FIRST ===
          console.log(`Messages API: Step 1 - Creating user message...`);
          const userMessage = await Message.create({
            chat_id,
            role: 'user',
            content,
            agent_type,
            agent_model: model_id
          });
          userMessageId = userMessage.id;
          console.log(`Messages API: User message created with ID: ${userMessageId}`);

          // === STEP 2: PROCESS ATTACHMENTS ===
          console.log(`Messages API: Step 2 - Processing ${attachments.length} attachments`);
          const savedAttachmentIds = [];

          for (let i = 0; i < attachments.length; i++) {
            const file = attachments[i];
            console.log(`Messages API: Processing attachment ${i + 1}/${attachments.length}: ${file.originalname}`);

            try {
              // 2.1 Upload to Google Cloud Storage
              console.log(`Messages API: Uploading ${file.originalname} to GCS...`);
              const cloudResult = await cloudStorage.uploadFileFromPath(file.path, file.originalname, {
                folder: `chat_${chat_id}`,
                contentType: file.mimetype,
                metadata: {
                  user_id: userId,
                  chat_id: chat_id,
                  original_name: file.originalname
                }
              });
              console.log(`Messages API: Upload successful for ${file.originalname}`);

              // 2.2 Create attachment in database
              console.log(`Messages API: Creating attachment record for ${file.originalname}...`);
              const attachment = await Attachment.create({
                message_id: userMessage.id,
                user_id: userId,
                chat_id,
                file_type: getFileTypeFromMimeType(file.mimetype),
                file_name: cloudResult.fileName,
                original_name: file.originalname,
                file_path: cloudResult.gsUrl || cloudResult.filePath,
                file_size: cloudResult.size || file.size,
                mime_type: file.mimetype
              });

              savedAttachmentIds.push(attachment.id);
              console.log(`Messages API: Attachment saved with ID: ${attachment.id}`);

              // 2.3 Clean up local file
              try {
                // Check if file exists before attempting to delete
                const fileExists = require('fs').existsSync(file.path);
                if (fileExists) {
                  await fs.unlink(file.path);
                  console.log(`Messages API: Local file deleted: ${file.originalname}`);
                } else {
                  console.log(`Messages API: Local file already deleted or doesn't exist: ${file.originalname}`);
                }
              } catch (unlinkError) {
                console.warn(`Messages API: Could not delete local file: ${unlinkError.message}`);
              }

            } catch (attachmentError) {
              console.error(`Messages API: Failed to process attachment ${file.originalname}:`, attachmentError.message);

              // Fallback: save with local path if GCS upload fails
              try {
                const attachment = await Attachment.create({
                  message_id: userMessage.id,
                  user_id: userId,
                  chat_id,
                  file_type: getFileTypeFromMimeType(file.mimetype),
                  file_name: file.filename,
                  original_name: file.originalname,
                  file_path: file.path,
                  file_size: file.size,
                  mime_type: file.mimetype
                });

                savedAttachmentIds.push(attachment.id);
                console.log(`Messages API: Attachment saved locally with ID: ${attachment.id}`);
              } catch (dbError) {
                console.error(`Messages API: Failed to save attachment to database:`, dbError.message);
                // Continue processing other attachments
              }
            }
          }

          console.log(`Messages API: Step 2 completed - ${savedAttachmentIds.length} attachments processed`);
          console.log(`Messages API: Proceeding with AI service resolution...`);

          // === STEP 3: RESOLVE AI SERVICE ===
          console.log(`Messages API: Step 3 - Resolving AI service for model: ${model_id}`);
          try {

            // Validate model_id before calling service resolution
            if (!model_id) {
              console.error(`Messages API: Missing model_id in request`);
              throw new Error('Model ID is required');
            }

            // Additional validation for model_id format
            if (typeof model_id !== 'string') {
              console.error(`Messages API: Invalid model_id format: ${typeof model_id}`);
              throw new Error('Model ID must be a string');
            }

            // Trim whitespace from model_id
            const trimmedModelId = model_id.trim();
            if (trimmedModelId.length === 0) {
              console.error(`Messages API: Empty model_id after trimming`);
              throw new Error('Model ID cannot be empty');
            }

            console.log(`Messages API: Calling resolveStreamingService with model_id: ${trimmedModelId}`);
            const serviceInfo = await modelService.resolveStreamingService(trimmedModelId);

            console.log(`Messages API: Service resolved successfully: ${serviceInfo.service}, provider: ${serviceInfo.provider}, type: ${serviceInfo.providerType}`);
            console.log(`Messages API: Step 3 completed - AI service resolution successful`);

            // Log additional details for indirect providers
            if (serviceInfo.providerType === 'indirect') {
              console.log(`Messages API: Using aggregator ${serviceInfo.aggregatorProvider} for source provider ${serviceInfo.sourceProvider || 'unknown'}`);
            }

            // Map the service name to the actual service object
            switch (serviceInfo.service) {
              case 'anthropicService':
                aiService = anthropicService;
                break;
              case 'openaiService':
                aiService = openaiService;
                break;
              case 'deepseekService':
                aiService = deepseekService;
                break;
              case 'togetherService':
                aiService = togetherService;
                break;
              case 'ideogramService':
                aiService = ideogramService;
                break;
              case 'openrouterService':
                aiService = openrouterService;
                break;
              case 'googleVeoService':
                aiService = googleVeoService;
                break;
              default:
                console.error(`Messages API: Unsupported service: ${serviceInfo.service} for model: ${model_id}`);
                if (!responseSent) {
                  throw new Error(`Servizio non supportato: ${serviceInfo.service}`);
                }
                return;
            }
          } catch (error) {
            console.error(`Messages API: Error resolving streaming service for model ${model_id}:`, error);

            // Handle specific error types with user-friendly messages
            if (error.message.includes('Model not found')) {
              if (!responseSent) {
                throw new Error(`Modello non trovato nel database: ${model_id}`);
              }
              return;
            } else if (error.message.includes('Provider not found')) {
              if (!responseSent) {
                throw new Error(`Provider non trovato per il modello: ${model_id}`);
              }
              return;
            } else if (error.message.includes('No streaming service available')) {
              if (!responseSent) {
                throw new Error(`Nessun servizio di streaming disponibile per il modello: ${model_id}`);
              }
              return;
            } else if (error.message.includes('Database connection error')) {
              if (!responseSent) {
                throw new Error(`Errore di connessione al database. Riprova più tardi.`);
              }
              return;
            } else if (error.message.includes('Model slug is required')) {
              if (!responseSent) {
                throw new Error(`ID modello non valido o mancante`);
              }
              return;
            } else {
              // Generic error message for other cases
              if (!responseSent) {
                if (!responseSent) {
                  throw new Error(`Modello non supportato: ${error.message}`);
                }
                return;
              }
              return;
            }
          }

          // === STEP 4: SEND AI REQUEST ===
          console.log(`Messages API: Step 4 - Sending AI request with ${savedAttachmentIds.length} attachment IDs`);
          try {
            // Special handling for Ideogram with event stream
            if (modelInstance.provider?.name === 'ideogram') {
              console.log('Messages API: Using Ideogram with event stream support');
              await aiService.sendRequest(
                content,
                model_id,
                userId,
                chat_id,
                agent_type,
                savedAttachmentIds,
                (chunk, usage) => {
                  if (chunk) {
                    fullText += chunk;
                    sendEvent('delta', { text: chunk });
                  }
                  if (usage) {
                    console.log('Usage received:', usage); // Debug log
                    if (usage.input_tokens !== undefined) {
                      inputTokens = usage.input_tokens;
                      console.log('Updated inputTokens:', inputTokens); // Debug log
                    }
                    if (usage.output_tokens !== undefined) {
                      outputTokens = usage.output_tokens;
                      console.log('Updated outputTokens:', outputTokens); // Debug log
                    }
                  }
                },
                image_options, // per ideogram
                sendEvent // Passa la funzione sendEvent per event stream
              );
            } else {
              // Standard handling for other services
              
              // Usa finalContent già preparato prima del calcolo costi
              // (finalContent è già disponibile dalla sezione precedente)
              
              await aiService.sendRequest(
                finalContent, // Usa il contenuto con contesto già preparato
                model_id,
                userId,
                chat_id,
                agent_type,
                savedAttachmentIds,
                (chunk, usage) => {
                  if (chunk) {
                    fullText += chunk;
                    sendEvent('delta', { text: chunk });
                  }
                  if (usage) {
                    console.log('Usage received:', usage); // Debug log
                    if (usage.input_tokens !== undefined) {
                      inputTokens = usage.input_tokens;
                      console.log('Updated inputTokens:', inputTokens); // Debug log
                    }
                    if (usage.output_tokens !== undefined) {
                      outputTokens = usage.output_tokens;
                      console.log('Updated outputTokens:', outputTokens); // Debug log
                    }
                    // Fallback per diversi formati di risposta
                    if (usage.prompt_tokens !== undefined) {
                      inputTokens = usage.prompt_tokens;
                    }
                    if (usage.completion_tokens !== undefined) {
                      outputTokens = usage.completion_tokens;
                    }
                    if (usage.total_tokens !== undefined) {
                      // Se abbiamo solo total_tokens, stimiamo input/output
                      if (inputTokens === 0 && outputTokens === 0) {
                        inputTokens = Math.ceil(finalContent.length / 4); // Usa finalContent invece di content
                        outputTokens = usage.total_tokens - inputTokens;
                      }
                    }
                  }
                },
                image_options // per ideogram
              );
            }
          } catch (streamErr) {
            streamInterrupted = true;
            console.error('Errore streaming AI:', streamErr);
            sendEvent('interrupted', { text: fullText, error: streamErr.message });
          }

          // Special handling for image models (like Ideogram) that don't use tokens
          if (modelInstance.provider?.name === 'ideogram') {
            // For Ideogram, tokens should remain 0 since images don't use tokens
            inputTokens = 0;
            outputTokens = 0;
            console.log('Ideogram model - tokens set to 0 (images don\'t use tokens)');
          } else if (modelInstance.provider?.name === 'google-veo') {
            // For Google Veo, tokens should remain 0 since videos don't use tokens
            inputTokens = 0;
            outputTokens = 0;
            console.log('Google Veo model - tokens set to 0 (videos don\'t use tokens)');
          } else {
            // For text models, estimate tokens if not received from callback
            if (inputTokens === 0) {
              inputTokens = Math.ceil(finalContent.length / 4); // ✅ Usa finalContent invece di content
              console.log('Estimated inputTokens:', inputTokens); // Debug log
            }
            if (outputTokens === 0) {
              outputTokens = Math.ceil(fullText.length / 4);
              console.log('Estimated outputTokens:', outputTokens); // Debug log
            }
          }

          console.log('Final token counts - Input:', inputTokens, 'Output:', outputTokens); // Debug log

          // Calcola costi (sempre, indipendentemente da streamInterrupted)
          try {
            // Skip cost calculation for Ideogram since it handles its own costs
            if (modelInstance.provider?.name === 'ideogram') {
              console.log('Skipping CostCalculator for Ideogram - costs already handled by service');
              finalCost = {
                total_cost_for_user: 0, // Already deducted by Ideogram service
                total_cost_aigens: 0,
                markup_value: 0,
                fixed_markup_value: 0,
                base_cost: 0, // Required by MessageCost schema
                total_cost: 0, // Required by MessageCost schema
                baseCost: 0, // Alternative property name used in ideogram service
                totalCost: 0, // Alternative property name used in ideogram service
                fixedMarkup: 0,
                percentageMarkup: 0,
                totalMarkup: 0
              };
            } else if (modelInstance.provider?.name === 'google-veo') {
              console.log('Skipping CostCalculator for Google Veo - costs already handled by service');
              finalCost = {
                total_cost_for_user: 0, // Already deducted by Google Veo service
                total_cost_aigens: 0,
                markup_value: 0,
                fixed_markup_value: 0,
                base_cost: 0, // Required by MessageCost schema
                total_cost: 0, // Required by MessageCost schema
                baseCost: 0, // Alternative property name used in google veo service
                totalCost: 0, // Alternative property name used in google veo service
                fixedMarkup: 0,
                percentageMarkup: 0,
                totalMarkup: 0
              };
            } else {
              const costCalculator = new CostCalculator();
              const providerName = modelInstance.provider?.name || 'anthropic';

              finalCost = await costCalculator.calculateCost({
                provider: providerName,
                modelId: modelInstance.id,
                apiModelId: model_id,
                inputTokens: inputTokens,
                outputTokens: outputTokens
              });
            }
          } catch (costError) {
            console.error('Error calculating cost:', costError);
            // If it's a pricing error, don't use fallback - throw the error to stop execution
            if (costError.message.includes('Missing pricing data') || costError.message.includes('No pricing data available')) {
              if (!responseSent) {
                throw costError;
              }
              return;
            }
            // Fallback to legacy cost calculation for other errors
            if (aiService && aiService.calculateCost) {
              finalCost = await aiService.calculateCost(model_id, inputTokens, outputTokens);
            }
          }

          if (!streamInterrupted) {
            sendEvent('completed', {
              text: fullText,
              cost: finalCost ? {
                input_tokens: finalCost.input_tokens,
                output_tokens: finalCost.output_tokens,
                total_tokens: finalCost.total_tokens,
                price_1m_input_tokens: finalCost.price_1m_input_tokens,
                price_1m_output_tokens: finalCost.price_1m_output_tokens,
                fixed_markup_perc: finalCost.fixed_markup_perc,
                fixed_markup_value: finalCost.fixed_markup_value,
                markup_perc_value: finalCost.markup_perc_value, // Rinominato da markup_perc
                total_markup_value: finalCost.total_markup_value, // Rinominato da total_markup
                total_cost_for_user_credits: finalCost.total_cost_for_user, // Rinominato da total_cost_for_user
                total_cost_for_user_money: creditsToEur(finalCost.total_cost_for_user).toFixed(4), // Conversione in euro
                total_cost_aigens: finalCost.total_cost_aigens,
                total_margin_value: finalCost.total_margin_value,
                new_balance: (wallet.balance - finalCost.total_cost_for_user).toFixed(4) // Nuovo bilancio dopo la transazione
              } : null
            });
          }
          res.end();
          responseSent = true;
        } catch (err) {
          console.error('Messages API: Critical error in streaming flow:', err);
          console.error('Messages API: Error stack:', err.stack);

          // Check if this is a pricing/cost calculation error - should not continue execution
          if (err.message && (err.message.includes('Missing pricing data') ||
            err.message.includes('No pricing data available') ||
            err.message.includes('Cost calculation failed'))) {
            console.error('Messages API: Pricing error detected, stopping execution completely');
            streamInterrupted = 'pricing_error'; // Mark as pricing error to prevent async save
            sendEvent('error', {
              error: 'Modello non disponibile',
              details: 'Dati di pricing mancanti per questo modello. Contatta il supporto.'
            });
            res.end();
            responseSent = true;
            return; // Critical: stop execution here
          }

          // For other errors, continue with normal error handling
          sendEvent('error', { error: `Errore AI (${err.message})`, details: err.message, text: fullText });
          res.end();
          responseSent = true;
          streamInterrupted = true;
          return; // CRITICAL FIX: Return here to prevent execution of non-streaming flow
        }

        // 5. Salvataggio asincrono (fire and forget) - only if no critical pricing errors
        if (streamInterrupted !== 'pricing_error') {
          (async () => {
            try {
              // Check if service already handled message creation (like Ideogram)
              let assistantMessage;
              if (modelInstance.provider?.name === 'ideogram') {
                // For Ideogram, the service already created the assistant message
                // Just log that we're skipping this step
                console.log('Skipping assistant message creation for Ideogram - already handled by service');
                return; // Skip the entire fire-and-forget section for Ideogram
              } else {
                // For other services, create the assistant message as usual
                assistantMessage = await Message.create({
                  chat_id,
                  role: 'assistant',
                  content: fullText,
                  agent_type,
                  agent_model: model_id,
                  is_complete: !streamInterrupted
                });
                assistantMessageId = assistantMessage.id;
              }

              // Usa il costo già calcolato
              if (finalCost) {
                // Salva costi con i nuovi campi calcolati correttamente
                try {
                  await MessageCost.create({
                    message_id: assistantMessage.id,
                    chat_id,
                    user_id: userId,
                    model_id: modelInstance.id,
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    total_tokens: inputTokens + outputTokens,
                    base_cost: finalCost.base_cost || finalCost.baseCost,
                    fixed_markup: finalCost.fixed_markup_value || finalCost.fixedMarkup,
                    percentage_markup: finalCost.markup_value || finalCost.percentageMarkup,
                    total_markup: finalCost.total_markup || finalCost.totalMarkup,
                    total_cost: finalCost.total_cost_for_user || finalCost.totalCost,
                    credit_cost: finalCost.credit_cost || finalCost.total_cost_for_user || finalCost.totalCost,
                    model_used: model_id
                  });
                } catch (error) {
                  console.error('Errore salvataggio MessageCost con credit_cost:', error);
                  // Fallback: salvare senza credit_cost
                  await MessageCost.create({
                    message_id: assistantMessage.id,
                    chat_id,
                    user_id: userId,
                    model_id: modelInstance.id,
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    total_tokens: inputTokens + outputTokens,
                    base_cost: finalCost.base_cost || finalCost.baseCost,
                    fixed_markup: finalCost.fixed_markup_value || finalCost.fixedMarkup,
                    percentage_markup: finalCost.markup_value || finalCost.percentageMarkup,
                    total_markup: finalCost.total_markup || finalCost.totalMarkup,
                    total_cost: finalCost.total_cost_for_user || finalCost.totalCost,
                    model_used: model_id
                  });
                }
                // Aggiorna wallet
                await Wallet.update(
                  { balance: db.sequelize.literal(`balance - ${finalCost.total_cost_for_user || finalCost.totalCost}`) },
                  { where: { user_id: userId } }
                );
              }

              // Background prompt categorization and usage statistics (fire and forget)
              // Only execute if we have a successful AI response (assistantMessageId exists and fullText is not empty)
              if (assistantMessageId && fullText && fullText.trim().length > 0) {
                (async () => {
                  try {
                    const startTime = Date.now();
                    const categorization = await pythonAddonService.categorizePrompt(content, false);
                    const responseTime = (Date.now() - startTime) / 1000; // Convert to seconds

                    if (categorization && assistantMessageId) {
                      await saveUsageStatistics({
                        modelId: modelInstance.id,
                        messageId: assistantMessageId,
                        inputLength: content.length,
                        outputLength: fullText.length,
                        categorization: categorization,
                        responseTime: responseTime,
                        expectedCost: 0, // Will be populated from cost estimation
                        effectiveCost: finalCost?.total_cost_for_user || finalCost?.totalCost || 0,
                        hasAttachments: (attachments && attachments.length > 0)
                      });
                      console.log('Usage statistics saved for message:', assistantMessageId);

                      // Report usage stats to Python addon endpoint
                      const userToken = req.headers.authorization?.replace('Bearer ', '');
                      if (userToken) {
                        await reportUserUsageStats(userToken, userId, {
                          inputLength: content.length,
                          outputLength: fullText.length,
                          modelUsed: model_id,
                          cost: finalCost?.total_cost_for_user || finalCost?.totalCost || 0,
                          responseTime: responseTime,
                          hasAttachments: (attachments && attachments.length > 0)
                        }, categorization);
                      }
                    }
                  } catch (err) {
                    console.error('Background categorization/statistics failed:', err.message);
                    // Don't throw - this is a background operation
                  }
                })();
              } else {
                console.log('Skipping categorization task - no successful AI response generated');
              }
            } catch (err) {
              // Log errore e inserisci in tabella message_save_errors per retry
              console.error('Errore salvataggio asincrono messaggi/costi:', err);
              try {
                await db.sequelize.models.MessageSaveError.create({
                  chat_id,
                  user_id: userId,
                  model_id: modelInstance.id,
                  error_message: err.message,
                  payload: JSON.stringify({ content, agent_type, model_id, fullText, inputTokens, outputTokens })
                });
              } catch (e2) {
                console.error('Errore salvataggio in MessageSaveError:', e2);
              }
            }
          })();
        }

        // CRITICAL FIX: Return here to prevent execution of non-streaming flow
        return;
      }

      // 6. Fallback: modalità non-SSE (solo se non è già stata inviata una risposta streaming)
      if (responseSent) {
        console.log('Messages API: Response already sent via streaming, skipping non-streaming flow');
        return;
      }

      try {
        // Verifica che la chat esista e appartenga all'utente
        const chat = await Chat.findOne({
          where: {
            id: chat_id,
            user_id: userId
          }
        });

        if (!chat) {
          if (req.files && req.files.length > 0) {
            for (const file of req.files) {
              await fs.unlink(file.path).catch(err =>
                console.error(`Error removing file ${file.path}:`, err)
              );
            }
          }
          if (!responseSent) {
            res.status(404).json({
              success: false,
              error: 'Chat non trovata'
            });
            responseSent = true;
          }
          return;
        }

        // Recupera l'istanza del modello tramite id_model
        const modelInstance = await Model.findOne({
          where: { id: id_model },
          include: [{
            model: db.sequelize.models.Provider,
            as: 'provider',
            attributes: ['id', 'name']
          }]
        });
        if (!modelInstance) {
          if (!responseSent) {
            res.status(404).json({ success: false, error: "Modello non trovato" });
            responseSent = true;
          }
          return;
        }
        const model_id = modelInstance.api_model_id || modelInstance.model_slug;

        if (!model_id) {
          if (!responseSent) {
            res.status(400).json({ success: false, error: "ID modello non valido" });
            responseSent = true;
          }
          return;
        }

        // Controllo credito
        const estimatedTokens = Math.ceil(content.length / 4);
        let costEstimate;

        if (model_id.includes('claude')) {
          costEstimate = await anthropicService.calculateCost(model_id, estimatedTokens, 0, true);
        } else if (model_id.includes('gpt-')) {
          costEstimate = await openaiService.calculateCost(model_id, estimatedTokens, 0, true);
        } else if (model_id.includes('deepseek')) {
          costEstimate = await deepseekService.calculateCost(model_id, estimatedTokens, 0, true);
        } else if (model_id.includes('meta-llama') || model_id.includes('mistralai') || model_id.includes('Qwen')) {
          costEstimate = await togetherService.calculateCost(model_id, estimatedTokens, 0, true);
        } else if (model_id.startsWith('ideogram-')) {
          costEstimate = await ideogramService.calculateCost(modelInstance.id, (image_options?.count || 1));
        } else {
          if (!responseSent) {
            return res.status(400).json({
              success: false,
              error: `Modello non supportato: ${model_id}`
            });
          }
          return;
        }

        // Check credito
        if (!wallet || wallet.balance < costEstimate.totalCost) {
          if (!responseSent) {
            return res.status(402).json({
              success: false,
              error: 'Fondi insufficienti',
              details: `Costo stimato: ${costEstimate.totalCost}`
            });
          }
          return;
        }

        // 1. PRIMA: Carica allegati su Google Cloud Storage e salvali nel database
        console.log(`Messages API: Step 1 - Processing ${req.files?.length || 0} attachments in non-streaming mode`);
        const processedAttachments = [];

        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            console.log(`Messages API: Processing attachment: ${file.originalname} (${file.mimetype})`);
            console.log(`Messages API: File path: ${file.path}, size: ${file.size} bytes`);

            try {
              // 1. Leggi il file come buffer
              console.log(`Messages API: Reading file as buffer...`);
              const fileBuffer = await readFile(file.path);
              console.log(`Messages API: File buffer size: ${fileBuffer.length} bytes`);

              // 2. Upload su Google Cloud Storage
              console.log(`Messages API: Uploading to Google Cloud Storage...`);
              const cloudResult = await cloudStorage.uploadFile(fileBuffer, file.originalname, {
                folder: `chat_${chat_id}`,
                contentType: file.mimetype,
                metadata: {
                  user_id: userId,
                  chat_id: chat_id,
                  original_name: file.originalname
                }
              });
              console.log(`Messages API: Upload successful, cloud path: ${cloudResult.filePath}`);

              // 3. Elimina il file locale dopo upload riuscito
              await unlink(file.path).catch(() => { });

              // 4. Prepara i dati dell'allegato per il database
              processedAttachments.push({
                file_name: cloudResult.fileName,
                original_name: file.originalname,
                file_path: cloudResult.gsUrl || cloudResult.filePath,
                file_size: cloudResult.size || file.size,
                mime_type: file.mimetype,
                file_type: getFileTypeFromMimeType(file.mimetype)
              });

              console.log(`Messages API: Attachment prepared for database: ${file.originalname}`);

            } catch (error) {
              console.error(`Messages API: Error processing attachment ${file.originalname}:`, error.message);
              // Elimina il file locale in caso di errore
              await unlink(file.path).catch(() => { });
              // Continua con gli altri allegati
            }
          }
        }

        console.log(`Messages API: Step 1 completed - ${processedAttachments.length} attachments processed`);

        // 2. POI: Salva il messaggio utente
        console.log(`Messages API: Step 2 - Creating user message...`);
        const userMessage = await Message.create({
          chat_id,
          role: 'user',
          content,
          agent_type,
          agent_model: model_id
        });
        console.log(`Messages API: User message created with ID: ${userMessage.id}`);

        // 3. INFINE: Salva gli allegati nel database
        console.log(`Messages API: Step 3 - Saving attachments to database...`);
        const savedAttachmentIds = [];

        for (const attachmentData of processedAttachments) {
          try {
            const attachment = await Attachment.create({
              message_id: userMessage.id,
              user_id: userId,
              chat_id,
              file_type: attachmentData.file_type,
              file_name: attachmentData.file_name,
              original_name: attachmentData.original_name,
              file_path: attachmentData.file_path,
              file_size: attachmentData.file_size,
              mime_type: attachmentData.mime_type
            });
            savedAttachmentIds.push(attachment.id);
            console.log(`Messages API: Attachment saved to database with ID: ${attachment.id}`);
          } catch (error) {
            console.error(`Messages API: Error saving attachment to database:`, error.message);
          }
        }

        console.log(`Messages API: Step 3 completed - ${savedAttachmentIds.length} attachments saved to database`);
        console.log(`Messages API: Proceeding with AI service resolution`);

        // Determina il servizio AI - Utilizzo del servizio di risoluzione basato sul database
        let aiService;
        try {
          console.log(`Messages API: Resolving AI service for model: ${model_id}`);
          const serviceInfo = await modelService.resolveStreamingService(model_id);

          // Map the service name to the actual service object
          switch (serviceInfo.service) {
            case 'anthropicService':
              aiService = anthropicService;
              break;
            case 'openaiService':
              aiService = openaiService;
              break;
            case 'deepseekService':
              aiService = deepseekService;
              break;
            case 'togetherService':
              aiService = togetherService;
              break;
            case 'ideogramService':
              aiService = ideogramService;
              break;
            case 'openrouterService':
              aiService = openrouterService;
              break;
            default:
              if (!responseSent) {
                throw new Error(`Servizio non supportato: ${serviceInfo.service}`);
              }
              return;
          }
        } catch (error) {
          if (!responseSent) {
            throw new Error(`Modello non supportato: ${error.message}`);
          }
          return;
        }

        // Invia la richiesta all'AI (non streaming)
        let fullText = '';
        let inputTokens = 0;
        let outputTokens = 0;

        console.log(`Messages API: Sending non-streaming request to AI service with ${savedAttachmentIds.length} attachment IDs`);

        // Special handling for Ideogram in non-streaming mode
        let response;
        if (modelInstance.provider?.name === 'ideogram') {
          console.log('Messages API: Using Ideogram in non-streaming mode');
          response = await aiService.sendRequest(
            content,
            model_id,
            userId,
            chat_id,
            agent_type,
            savedAttachmentIds,
            null, // no streaming callback
            null // no sendEvent in non-streaming mode
          );
        } else {
          response = await aiService.sendRequest(
            content,
            model_id,
            userId,
            chat_id,
            agent_type,
            savedAttachmentIds,
            null // no streaming callback
          );
        }

        console.log('Response from AI service:', response); // Debug log

        if (response.fullText) {
          fullText = response.fullText;
        }
        if (response.inputTokens !== undefined) {
          inputTokens = response.inputTokens || 0;
          console.log('Input tokens from response:', inputTokens); // Debug log
        }
        if (response.outputTokens !== undefined) {
          outputTokens = response.outputTokens || 0;
          console.log('Output tokens from response:', outputTokens); // Debug log
        }
        // Fallback per diversi formati di risposta
        if (response.usage) {
          console.log('Usage from response:', response.usage); // Debug log
          if (response.usage.input_tokens !== undefined) {
            inputTokens = response.usage.input_tokens;
          }
          if (response.usage.output_tokens !== undefined) {
            outputTokens = response.usage.output_tokens;
          }
          if (response.usage.prompt_tokens !== undefined) {
            inputTokens = response.usage.prompt_tokens;
          }
          if (response.usage.completion_tokens !== undefined) {
            outputTokens = response.usage.completion_tokens;
          }
        }

        // Special handling for image models (like Ideogram) that don't use tokens
        if (modelInstance.provider?.name === 'ideogram') {
          // For Ideogram, tokens should remain 0 since images don't use tokens
          inputTokens = 0;
          outputTokens = 0;
          console.log('Ideogram model (non-SSE) - tokens set to 0 (images don\'t use tokens)');
        } else {
          // For text models, estimate tokens if not received
          if (inputTokens === 0) {
            inputTokens = Math.ceil(finalContent.length / 4); // ✅ Usa finalContent invece di content
            console.log('Estimated inputTokens (non-SSE):', inputTokens); // Debug log
          }
          if (outputTokens === 0) {
            outputTokens = Math.ceil(fullText.length / 4);
            console.log('Estimated outputTokens (non-SSE):', outputTokens); // Debug log
          }
        }

        console.log('Final token counts (non-SSE) - Input:', inputTokens, 'Output:', outputTokens); // Debug log

        // Check if the service already handled message creation (like Ideogram)
        let assistantMessage;
        let cost;

        if (modelInstance.provider?.name === 'ideogram') {
          // For Ideogram, the service already created the assistant message with attachments
          // Get the assistant message from the response
          if (response.messageId) {
            assistantMessage = await Message.findByPk(response.messageId, {
              include: [{
                model: Attachment,
                attributes: ["id", "file_type", "file_name", "file_path", "file_size", "mime_type"]
              }]
            });
            console.log('Using assistant message created by Ideogram service:', assistantMessage.id);
          } else {
            throw new Error('Ideogram service should have returned messageId but none found');
          }

          // Skip cost calculation and wallet updates since Ideogram already handled them
          console.log('Skipping cost calculation and wallet updates for Ideogram - already handled by service');
          cost = {
            total_cost_for_user: 0, // Already deducted by Ideogram service
            total_cost_aigens: 0,
            markup_value: 0,
            fixed_markup_value: 0,
            base_cost: 0,
            total_cost: 0,
            baseCost: 0,
            totalCost: 0,
            fixedMarkup: 0,
            percentageMarkup: 0,
            totalMarkup: 0
          };
        } else {
          // For other services, create the assistant message as usual
          assistantMessage = await Message.create({
            chat_id,
            role: 'assistant',
            content: fullText,
            agent_type,
            agent_model: model_id
          });

          // Calculate costs using the CostCalculator
          try {
            const costCalculator = new CostCalculator();
            const providerName = modelInstance.provider?.name || 'anthropic';

            cost = await costCalculator.calculateCost({
              provider: providerName,
              modelId: modelInstance.id,
              apiModelId: model_id,
              inputTokens: inputTokens,
              outputTokens: outputTokens
            });
          } catch (costError) {
            console.error('Error calculating cost with CostCalculator:', costError);
            // If it's a pricing error, don't use fallback - throw the error to stop execution
            if (costError.message.includes('Missing pricing data') || costError.message.includes('No pricing data available')) {
              if (!responseSent) {
                throw costError;
              }
              return;
            }
            // Fallback to legacy cost calculation for other errors
            cost = response.cost || await aiService.calculateCost(model_id, inputTokens, outputTokens);
          }

          // Save costs for non-Ideogram services
          try {
            await MessageCost.create({
              message_id: assistantMessage.id,
              chat_id,
              user_id: userId,
              model_id: modelInstance.id,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              total_tokens: inputTokens + outputTokens,
              base_cost: cost.base_cost || cost.baseCost,
              fixed_markup: cost.fixed_markup_value || cost.fixedMarkup,
              percentage_markup: cost.markup_value || cost.percentageMarkup,
              total_markup: cost.total_markup || cost.totalMarkup,
              total_cost: cost.total_cost_for_user || cost.totalCost,
              credit_cost: cost.credit_cost || cost.total_cost_for_user || cost.totalCost,
              model_used: model_id
            });
          } catch (error) {
            console.error('Errore salvataggio MessageCost con credit_cost:', error);
            // Fallback: salvare senza credit_cost
            await MessageCost.create({
              message_id: assistantMessage.id,
              chat_id,
              user_id: userId,
              model_id: modelInstance.id,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              total_tokens: inputTokens + outputTokens,
              base_cost: cost.base_cost || cost.baseCost,
              fixed_markup: cost.fixed_markup_value || cost.fixedMarkup,
              percentage_markup: cost.markup_value || cost.percentageMarkup,
              total_markup: cost.total_markup || cost.totalMarkup,
              total_cost: cost.total_cost_for_user || cost.totalCost,
              model_used: model_id
            });
          }

          // Update wallet for non-Ideogram services
          await Wallet.update(
            { balance: db.sequelize.literal(`balance - ${cost.total_cost_for_user || cost.totalCost}`) },
            { where: { user_id: userId } }
          );
        }

        // Update last_message_at for all services
        await Chat.update(
          { last_message_at: new Date() },
          { where: { id: chat_id } }
        );

        // Background prompt categorization and usage statistics (fire and forget)
        // Only execute if we have a successful AI response (assistantMessage exists and fullText is not empty)
        if (assistantMessage && assistantMessage.id && fullText && fullText.trim().length > 0) {
          (async () => {
            try {
              const startTime = Date.now();
              const categorization = await pythonAddonService.categorizePrompt(content, false);
              const responseTime = (Date.now() - startTime) / 1000; // Convert to seconds

              if (categorization && assistantMessage.id) {
                await saveUsageStatistics({
                  modelId: modelInstance.id,
                  messageId: assistantMessage.id,
                  inputLength: content.length,
                  outputLength: fullText.length,
                  categorization: categorization,
                  responseTime: responseTime,
                  expectedCost: 0, // Will be populated from cost estimation
                  effectiveCost: cost?.total_cost_for_user || cost?.totalCost || 0,
                  hasAttachments: (req.files && req.files.length > 0)
                });
                console.log('Usage statistics saved for message:', assistantMessage.id);

                // Report usage stats to Python addon endpoint
                const userToken = req.headers.authorization?.replace('Bearer ', '');
                if (userToken) {
                  await reportUserUsageStats(userToken, userId, {
                    inputLength: content.length,
                    outputLength: fullText.length,
                    modelUsed: model_id,
                    cost: cost?.total_cost_for_user || cost?.totalCost || 0,
                    responseTime: responseTime,
                    hasAttachments: (req.files && req.files.length > 0)
                  }, categorization);
                }
              }
            } catch (err) {
              console.error('Background categorization/statistics failed:', err.message);
              // Don't throw - this is a background operation
            }
          })();
        } else {
          console.log('Skipping categorization task - no successful AI response generated');
        }

        // Only send response if no response has been sent yet
        if (!responseSent) {
          res.status(201).json({
            success: true,
            data: {
              userMessage,
              assistantMessage,
              cost: {
                input_tokens: cost.input_tokens,
                output_tokens: cost.output_tokens,
                total_tokens: cost.total_tokens,
                price_1m_input_tokens: cost.price_1m_input_tokens,
                price_1m_output_tokens: cost.price_1m_output_tokens,
                fixed_markup_perc: cost.fixed_markup_perc,
                fixed_markup_value: cost.fixed_markup_value,
                markup_perc_value: cost.markup_perc_value, // Rinominato da markup_perc
                total_markup_value: cost.total_markup_value, // Rinominato da total_markup
                total_cost_for_user_credits: cost.total_cost_for_user, // Rinominato da total_cost_for_user
                total_cost_for_user_money: creditsToEur(cost.total_cost_for_user).toFixed(4), // Conversione in euro
                total_cost_aigens: cost.total_cost_aigens,
                total_margin_value: cost.total_margin_value,
                new_balance: (wallet.balance - cost.total_cost_for_user).toFixed(4) // Nuovo bilancio dopo la transazione
              }
            }
          });
          responseSent = true;
        }
      } catch (error) {
        console.error('Errore nell\'invio del messaggio:', error);

        // Cleanup files if error
        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            await fs.unlink(file.path).catch(err =>
              console.error(`Error removing file ${file.path}:`, err)
            );
          }
        }

        // Only re-throw if no response has been sent yet
        if (!responseSent) {
          throw error;
        }
      }
    } catch (error) {
      console.error('Messages API: Unhandled error:', error);

      // Cleanup files if they exist
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          await fs.unlink(file.path).catch(err =>
            console.error(`Error removing file ${file.path}:`, err)
          );
        }
      }

      // Only send error response if no response has been sent yet
      if (!responseSent && !res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Errore interno del server',
          details: error.message
        });
        responseSent = true;
      }
    }
  }
);

/**
 * @swagger
 * /api/v1/chats/{chatId}/messages/{id}:
 *   put:
 *     summary: Aggiorna un messaggio esistente
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del messaggio
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: Nuovo contenuto del messaggio
 *     responses:
 *       200:
 *         description: Messaggio aggiornato con successo
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
 *                     chat_id:
 *                       type: integer
 *                     role:
 *                       type: string
 *                     content:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Dati non validi
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Messaggio non trovato
 *       500:
 *         description: Errore del server
 */
router.put("/:id", authMiddleware.authenticate, async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const messageId = req.params.id;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: "Il contenuto è obbligatorio",
      });
    }

    // Trova il messaggio
    const message = await Message.findOne({
      where: {
        id: messageId,
        chat_id: chatId,
      },
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: "Messaggio non trovato",
      });
    }

    // Verifica che il messaggio appartenga a una chat dell'utente
    const chat = await Chat.findOne({
      where: {
        id: chatId,
        user_id: req.user.id,
      },
    });

    if (!chat) {
      return res.status(401).json({
        success: false,
        error: "Non autorizzato a modificare questo messaggio",
      });
    }

    // Verifica che il messaggio sia dell'utente (non si possono modificare i messaggi dell'assistente)
    if (message.role !== "user") {
      return res.status(400).json({
        success: false,
        error: "Puoi modificare solo i tuoi messaggi",
      });
    }

    // Aggiorna il messaggio
    message.content = content;
    await message.save();

    res.status(200).json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error("Errore nell'aggiornamento del messaggio:", error);
    res.status(500).json({
      success: false,
      error: "Errore nell'aggiornamento del messaggio",
    });
  }
});

/**
 * @swagger
 * /api/v1/chats/{chatId}/messages/{id}:
 *   delete:
 *     summary: Elimina un messaggio
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del messaggio
 *     responses:
 *       200:
 *         description: Messaggio eliminato con successo
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
 *                   example: Messaggio eliminato con successo
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Messaggio non trovato
 *       500:
 *         description: Errore del server
 */
router.delete("/:id", authMiddleware.authenticate, async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const chatId = req.params.chatId;
    const messageId = req.params.id;

    // Trova il messaggio
    const message = await Message.findOne({
      where: {
        id: messageId,
        chat_id: chatId,
      },
      include: [
        {
          model: Chat,
          where: {
            user_id: req.user.id,
          },
        },
        {
          model: Attachment,
        },
      ],
      transaction,
    });

    if (!message) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: "Messaggio non trovato",
      });
    }

    // Elimina gli allegati associati
    if (message.Attachments && message.Attachments.length > 0) {
      for (const attachment of message.Attachments) {
        // Elimina il file fisico
        try {
          await fs.unlink(attachment.file_path);
        } catch (err) {
          console.error(
            `Impossibile eliminare il file: ${attachment.file_path}`,
            err
          );
        }

        // Elimina il record dal database
        await attachment.destroy({ transaction });
      }
    }

    // Elimina i costi associati
    await MessageCost.destroy({
      where: {
        message_id: message.id,
      },
      transaction,
    });

    // Elimina il messaggio
    await message.destroy({ transaction });

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: "Messaggio eliminato con successo",
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    console.error("Errore nell'eliminazione del messaggio:", error);
    res.status(500).json({
      success: false,
      error: "Errore nell'eliminazione del messaggio",
    });
  }
});

/**
 * @swagger
 * /api/v1/chats/{chatId}/messages/{id}/cost:
 *   get:
 *     summary: Ottiene i dettagli del costo di un messaggio
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del messaggio
 *     responses:
 *       200:
 *         description: Dettagli del costo recuperati con successo
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
 *                     message_id:
 *                       type: integer
 *                     input_tokens:
 *                       type: integer
 *                     output_tokens:
 *                       type: integer
 *                     cost_usd:
 *                       type: number
 *                       format: float
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Dettagli del costo non trovati
 *       500:
 *         description: Errore del server
 */
router.get("/:id/cost", authMiddleware.authenticate, async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const messageId = req.params.id;

    const messageCost = await MessageCost.findOne({
      where: {
        message_id: messageId,
      },
      include: [
        {
          model: Message,
          where: {
            chat_id: chatId,
          },
          include: [
            {
              model: Chat,
              where: {
                user_id: req.user.id,
              },
            },
          ],
        },
      ],
    });

    if (!messageCost) {
      return res.status(404).json({
        success: false,
        error: "Dettagli del costo non trovati",
      });
    }

    res.status(200).json({
      success: true,
      data: messageCost,
    });
  } catch (error) {
    console.error("Errore nel recupero dei dettagli del costo:", error);
    res.status(500).json({
      success: false,
      error: "Errore nel recupero dei dettagli del costo",
    });
  }
});

/**
 * @swagger
 * /api/v1/chats/{chatId}/messages/{id}/like:
 *   post:
 *     summary: Imposta un like per un messaggio
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del messaggio
 *     responses:
 *       200:
 *         description: Like impostato con successo
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
 *                     user_like:
 *                       type: boolean
 *                       example: true
 *                     user_dislike:
 *                       type: boolean
 *                       example: false
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Messaggio non trovato
 *       500:
 *         description: Errore del server
 */
router.post("/:id/like", authMiddleware.authenticate, async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const messageId = req.params.id;

    // Trova il messaggio e verifica che appartenga a una chat dell'utente
    const message = await Message.findOne({
      where: {
        id: messageId,
        chat_id: chatId,
      },
      include: [
        {
          model: Chat,
          where: {
            user_id: req.user.id,
          },
        },
      ],
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: "Messaggio non trovato",
      });
    }

    // Imposta like a true e dislike a false
    message.user_like = true;
    message.user_dislike = false;
    await message.save();

    res.status(200).json({
      success: true,
      data: {
        id: message.id,
        user_like: message.user_like,
        user_dislike: message.user_dislike,
      },
    });
  } catch (error) {
    console.error("Errore nell'impostazione del like:", error);
    res.status(500).json({
      success: false,
      error: "Errore nell'impostazione del like",
    });
  }
});

/**
 * @swagger
 * /api/v1/chats/{chatId}/messages/{id}/dislike:
 *   post:
 *     summary: Imposta un dislike per un messaggio
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del messaggio
 *     responses:
 *       200:
 *         description: Dislike impostato con successo
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
 *                     user_like:
 *                       type: boolean
 *                       example: false
 *                     user_dislike:
 *                       type: boolean
 *                       example: true
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Messaggio non trovato
 *       500:
 *         description: Errore del server
 */
router.post("/:id/dislike", authMiddleware.authenticate, async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const messageId = req.params.id;

    // Trova il messaggio e verifica che appartenga a una chat dell'utente
    const message = await Message.findOne({
      where: {
        id: messageId,
        chat_id: chatId,
      },
      include: [
        {
          model: Chat,
          where: {
            user_id: req.user.id,
          },
        },
      ],
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: "Messaggio non trovato",
      });
    }

    // Imposta dislike a true e like a false
    message.user_dislike = true;
    message.user_like = false;
    await message.save();

    res.status(200).json({
      success: true,
      data: {
        id: message.id,
        user_like: message.user_like,
        user_dislike: message.user_dislike,
      },
    });
  } catch (error) {
    console.error("Errore nell'impostazione del dislike:", error);
    res.status(500).json({
      success: false,
      error: "Errore nell'impostazione del dislike",
    });
  }
});

/**
 * @swagger
 * /api/v1/chats/{chatId}/messages/{id}/feedback:
 *   delete:
 *     summary: Rimuove il feedback (like/dislike) da un messaggio
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID della chat
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del messaggio
 *     responses:
 *       200:
 *         description: Feedback rimosso con successo
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
 *                     user_like:
 *                       type: boolean
 *                       example: null
 *                     user_dislike:
 *                       type: boolean
 *                       example: null
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Messaggio non trovato
 *       500:
 *         description: Errore del server
 */
router.delete("/:id/feedback", authMiddleware.authenticate, async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const messageId = req.params.id;

    // Trova il messaggio e verifica che appartenga a una chat dell'utente
    const message = await Message.findOne({
      where: {
        id: messageId,
        chat_id: chatId,
      },
      include: [
        {
          model: Chat,
          where: {
            user_id: req.user.id,
          },
        },
      ],
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: "Messaggio non trovato",
      });
    }

    // Rimuovi il feedback (imposta entrambi a null)
    message.user_like = null;
    message.user_dislike = null;
    await message.save();

    res.status(200).json({
      success: true,
      data: {
        id: message.id,
        user_like: message.user_like,
        user_dislike: message.user_dislike,
      },
    });
  } catch (error) {
    console.error("Errore nella rimozione del feedback:", error);
    res.status(500).json({
      success: false,
      error: "Errore nella rimozione del feedback",
    });
  }
});

/**
 * Prepara il contenuto con il contesto delle chat per i modelli text-to-text
 * @param {string} content - Contenuto originale del messaggio
 * @param {number} chatId - ID della chat
 * @param {string} providerName - Nome del provider AI
 * @param {Object} modelInstance - Istanza del modello
 * @returns {Promise<string>} Contenuto con contesto se applicabile
 */
async function prepareContentWithContext(content, chatId, providerName, modelInstance) {
  let finalContent = content;
  
  // Aggiungi contesto solo per modelli text-to-text
  if (providerName && !['ideogram', 'google-veo'].includes(providerName)) {
    try {
      finalContent = await preparePromptWithContext(content, chatId, providerName);
      console.log(`Messages API: Added chat context for provider ${providerName}`);
    } catch (contextError) {
      console.error('Messages API: Error preparing chat context:', contextError);
      // In caso di errore, usa il contenuto originale
      finalContent = content;
    }
  }
  
  return finalContent;
}

module.exports = router;
module.exports.estimateCostHandler = estimateCostHandler;