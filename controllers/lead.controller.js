/**
 * Controller per la gestione dei lead
 * @module controllers/lead
 */

const leadService = require('../services/lead.service');
const modelService = require('../services/model.service');
const { getLogger } = require('../services/logging');
const logger = getLogger('lead', 'controller');

/**
 * Crea un nuovo lead
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} Risposta JSON
 */
const createLead = async (req, res) => {
  try {
    const { email, models_interest, estimated_savings, currency, source } = req.body;
    
    // Validazione dei dati
    if (!email || !models_interest || !Array.isArray(models_interest) || models_interest.length < 1) {
      return res.status(400).json({
        success: false,
        message: 'Dati mancanti o non validi. Email e almeno un modello di interesse sono richiesti.'
      });
    }
    
    // Verifica che i modelli specificati esistano
    for (const modelInterest of models_interest) {
      const { model_id } = modelInterest;
      const modelExists = await modelService.getModelByModelId(model_id);
      
      if (!modelExists) {
        return res.status(400).json({
          success: false,
          message: `Il modello con ID ${model_id} non esiste.`
        });
      }
    }
    
    // Crea il lead
    const leadData = {
      email,
      models_interest,
      estimated_savings: estimated_savings || 0,
      currency: currency || 'EUR',
      source
    };
    
    const lead = await leadService.createLead(leadData);
    
    return res.status(201).json({
      success: true,
      message: 'Lead creato con successo',
      data: lead
    });
  } catch (error) {
    logger.error('Errore durante la creazione del lead:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore durante la creazione del lead',
      error: error.message
    });
  }
};

/**
 * Ottiene tutti i lead
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} Risposta JSON
 */
const getLeads = async (req, res) => {
  try {
    const { status, email, startDate, endDate } = req.query;
    
    const filters = {};
    
    if (status) filters.status = status;
    if (email) filters.email = email;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    
    const leads = await leadService.getLeads(filters);
    
    return res.status(200).json({
      success: true,
      message: 'Lead recuperati con successo',
      data: leads
    });
  } catch (error) {
    logger.error('Errore durante il recupero dei lead:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore durante il recupero dei lead',
      error: error.message
    });
  }
};

/**
 * Ottiene un lead per ID
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} Risposta JSON
 */
const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const lead = await leadService.getLeadById(id);
    
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: `Lead con ID ${id} non trovato`
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Lead recuperato con successo',
      data: lead
    });
  } catch (error) {
    logger.error(`Errore durante il recupero del lead con ID ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Errore durante il recupero del lead',
      error: error.message
    });
  }
};

/**
 * Aggiorna un lead
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} Risposta JSON
 */
const updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const leadData = req.body;
    
    // Verifica che il lead esista
    const existingLead = await leadService.getLeadById(id);
    
    if (!existingLead) {
      return res.status(404).json({
        success: false,
        message: `Lead con ID ${id} non trovato`
      });
    }
    
    // Se vengono aggiornati i modelli di interesse, verifica che esistano
    if (leadData.models_interest && Array.isArray(leadData.models_interest)) {
      for (const modelInterest of leadData.models_interest) {
        const { model_id } = modelInterest;
        const modelExists = await modelService.getModelByModelId(model_id);
        
        if (!modelExists) {
          return res.status(400).json({
            success: false,
            message: `Il modello con ID ${model_id} non esiste.`
          });
        }
      }
    }
    
    const updatedLead = await leadService.updateLead(id, leadData);
    
    return res.status(200).json({
      success: true,
      message: 'Lead aggiornato con successo',
      data: updatedLead
    });
  } catch (error) {
    logger.error(`Errore durante l'aggiornamento del lead con ID ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Errore durante l\'aggiornamento del lead',
      error: error.message
    });
  }
};

/**
 * Aggiorna lo stato di un lead
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} Risposta JSON
 */
const updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['new', 'contacted', 'qualified', 'converted', 'lost'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Stato non valido. Gli stati validi sono: new, contacted, qualified, converted, lost'
      });
    }
    
    // Verifica che il lead esista
    const existingLead = await leadService.getLeadById(id);
    
    if (!existingLead) {
      return res.status(404).json({
        success: false,
        message: `Lead con ID ${id} non trovato`
      });
    }
    
    const updatedLead = await leadService.updateLeadStatus(id, status);
    
    return res.status(200).json({
      success: true,
      message: 'Stato del lead aggiornato con successo',
      data: updatedLead
    });
  } catch (error) {
    logger.error(`Errore durante l'aggiornamento dello stato del lead con ID ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Errore durante l\'aggiornamento dello stato del lead',
      error: error.message
    });
  }
};

/**
 * Converte un lead in utente
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} Risposta JSON
 */
const convertLeadToUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'ID utente mancante'
      });
    }
    
    // Verifica che il lead esista
    const existingLead = await leadService.getLeadById(id);
    
    if (!existingLead) {
      return res.status(404).json({
        success: false,
        message: `Lead con ID ${id} non trovato`
      });
    }
    
    const updatedLead = await leadService.convertLeadToUser(id, user_id);
    
    return res.status(200).json({
      success: true,
      message: 'Lead convertito in utente con successo',
      data: updatedLead
    });
  } catch (error) {
    logger.error(`Errore durante la conversione del lead con ID ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Errore durante la conversione del lead in utente',
      error: error.message
    });
  }
};

/**
 * Elimina un lead
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} Risposta JSON
 */
const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica che il lead esista
    const existingLead = await leadService.getLeadById(id);
    
    if (!existingLead) {
      return res.status(404).json({
        success: false,
        message: `Lead con ID ${id} non trovato`
      });
    }
    
    await leadService.deleteLead(id);
    
    return res.status(200).json({
      success: true,
      message: 'Lead eliminato con successo'
    });
  } catch (error) {
    logger.error(`Errore durante l'eliminazione del lead con ID ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Errore durante l\'eliminazione del lead',
      error: error.message
    });
  }
};

module.exports = {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  updateLeadStatus,
  convertLeadToUser,
  deleteLead
}; 