// routes/payments.js
const express = require('express');
const router = express.Router();
const btcpayService = require('../../services/btc-payments.service');
const { Transaction, Wallet, User } = require('../../database').sequelize.models;
const { authenticate } = require('../../middlewares/auth.middleware');
const creditConversion = require('../../services/credit-conversion.service');
const exchangeRateService = require('../../services/exchange-rate.service');

/**
 * Legacy BTC creation route for backward compatibility
 * @route POST /api/v1/btc/create
 */
router.post('/create', authenticate, async (req, res) => {
    try {
        const { amount, details } = req.body;

        // Map legacy request format to new format by modifying req.body
        const originalBody = req.body;
        req.body = {
            amountUSD: amount,
            creditAmount: details?.creditAmount || amount,
            paymentMethod: 'auto'
        };

        // Import and use PaymentController
        const PaymentController = require('../../controllers/paymentController');
        await PaymentController.createInvoice(req, res);

        // Restore original body (optional, for cleanup)
        req.body = originalBody;
    } catch (error) {
        console.error('Error in legacy BTC create route:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

/**
 * @swagger
 * tags:
 *   name: BTC Payments
 *   description: >-
 *     [DEPRECATO] Gli endpoint di creazione pagamento BTC/BTCPay sono ora gestiti unicamente tramite `/api/v1/wallets/deposit`.
 *     Utilizzare solo l'endpoint unificato per depositi in EUR, Stripe e Bitcoin/BTCPay.
 */
/**
 * @swagger
 * /btcpay/webhook:
 *   post:
 *     summary: Gestore webhook BTCPay (accredito in crediti, conversione automatica)
 *     tags:
 *       - BTC Payments
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               invoiceId:
 *                 type: string
 *                 description: ID invoice BTCPay
 *               type:
 *                 type: string
 *                 description: Tipo evento webhook (es. InvoiceSettled, InvoiceInvalid, InvoiceExpired)
 *     responses:
 *       200:
 *         description: Webhook processato con successo. Se il pagamento è completato, l'accredito avviene in crediti secondo il tasso di cambio BCE/CoinGecko (1 EUR = 80 crediti).
 *       401:
 *         description: Non autorizzato o firma non valida
 *       500:
 *         description: Errore durante il processamento del webhook (BTCPay ritenterà)
 */
// BTCPay webhook handler with signature validation
router.post('/btcpay/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        // Validate webhook signature
        const crypto = require('crypto');
        const signature = req.headers['btcpay-sig'];
        const secret = process.env.BTCPAY_WEBHOOK_SECRET;

        if (!signature || !secret) {
            return res.status(401).send('Unauthorized');
        }

        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(req.body)
            .digest('hex');

        if (signature !== expectedSignature) {
            console.error('Invalid webhook signature');
            return res.status(401).send('Invalid signature');
        }

        // Parse the validated payload
        const payload = JSON.parse(req.body.toString());
        const { invoiceId, type } = payload;

        if (type === 'InvoiceSettled') {
            const invoice = await btcpayService.getInvoice(invoiceId);

            // Use transactionId from metadata if available
            let transaction = null;
            if (invoice.metadata && invoice.metadata.transactionId) {
                transaction = await Transaction.findOne({
                    where: { id: invoice.metadata.transactionId },
                    include: [{ model: Wallet, as: 'Wallet' }]
                });
            } else {
                // Fallback to old method
                transaction = await Transaction.findOne({
                    where: { transaction_id: invoiceId },
                    include: [{ model: Wallet, as: 'Wallet' }]
                });
            }

            if (transaction && invoice.status === 'Settled') {
                // Update transaction status
                await transaction.update({ status: 'completed' });

                // Conversione in crediti
                // 1. Recupera tasso BTC/EUR
                const btcToEurRate = await exchangeRateService.getBtcEurRate();
                // 2. Calcola importo pagato in BTC (invoice.amount)
                const amountBTC = invoice.amount;
                // 3. Converte in crediti
                const credits = creditConversion.btcToCredits(amountBTC, btcToEurRate);

                // Add credits to wallet
                const wallet = await Wallet.findByPk(transaction.wallet_id);
                await wallet.increment('balance', { by: credits });
                await wallet.update({ last_deposit_at: new Date() });

                // Aggiorna la transazione con i crediti effettivi
                await transaction.update({
                    amount: credits,
                    currency: 'CREDIT',
                    description: `BTC payment (${amountBTC} BTC, ${credits} crediti)`
                });

                // Invia email di conferma acquisto
                try {
                    const purchaseNotificationService = require('../../services/purchase-notification.service');
                    await purchaseNotificationService.sendBTCPayPurchaseConfirmation(
                        transaction,
                        wallet,
                        credits,
                        amountBTC
                    );
                } catch (emailError) {
                    console.error('[BTCPay] Errore nell\'invio email di conferma acquisto:', emailError);
                    // Non blocchiamo il processo se l'email fallisce
                }
            }
        } else if (type === 'InvoiceInvalid' || type === 'InvoiceExpired') {
            // Mark transaction as failed
            await Transaction.update(
                { status: 'failed' },
                { where: { transaction_id: invoiceId } }
            );
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        // Return 500 to trigger BTCPay redelivery
        res.status(500).send('Error processing webhook');
    }
});

/**
 * @swagger
 * /status/:invoiceId:
 *   get:
 *     summary: Check the status of a BTC payment
 *     tags:
 *       - BTC Payments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *         description: BTCPay invoice ID
 *     responses:
 *       200:
 *         description: Payment status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *       500:
 *         description: Server error
 */
// Check payment status
router.get('/status/:invoiceId', authenticate, async (req, res) => {
    try {
        const invoice = await btcpayService.getInvoice(req.params.invoiceId);
        res.json({ status: invoice.status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;