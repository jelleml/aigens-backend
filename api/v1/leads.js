/**
 * Router per la gestione dei lead
 * @module api/v1/leads
 */

const express = require('express');
const router = express.Router();
const leadController = require('../../controllers/lead.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

/**
 * @swagger
 * tags:
 *   name: Leads
 *   description: API per la gestione dei lead
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ModelInterest:
 *       type: object
 *       required:
 *         - model_id
 *         - name
 *         - usage_plan
 *         - usage_time
 *       properties:
 *         model_id:
 *           type: string
 *           description: ID del modello
 *         name:
 *           type: string
 *           description: Nome del modello
 *         usage_plan:
 *           type: string
 *           description: Piano di utilizzo (es. basic, pro, enterprise)
 *         usage_time:
 *           type: string
 *           description: Tempo di utilizzo previsto (es. 1 mese, 6 mesi, 1 anno)
 *       example:
 *         model_id: "claude-3-opus"
 *         name: "Claude 3 Opus"
 *         usage_plan: "pro"
 *         usage_time: "6 mesi"
 *
 *     Lead:
 *       type: object
 *       required:
 *         - email
 *         - models_interest
 *         - estimated_savings
 *       properties:
 *         id:
 *           type: integer
 *           description: ID del lead
 *         email:
 *           type: string
 *           format: email
 *           description: Email del lead
 *         models_interest:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ModelInterest'
 *           description: Array di modelli di interesse
 *         estimated_savings:
 *           type: number
 *           format: float
 *           description: Risparmio stimato in valuta
 *         currency:
 *           type: string
 *           default: EUR
 *           description: Valuta del risparmio stimato
 *         status:
 *           type: string
 *           enum: [new, contacted, qualified, converted, lost]
 *           default: new
 *           description: Stato del lead nel processo di conversione
 *         notes:
 *           type: string
 *           description: Note sul lead
 *         contact_attempts:
 *           type: integer
 *           default: 0
 *           description: Numero di tentativi di contatto
 *         last_contact_date:
 *           type: string
 *           format: date-time
 *           description: Data dell'ultimo contatto
 *         source:
 *           type: string
 *           description: Fonte di acquisizione del lead
 *         user_id:
 *           type: integer
 *           description: ID dell'utente se il lead è stato convertito
 *         conversion_date:
 *           type: string
 *           format: date-time
 *           description: Data di conversione del lead in utente
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Data di creazione
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Data di ultimo aggiornamento
 *       example:
 *         id: 1
 *         email: "cliente@example.com"
 *         models_interest: [
 *           {
 *             model_id: "claude-3-opus",
 *             name: "Claude 3 Opus",
 *             usage_plan: "pro",
 *             usage_time: "6 mesi"
 *           }
 *         ]
 *         estimated_savings: 1500.00
 *         currency: "EUR"
 *         status: "new"
 *         notes: "Cliente interessato al piano pro"
 *         contact_attempts: 0
 *         source: "landing_page"
 *         created_at: "2023-01-01T12:00:00Z"
 *         updated_at: "2023-01-01T12:00:00Z"
 */

/**
 * @swagger
 * /api/v1/leads:
 *   post:
 *     summary: Crea un nuovo lead
 *     description: Endpoint pubblico per la creazione di un nuovo lead dal form di contatto
 *     tags: [Leads]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - models_interest
 *               - estimated_savings
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email del lead
 *               models_interest:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ModelInterest'
 *                 description: Array di modelli di interesse
 *               estimated_savings:
 *                 type: number
 *                 format: float
 *                 description: Risparmio stimato in valuta
 *               currency:
 *                 type: string
 *                 default: EUR
 *                 description: Valuta del risparmio stimato
 *               source:
 *                 type: string
 *                 description: Fonte di acquisizione del lead
 *     responses:
 *       201:
 *         description: Lead creato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Lead creato con successo
 *                 data:
 *                   $ref: '#/components/schemas/Lead'
 *       400:
 *         description: Dati mancanti o non validi
 *       500:
 *         description: Errore del server
 */
router.post('/', leadController.createLead);

/**
 * @swagger
 * /api/v1/leads:
 *   get:
 *     summary: Ottiene tutti i lead
 *     description: Recupera tutti i lead con possibilità di filtraggio
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [new, contacted, qualified, converted, lost]
 *         description: Filtra per stato
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: Filtra per email (ricerca parziale)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filtra per data di creazione (inizio)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filtra per data di creazione (fine)
 *     responses:
 *       200:
 *         description: Lista dei lead
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Lead recuperati con successo
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Lead'
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.get('/', authMiddleware.authenticate, authMiddleware.authorize('admin'), leadController.getLeads);

/**
 * @swagger
 * /api/v1/leads/{id}:
 *   get:
 *     summary: Ottiene un lead per ID
 *     description: Recupera un lead specifico tramite il suo ID
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del lead
 *     responses:
 *       200:
 *         description: Lead recuperato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Lead recuperato con successo
 *                 data:
 *                   $ref: '#/components/schemas/Lead'
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Lead non trovato
 *       500:
 *         description: Errore del server
 */
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorize('admin'), leadController.getLeadById);

/**
 * @swagger
 * /api/v1/leads/{id}:
 *   put:
 *     summary: Aggiorna un lead
 *     description: Aggiorna i dati di un lead esistente
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del lead
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               models_interest:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ModelInterest'
 *               estimated_savings:
 *                 type: number
 *                 format: float
 *               currency:
 *                 type: string
 *               notes:
 *                 type: string
 *               source:
 *                 type: string
 *     responses:
 *       200:
 *         description: Lead aggiornato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Lead aggiornato con successo
 *                 data:
 *                   $ref: '#/components/schemas/Lead'
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Lead non trovato
 *       500:
 *         description: Errore del server
 */
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorize('admin'), leadController.updateLead);

/**
 * @swagger
 * /api/v1/leads/{id}/status:
 *   patch:
 *     summary: Aggiorna lo stato di un lead
 *     description: Aggiorna lo stato di un lead nel processo di conversione
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del lead
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [new, contacted, qualified, converted, lost]
 *                 description: Nuovo stato del lead
 *     responses:
 *       200:
 *         description: Stato del lead aggiornato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Stato del lead aggiornato con successo
 *                 data:
 *                   $ref: '#/components/schemas/Lead'
 *       400:
 *         description: Stato non valido
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Lead non trovato
 *       500:
 *         description: Errore del server
 */
router.patch('/:id/status', authMiddleware.authenticate, authMiddleware.authorize('admin'), leadController.updateLeadStatus);

/**
 * @swagger
 * /api/v1/leads/{id}/convert:
 *   post:
 *     summary: Converte un lead in utente
 *     description: Associa un lead a un utente registrato
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del lead
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *             properties:
 *               user_id:
 *                 type: integer
 *                 description: ID dell'utente
 *     responses:
 *       200:
 *         description: Lead convertito in utente con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Lead convertito in utente con successo
 *                 data:
 *                   $ref: '#/components/schemas/Lead'
 *       400:
 *         description: ID utente mancante
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Lead non trovato
 *       500:
 *         description: Errore del server
 */
router.post('/:id/convert', authMiddleware.authenticate, authMiddleware.authorize('admin'), leadController.convertLeadToUser);

/**
 * @swagger
 * /api/v1/leads/{id}:
 *   delete:
 *     summary: Elimina un lead
 *     description: Elimina un lead dal database
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del lead
 *     responses:
 *       200:
 *         description: Lead eliminato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Lead eliminato con successo
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Lead non trovato
 *       500:
 *         description: Errore del server
 */
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorize('admin'), leadController.deleteLead);

module.exports = router; 