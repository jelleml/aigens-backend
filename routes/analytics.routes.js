const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const authMiddleware = require('../middlewares/auth.middleware');

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Analytics APIs for platform usage data
 */

/**
 * @swagger
 * /api/v1/analytics/chat-agent-type:
 *   get:
 *     summary: Get chat agent type usage statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, year]
 *           default: week
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: Successfully retrieved chat agent type statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: string
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           agent_type:
 *                             type: string
 *                           count:
 *                             type: integer
 *                           percentage:
 *                             type: number
 *                     total:
 *                       type: integer
 *       400:
 *         description: Invalid parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/chat-agent-type', authMiddleware.authenticate, analyticsController.getChatAgentTypeStats);

/**
 * @swagger
 * /api/v1/analytics/chat-agent-model:
 *   get:
 *     summary: Get chat agent model usage statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, year]
 *           default: week
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: Successfully retrieved chat agent model statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: string
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           model:
 *                             type: string
 *                           model_id:
 *                             type: integer
 *                           count:
 *                             type: integer
 *                           percentage:
 *                             type: number
 *                     total:
 *                       type: integer
 *       400:
 *         description: Invalid parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/chat-agent-model', authMiddleware.authenticate, analyticsController.getChatAgentModelStats);

/**
 * @swagger
 * /api/v1/analytics/credit-usage:
 *   get:
 *     summary: Get user credit usage over time
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, year]
 *           default: week
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: Successfully retrieved credit usage data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: string
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                           value:
 *                             type: number
 *       400:
 *         description: Invalid parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/credit-usage', authMiddleware.authenticate, analyticsController.getUserCreditUsage);

/**
 * @swagger
 * /api/v1/analytics/savings:
 *   get:
 *     summary: Get savings data compared to commercial models
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved savings data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_savings:
 *                       type: number
 *                     total_savings_percentage:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     model_details:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           model:
 *                             type: string
 *                           input_tokens:
 *                             type: integer
 *                           output_tokens:
 *                             type: integer
 *                           actual_cost:
 *                             type: number
 *                           commercial_cost:
 *                             type: number
 *                           savings:
 *                             type: number
 *                           savings_percentage:
 *                             type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/savings', authMiddleware.authenticate, analyticsController.getSavingsData);

module.exports = router; 