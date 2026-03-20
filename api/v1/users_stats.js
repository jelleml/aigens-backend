/**
 * Router per la gestione delle statistiche utente
 * @module api/v1/users_stats
 */

const express = require('express');
const router = express.Router();
const db = require('../../database');
const { UserModelUsageStats } = db.sequelize.models;
const { authenticate: authMiddleware } = require('../../middlewares/auth.middleware');
const { Op } = require('sequelize');
const savingsService = require('../../services/savings.service');

/**
 * Middleware per validare i parametri date_from e date_to
 */
const validateStatsParams = (req, res, next) => {
  const { date_from, date_to } = req.query;
  
  // Validazione formato date se fornite
  if (date_from && isNaN(Date.parse(date_from))) {
    return res.status(400).json({
      success: false,
      error: 'date_from must be a valid date format'
    });
  }
  
  if (date_to && isNaN(Date.parse(date_to))) {
    return res.status(400).json({
      success: false,
      error: 'date_to must be a valid date format'
    });
  }
  
  next();
};

/**
 * Costruisce la condizione WHERE per le query basata sui parametri
 */
const buildWhereCondition = (user_id, date_from, date_to, type) => {
  const whereCondition = {
    id_user: user_id,
    type: type
  };
  
  if (date_from || date_to) {
    whereCondition.calculated_at = {};
    
    if (date_from) {
      whereCondition.calculated_at[Op.gte] = new Date(date_from);
    }
    
    if (date_to) {
      whereCondition.calculated_at[Op.lte] = new Date(date_to);
    }
  }
  
  return whereCondition;
};

/**
 * @swagger
 * tags:
 *   name: UserStats
 *   description: API per le statistiche utente e analytics dashboard
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     UserStatsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indica se la richiesta è andata a buon fine
 *           example: true
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/UserModelUsageStat'
 *     UserModelUsageStat:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID univoco della statistica
 *           example: 129
 *         type:
 *           type: string
 *           description: Tipo di statistica
 *           enum: [trendline_usage_credits, model_usage, message_count, category_usage, user_expenses, user_savings, pie_fav_models_count, pie_categories_count, savings_total, savings_total_model]
 *           example: "trendline_usage_credits"
 *         label:
 *           type: string
 *           description: Etichetta descrittiva della statistica
 *           example: "day7"
 *         value:
 *           type: number
 *           description: Valore numerico della statistica
 *           example: 150.5
 *         aggregation_level:
 *           type: string
 *           description: Livello di aggregazione temporale
 *           enum: [day, last7days, last14days, last30days, thisMonth, last3month, year, 1day]
 *           example: "1day"
 *         calculated_at:
 *           type: string
 *           format: date-time
 *           description: Data e ora del calcolo della statistica
 *           example: "2025-07-09T22:26:07.000Z"
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Data di creazione del record
 *           example: "2025-07-09T22:26:07.000Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Data di ultimo aggiornamento
 *           example: "2025-07-09T22:26:07.000Z"
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *           example: "date_from must be a valid date format"
 */

/**
 * @swagger
 * /api/v1/users/stats/usage:
 *   get:
 *     summary: Ottiene tutte le statistiche di utilizzo dell'utente
 *     description: Restituisce tutti i dati di utilizzo dell'utente dalla tabella user_model_usage_stats, inclusi model_usage, message_count, category_usage, user_expenses, user_savings, trendline_usage_credits e altri tipi. L'utente viene identificato automaticamente dal JWT token.
 *     tags: [UserStats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *         description: Data di inizio filtro (formato YYYY-MM-DD)
 *         example: "2025-07-01"
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *         description: Data di fine filtro (formato YYYY-MM-DD)
 *         example: "2025-07-31"
 *     responses:
 *       200:
 *         description: Statistiche di utilizzo crediti recuperate con successo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserStatsResponse'
 *             example:
 *               success: true
 *               data:
 *                 - id: 135
 *                   type: "trendline_usage_credits"
 *                   label: "day7"
 *                   value: 1
 *                   aggregation_level: "1day"
 *                   calculated_at: "2025-07-09T22:26:07.000Z"
 *                   created_at: "2025-07-09T22:26:07.000Z"
 *                   updated_at: "2025-07-09T22:26:07.000Z"
 *                 - id: 136
 *                   type: "model_usage"
 *                   label: "gpt-4"
 *                   value: 150.5
 *                   aggregation_level: "day"
 *                   calculated_at: "2025-07-09T22:26:07.000Z"
 *                   created_at: "2025-07-09T22:26:07.000Z"
 *                   updated_at: "2025-07-09T22:26:07.000Z"
 *                 - id: 137
 *                   type: "message_count"
 *                   label: "Total Messages"
 *                   value: 25
 *                   aggregation_level: "day"
 *                   calculated_at: "2025-07-09T22:26:07.000Z"
 *                   created_at: "2025-07-09T22:26:07.000Z"
 *                   updated_at: "2025-07-09T22:26:07.000Z"
 *                 - id: 138
 *                   type: "user_expenses"
 *                   label: "Daily Expenses"
 *                   value: 12.50
 *                   aggregation_level: "day"
 *                   calculated_at: "2025-07-09T22:26:07.000Z"
 *                   created_at: "2025-07-09T22:26:07.000Z"
 *                   updated_at: "2025-07-09T22:26:07.000Z"
 *       400:
 *         description: Errore nei parametri di input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalid_date_from:
 *                 summary: Formato date_from non valido
 *                 value:
 *                   success: false
 *                   error: "date_from must be a valid date format"
 *               invalid_date_to:
 *                 summary: Formato date_to non valido
 *                 value:
 *                   success: false
 *                   error: "date_to must be a valid date format"
 *       401:
 *         description: Non autorizzato - token JWT mancante o non valido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Accesso non autorizzato. Token mancante o non valido"
 *       500:
 *         description: Errore interno del server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error"
 */
