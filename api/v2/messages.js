/**
 * API v2 Messages Endpoint
 * Compatible with Vercel AI SDK frontend integration
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const businessLogicAdapter = require('../../services/business-logic-adapter.service');
const performanceMonitoringService = require('../../services/performance-monitoring.service');
const authMiddleware = require('../../middlewares/auth.middleware');
const convertModelIdToSlug = require('../../middlewares/model-id-converter.middleware');
const testAuthBypass = require('../../middlewares/test-auth-bypass.middleware');
const { createLogger } = require('../../scripts/utils/error-handler');
const db = require('../../database');

const { Chat, Message, Attachment } = db.sequelize.models;
const logger = createLogger('api-v2-messages');

/**
 * Get provider name from model slug
 */
function getProviderFromModel(modelSlug) {
    if (modelSlug.startsWith('gpt-') || modelSlug.startsWith('o1-')) return 'openai';
    if (modelSlug.startsWith('claude-')) return 'anthropic';
    if (modelSlug.startsWith('deepseek-')) return 'deepseek';
    if (modelSlug.includes('/')) return 'openrouter'; // Usually has format like "meta-llama/llama-2-70b"
    if (modelSlug.startsWith('together-')) return 'together';
    return 'unknown';
}

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/temp/',
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5
    }
});

/**
 * Convert internal message format to AI SDK compatible format
 */
function convertToAISDKFormat(message) {
    return {
        id: message.id.toString(),
        role: message.role,
        content: message.content,
        createdAt: message.created_at || message.createdAt,
        data: {
            chat_id: message.chat_id,
            status: message.is_complete ? 'sent' : 'sending',
            agent_model: message.agent_model,
            agent_type: message.agent_type || 'text',
            cost: null, // Will be populated if available
            input_tokens: message.input_tokens,
            output_tokens: message.tokens_used,
            is_complete: message.is_complete,
            sse_status: message.sse_status,
            sse_error: message.sse_error
        },
        experimental_attachments: message.Attachments ?
            message.Attachments.map(att => ({
                name: att.file_name,
                contentType: att.mime_type,
                url: att.file_path // This should be processed for signed URLs
            })) : []
    };
}

/**
 * Convert AI SDK format to internal message format
 */
function convertFromAISDKFormat(aiMessage) {
    return {
        role: aiMessage.role,
        content: typeof aiMessage.content === 'string' ? aiMessage.content : JSON.stringify(aiMessage.content),
        experimental_attachments: aiMessage.experimental_attachments || []
    };
}

/**
 * Send Server-Sent Events with Data Stream Protocol
 */
function sendDataStreamEvent(res, type, data) {
    if (res.finished || res.destroyed) return;

    try {
        switch (type) {
            case 'text':
                res.write(`0:${JSON.stringify(data)}\n`);
                break;
            case 'data':
                res.write(`d:${JSON.stringify(data)}\n`);
                break;
            case 'error':
                res.write(`e:${JSON.stringify(data)}\n`);
                break;
            default:
                res.write(`${type}:${JSON.stringify(data)}\n`);
        }
    } catch (error) {
        logger.error('Error sending SSE event', { type, error: error.message });
    }
}

/**
 * Handle streaming response with Data Stream Protocol
 */
function handleStreamingResponse(res, modelSlug, streamPromise) {
    // Set streaming headers
    res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    let totalCost = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let messageId = null;

    streamPromise
        .then(result => {
            if (result.success && result.streaming) {
                messageId = result.assistantMessage.id;

                // Send initial metadata
                sendDataStreamEvent(res, 'data', {
                    status: 'started',
                    model: modelSlug,
                    messageId: messageId
                });
            }
        })
        .catch(error => {
            logger.error('Streaming setup failed', { error: error.message });
            sendDataStreamEvent(res, 'error', {
                type: error.type || 'internal_error',
                message: error.message,
                code: error.code || 'INTERNAL_ERROR'
            });
            if (!res.finished) {
                res.end();
            }
        });

    // Handle connection close
    res.on('close', () => {
        logger.info('Client disconnected from stream', { messageId });
        // Abort stream if still active
        if (streamPromise && streamPromise.streamControl) {
            streamPromise.streamControl.abort();
        }
    });

    return {
        onToken: (delta, accumulated) => {
            sendDataStreamEvent(res, 'text', delta);
        },
        onFinish: (result) => {
            totalCost = result.cost || 0;
            inputTokens = result.usage?.inputTokens || 0;
            outputTokens = result.usage?.outputTokens || 0;

            // Send final metadata
            sendDataStreamEvent(res, 'data', {
                status: 'completed',
                cost: totalCost,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                model: modelSlug,
                messageId: messageId
            });

            if (!res.finished) {
                res.end();
            }
        },
        onError: (error) => {
            sendDataStreamEvent(res, 'error', {
                type: error.type || 'internal_error',
                message: error.message,
                code: error.code || 'INTERNAL_ERROR'
            });

            if (!res.finished) {
                res.end();
            }
        }
    };
}

