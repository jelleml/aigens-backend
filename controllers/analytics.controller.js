const analyticsService = require('../services/analytics.service');
const { getLogger } = require('../services/logging');
const logger = getLogger('analytics', 'controller');

/**
 * Controller for analytics endpoints
 */
class AnalyticsController {
    /**
     * Get chat agent type usage statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getChatAgentTypeStats(req, res) {
        try {
            const { period = 'week' } = req.query;

            if (!['week', 'month', 'year'].includes(period)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid period. Allowed values: week, month, year'
                });
            }

            const data = await analyticsService.getChatAgentTypeStats(period);

            return res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error getting chat agent type statistics:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'An error occurred while fetching chat agent type statistics'
            });
        }
    }

    /**
     * Get chat agent model usage statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getChatAgentModelStats(req, res) {
        try {
            const { period = 'week' } = req.query;

            if (!['week', 'month', 'year'].includes(period)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid period. Allowed values: week, month, year'
                });
            }

            const data = await analyticsService.getChatAgentModelStats(period);

            return res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error getting chat agent model statistics:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'An error occurred while fetching chat agent model statistics'
            });
        }
    }

    /**
     * Get user credit usage over time
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getUserCreditUsage(req, res) {
        try {
            const { period = 'week' } = req.query;

            if (!['week', 'month', 'year'].includes(period)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid period. Allowed values: week, month, year'
                });
            }

            const data = await analyticsService.getUserCreditUsage(period);

            return res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error getting user credit usage:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'An error occurred while fetching user credit usage data'
            });
        }
    }

    /**
     * Get savings data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getSavingsData(req, res) {
        try {
            const data = await analyticsService.getSavingsData();

            return res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error getting savings data:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'An error occurred while fetching savings data'
            });
        }
    }
}

module.exports = new AnalyticsController(); 