/**
 * API v2 Stream Control Endpoint
 * Handle stream interruption and control
 */

const express = require('express');
const router = express.Router({ mergeParams: true });

const aiSDKService = require('../../services/ai-sdk.service');
const businessLogicAdapter = require('../../services/business-logic-adapter.service');
const authMiddleware = require('../../middlewares/auth.middleware');
const { createLogger } = require('../../scripts/utils/error-handler');
const db = require('../../database');

const { Message } = db.sequelize.models;
const logger = createLogger('api-v2-stream-control');

/**
 * @swagger
 * /api/v2/chats/{chatId}/messages/{messageId}/stream:
 *   delete:
 *     summary: Stop streaming for a specific message
 *     tags: [Stream Control v2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat ID
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Message ID being streamed
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [user_cancelled, timeout, error]
 *                 default: user_cancelled
 *                 description: Reason for stopping the stream
 *     responses:
 *       200:
 *         description: Stream stopped successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     content:
 *                       type: string
 *                       description: Partial content when stream was stopped
 *                     is_complete:
 *                       type: boolean
 *                       example: false
 *                     data:
 *                       type: object
 *                       properties:
 *                         interrupted_at:
 *                           type: string
 *                           format: date-time
 *                         reason:
 *                           type: string
 *                         sse_status:
 *                           type: string
 *                           example: interrupted
 *       404:
 *         description: Message or stream not found
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.delete('/:messageId/stream',
    authMiddleware.authenticate,
    async (req, res) => {
        const requestId = `stop_stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            const chatId = req.params.chatId;
            const messageId = req.params.messageId;
            const userId = req.user.id;
            const { reason = 'user_cancelled' } = req.body;

            logger.info('V2 API: Stream stop requested', {
                requestId,
                chatId,
                messageId,
                userId,
                reason
            });

            // Verify message exists and belongs to user
            const message = await Message.findOne({
                where: {
                    id: messageId,
                    chat_id: chatId
                },
                include: [{
                    model: db.models.Chat,
                    as: 'chat',
                    where: { user_id: userId }
                }]
            });

            if (!message) {
                return res.status(404).json({
                    error: {
                        type: 'not_found',
                        message: 'Message not found or access denied',
                        code: 'MESSAGE_NOT_FOUND'
                    }
                });
            }

            // Check if message is currently streaming
            if (message.sse_status !== 'streaming') {
                return res.status(400).json({
                    error: {
                        type: 'invalid_state',
                        message: `Message is not currently streaming (status: ${message.sse_status})`,
                        code: 'NOT_STREAMING'
                    }
                });
            }

            // Try to find and abort the active stream
            const activeStreams = aiSDKService.getActiveStreams();
            let streamFound = false;
            let streamAborted = false;

            // Look for stream by message ID (this would require tracking streams by message ID)
            // For now, we'll try to abort any active streams and update the message
            for (const streamId of activeStreams) {
                try {
                    const aborted = aiSDKService.abortStream(streamId);
                    if (aborted) {
                        streamAborted = true;
                        streamFound = true;
                        logger.info('Stream aborted successfully', { requestId, streamId, messageId });
                        break;
                    }
                } catch (abortError) {
                    logger.warn('Failed to abort stream', {
                        requestId,
                        streamId,
                        error: abortError.message
                    });
                }
            }

            // Update message status regardless of whether we found the stream
            const interruptedAt = new Date();
            await message.update({
                sse_status: 'interrupted',
                sse_error: `Stream interrupted: ${reason}`,
                is_complete: false,
                updated_at: interruptedAt
            });

            logger.info('Message marked as interrupted', {
                requestId,
                messageId,
                reason,
                streamFound,
                streamAborted
            });

            // Prepare response
            const response = {
                success: true,
                stream_found: streamFound,
                stream_aborted: streamAborted,
                message: {
                    id: message.id.toString(),
                    content: message.content,
                    is_complete: false,
                    data: {
                        interrupted_at: interruptedAt.toISOString(),
                        reason: reason,
                        sse_status: 'interrupted',
                        chat_id: chatId
                    }
                }
            };

            res.json(response);

        } catch (error) {
            logger.error('V2 API: Failed to stop stream', {
                requestId,
                chatId: req.params.chatId,
                messageId: req.params.messageId,
                error: error.message,
                stack: error.stack
            });

            res.status(500).json({
                error: {
                    type: 'internal_error',
                    message: 'Failed to stop stream',
                    code: 'STOP_STREAM_ERROR'
                }
            });
        }
    }
);

/**
 * @swagger
 * /api/v2/streams:
 *   get:
 *     summary: Get list of active streams for user
 *     tags: [Stream Control v2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active streams
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 active_streams:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       stream_id:
 *                         type: string
 *                       message_id:
 *                         type: string
 *                       chat_id:
 *                         type: string
 *                       started_at:
 *                         type: string
 *                         format: date-time
 *                 total_count:
 *                   type: integer
 */
