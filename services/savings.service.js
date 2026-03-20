/**
 * Service per calcolare i risparmi degli utenti
 * @module services/savings
 */

const db = require('../database');
const { Op } = require('sequelize');
const moment = require('moment');

const { 
  User, 
  Model, 
  ModelsSubscription, 
  ProviderSubscription, 
  Transaction, 
  Chat, 
  Message,
  Provider
} = db.sequelize.models;

/**
 * Tasso di conversione fisso EUR/USD (dovrebbe essere dinamico in produzione)
 */
const EUR_USD_RATE = 0.85; // 1 USD = 0.85 EUR

/**
 * Converte un importo da una valuta all'EUR
 * @param {number} amount - Importo da convertire
 * @param {string} currency - Valuta di origine
 * @returns {number} - Importo convertito in EUR
 */
function convertToEUR(amount, currency) {
  if (currency === 'EUR') return amount;
  if (currency === 'USD') return amount * EUR_USD_RATE;
  // Aggiungi altre valute se necessario
  return amount; // Default: nessuna conversione
}

/**
 * Ottiene tutti i modelli unici utilizzati dall'utente
 * @param {string} userId - ID dell'utente
 * @param {Date} dateFrom - Data di inizio (opzionale)
 * @param {Date} dateTo - Data di fine (opzionale)
 * @returns {Array} - Array di ID modelli unici
 */
async function getUserUsedModels(userId, dateFrom = null, dateTo = null) {
  const whereCondition = {
    '$Chat.user_id$': userId
  };

  if (dateFrom || dateTo) {
    whereCondition.created_at = {};
    if (dateFrom) whereCondition.created_at[Op.gte] = dateFrom;
    if (dateTo) whereCondition.created_at[Op.lte] = dateTo;
  }

  const messages = await Message.findAll({
    attributes: ['agent_model'],
    include: [{
      model: Chat,
      attributes: ['user_id'],
      where: { user_id: userId }
    }],
    where: {
      ...whereCondition,
      agent_model: { [Op.ne]: null },
      role: 'assistant'
    },
    group: ['agent_model']
  });

  // Estrai gli ID dei modelli dai model slugs
  const modelSlugs = messages.map(msg => msg.agent_model).filter(Boolean);
  
  if (modelSlugs.length === 0) return [];

  const models = await Model.findAll({
    attributes: ['id'],
    where: {
      model_slug: { [Op.in]: modelSlugs }
    }
  });

  return models.map(model => model.id);
}

/**
 * Calcola il costo delle sottoscrizioni per i modelli utilizzati dall'utente
 * @param {Array} modelIds - Array di ID modelli
 * @param {number} months - Numero di mesi per il calcolo
 * @returns {number} - Costo totale delle sottoscrizioni in EUR
 */
async function calculateSubscriptionCosts(modelIds, months = 1) {
  if (modelIds.length === 0) return 0;

  const subscriptions = await ModelsSubscription.findAll({
    include: [{
      model: ProviderSubscription,
      as: 'subscription',
      attributes: ['cost']
    }],
    where: {
      id_model: { [Op.in]: modelIds }
    }
  });

  const totalMonthlyCost = subscriptions.reduce((total, modelSub) => {
    if (modelSub.subscription && modelSub.subscription.cost) {
      return total + parseFloat(modelSub.subscription.cost);
    }
    return total;
  }, 0);

  return totalMonthlyCost * months;
}

/**
 * Calcola l'importo totale speso dall'utente nelle transazioni
 * @param {string} userId - ID dell'utente
 * @param {Date} dateFrom - Data di inizio (opzionale)
 * @param {Date} dateTo - Data di fine (opzionale)
 * @returns {number} - Importo totale speso in EUR
 */
async function calculateTotalSpent(userId, dateFrom = null, dateTo = null) {
  const whereCondition = {
    user_id: userId,
    type: ['deposit', 'withdrawal', 'usage'],
    status: 'completed'
  };

  if (dateFrom || dateTo) {
    whereCondition.created_at = {};
    if (dateFrom) whereCondition.created_at[Op.gte] = dateFrom;
    if (dateTo) whereCondition.created_at[Op.lte] = dateTo;
  }

  const transactions = await Transaction.findAll({
    attributes: ['amount', 'currency', 'type'],
    where: whereCondition
  });

  let totalSpent = 0;

  transactions.forEach(transaction => {
    const amountInEUR = convertToEUR(parseFloat(transaction.amount), transaction.currency);
    
    // Considera solo le spese (usage e withdrawal), non i depositi
    if (transaction.type === 'usage' || transaction.type === 'withdrawal') {
      totalSpent += Math.abs(amountInEUR);
    }
  });

  return totalSpent;
}

