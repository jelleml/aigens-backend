/**
 * Middleware per la validazione delle richieste
 * @module middlewares/validation.middleware
 */

/**
 * Funzione di validazione generica per le richieste
 * @param {Function} validationSchema - Schema di validazione (funzione che accetta req e restituisce errori)
 * @returns {Function} Middleware di validazione
 */
const validate = (validationSchema) => {
  return (req, res, next) => {
    const errors = validationSchema(req);
    
    if (errors && Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Errore di validazione',
        details: errors
      });
    }
    
    next();
  };
};

/**
 * Validazione dei parametri di paginazione
 * @param {Object} req - Oggetto richiesta Express
 * @param {Object} res - Oggetto risposta Express
 * @param {Function} next - Funzione per passare al middleware successivo
 */
const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;
  
  // Imposta valori predefiniti se non specificati
  req.query.page = page ? parseInt(page, 10) : 1;
  req.query.limit = limit ? parseInt(limit, 10) : 10;
  
  // Validazione
  if (isNaN(req.query.page) || req.query.page < 1) {
    req.query.page = 1;
  }
  
  if (isNaN(req.query.limit) || req.query.limit < 1 || req.query.limit > 100) {
    req.query.limit = 10;
  }
  
  next();
};

/**
 * Validazione dei parametri di ordinamento
 * @param {Array} allowedFields - Campi consentiti per l'ordinamento
 * @returns {Function} Middleware di validazione
 */
const validateSorting = (allowedFields) => {
  return (req, res, next) => {
    const { sort } = req.query;
    
    if (!sort) {
      // Imposta un ordinamento predefinito se non specificato
      req.query.sort = allowedFields[0];
      req.query.order = 'ASC';
      return next();
    }
    
    // Estrai il campo e la direzione (es. "name:desc")
    const [field, direction] = sort.split(':');
    
    // Verifica che il campo sia consentito
    if (!allowedFields.includes(field)) {
      return res.status(400).json({
        success: false,
        error: `Campo di ordinamento non valido. Campi consentiti: ${allowedFields.join(', ')}`
      });
    }
    
    // Normalizza la direzione
    const order = direction && direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    // Aggiorna i parametri di query
    req.query.sort = field;
    req.query.order = order;
    
    next();
  };
};

/**
 * Validazione dei parametri di ricerca
 * @param {Array} allowedFields - Campi consentiti per la ricerca
 * @returns {Function} Middleware di validazione
 */
const validateSearch = (allowedFields) => {
  return (req, res, next) => {
    const { search, searchFields } = req.query;
    
    if (!search) {
      return next();
    }
    
    // Se i campi di ricerca non sono specificati, usa tutti i campi consentiti
    let fields = searchFields ? searchFields.split(',') : allowedFields;
    
    // Filtra i campi non consentiti
    fields = fields.filter(field => allowedFields.includes(field));
    
    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Campi di ricerca non validi. Campi consentiti: ${allowedFields.join(', ')}`
      });
    }
    
    // Aggiorna i parametri di query
    req.query.searchFields = fields;
    
    next();
  };
};

module.exports = {
  validate,
  validatePagination,
  validateSorting,
  validateSearch
}; 