router.get('/streams',
    authMiddleware.authenticate,
    async (req, res) => {
        try {
            const userId = req.user.id;

            logger.info('V2 API: Active streams requested', { userId });

            // Get active streams from AI SDK service
            const activeStreamIds = aiSDKService.getActiveStreams();

            // Find messages that are currently streaming for this user
            const streamingMessages = await Message.findAll({
                where: {
                    sse_status: 'streaming'
                },
                include: [{
                    model: db.models.Chat,
                    as: 'chat',
                    where: { user_id: userId },
                    attributes: ['id', 'user_id']
                }],
                attributes: ['id', 'chat_id', 'created_at', 'sse_status'],
                order: [['created_at', 'DESC']]
            });

            // Format response
            const activeStreams = streamingMessages.map(message => ({
                message_id: message.id.toString(),
                chat_id: message.chat_id.toString(),
                started_at: message.created_at.toISOString(),
                sse_status: message.sse_status
            }));

            res.json({
                active_streams: activeStreams,
                total_count: activeStreams.length,
                sdk_active_streams: activeStreamIds.length
            });

        } catch (error) {
            logger.error('V2 API: Failed to get active streams', {
                userId: req.user.id,
                error: error.message
            });

            res.status(500).json({
                error: {
                    type: 'internal_error',
                    message: 'Failed to retrieve active streams',
                    code: 'GET_STREAMS_ERROR'
                }
            });
        }
    }
);

/**
 * @swagger
 * /api/v2/streams/{streamId}:
 *   delete:
 *     summary: Stop stream by stream ID
 *     tags: [Stream Control v2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: streamId
 *         required: true
 *         schema:
 *           type: string
 *         description: Stream ID to stop
 *     responses:
 *       200:
 *         description: Stream stopped successfully
 *       404:
 *         description: Stream not found
 */
router.delete('/streams/:streamId',
    authMiddleware.authenticate,
    async (req, res) => {
        try {
            const streamId = req.params.streamId;
            const userId = req.user.id;

            logger.info('V2 API: Stream stop by ID requested', { streamId, userId });

            // Try to abort the stream
            const aborted = aiSDKService.abortStream(streamId);

            if (!aborted) {
                return res.status(404).json({
                    error: {
                        type: 'not_found',
                        message: 'Stream not found or already completed',
                        code: 'STREAM_NOT_FOUND'
                    }
                });
            }

            res.json({
                success: true,
                stream_id: streamId,
                aborted_at: new Date().toISOString()
            });

        } catch (error) {
            logger.error('V2 API: Failed to stop stream by ID', {
                streamId: req.params.streamId,
                userId: req.user.id,
                error: error.message
            });

            res.status(500).json({
                error: {
                    type: 'internal_error',
                    message: 'Failed to stop stream',
                    code: 'STOP_STREAM_BY_ID_ERROR'
                }
            });
        }
    }
);

module.exports = router;
