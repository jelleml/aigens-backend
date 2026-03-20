/**
 * @module api/v1/stripe
 * Stripe payment routes: payment intent creation and webhook handler
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const stripeService = require('../../services/stripe.service');

/**
 * @swagger
 * /api/v1/stripe/create-payment-intent:
 *   post:
 *     summary: Crea un PaymentIntent Stripe per pagamenti con carta, Google Pay o Apple Pay
 *     tags: [Stripe]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Importo in USD da convertire in crediti
 *     responses:
 *       200:
 *         description: Client secret per completare il pagamento Stripe
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clientSecret:
 *                   type: string
 *       400:
 *         description: Dati non validi
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.post('/create-payment-intent', authMiddleware.authenticate, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Importo non valido' });
        }
        const paymentIntent = await stripeService.createPaymentIntent({
            amount,
            userId: req.user.id
        });
        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error('Errore creazione PaymentIntent:', error);
        res.status(500).json({ error: 'Errore creazione PaymentIntent' });
    }
});

/**
 * @swagger
 * /api/v1/stripe/webhook:
 *   post:
 *     summary: Webhook Stripe per gestire eventi di pagamento
 *     tags: [Stripe]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Evento gestito con successo
 *       400:
 *         description: Errore nel webhook
 */
router.post('/webhook', express.raw({ type: 'application/json' }), stripeService.handleWebhook);

/**
 * @swagger
 * /api/v1/stripe/payment-method:
 *   post:
 *     summary: Salva un nuovo payment method Stripe per l'utente autenticato
 *     tags: [Stripe]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethodId
 *             properties:
 *               paymentMethodId:
 *                 type: string
 *                 description: ID del payment method Stripe
 *     responses:
 *       200:
 *         description: Payment method salvato
 *       400:
 *         description: Dati non validi
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.post('/payment-method', authMiddleware.authenticate, async (req, res) => {
    try {
        const { paymentMethodId } = req.body;
        if (!paymentMethodId) {
            return res.status(400).json({ error: 'paymentMethodId richiesto' });
        }
        const record = await stripeService.saveUserPaymentMethod(req.user.id, paymentMethodId);
        res.json({ success: true, paymentMethod: record });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Errore salvataggio payment method' });
    }
});

/**
 * @swagger
 * /api/v1/stripe/payment-method:
 *   get:
 *     summary: Restituisce il payment method attivo dell'utente autenticato
 *     tags: [Stripe]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment method attivo
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Nessun payment method attivo
 *       500:
 *         description: Errore del server
 */
router.get('/payment-method', authMiddleware.authenticate, async (req, res) => {
    try {
        const record = await stripeService.getActiveUserPaymentMethod(req.user.id);
        if (!record) {
            return res.status(200).json({ paymentMethod: null });
        }
        res.json({ paymentMethod: record });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Errore recupero payment method' });
    }
});

/**
 * @swagger
 * /api/v1/stripe/payment-method/{paymentMethodId}:
 *   get:
 *     summary: Recupera i dettagli di un payment method Stripe
 *     tags: [Stripe]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentMethodId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del payment method Stripe
 *     responses:
 *       200:
 *         description: Dettagli del payment method
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Payment method non trovato
 *       500:
 *         description: Errore del server
 */
router.get('/payment-method/:paymentMethodId', authMiddleware.authenticate, async (req, res) => {
    try {
        const { paymentMethodId } = req.params;
        const paymentMethod = await require('../../services/stripe.service').getStripePaymentMethodDetails(paymentMethodId);
        if (!paymentMethod) {
            return res.status(404).json({ error: 'Payment method non trovato' });
        }
        res.json(paymentMethod);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Errore recupero dettagli payment method' });
    }
});

/**
 * @swagger
 * /api/v1/stripe/payment-method:
 *   delete:
 *     summary: Elimina il payment method attivo dell'utente sia dal database che da Stripe
 *     tags: [Stripe]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment method eliminato
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Nessun payment method attivo
 *       500:
 *         description: Errore del server
 */
router.delete('/payment-method', authMiddleware.authenticate, async (req, res) => {
    try {
        const record = await stripeService.getActiveUserPaymentMethod(req.user.id);
        if (!record) {
            return res.status(404).json({ error: 'Nessun payment method attivo da eliminare' });
        }
        await stripeService.deleteUserPaymentMethod(req.user.id, record.stripe_payment_method_id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Errore eliminazione payment method' });
    }
});

module.exports = router; 