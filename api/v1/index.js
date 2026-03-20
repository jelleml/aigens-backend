/**
 * Router principale per l'API v1
 * @module api/v1
 */

const express = require('express');
const router = express.Router();

// Importa tutti i router
const usersRouter = require('./users');
const authRouter = require('./auth');
const chatsRouter = require('./chats');
const foldersRouter = require('./folders');
const { estimateCostHandler } = require('./messages');
const authMiddleware = require('../../middlewares/auth.middleware');
const userAccessMiddleware = require('../../middlewares/user-access.middleware');
const walletsRouter = require('./wallets');
const promptsRouter = require('./prompts');
const modelsRouter = require('./models');
const leadsRouter = require('./leads');
const userAccessesRouter = require('./user-accesses');
const stripeRouter = require('./stripe');
const btcPaymentsRouter = require('./btc-payments');
const paymentsRouter = require('./payments');
const usersStatsRouter = require('./users_stats');
const messageRecoveryRouter = require('./message-recovery');

/**
 * @swagger
 * tags:
 *   name: API
 *   description: Informazioni generali sull'API
 */

// Middleware per tracciare gli accessi utente
router.use(userAccessMiddleware.trackUserAccess);

// Registra le rotte
router.use('/users', usersRouter);
router.use('/auth', authRouter);
router.use('/chats', chatsRouter);
router.use('/folders', foldersRouter);
// Il router dei messaggi è ora annidato all'interno del router delle chat
// router.use('/messages', messagesRouter);
router.use('/wallets', walletsRouter);
router.use('/prompts', promptsRouter);
router.use('/models', modelsRouter);
router.use('/leads', leadsRouter);
router.use('/user-accesses', userAccessesRouter);
router.use('/user-settings', require('./user-settings'));
router.use('/stripe', stripeRouter);
router.use('/btc', btcPaymentsRouter);
router.use('/payments', paymentsRouter);
router.use('/users/stats', usersStatsRouter);
router.use('/message-recovery', messageRecoveryRouter);

// Registra gli endpoint messages
const messagesRouter = require('./messages');
router.post('/messages/estimate-cost', authMiddleware.authenticate, estimateCostHandler);
router.use('/messages', messagesRouter); // RIMOSSO: il router dei messaggi è già montato come annidato in chats.js

/**
 * @swagger
 * /api/v1:
 *   get:
 *     summary: Verifica lo stato dell'API v1
 *     tags: [API]
 *     responses:
 *       200:
 *         description: API v1 funzionante correttamente
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
 *                   example: API v1 funzionante
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API v1 funzionante',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 