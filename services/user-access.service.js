/**
 * Service for managing user access records
 * @module services/user-access.service
 */

const { models } = require('../database');
const { Op } = require('sequelize');

/**
 * Create a new user access record
 * @param {Object} accessData - The access data
 * @param {string} accessData.user_id - The user ID
 * @param {string} accessData.device_type - The device type (mobile, tablet, desktop)
 * @param {string} accessData.browser - The browser name
 * @param {string} accessData.operating_system - The operating system
 * @param {string} [accessData.ip_address] - The IP address
 * @returns {Promise<Object>} The created access record
 */
const createUserAccess = async (accessData) => {
    return await models.UserAccess.create(accessData);
};

/**
 * Get all access records for a user
 * @param {string} userId - The user ID
 * @param {Object} [options] - Query options
 * @param {number} [options.limit=100] - Maximum number of records to retrieve
 * @param {number} [options.offset=0] - Number of records to skip
 * @returns {Promise<Array>} The user access records
 */
const getUserAccesses = async (userId, options = {}) => {
    const { limit = 100, offset = 0 } = options;

    return await models.UserAccess.findAll({
        where: { user_id: userId },
        order: [['accessed_at', 'DESC']],
        limit,
        offset
    });
};

/**
 * Get a specific user access record
 * @param {string} accessId - The access record ID
 * @param {string} userId - The user ID (for access control)
 * @returns {Promise<Object|null>} The user access record or null if not found
 */
const getUserAccess = async (accessId, userId) => {
    return await models.UserAccess.findOne({
        where: {
            id: accessId,
            user_id: userId
        }
    });
};

/**
 * Delete a user access record
 * @param {string} accessId - The access record ID
 * @param {string} userId - The user ID (for access control)
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
const deleteUserAccess = async (accessId, userId) => {
    const deleted = await models.UserAccess.destroy({
        where: {
            id: accessId,
            user_id: userId
        }
    });

    return deleted > 0;
};

/**
 * Delete all access records for a user
 * @param {string} userId - The user ID
 * @returns {Promise<number>} Number of deleted records
 */
const deleteAllUserAccesses = async (userId) => {
    return await models.UserAccess.destroy({
        where: { user_id: userId }
    });
};

/**
 * Get user access statistics
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Statistics about user accesses
 */
const getUserAccessStats = async (userId) => {
    // Get device type distribution
    const deviceStats = await models.UserAccess.findAll({
        attributes: [
            'device_type',
            [models.sequelize.fn('COUNT', models.sequelize.col('device_type')), 'count']
        ],
        where: { user_id: userId },
        group: ['device_type'],
        raw: true
    });

    // Get browser distribution
    const browserStats = await models.UserAccess.findAll({
        attributes: [
            'browser',
            [models.sequelize.fn('COUNT', models.sequelize.col('browser')), 'count']
        ],
        where: { user_id: userId },
        group: ['browser'],
        raw: true
    });

    // Get OS distribution
    const osStats = await models.UserAccess.findAll({
        attributes: [
            'operating_system',
            [models.sequelize.fn('COUNT', models.sequelize.col('operating_system')), 'count']
        ],
        where: { user_id: userId },
        group: ['operating_system'],
        raw: true
    });

    // Get total count
    const totalAccesses = await models.UserAccess.count({
        where: { user_id: userId }
    });

    // Get first and last access
    const firstAccess = await models.UserAccess.findOne({
        where: { user_id: userId },
        order: [['accessed_at', 'ASC']],
        attributes: ['accessed_at']
    });

    const lastAccess = await models.UserAccess.findOne({
        where: { user_id: userId },
        order: [['accessed_at', 'DESC']],
        attributes: ['accessed_at']
    });

    return {
        total: totalAccesses,
        deviceStats,
        browserStats,
        osStats,
        firstAccess: firstAccess ? firstAccess.accessed_at : null,
        lastAccess: lastAccess ? lastAccess.accessed_at : null
    };
};

module.exports = {
    createUserAccess,
    getUserAccesses,
    getUserAccess,
    deleteUserAccess,
    deleteAllUserAccesses,
    getUserAccessStats
}; 