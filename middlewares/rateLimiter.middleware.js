/**
 * Middleware per il rate limiting
 * @module middlewares/rateLimiter.middleware
 */

/**
 * Implementazione semplice di rate limiting in-memory
 * Nota: In produzione, è consigliabile utilizzare una soluzione più robusta come Redis
 */
class InMemoryStore {
  constructor() {
    this.requests = {};

    // Pulizia periodica per evitare memory leak
    setInterval(() => {
      const now = Date.now();
      Object.keys(this.requests).forEach(key => {
        if (this.requests[key].resetTime < now) {
          delete this.requests[key];
        }
      });
    }, 60000); // Pulizia ogni minuto
  }

  /**
   * Incrementa il contatore per un client
   * @param {string} key - Chiave identificativa del client (es. IP)
   * @param {number} windowMs - Finestra temporale in millisecondi
   * @returns {Object} Stato attuale del rate limiting per il client
   */
  increment(key, windowMs) {
    const now = Date.now();

    if (!this.requests[key] || this.requests[key].resetTime < now) {
      this.requests[key] = {
        count: 1,
        resetTime: now + windowMs
      };
      return { count: 1, remaining: Infinity, resetTime: this.requests[key].resetTime };
    }

    this.requests[key].count += 1;
    return {
      count: this.requests[key].count,
      remaining: Infinity,
      resetTime: this.requests[key].resetTime
    };
  }
}

// Istanza condivisa dello store
const store = new InMemoryStore();

/**
 * Middleware leggero per caricare l'utente dal JWT token
 * Viene applicato prima del rate limiter per assicurarsi che req.user sia disponibile
 */
const loadUserFromToken = async (req, res, next) => {
  try {
    // Se l'utente è già caricato (es. da sessione), salta
    if (req.user) {
      return next();
    }

    // Prova a caricare l'utente dal JWT token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const config = require('../config/config');
        const db = require('../database');

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, config.jwt.secret);

        // Carica l'utente dal database
        const user = await db.models.User.findByPk(decoded.id, {
          attributes: { exclude: ['password'] }
        });

        if (user) {
          req.user = user;
        }
      } catch (error) {
        // Token non valido o scaduto, continua senza utente
      }
    }

    next();
  } catch (error) {
    // In caso di errore, continua senza utente
    next();
  }
};

/**
 * Genera una chiave unica per il rate limiting basata su IP e utente
 * @param {Object} req - Oggetto richiesta Express
 * @returns {string} Chiave unica per il rate limiting
 */
const generateRateLimitKey = (req) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  // Se l'utente è autenticato, includi il suo ID nella chiave
  if (req.user && req.user.id) {
    return `${ip}-user-${req.user.id}`;
  }

  // Se c'è un token JWT valido ma l'utente non è ancora stato caricato
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const config = require('../config/config');
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwt.secret);
      return `${ip}-jwt-${decoded.id}`;
    } catch (error) {
      // Token non valido, usa solo IP
    }
  }

  // Fallback: usa solo IP per utenti non autenticati
  return `${ip}-anonymous`;
};

/**
 * Middleware per il rate limiting
 * @param {Object} options - Opzioni di configurazione
 * @param {number} options.windowMs - Finestra temporale in millisecondi
 * @param {number} options.max - Numero massimo di richieste nella finestra temporale
 * @param {Function} options.keyGenerator - Funzione per generare la chiave del client
 * @param {boolean} options.headers - Se includere gli header di rate limiting nella risposta
 * @returns {Function} Middleware di rate limiting
 */
const rateLimiter = (options = {}) => {
  const {
    windowMs = 60 * 1000, // 1 minuto di default
    max = 100, // 100 richieste per finestra di default
    keyGenerator = generateRateLimitKey,
    headers = true
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const { count, resetTime } = store.increment(key, windowMs);

    // Calcola i valori per gli header
    const remaining = Math.max(0, max - count);
    const reset = Math.ceil(resetTime / 1000); // In secondi

    // Imposta gli header se richiesto
    if (headers) {
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', reset);
    }

    // Se il limite è stato superato, restituisci un errore
    if (count > max) {
      return res.status(429).json({
        success: false,
        error: 'Troppe richieste, riprova più tardi',
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000) // In secondi
      });
    }

    next();
  };
};

/**
 * Middleware per il rate limiting specifico per le API di autenticazione
 * Più restrittivo per prevenire attacchi di forza bruta
 */
const authLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 10, // 10 tentativi per finestra
  keyGenerator: (req) => {
    // Usa l'email come parte della chiave per limitare i tentativi per account
    const email = req.body.email || 'unknown';
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    return `${ip}-${email}`;
  }
});

/**
 * Middleware per il rate limiting generale delle API
 * Meno restrittivo per le normali operazioni
 * Limite aumentato in development per facilitare il testing
 */
const apiLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  max: process.env.NODE_ENV === 'development' ? 1000 : 60 // 1000 richieste in dev, 60 in produzione
});

/**
 * Middleware combinato che applica prima il caricamento dell'utente e poi il rate limiting
 * Questo assicura che req.user sia sempre disponibile quando possibile
 */
const apiLimiterWithUser = [
  loadUserFromToken,
  apiLimiter
];

module.exports = {
  rateLimiter,
  authLimiter,
  apiLimiter,
  apiLimiterWithUser,
  loadUserFromToken,
  generateRateLimitKey
}; 