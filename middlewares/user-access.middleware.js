/**
 * Middleware for tracking user access information
 * @module middlewares/user-access.middleware
 */

const UAParser = require('ua-parser-js');
const userAccessService = require('../services/user-access.service');
const { getLogger } = require('../services/logging');
const logger = getLogger('user-access', 'middleware');

/**
 * Determine the device type based on user agent
 * @param {Object} userAgent - The parsed user agent
 * @returns {string} Device type ('mobile', 'tablet', or 'desktop')
 */
const getDeviceType = (userAgent) => {
    const deviceType = userAgent.device.type;

    if (deviceType === 'mobile') return 'mobile';
    if (deviceType === 'tablet') return 'tablet';
    return 'desktop'; // Default to desktop for unknown or desktop devices
};

/**
 * Middleware to track user access information
 * Collects and stores device type, browser, OS, and IP information
 */
const trackUserAccess = async (req, res, next) => {
    try {
        // Only track access for authenticated users
        if (req.user && req.user.id) {
            // Parse the user agent string
            const parser = new UAParser(req.headers['user-agent']);
            const userAgent = parser.getResult();

            // Collect access data
            const accessData = {
                user_id: req.user.id,
                device_type: getDeviceType(userAgent),
                browser: `${userAgent.browser.name || 'Unknown'} ${userAgent.browser.version || ''}`.trim(),
                operating_system: `${userAgent.os.name || 'Unknown'} ${userAgent.os.version || ''}`.trim(),
                ip_address: req.ip || req.connection.remoteAddress,
                accessed_at: new Date()
            };

            // Store access data asynchronously (don't block the request)
            userAccessService.createUserAccess(accessData).catch(error => {
                logger.error('Error tracking user access:', error);
            });
        }
    } catch (error) {
        // Log the error but don't interrupt the request
        logger.error('Error in user access middleware:', error);
    }

    // Always continue to the next middleware
    next();
};

module.exports = {
    trackUserAccess
}; 