/**
 * @swagger
 * /api/v2/chats/{chatId}/messages:
 *   post:
 *     summary: Send message with AI SDK compatibility
 *     tags: [Messages v2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *               - id_model
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [user, assistant, system]
 *                     content:
 *                       type: string
 *               id_model:
 *                 type: string
 *                 description: Model slug or "auto" for auto-selection
 *               experimental_attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     contentType:
 *                       type: string
 *                     url:
 *                       type: string
 *               data:
 *                 type: object
 *                 properties:
 *                   chat_id:
 *                     type: string
 *                   use_auto_selector:
 *                     type: boolean
 *                   user_preferences:
 *                     type: object
 *     responses:
 *       200:
 *         description: Streaming response (Data Stream Protocol)
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       201:
 *         description: Non-streaming response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 role:
 *                   type: string
 *                 content:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                 data:
 *                   type: object
 */
router.post('/',
    testAuthBypass, // Test bypass first
    authMiddleware.authenticate,
    convertModelIdToSlug, // Add backward compatibility middleware
    upload.array('attachments', 5),
    async (req, res) => {
        const requestId = `v2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        let finalStatusCode = 200;
        let modelSlug = null;
        let isStreaming = false;

        try {
            const chatId = req.params.chatId;
            const userId = req.user.id;
            const {
                messages,
                id_model,
                experimental_attachments = [],
                data = {}
            } = req.body;

            logger.info('V2 API: Processing message request', {
                requestId,
                chatId,
                userId,
                modelId: id_model,
                messageCount: messages?.length
            });

            // Validate required fields
            if (!messages || !Array.isArray(messages) || messages.length === 0) {
                finalStatusCode = 400;
                return res.status(400).json({
                    error: {
                        type: 'validation_error',
                        message: 'Messages array is required and must not be empty',
                        code: 'INVALID_MESSAGES'
                    }
                });
            }

            if (!id_model) {
                finalStatusCode = 400;
                return res.status(400).json({
                    error: {
                        type: 'validation_error',
                        message: 'Model ID is required',
                        code: 'MISSING_MODEL'
                    }
                });
            }

            modelSlug = id_model;

            // Verify chat access
            const chat = await Chat.findOne({
                where: { id: chatId, user_id: userId }
            });

            if (!chat) {
                return res.status(404).json({
                    error: {
                        type: 'not_found',
                        message: 'Chat not found or access denied',
                        code: 'CHAT_NOT_FOUND'
                    }
                });
            }

            // Convert AI SDK messages to internal format
            const internalMessages = messages.map(convertFromAISDKFormat);

            // Handle auto-selector if needed
            // modelSlug is already declared at the top and assigned on line 332
            let autoSelectorUsed = false;

            if (id_model === 'auto') {
                logger.info('V2 API: Auto-selector requested', { requestId, userId });
                autoSelectorUsed = true;
                // The actual auto-selection will be handled by the business logic adapter
            }

            // Determine if streaming is requested
            isStreaming = req.headers.accept === 'text/plain' ||
                req.headers['x-streaming'] === 'true' ||
                req.headers.accept === 'text/event-stream';

            logger.info('V2 API: Request mode determined', {
                requestId,
                isStreaming,
                accept: req.headers.accept
            });

            // Process attachments from request
            const attachments = [];

            // Handle multipart file uploads
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    attachments.push({
                        name: file.originalname,
                        contentType: file.mimetype,
                        path: file.path,
                        size: file.size
                    });
                }
            }

            // Handle experimental_attachments from JSON
            if (experimental_attachments.length > 0) {
                for (const attachment of experimental_attachments) {
                    attachments.push({
                        name: attachment.name,
                        contentType: attachment.contentType,
                        url: attachment.url
                    });
                }
            }

            if (isStreaming) {
                // Handle streaming response
                const streamHandlers = handleStreamingResponse(res, modelSlug, null);

                const streamPromise = businessLogicAdapter.processAIRequest({
                    modelSlug,
                    messages: internalMessages,
                    chatId,
                    userId,
                    attachments,
                    streaming: true,
                    onToken: streamHandlers.onToken,
                    onFinish: streamHandlers.onFinish,
                    onError: streamHandlers.onError,
                    options: {
                        userPreferences: data.user_preferences
                    }
                });

                // Update stream handlers with actual promise
                handleStreamingResponse(res, modelSlug, streamPromise);

            } else {
                // Handle non-streaming response
                const result = await businessLogicAdapter.processAIRequest({
                    modelSlug,
                    messages: internalMessages,
                    chatId,
                    userId,
                    attachments,
                    streaming: false,
                    options: {
                        userPreferences: data.user_preferences
                    }
                });

                // Convert response to AI SDK format
                const response = {
                    id: result.assistantMessage.id.toString(),
                    role: 'assistant',
                    content: result.content,
                    createdAt: result.assistantMessage.created_at || new Date().toISOString(),
                    data: {
                        cost: result.cost?.total_cost || 0,
                        input_tokens: result.usage?.inputTokens || 0,
                        output_tokens: result.usage?.outputTokens || 0,
                        model: modelSlug,
                        chat_id: chatId
                    }
                };

                res.status(201).json(response);
                finalStatusCode = 201;
            }

            // Clean up uploaded files
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    try {
                        await fs.unlink(file.path);
                    } catch (error) {
                        logger.warn('Failed to clean up uploaded file', { file: file.path, error: error.message });
                    }
                }
            }

        } catch (error) {
            logger.error('V2 API: Message processing failed', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            // Clean up uploaded files on error
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    try {
                        await fs.unlink(file.path);
                    } catch (cleanupError) {
                        logger.warn('Failed to clean up file after error', { file: file.path });
                    }
                }
            }

            // Send appropriate error response
            finalStatusCode = error.statusCode || 500;
            const errorResponse = {
                error: {
                    type: error.type || 'internal_error',
                    message: error.message,
                    code: error.code || 'INTERNAL_ERROR'
                }
            };

            res.status(finalStatusCode).json(errorResponse);
        } finally {
            // Record performance metrics
            const duration = Date.now() - startTime;
            performanceMonitoringService.recordAPIRequest({
                endpoint: '/chats/:chatId/messages',
                method: 'POST',
                userId: req.user?.id,
                duration,
                statusCode: finalStatusCode,
                modelSlug: modelSlug || 'unknown',
                provider: modelSlug ? (modelSlug === 'auto' ? 'auto-selector' : getProviderFromModel(modelSlug)) : 'unknown',
                streaming: isStreaming,
                autoSelectorUsed: modelSlug === 'auto',
                requestId
            });
        }
    }
);

/**
 * @swagger
 * /api/v2/chats/{chatId}/messages:
 *   get:
 *     summary: Get messages in AI SDK compatible format
 *     tags: [Messages v2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of messages to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of messages to skip
 *     responses:
 *       200:
 *         description: Messages in AI SDK format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       role:
 *                         type: string
 *                       content:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                       data:
 *                         type: object
 *                       experimental_attachments:
 *                         type: array
 */
router.get('/',
    authMiddleware.authenticate,
    async (req, res) => {
        try {
            const chatId = req.params.chatId;
            const userId = req.user.id;
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;

            logger.info('V2 API: Fetching messages', { chatId, userId, limit, offset });

            // Verify chat access
            const chat = await Chat.findOne({
                where: { id: chatId, user_id: userId }
            });

            if (!chat) {
                return res.status(404).json({
                    error: {
                        type: 'not_found',
                        message: 'Chat not found or access denied',
                        code: 'CHAT_NOT_FOUND'
                    }
                });
            }

            // Fetch messages with attachments
            const messages = await Message.findAll({
                where: { chat_id: chatId },
                include: [
                    {
                        model: Attachment,
                        as: 'Attachments',
                        required: false
                    }
                ],
                order: [['created_at', 'ASC']],
                limit,
                offset
            });

            // Convert to AI SDK format
            const aiSDKMessages = messages.map(convertToAISDKFormat);

            res.json({
                data: aiSDKMessages,
                pagination: {
                    limit,
                    offset,
                    total: messages.length
                }
            });

        } catch (error) {
            logger.error('V2 API: Failed to fetch messages', {
                chatId: req.params.chatId,
                error: error.message
            });

            res.status(500).json({
                error: {
                    type: 'internal_error',
                    message: 'Failed to fetch messages',
                    code: 'FETCH_MESSAGES_ERROR'
                }
            });
        }
    }
);

module.exports = router;
