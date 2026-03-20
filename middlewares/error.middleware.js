/**
 * Middleware per la gestione degli errori
 * @module middlewares/error.middleware
 */

const { getLogger } = require('../services/logging');
const logger = getLogger('error', 'middleware');

/**
 * Middleware per gestire le rotte non trovate
 * @param {Object} req - Oggetto richiesta Express
 * @param {Object} res - Oggetto risposta Express
 * @param {Function} next - Funzione per passare al middleware successivo
 */
const notFound = (req, res, next) => {
  const error = new Error(`Risorsa non trovata - ${req.originalUrl}`);
  error.status = 404;
  next(error);
};

/**
 * Middleware per gestire gli errori di autenticazione
 * @param {Object} err - Oggetto errore
 * @param {Object} req - Oggetto richiesta Express
 * @param {Object} res - Oggetto risposta Express
 * @param {Function} next - Funzione per passare al middleware successivo
 */
const authError = (err, req, res, next) => {
  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Autenticazione non valida',
      details: err.message
    });
  }

  if (err.name === 'AuthenticationError') {
    return res.status(401).json({
      success: false,
      error: err.message || 'Autenticazione fallita'
    });
  }

  if (err.name === 'OAuthError') {
    logger.error('Errore OAuth:', err);
    return res.redirect('/login?error=oauth_error');
  }

  next(err);
};

/**
 * Middleware per la gestione centralizzata degli errori
 * @param {Object} err - Oggetto errore
 * @param {Object} req - Oggetto richiesta Express
 * @param {Object} res - Oggetto risposta Express
 * @param {Function} next - Funzione per passare al middleware successivo
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Log dell'errore in console (sempre)
  logger.error(`[ERROR] ${err.message}`, err.stack);

  // Nel caso di API, restituisci un JSON
  if (req.originalUrl.includes('/api/')) {
    return res.status(statusCode).json({
      success: false,
      error: err.message,
      stack: isProduction ? undefined : err.stack,
      timestamp: new Date().toISOString()
    });
  }

  // Per richieste non API, restituisci comunque JSON (poiché non abbiamo views)
  res.status(statusCode).json({
    success: false,
    error: err.message,
    stack: isProduction ? undefined : err.stack,
    timestamp: new Date().toISOString()
  });
};

/**
 * Middleware per gestire gli errori della validazione
 * @param {Object} err - Oggetto errore
 * @param {Object} req - Oggetto richiesta Express
 * @param {Object} res - Oggetto risposta Express
 * @param {Function} next - Funzione per passare al middleware successivo
 */
const validationError = (err, req, res, next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Errore di validazione',
      details: err.errors
    });
  }

  next(err);
};

/**
 * Middleware per gestire gli errori CSRF
 * @param {Object} err - Oggetto errore
 * @param {Object} req - Oggetto richiesta Express
 * @param {Object} res - Oggetto risposta Express
 * @param {Function} next - Funzione per passare al middleware successivo
 */
const csrfError = (err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      success: false,
      error: 'Invalid CSRF token. Try refreshing the page.'
    });
  }

  next(err);
};

module.exports = {
  notFound,
  authError,
  errorHandler,
  validationError,
  csrfError
}; 