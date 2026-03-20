/**
 * Middleware per la gestione dell'autenticazione
 * @module middlewares/auth.middleware
 */

const jwt = require('jsonwebtoken');
const db = require('../database');
const config = require('../config/config');
const { getLogger } = require('../services/logging');
const logger = getLogger('auth', 'middleware');

/**
 * Middleware per verificare l'autenticazione dell'utente tramite JWT o sessione
 * @param {Object} req - Oggetto richiesta Express
 * @param {Object} res - Oggetto risposta Express
 * @param {Function} next - Funzione per passare al middleware successivo
 */
const authenticate = async (req, res, next) => {
  try {
    // Verifica innanzitutto se l'utente è autenticato tramite sessione (Passport)
    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }

    // Se non autenticato con sessione, prova con JWT
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Accesso non autorizzato. Token mancante o non valido'
      });
    }

    // Estrai il token
    const token = authHeader.split(' ')[1];

    // Verifica il token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Verifica che l'utente esista ancora nel database
    const user = await db.models.User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utente non trovato o non più valido'
      });
    }

    // Aggiungi i dati dell'utente alla richiesta
    req.user = user;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token scaduto. Effettua nuovamente il login'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Token non valido'
      });
    }

    logger.error('Errore di autenticazione:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante l\'autenticazione'
    });
  }
};

/**
 * Middleware per verificare i ruoli dell'utente
 * @param {Array|String} roles - Ruoli autorizzati
 * @returns {Function} Middleware per la verifica dei ruoli
 */
const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Utente non autenticato'
      });
    }

    // Converti in array se è una stringa
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (allowedRoles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({
        success: false,
        error: 'Non hai i permessi necessari per accedere a questa risorsa'
      });
    }
  };
};

/**
 * Middleware per verificare se un utente è autenticato
 * @param {Object} req - Oggetto richiesta Express
 * @param {Object} res - Oggetto risposta Express
 * @param {Function} next - Funzione per passare al middleware successivo
 */
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  // Verifica anche JWT
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }

  res.status(401).json({
    success: false,
    error: 'Accesso non autorizzato. Effettua il login per continuare'
  });
};

/**
 * Middleware per verificare l'email dell'utente
 * @param {Object} req - Oggetto richiesta Express
 * @param {Object} res - Oggetto risposta Express
 * @param {Function} next - Funzione per passare al middleware successivo
 */
const isEmailVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Utente non autenticato'
    });
  }

  if (!req.user.is_email_verified) {
    return res.status(403).json({
      success: false,
      error: 'Email non verificata. Verifica la tua email per continuare',
      requiresVerification: true
    });
  }

  next();
};

/**
 * Genera un token JWT per l'utente
 * @param {Object} user - Utente per cui generare il token
 * @returns {string} Token JWT
 */
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn || '24h' }
  );
};

module.exports = {
  authenticate,
  authorize,
  isAuthenticated,
  isEmailVerified,
  generateToken
}; 