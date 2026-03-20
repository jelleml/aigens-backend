// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const PaymentController = require('../../controllers/paymentController');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validateWebhook } = require('../../middlewares/btcpayWebhook');
const BTCPayService = require('../../services/btc-payments.service');

/**
 * Main payment creation endpoint that your frontend calls
 * @route POST /api/v1/payments/create-invoice
 */
router.post('/create-invoice', authenticate, (req, res, next) => {
    PaymentController.createInvoice(req, res).catch(next);
});

/**
 * Get invoice details with QR codes
 * @route GET /api/v1/payments/invoice/:invoiceId
 */
router.get('/invoice/:invoiceId', authenticate, (req, res, next) => {
    PaymentController.getInvoice(req, res).catch(next);
});

/**
 * Get Lightning-specific invoice data
 * @route GET /api/v1/payments/lightning/:invoiceId
 */
router.get('/lightning/:invoiceId', authenticate, (req, res, next) => {
    PaymentController.getLightningInvoice(req, res).catch(next);
});

/**
 * Check payment status using transaction ID
 * @route GET /api/v1/payments/status/:transactionId
 */
router.get('/status/:transactionId', authenticate, (req, res, next) => {
    PaymentController.checkPaymentStatus(req, res).catch(next);
});

/**
 * Get payment history with pagination
 * @route GET /api/v1/payments/history
 */
router.get('/history', authenticate, (req, res, next) => {
    PaymentController.getPaymentHistory(req, res).catch(next);
});

/**
 * Request a refund for a payment
 * @route POST /api/v1/payments/:id/refund
 */
router.post('/:id/refund', authenticate, (req, res, next) => {
    PaymentController.requestRefund(req, res).catch(next);
});

/**
 * Check if Lightning Network is available
 * @route GET /api/v1/payments/lightning/availability
 */
router.get('/lightning/availability', authenticate, async (req, res) => {
    try {
        const isAvailable = await BTCPayService.isLightningAvailable();

        res.json({
            success: true,
            data: {
                lightningAvailable: isAvailable
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to check Lightning availability'
        });
    }
});

/**
 * Get available payment methods
 * @route GET /api/v1/payments/methods
 */
router.get('/methods', authenticate, async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                methods: [
                    {
                        id: 'lightning',
                        name: 'Lightning Network',
                        description: 'Instant Bitcoin payments',
                        recommended: true,
                        fees: 'Low',
                        confirmationTime: 'Instant',
                        icon: '⚡'
                    },
                    {
                        id: 'onchain',
                        name: 'Bitcoin On-Chain',
                        description: 'Traditional Bitcoin payments',
                        recommended: false,
                        fees: 'Variable',
                        confirmationTime: '10-60 minutes',
                        icon: '₿'
                    },
                    {
                        id: 'auto',
                        name: 'Automatic',
                        description: 'Best available payment method',
                        recommended: true,
                        fees: 'Optimized',
                        confirmationTime: 'Variable',
                        icon: '🔗'
                    }
                ]
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get payment methods'
        });
    }
});

/**
 * BTCPay webhook endpoint
 * @route POST /api/v1/btcpay/webhook
 */
router.post('/webhook', validateWebhook, (req, res, next) => {
    PaymentController.handleWebhook(req, res).catch(next);
});

/**
 * BTCPay webhook endpoint (con raw body parsing configurato in server.js)
 * @route POST /api/v1/payments/btcpay/webhook
 * IMPORTANTE: Il raw body parsing è configurato in server.js prima di setupBodyParser()
 */
router.post('/btcpay/webhook', async (req, res) => {
    try {
        console.log('Webhook received');
        console.log('Body is Buffer:', Buffer.isBuffer(req.body));
        console.log('Body type:', typeof req.body);

        // Validate webhook signature
        const crypto = require('crypto');
        const signature = req.headers['btcpay-sig'];
        const secret = process.env.BTCPAY_WEBHOOK_SECRET;

        if (!signature || !secret) {
            console.error('Missing signature or secret');
            return res.status(401).send('Unauthorized');
        }

        // Con la configurazione raw in app.js, req.body dovrebbe essere un Buffer
        const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body), 'utf8');

        // Calculate the expected signature
        const expectedHash = crypto
            .createHmac('sha256', secret)
            .update(bodyBuffer)
            .digest('hex');

        // Extract hash from BTCPay signature format: sha256=<hash>
        const receivedHash = signature.startsWith('sha256=')
            ? signature.substring(7)
            : signature;

        console.log('Received signature:', signature);
        console.log('Received hash (extracted):', receivedHash);
        console.log('Expected hash:', expectedHash);
        console.log('Body buffer length:', bodyBuffer.length);
        console.log('Hashes match:', receivedHash === expectedHash);

        // Compare the hashes using crypto.timingSafeEqual for security
        if (receivedHash.length !== expectedHash.length ||
            !crypto.timingSafeEqual(
                Buffer.from(receivedHash, 'hex'),
                Buffer.from(expectedHash, 'hex')
            )) {
            console.error('Invalid webhook signature');
            console.error('Raw body (first 200 chars):', bodyBuffer.toString().substring(0, 200));
            return res.status(401).send('Invalid signature');
        }

        console.log('✅ Webhook signature validated successfully!');

        // Parse the JSON payload
        const payload = JSON.parse(bodyBuffer.toString());

        // Log the complete payload for debugging
        console.log('🔍 Webhook payload completo:', JSON.stringify(payload, null, 2));
        console.log('🔍 Invoice ID dal payload:', payload.invoiceId);
        console.log('🔍 Event type dal payload:', payload.type);

        // Set the parsed payload as req.body for the controller
        req.body = payload;

        // Call the controller with the parsed payload
        await PaymentController.handleWebhook(req, res);

    } catch (error) {
        console.error('Webhook error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).send('Error processing webhook');
    }
});

/**
 * Webhook di conferma refund/payout da BTCPay Server
 * @route POST /api/v1/payments/refund-webhook
 */
router.post('/refund-webhook', (req, res, next) => {
    PaymentController.handleRefundWebhook(req, res).catch(next);
});

/**
 * Check payment status by invoiceId (per uso frontend dopo redirect BTCPay)
 * @route GET /api/v1/payments/status/invoice/:invoiceId
 */
router.get('/status/invoice/:invoiceId', (req, res, next) => {
    PaymentController.checkPaymentStatusByInvoiceId(req, res).catch(next);
});

// Legacy routes for backward compatibility with your existing frontend
/**
 * Legacy BTC creation route
 * @route POST /api/v1/btc/create
 */
router.post('/btc/create', authenticate, (req, res, next) => {
    const { amount, details } = req.body;

    // Map legacy request to new format
    req.body = {
        amountUSD: amount,
        creditAmount: details?.creditAmount || amount,
        paymentMethod: 'auto'
    };

    PaymentController.createInvoice(req, res).catch(next);
});

// Error handling middleware
router.use((err, req, res, next) => {
    console.error('Error in payment routes:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: err.message
    });
});

module.exports = router;
