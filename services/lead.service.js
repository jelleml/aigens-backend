/**
 * Service per la gestione dei lead
 * @module services/lead
 */

const db = require('../database');
const { Op } = require('sequelize');

/**
 * Crea un nuovo lead
 * @param {Object} leadData - Dati del lead
 * @param {string} leadData.email - Email del lead
 * @param {Array} leadData.models_interest - Array di modelli di interesse
 * @param {number} leadData.estimated_savings - Risparmio stimato
 * @param {string} [leadData.currency='EUR'] - Valuta del risparmio
 * @param {string} [leadData.source] - Fonte di acquisizione del lead
 * @returns {Promise<Object>} Il lead creato
 */
const createLead = async (leadData) => {
  try {
    // Verifica se esiste già un lead con questa email
    const existingLead = await db.Lead.findOne({
      where: { email: leadData.email }
    });

    if (existingLead) {
      // Aggiorna il lead esistente con i nuovi dati
      return await existingLead.update(leadData);
    }

    // Crea un nuovo lead
    return await db.Lead.create(leadData);
  } catch (error) {
    console.error('Errore durante la creazione del lead:', error);
    throw error;
  }
};

/**
 * Ottiene tutti i lead
 * @param {Object} [filters] - Filtri opzionali
 * @param {string} [filters.status] - Filtra per stato
 * @param {string} [filters.email] - Filtra per email
 * @param {Date} [filters.startDate] - Filtra per data di creazione (inizio)
 * @param {Date} [filters.endDate] - Filtra per data di creazione (fine)
 * @returns {Promise<Array>} Lista dei lead
 */
const getLeads = async (filters = {}) => {
  try {
    const whereClause = {};
    
    if (filters.status) {
      whereClause.status = filters.status;
    }
    
    if (filters.email) {
      whereClause.email = { [Op.like]: `%${filters.email}%` };
    }
    
    if (filters.startDate && filters.endDate) {
      whereClause.created_at = {
        [Op.between]: [filters.startDate, filters.endDate]
      };
    } else if (filters.startDate) {
      whereClause.created_at = { [Op.gte]: filters.startDate };
    } else if (filters.endDate) {
      whereClause.created_at = { [Op.lte]: filters.endDate };
    }
    
    return await db.Lead.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });
  } catch (error) {
    console.error('Errore durante il recupero dei lead:', error);
    throw error;
  }
};

/**
 * Ottiene un lead per ID
 * @param {number} id - ID del lead
 * @returns {Promise<Object>} Il lead
 */
const getLeadById = async (id) => {
  try {
    return await db.Lead.findByPk(id);
  } catch (error) {
    console.error(`Errore durante il recupero del lead con ID ${id}:`, error);
    throw error;
  }
};

/**
 * Aggiorna un lead
 * @param {number} id - ID del lead
 * @param {Object} leadData - Dati aggiornati del lead
 * @returns {Promise<Object>} Il lead aggiornato
 */
const updateLead = async (id, leadData) => {
  try {
    const lead = await db.Lead.findByPk(id);
    
    if (!lead) {
      throw new Error(`Lead con ID ${id} non trovato`);
    }
    
    return await lead.update(leadData);
  } catch (error) {
    console.error(`Errore durante l'aggiornamento del lead con ID ${id}:`, error);
    throw error;
  }
};

/**
 * Aggiorna lo stato di un lead
 * @param {number} id - ID del lead
 * @param {string} status - Nuovo stato del lead
 * @returns {Promise<Object>} Il lead aggiornato
 */
const updateLeadStatus = async (id, status) => {
  try {
    const lead = await db.Lead.findByPk(id);
    
    if (!lead) {
      throw new Error(`Lead con ID ${id} non trovato`);
    }
    
    return await lead.update({ 
      status,
      ...(status === 'contacted' ? { 
        contact_attempts: lead.contact_attempts + 1,
        last_contact_date: new Date()
      } : {}),
      ...(status === 'converted' ? { conversion_date: new Date() } : {})
    });
  } catch (error) {
    console.error(`Errore durante l'aggiornamento dello stato del lead con ID ${id}:`, error);
    throw error;
  }
};

/**
 * Converte un lead in utente
 * @param {number} leadId - ID del lead
 * @param {number} userId - ID dell'utente creato
 * @returns {Promise<Object>} Il lead aggiornato
 */
const convertLeadToUser = async (leadId, userId) => {
  try {
    const lead = await db.Lead.findByPk(leadId);
    
    if (!lead) {
      throw new Error(`Lead con ID ${leadId} non trovato`);
    }
    
    return await lead.update({
      status: 'converted',
      user_id: userId,
      conversion_date: new Date()
    });
  } catch (error) {
    console.error(`Errore durante la conversione del lead con ID ${leadId}:`, error);
    throw error;
  }
};

/**
 * Elimina un lead
 * @param {number} id - ID del lead
 * @returns {Promise<boolean>} True se l'eliminazione è avvenuta con successo
 */
const deleteLead = async (id) => {
  try {
    const lead = await db.Lead.findByPk(id);
    
    if (!lead) {
      throw new Error(`Lead con ID ${id} non trovato`);
    }
    
    await lead.destroy();
    return true;
  } catch (error) {
    console.error(`Errore durante l'eliminazione del lead con ID ${id}:`, error);
    throw error;
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