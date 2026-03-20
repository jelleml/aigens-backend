/**
 * API v2 Cost Estimation Endpoint
 * Compatible with Vercel AI SDK frontend integration
 */

const express = require('express');
const router = express.Router();

const businessLogicAdapter = require('../../services/business-logic-adapter.service');
const authMiddleware = require('../../middlewares/auth.middleware');
const { createLogger } = require('../../scripts/utils/error-handler');

const logger = createLogger('api-v2-cost-estimation');

/**
 * @swagger
 * /api/v2/messages/estimate-cost:
 *   post:
 *     summary: Estimate cost for AI request (AI SDK compatible)
 *     tags: [Cost Estimation v2]
 *     security:
 *       - bearerAuth: []
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
 *                   user_preferences:
 *                     type: object
 *                     properties:
 *                       costs:
 *                         type: number
 *                         minimum: 0
 *                         maximum: 1
 *                       quality:
 *                         type: number
 *                         minimum: 0
 *                         maximum: 1
 *                       speed:
 *                         type: number
 *                         minimum: 0
 *                         maximum: 1
 *     responses:
 *       200:
 *         description: Cost estimation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 estimated_cost:
 *                   type: number
 *                   description: Total estimated cost in credits
 *                 input_tokens:
 *                   type: integer
 *                   description: Estimated input tokens
 *                 output_tokens_estimated:
 *                   type: integer
 *                   description: Estimated output tokens
 *                 total_tokens_estimated:
 *                   type: integer
 *                   description: Total estimated tokens
 *                 model:
 *                   type: string
 *                   description: Model slug used for estimation
 *                 model_selected:
 *                   type: string
 *                   description: Selected model (if auto-selector was used)
 *                 currency:
 *                   type: string
 *                   example: credits
 *                 breakdown:
 *                   type: object
 *                   properties:
 *                     input_cost:
 *                       type: number
 *                     output_cost:
 *                       type: number
 *                     attachments_cost:
 *                       type: number
 *                     markup:
 *                       type: number
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/estimate-cost',
    authMiddleware.authenticate,
    async (req, res) => {
        const requestId = `cost_est_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            const userId = req.user.id;
            const {
                messages,
                id_model,
                experimental_attachments = [],
                data = {}
            } = req.body;

            logger.info('V2 API: Cost estimation request', {
                requestId,
                userId,
                modelId: id_model,
                messageCount: messages?.length,
                attachmentCount: experimental_attachments.length
            });

            // Validate required fields
            if (!messages || !Array.isArray(messages) || messages.length === 0) {
                return res.status(400).json({
                    error: {
                        type: 'validation_error',
                        message: 'Messages array is required and must not be empty',
                        code: 'INVALID_MESSAGES'
                    }
                });
            }

            if (!id_model) {
                return res.status(400).json({
                    error: {
                        type: 'validation_error',
                        message: 'Model ID is required',
                        code: 'MISSING_MODEL'
                    }
                });
            }

            // Handle auto-selector if needed
            let modelSlug = id_model;
            let selectedModel = id_model;
            let autoSelectorUsed = false;

            if (id_model === 'auto') {
                logger.info('V2 API: Auto-selector requested for cost estimation', { requestId, userId });

                try {
                    const autoSelectorService = require('../../services/auto-selector.service');
                    const userContent = messages.map(m => m.content).join(' ');

                    const autoSelectorResult = await autoSelectorService.selectModel({
                        prompt: userContent,
                        userPreferences: data.user_preferences || {},
                        attachments: experimental_attachments,
                        userId: userId
                    });

                    modelSlug = autoSelectorResult.model_slug;
                    selectedModel = modelSlug;
                    autoSelectorUsed = true;

                    logger.info('V2 API: Auto-selector completed for cost estimation', {
                        requestId,
                        selectedModel: modelSlug,
                        confidence: autoSelectorResult.confidence
                    });

                } catch (autoSelectorError) {
                    logger.warn('V2 API: Auto-selector failed for cost estimation, using default', {
                        requestId,
                        error: autoSelectorError.message
                    });

                    // Use default fallback
                    modelSlug = 'gpt-4o-mini';
                    selectedModel = modelSlug;
                    autoSelectorUsed = true;
                }
            }

            // Estimate cost using business logic adapter
            const costEstimation = await businessLogicAdapter.estimateCost({
                modelSlug,
                messages,
                userId
            });

            // Calculate attachment costs if any
            let attachmentCost = 0;
            if (experimental_attachments.length > 0) {
                // Simplified attachment cost calculation
                // In a real implementation, this would depend on file size and type
                attachmentCost = experimental_attachments.length * 0.001; // $0.001 per attachment
            }

            // Prepare response in the specified format
            const response = {
                estimated_cost: costEstimation.totalCost + attachmentCost,
                input_tokens: costEstimation.inputTokens,
                output_tokens_estimated: costEstimation.outputTokens,
                total_tokens_estimated: costEstimation.totalTokens,
                model: modelSlug,
                model_selected: selectedModel,
                currency: 'credits',
                breakdown: {
                    input_cost: costEstimation.baseCost * (costEstimation.inputTokens / costEstimation.totalTokens),
                    output_cost: costEstimation.baseCost * (costEstimation.outputTokens / costEstimation.totalTokens),
                    attachments_cost: attachmentCost,
                    markup: costEstimation.totalMarkup
                },
                // Additional metadata
                auto_selector_used: autoSelectorUsed,
                provider: costEstimation.provider || 'unknown'
            };

            logger.info('V2 API: Cost estimation completed', {
                requestId,
                estimatedCost: response.estimated_cost,
                model: modelSlug
            });

            res.json(response);

        } catch (error) {
            logger.error('V2 API: Cost estimation failed', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            // Send appropriate error response
            const statusCode = error.statusCode || 500;
            const errorResponse = {
                error: {
                    type: error.type || 'internal_error',
                    message: error.message,
                    code: error.code || 'COST_ESTIMATION_ERROR'
                }
            };

            res.status(statusCode).json(errorResponse);
        }
    }
);

module.exports = router;