/**
 * Calcola i risparmi totali dell'utente
 * @param {string} userId - ID dell'utente
 * @param {string} period - Periodo di calcolo ('all', 'monthly', 'yearly')
 * @returns {Object} - Oggetto con i dettagli del risparmio
 */
async function calculateUserSavings(userId, period = 'all') {
  let dateFrom = null;
  let dateTo = null;
  let months = 1;

  // Definisci i periodi
  switch (period) {
    case 'monthly':
      dateFrom = moment().startOf('month').toDate();
      dateTo = moment().endOf('month').toDate();
      months = 1;
      break;
    case 'yearly':
      dateFrom = moment().startOf('year').toDate();
      dateTo = moment().endOf('year').toDate();
      months = 12;
      break;
    case 'all':
    default:
      // Per "all time", calcola i mesi dall'inizio dell'utilizzo
      const firstMessage = await Message.findOne({
        include: [{
          model: Chat,
          where: { user_id: userId }
        }],
        order: [['created_at', 'ASC']]
      });
      
      if (firstMessage) {
        dateFrom = firstMessage.created_at;
        months = moment().diff(moment(dateFrom), 'months') || 1;
      }
      break;
  }

  // Ottieni i modelli utilizzati dall'utente
  const modelIds = await getUserUsedModels(userId, dateFrom, dateTo);
  
  // Calcola i costi delle sottoscrizioni
  const subscriptionCost = await calculateSubscriptionCosts(modelIds, months);
  
  // Calcola l'importo effettivamente speso
  const actualSpent = await calculateTotalSpent(userId, dateFrom, dateTo);
  
  // Calcola il risparmio
  const totalSavings = Math.max(0, subscriptionCost - actualSpent);

  return {
    period,
    subscriptionCost: subscriptionCost.toFixed(2),
    actualSpent: actualSpent.toFixed(2),
    totalSavings: totalSavings.toFixed(2),
    modelsUsed: modelIds.length,
    months
  };
}

/**
 * Calcola i risparmi per tutti i periodi (all, monthly, yearly)
 * @param {string} userId - ID dell'utente
 * @returns {Object} - Oggetto con tutti i periodi di risparmio
 */
async function calculateAllPeriodsSavings(userId) {
  const allTime = await calculateUserSavings(userId, 'all');
  const monthly = await calculateUserSavings(userId, 'monthly');
  const yearly = await calculateUserSavings(userId, 'yearly');

  return {
    allTime,
    monthly,
    yearly
  };
}

/**
 * Ottiene tutti i modelli utilizzati dall'utente raggruppati per provider
 * @param {string} userId - ID dell'utente
 * @param {Date} dateFrom - Data di inizio (opzionale)
 * @param {Date} dateTo - Data di fine (opzionale)
 * @returns {Object} - Oggetto con provider come chiave e array di modelli come valore
 */
async function getUserModelsGroupedByProvider(userId, dateFrom = null, dateTo = null) {
  const whereCondition = {
    '$Chat.user_id$': userId
  };

  if (dateFrom || dateTo) {
    whereCondition.created_at = {};
    if (dateFrom) whereCondition.created_at[Op.gte] = dateFrom;
    if (dateTo) whereCondition.created_at[Op.lte] = dateTo;
  }

  const messages = await Message.findAll({
    attributes: ['agent_model'],
    include: [{
      model: Chat,
      attributes: ['user_id'],
      where: { user_id: userId }
    }],
    where: {
      ...whereCondition,
      agent_model: { [Op.ne]: null },
      role: 'assistant'
    },
    group: ['agent_model']
  });

  const modelSlugs = messages.map(msg => msg.agent_model).filter(Boolean);
  
  if (modelSlugs.length === 0) return {};

  // Ottieni i modelli con i loro provider
  const models = await Model.findAll({
    attributes: ['id', 'model_slug', 'name'],
    include: [{
      model: Provider,
      as: 'provider',
      attributes: ['id', 'name']
    }],
    where: {
      model_slug: { [Op.in]: modelSlugs }
    }
  });

  // Raggruppa per provider
  const modelsByProvider = {};
  models.forEach(model => {
    const providerName = model.provider.name;
    if (!modelsByProvider[providerName]) {
      modelsByProvider[providerName] = {
        providerId: model.provider.id,
        providerName: providerName,
        models: []
      };
    }
    modelsByProvider[providerName].models.push({
      id: model.id,
      name: model.name,
      model_slug: model.model_slug
    });
  });

  return modelsByProvider;
}

