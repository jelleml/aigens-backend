const { Op } = require('sequelize');
const { sequelize, Chat, Message, User, Model, Wallet, Transaction } = require('../database');
const moment = require('moment');

/**
 * Service for analytics functionality
 */
class AnalyticsService {
    /**
     * Get chat agent type usage statistics by time period
     * @param {string} timePeriod - 'week', 'month', or 'year'
     * @returns {Promise<Object>} - Analytics data for agent types
     */
    async getChatAgentTypeStats(timePeriod) {
        try {
            const startDate = this._getStartDateByPeriod(timePeriod);

            const results = await Message.findAll({
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                    'agent_type'
                ],
                where: {
                    createdAt: {
                        [Op.gte]: startDate
                    },
                    agent_type: {
                        [Op.ne]: null
                    }
                },
                group: ['agent_type'],
                raw: true
            });

            // Calculate total for percentage computation
            const total = results.reduce((sum, item) => sum + parseInt(item.count), 0);

            // Format the results with percentages
            const formattedResults = results.map(item => ({
                agent_type: item.agent_type,
                count: parseInt(item.count),
                percentage: total > 0 ? parseFloat(((parseInt(item.count) / total) * 100).toFixed(2)) : 0
            }));

            return {
                period: timePeriod,
                data: formattedResults,
                total
            };
        } catch (error) {
            console.error('Error fetching chat agent type statistics:', error);
            throw error;
        }
    }

    /**
     * Get chat agent model usage statistics by time period
     * @param {string} timePeriod - 'week', 'month', or 'year'
     * @returns {Promise<Object>} - Analytics data for agent models
     */
    async getChatAgentModelStats(timePeriod) {
        try {
            const startDate = this._getStartDateByPeriod(timePeriod);

            const results = await Message.findAll({
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                    'model_id'
                ],
                include: [{
                    model: Model,
                    attributes: ['name'],
                    required: true
                }],
                where: {
                    createdAt: {
                        [Op.gte]: startDate
                    },
                    model_id: {
                        [Op.ne]: null
                    }
                },
                group: ['model_id', 'Model.name'],
                raw: true
            });

            // Calculate total for percentage computation
            const total = results.reduce((sum, item) => sum + parseInt(item.count), 0);

            // Format the results with percentages
            const formattedResults = results.map(item => ({
                model: item['Model.name'],
                model_id: item.model_id,
                count: parseInt(item.count),
                percentage: total > 0 ? parseFloat(((parseInt(item.count) / total) * 100).toFixed(2)) : 0
            }));

            return {
                period: timePeriod,
                data: formattedResults,
                total
            };
        } catch (error) {
            console.error('Error fetching chat agent model statistics:', error);
            throw error;
        }
    }

    /**
     * Get user credit usage over time
     * @param {string} timePeriod - 'week', 'month', or 'year'
     * @returns {Promise<Object>} - User credit usage data for line chart
     */
    async getUserCreditUsage(timePeriod) {
        try {
            const { startDate, dateFormat, groupBy } = this._getTimeConfig(timePeriod);

            const results = await Transaction.findAll({
                attributes: [
                    [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), dateFormat), 'date'],
                    [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
                ],
                where: {
                    type: 'DEBIT', // Assuming DEBIT transactions represent credit usage
                    createdAt: {
                        [Op.gte]: startDate
                    }
                },
                group: [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), dateFormat)],
                order: [[sequelize.col('date'), 'ASC']],
                raw: true
            });

            // Fill in missing dates with zero values
            const filledData = this._fillMissingDates(results, startDate, new Date(), groupBy, dateFormat);

            return {
                period: timePeriod,
                data: filledData
            };
        } catch (error) {
            console.error('Error fetching user credit usage:', error);
            throw error;
        }
    }

    /**
     * Get savings data compared to commercial models
     * @returns {Promise<Object>} - Savings data including total, percentage and details by model
     */
    async getSavingsData() {
        try {
            // Get all models with their pricing information
            const models = await Model.findAll({
                attributes: ['id', 'name', 'input_price_per_million_tokens', 'output_price_per_million_tokens'],
                raw: true
            });

            // Create a map of models by id for quick lookup
            const modelsMap = models.reduce((acc, model) => {
                acc[model.id] = model;
                return acc;
            }, {});

            // Get all messages with their token counts
            const messages = await Message.findAll({
                attributes: [
                    'model_id',
                    [sequelize.fn('SUM', sequelize.col('input_tokens')), 'total_input_tokens'],
                    [sequelize.fn('SUM', sequelize.col('output_tokens')), 'total_output_tokens'],
                    [sequelize.fn('SUM', sequelize.col('cost')), 'actual_cost']
                ],
                where: {
                    model_id: {
                        [Op.ne]: null
                    }
                },
                group: ['model_id'],
                raw: true
            });

            let totalActualCost = 0;
            let totalCommercialCost = 0;
            const modelDetails = [];

            // Calculate costs and savings for each model
            messages.forEach(message => {
                const model = modelsMap[message.model_id];
                if (!model) return;

                const inputTokens = parseInt(message.total_input_tokens);
                const outputTokens = parseInt(message.total_output_tokens);
                const actualCost = parseFloat(message.actual_cost);

                // Calculate what it would cost with commercial rates (OpenAI or Anthropic)
                // This is a simplified example, in reality you'd have a more complex comparison
                const commercialInputRate = 0.01; // Example rate per million tokens for commercial equivalent
                const commercialOutputRate = 0.03; // Example rate per million tokens for commercial equivalent

                const commercialCost = (inputTokens / 1000000 * commercialInputRate) +
                    (outputTokens / 1000000 * commercialOutputRate);

                const savings = commercialCost - actualCost;
                const savingsPercentage = commercialCost > 0 ?
                    parseFloat((savings / commercialCost * 100).toFixed(2)) : 0;

                totalActualCost += actualCost;
                totalCommercialCost += commercialCost;

                modelDetails.push({
                    model: model.name,
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    actual_cost: parseFloat(actualCost.toFixed(4)),
                    commercial_cost: parseFloat(commercialCost.toFixed(4)),
                    savings: parseFloat(savings.toFixed(4)),
                    savings_percentage: savingsPercentage
                });
            });

            const totalSavings = totalCommercialCost - totalActualCost;
            const totalSavingsPercentage = totalCommercialCost > 0 ?
                parseFloat(((totalSavings / totalCommercialCost) * 100).toFixed(2)) : 0;

            return {
                total_savings: parseFloat(totalSavings.toFixed(4)),
                total_savings_percentage: totalSavingsPercentage,
                currency: 'EUR',
                model_details: modelDetails
            };
        } catch (error) {
            console.error('Error calculating savings data:', error);
            throw error;
        }
    }

    /**
     * Helper method to get start date based on time period
     * @param {string} timePeriod - 'week', 'month', or 'year'
     * @returns {Date} - Start date for the period
     * @private
     */
    _getStartDateByPeriod(timePeriod) {
        const now = new Date();
        switch (timePeriod) {
            case 'week':
                return moment().subtract(1, 'weeks').toDate();
            case 'month':
                return moment().subtract(1, 'months').toDate();
            case 'year':
                return moment().subtract(1, 'years').toDate();
            default:
                return moment().subtract(1, 'weeks').toDate(); // Default to week
        }
    }

    /**
     * Helper method to get time configuration for queries
     * @param {string} timePeriod - 'week', 'month', or 'year'
     * @returns {Object} - Configuration with startDate, dateFormat and groupBy
     * @private
     */
    _getTimeConfig(timePeriod) {
        switch (timePeriod) {
            case 'week':
                return {
                    startDate: moment().subtract(1, 'weeks').toDate(),
                    dateFormat: '%Y-%m-%d',
                    groupBy: 'day'
                };
            case 'month':
                return {
                    startDate: moment().subtract(1, 'months').toDate(),
                    dateFormat: '%Y-%m-%d',
                    groupBy: 'day'
                };
            case 'year':
                return {
                    startDate: moment().subtract(1, 'years').toDate(),
                    dateFormat: '%Y-%m',
                    groupBy: 'month'
                };
            default:
                return {
                    startDate: moment().subtract(1, 'weeks').toDate(),
                    dateFormat: '%Y-%m-%d',
                    groupBy: 'day'
                };
        }
    }

    /**
     * Helper method to fill in missing dates in the data
     * @param {Array} data - Original data array
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @param {string} groupBy - Grouping type ('day' or 'month')
     * @param {string} dateFormat - Date format used in SQL
     * @returns {Array} - Filled data array
     * @private
     */
    _fillMissingDates(data, startDate, endDate, groupBy, dateFormat) {
        const filledData = [];
        const dateMap = new Map();

        // Create a map from existing data
        data.forEach(item => {
            dateMap.set(item.date, parseFloat(item.total_amount));
        });

        // Generate all dates in the range
        let current = moment(startDate);
        const end = moment(endDate);

        while (current.isSameOrBefore(end)) {
            let dateKey;

            if (groupBy === 'day') {
                dateKey = current.format('YYYY-MM-DD');
            } else if (groupBy === 'month') {
                dateKey = current.format('YYYY-MM');
            }

            filledData.push({
                date: dateKey,
                value: dateMap.has(dateKey) ? dateMap.get(dateKey) : 0
            });

            if (groupBy === 'day') {
                current.add(1, 'days');
            } else if (groupBy === 'month') {
                current.add(1, 'months');
            }
        }

        return filledData;
    }
}

module.exports = new AnalyticsService(); 