router.get('/usage', authMiddleware, validateStatsParams, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const user_id = req.user.id; // Get user_id from JWT token
    
    // Build where condition without type filter to get all statistics
    const whereCondition = {
      id_user: user_id
    };
    
    if (date_from || date_to) {
      whereCondition.calculated_at = {};
      
      if (date_from) {
        whereCondition.calculated_at[Op.gte] = new Date(date_from);
      }
      
      if (date_to) {
        whereCondition.calculated_at[Op.lte] = new Date(date_to);
      }
    }
    
    const stats = await UserModelUsageStats.findAll({
      where: whereCondition,
      order: [['calculated_at', 'ASC'], ['type', 'ASC']],
      attributes: { exclude: ['id_user'] } // Esclude id_user dalla risposta
    });
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/v1/users/stats/favourites/models:
 *   get:
 *     summary: Ottiene le statistiche dei modelli preferiti per pie chart
 *     description: Restituisce i dati di utilizzo dei modelli preferiti per visualizzare grafici a torta nel dashboard. Filtra per tipo "pie_fav_models_count". L'utente viene identificato automaticamente dal JWT token.
 *     tags: [UserStats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *         description: Data di inizio filtro (formato YYYY-MM-DD)
 *         example: "2025-07-01"
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *         description: Data di fine filtro (formato YYYY-MM-DD)
 *         example: "2025-07-31"
 *     responses:
 *       200:
 *         description: Statistiche modelli preferiti recuperate con successo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserStatsResponse'
 *             example:
 *               success: true
 *               data:
 *                 - id: 129
 *                   type: "pie_fav_models_count"
 *                   label: "gpt-4"
 *                   value: 4
 *                   aggregation_level: "1day"
 *                   calculated_at: "2025-07-09T22:26:07.000Z"
 *                   created_at: "2025-07-09T22:26:07.000Z"
 *                   updated_at: "2025-07-09T22:26:07.000Z"
 *       400:
 *         description: Errore nei parametri di input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Non autorizzato - token JWT mancante o non valido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Errore interno del server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/favourites/models', authMiddleware, validateStatsParams, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const user_id = req.user.id; // Get user_id from JWT token
    
    const whereCondition = buildWhereCondition(user_id, date_from, date_to, 'pie_fav_models_count');
    
    const stats = await UserModelUsageStats.findAll({
      where: whereCondition,
      order: [['calculated_at', 'ASC']],
      attributes: { exclude: ['id_user'] } // Esclude id_user dalla risposta
    });
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching favourite models stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/v1/users/stats/favourites/categories:
 *   get:
 *     summary: Ottiene le statistiche delle categorie preferite per pie chart
 *     description: Restituisce i dati di utilizzo delle categorie preferite per visualizzare grafici a torta nel dashboard. Filtra per tipo "pie_categories_count". L'utente viene identificato automaticamente dal JWT token.
 *     tags: [UserStats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *         description: Data di inizio filtro (formato YYYY-MM-DD)
 *         example: "2025-07-01"
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *         description: Data di fine filtro (formato YYYY-MM-DD)
 *         example: "2025-07-31"
 *     responses:
 *       200:
 *         description: Statistiche categorie preferite recuperate con successo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserStatsResponse'
 *             example:
 *               success: true
 *               data:
 *                 - id: 133
 *                   type: "pie_categories_count"
 *                   label: "text"
 *                   value: 9
 *                   aggregation_level: "1day"
 *                   calculated_at: "2025-07-09T22:26:07.000Z"
 *                   created_at: "2025-07-09T22:26:07.000Z"
 *                   updated_at: "2025-07-09T22:26:07.000Z"
 *       400:
 *         description: Errore nei parametri di input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Non autorizzato - token JWT mancante o non valido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Errore interno del server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/favourites/categories', authMiddleware, validateStatsParams, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const user_id = req.user.id; // Get user_id from JWT token
    
    const whereCondition = buildWhereCondition(user_id, date_from, date_to, 'pie_categories_count');
    
    const stats = await UserModelUsageStats.findAll({
      where: whereCondition,
      order: [['calculated_at', 'ASC']],
      attributes: { exclude: ['id_user'] } // Esclude id_user dalla risposta
    });
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching favourite categories stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/v1/users/stats/savings/total:
 *   get:
 *     summary: Ottiene le statistiche del risparmio totale calcolate in real-time
 *     description: Calcola e restituisce i risparmi dell'utente per tutti i periodi (all-time, mensile, annuale). Il calcolo è basato sui modelli utilizzati dall'utente, i costi delle sottoscrizioni corrispondenti e l'importo effettivamente speso. L'utente viene identificato automaticamente dal JWT token.
 *     tags: [UserStats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [all, monthly, yearly]
 *         description: Periodo per il calcolo del risparmio
 *         example: "all"
 *     responses:
 *       200:
 *         description: Statistiche risparmio calcolate con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     allTime:
 *                       type: object
 *                       properties:
 *                         period:
 *                           type: string
 *                           example: "all"
 *                         subscriptionCost:
 *                           type: string
 *                           example: "500.00"
 *                         actualSpent:
 *                           type: string
 *                           example: "150.00"
 *                         totalSavings:
 *                           type: string
 *                           example: "350.00"
 *                         modelsUsed:
 *                           type: integer
 *                           example: 5
 *                         months:
 *                           type: integer
 *                           example: 6
 *                     monthly:
 *                       type: object
 *                       properties:
 *                         period:
 *                           type: string
 *                           example: "monthly"
 *                         subscriptionCost:
 *                           type: string
 *                           example: "80.00"
 *                         actualSpent:
 *                           type: string
 *                           example: "25.00"
 *                         totalSavings:
 *                           type: string
 *                           example: "55.00"
 *                         modelsUsed:
 *                           type: integer
 *                           example: 3
 *                         months:
 *                           type: integer
 *                           example: 1
 *                     yearly:
 *                       type: object
 *                       properties:
 *                         period:
 *                           type: string
 *                           example: "yearly"
 *                         subscriptionCost:
 *                           type: string
 *                           example: "960.00"
 *                         actualSpent:
 *                           type: string
 *                           example: "300.00"
 *                         totalSavings:
 *                           type: string
 *                           example: "660.00"
 *                         modelsUsed:
 *                           type: integer
 *                           example: 4
 *                         months:
 *                           type: integer
 *                           example: 12
 *       401:
 *         description: Non autorizzato - token JWT mancante o non valido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Errore interno del server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/savings/total', authMiddleware, async (req, res) => {
  try {
    const { period } = req.query;
    const user_id = req.user.id; // Get user_id from JWT token
    
    let savingsData;
    
    if (period && ['all', 'monthly', 'yearly'].includes(period)) {
      // Calcola per un periodo specifico
      savingsData = await savingsService.calculateUserSavings(user_id, period);
    } else {
      // Calcola per tutti i periodi
      savingsData = await savingsService.calculateAllPeriodsSavings(user_id);
    }
    
    res.json({
      success: true,
      data: savingsData
    });
  } catch (error) {
    console.error('Error calculating total savings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/v1/users/stats/savings/by_provider:
 *   get:
 *     summary: Ottiene le statistiche del risparmio per provider calcolate in real-time
 *     description: Calcola e restituisce i risparmi dell'utente raggruppati per provider per diversi periodi (settimana, mese, anno). Include percentuale di risparmio, modelli utilizzati per provider e totali spesi. L'utente viene identificato automaticamente dal JWT token.
 *     tags: [UserStats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, year]
 *         description: Periodo per il calcolo del risparmio per provider
 *         example: "month"
 *     responses:
 *       200:
 *         description: Statistiche risparmio per provider calcolate con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     week:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           label:
 *                             type: string
 *                             example: "openai"
 *                           providerId:
 *                             type: integer
 *                             example: 1
 *                           period:
 *                             type: string
 *                             example: "week"
 *                           subscriptionCost:
 *                             type: string
 *                             example: "20.00"
 *                           actualSpent:
 *                             type: string
 *                             example: "5.00"
 *                           totalSavings:
 *                             type: string
 *                             example: "15.00"
 *                           savingsPercentage:
 *                             type: string
 *                             example: "75.0"
 *                           modelsUsed:
 *                             type: integer
 *                             example: 2
 *                           models:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                   example: 1
 *                                 name:
 *                                   type: string
 *                                   example: "GPT-4"
 *                                 model_slug:
 *                                   type: string
 *                                   example: "gpt-4-openai"
 *                     month:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ProviderSavingsData'
 *                     year:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ProviderSavingsData'
 *       401:
 *         description: Non autorizzato - token JWT mancante o non valido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Errore interno del server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/savings/by_provider', authMiddleware, async (req, res) => {
  try {
    const { period } = req.query;
    const user_id = req.user.id; // Get user_id from JWT token
    
    let savingsData;
    
    if (period && ['week', 'month', 'year'].includes(period)) {
      // Calcola per un periodo specifico
      const providersData = await savingsService.calculateSavingsByProvider(user_id, period);
      savingsData = { [period]: providersData };
    } else {
      // Calcola per tutti i periodi
      savingsData = await savingsService.calculateAllPeriodsSavingsByProvider(user_id);
    }
    
    res.json({
      success: true,
      data: savingsData
    });
  } catch (error) {
    console.error('Error calculating savings by provider:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;