/**
 * Calcola l'importo speso dall'utente raggruppato per provider
 * @param {string} userId - ID dell'utente
 * @param {Date} dateFrom - Data di inizio (opzionale)
 * @param {Date} dateTo - Data di fine (opzionale)
 * @returns {Object} - Oggetto con provider come chiave e importo speso come valore
 */
async function calculateSpentByProvider(userId, dateFrom = null, dateTo = null) {
  const modelsByProvider = await getUserModelsGroupedByProvider(userId, dateFrom, dateTo);
  
  // Per ora, dividiamo equamente l'importo totale speso tra tutti i provider utilizzati
  // In futuro, potremmo tracciare i costi per modello/provider più precisamente
  const totalSpent = await calculateTotalSpent(userId, dateFrom, dateTo);
  const providerCount = Object.keys(modelsByProvider).length;
  
  if (providerCount === 0) return {};

  const spentByProvider = {};
  const spentPerProvider = totalSpent / providerCount;

  Object.keys(modelsByProvider).forEach(providerName => {
    spentByProvider[providerName] = spentPerProvider;
  });

  return spentByProvider;
}

/**
 * Calcola i risparmi per provider per un periodo specifico
 * @param {string} userId - ID dell'utente
 * @param {string} period - Periodo ('week', 'month', 'year')
 * @returns {Array} - Array di oggetti con risparmi per provider
 */
async function calculateSavingsByProvider(userId, period = 'month') {
  let dateFrom = null;
  let dateTo = null;
  let months = 1;

  // Definisci i periodi
  switch (period) {
    case 'week':
      dateFrom = moment().startOf('week').toDate();
      dateTo = moment().endOf('week').toDate();
      months = 0.25; // 1/4 di mese
      break;
    case 'month':
      dateFrom = moment().startOf('month').toDate();
      dateTo = moment().endOf('month').toDate();
      months = 1;
      break;
    case 'year':
      dateFrom = moment().startOf('year').toDate();
      dateTo = moment().endOf('year').toDate();
      months = 12;
      break;
  }

  // Ottieni modelli raggruppati per provider
  const modelsByProvider = await getUserModelsGroupedByProvider(userId, dateFrom, dateTo);
  
  // Ottieni spese per provider
  const spentByProvider = await calculateSpentByProvider(userId, dateFrom, dateTo);
  
  const results = [];

  for (const [providerName, providerData] of Object.entries(modelsByProvider)) {
    const modelIds = providerData.models.map(m => m.id);
    
    // Calcola costo sottoscrizioni per questo provider
    const subscriptionCost = await calculateSubscriptionCosts(modelIds, months);
    
    // Ottieni spesa effettiva per questo provider
    const actualSpent = spentByProvider[providerName] || 0;
    
    // Calcola risparmi
    const totalSavings = Math.max(0, subscriptionCost - actualSpent);
    
    // Calcola percentuale di risparmio
    const savingsPercentage = subscriptionCost > 0 
      ? ((totalSavings / subscriptionCost) * 100).toFixed(1)
      : '0.0';

    results.push({
      label: providerName,
      providerId: providerData.providerId,
      period: period,
      subscriptionCost: subscriptionCost.toFixed(2),
      actualSpent: actualSpent.toFixed(2),
      totalSavings: totalSavings.toFixed(2),
      savingsPercentage: savingsPercentage,
      modelsUsed: modelIds.length,
      models: providerData.models
    });
  }

  // Ordina per risparmi totali (decrescente)
  results.sort((a, b) => parseFloat(b.totalSavings) - parseFloat(a.totalSavings));

  return results;
}

/**
 * Calcola i risparmi per provider per tutti i periodi (week, month, year)
 * @param {string} userId - ID dell'utente
 * @returns {Object} - Oggetto con tutti i periodi di risparmio per provider
 */
async function calculateAllPeriodsSavingsByProvider(userId) {
  const week = await calculateSavingsByProvider(userId, 'week');
  const month = await calculateSavingsByProvider(userId, 'month');
  const year = await calculateSavingsByProvider(userId, 'year');

  return {
    week,
    month,
    year
  };
}

module.exports = {
  convertToEUR,
  getUserUsedModels,
  calculateSubscriptionCosts,
  calculateTotalSpent,
  calculateUserSavings,
  calculateAllPeriodsSavings,
  getUserModelsGroupedByProvider,
  calculateSpentByProvider,
  calculateSavingsByProvider,
  calculateAllPeriodsSavingsByProvider
};