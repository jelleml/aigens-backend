/**
 * Esportazione centralizzata di tutti i middleware
 * @module middlewares
 */

const authMiddleware = require('./auth.middleware');
const errorMiddleware = require('./error.middleware');
const validationMiddleware = require('./validation.middleware');
const rateLimiterMiddleware = require('./rateLimiter.middleware');

module.exports = {
  auth: authMiddleware,
  error: errorMiddleware,
  validation: validationMiddleware,
  rateLimiter: rateLimiterMiddleware
}; 