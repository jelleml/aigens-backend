// controllers/paymentController.js
const BTCPayService = require('../services/btc-payments.service');
const db = require('../database');
const { Transaction, User } = db.models;
const { getLogger } = require('../services/logging');
const logger = getLogger('payment', 'controller');

const PaymentController = {
    /**
     * Create a new payment invoice with Lightning support
     * @route POST /api/v1/payments/create-invoice
     */
    async createInvoice(req, res) {
        try {
            const {
                amountUSD,
                creditAmount,
                paymentMethod = 'auto', // 'auto', 'lightning', 'onchain'
                expirationMinutes,
                buyerEmail
            } = req.body;
            const userId = req.user.id;

            // Validate input
            if (!amountUSD || !creditAmount) {
                return res.status(400).json({
                    success: false,
                    error: 'Amount USD and credit amount are required'
                });
            }

            if (amountUSD < 0.01) {
                return res.status(400).json({
                    success: false,
                    error: 'Minimum amount is $0.01'
                });
            }

            // Create transaction record
            const transaction = await Transaction.create({
                user_id: userId,
                wallet_id: req.user.wallet_id || 1, // Default wallet ID if not available
                type: 'deposit', // Changed from 'credit_purchase' to match enum
                amount: amountUSD, // Changed from amountUSD to amount
                currency: 'USD',
                payment_method: 'bitcoin', // Changed from paymentMethod to match enum
                status: 'pending',
                description: `BTC payment for ${creditAmount} credits`
            });

            let invoiceData;

            // Create appropriate invoice based on payment method preference
            if (paymentMethod === 'lightning') {
                invoiceData = await BTCPayService.createLightningInvoice(
                    userId,
                    amountUSD,
                    creditAmount,
                    transaction.id,
                    {
                        expirationMinutes: expirationMinutes || 15,
                        buyerEmail: buyerEmail || req.user.email
                    }
                );
            } else {
                invoiceData = await BTCPayService.createInvoice(
                    userId,
                    amountUSD,
                    creditAmount,
                    transaction.id,
                    {
                        expirationMinutes: expirationMinutes || 60,
                        buyerEmail: buyerEmail || req.user.email
                    }
                );
            }

            // Update transaction with invoice ID
            await transaction.update({
                invoice_id: invoiceData.invoiceId, // Changed from invoiceId to invoice_id
                metadata: { // Store additional data in metadata instead of btcpayData
                    btcpayData: invoiceData,
                    creditAmount: creditAmount
                }
            });

            res.status(201).json({
                success: true,
                data: {
                    transactionId: transaction.id,
                    invoice: invoiceData,
                    expiresAt: new Date(invoiceData.expirationTime * 1000).toISOString()
                }
            });

        } catch (error) {
            console.error(error);
            logger.error('Error creating invoice:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create invoice',
                details: error.message
            });
        }
    },

    /**
     * Get invoice details with QR codes
     * @route GET /api/v1/payments/invoice/:invoiceId
     */
    async getInvoice(req, res) {
        try {
            const { invoiceId } = req.params;
            const userId = req.user.id;

            // Find the transaction to verify ownership
            const transaction = await Transaction.findOne({
                where: {
                    invoice_id: invoiceId, // Changed from invoiceId to invoice_id
                    user_id: userId // Changed from userId to user_id
                }
            });

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    error: 'Invoice not found or not authorized'
                });
            }

            // Get detailed invoice with payment methods and QR codes
            const invoiceData = await BTCPayService.getInvoiceWithPaymentMethods(invoiceId);

            res.json({
                success: true,
                data: {
                    transactionId: transaction.id,
                    invoice: invoiceData,
                    isExpired: new Date() > new Date(invoiceData.expirationTime * 1000)
                }
            });

        } catch (error) {
            logger.error('Error fetching invoice:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch invoice',
                details: error.message
            });
        }
    },

    /**
     * Get Lightning invoice (BOLT11) for QR code or payment
     * @route GET /api/v1/payments/lightning/:invoiceId
     */
    async getLightningInvoice(req, res) {
        try {
            const { invoiceId } = req.params;
            const userId = req.user.id;

            // Verify ownership
            const transaction = await Transaction.findOne({
                where: {
                    invoice_id: invoiceId, // Changed from invoiceId to invoice_id
                    user_id: userId // Changed from userId to user_id
                }
            });

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    error: 'Invoice not found or not authorized'
                });
            }

            const lightningInvoice = await BTCPayService.getLightningInvoice(invoiceId);

            if (!lightningInvoice) {
                return res.status(404).json({
                    success: false,
                    error: 'Lightning invoice not available for this payment'
                });
            }

            // Generate QR code for the Lightning invoice
            const QRCode = require('qrcode');
            const qrCode = await QRCode.toDataURL(lightningInvoice, {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                quality: 0.92,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            res.json({
                success: true,
                data: {
                    lightningInvoice: lightningInvoice,
                    qrCode: qrCode,
                    paymentMethod: 'Lightning Network'
                }
            });

        } catch (error) {
            logger.error('Error getting Lightning invoice:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get Lightning invoice',
                details: error.message
            });
        }
    },

    /**
     * Check payment status
     * @route GET /api/v1/payments/status/:transactionId
     */
    async checkPaymentStatus(req, res) {
        try {
            const { transactionId } = req.params;
            const userId = req.user.id;

            const transaction = await Transaction.findOne({
                where: {
                    id: transactionId,
                    user_id: userId // Changed from userId to user_id
                }
            });

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    error: 'Transaction not found'
                });
            }

            // Get current invoice status from BTCPay
            let currentStatus = transaction.status;
            if (transaction.invoice_id) { // Changed from invoiceId to invoice_id
                try {
                    const invoice = await BTCPayService.getInvoice(transaction.invoice_id); // Changed from invoiceId to invoice_id
                    currentStatus = this.mapBTCPayStatus(invoice.status);

                    // Update transaction if status changed
                    if (currentStatus !== transaction.status) {
                        await transaction.update({ status: currentStatus });
                    }
                } catch (error) {
                    logger.error('Error fetching invoice status:', error);
                    // Continue with cached status
                }
            }

            res.json({
                success: true,
                data: {
                    transactionId: transaction.id,
                    status: currentStatus,
                    amountUSD: transaction.amountUSD,
                    creditAmount: transaction.creditAmount,
                    createdAt: transaction.createdAt,
                    updatedAt: transaction.updatedAt
                }
            });

        } catch (error) {
            logger.error('Error checking payment status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to check payment status',
                details: error.message
            });
        }
    },

    /**
     * Get user's payment history
     * @route GET /api/v1/payments/history
     */
    async getPaymentHistory(req, res) {
        try {
            const userId = req.user.id;
            const { page = 1, limit = 10, status } = req.query;

            const whereClause = { user_id: userId }; // Changed from userId to user_id
            if (status) {
                whereClause.status = status;
            }

            const transactions = await Transaction.findAndCountAll({
                where: whereClause,
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit),
                offset: (parseInt(page) - 1) * parseInt(limit)
            });

            res.json({
                success: true,
                data: {
                    transactions: transactions.rows,
                    pagination: {
                        total: transactions.count,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(transactions.count / parseInt(limit))
                    }
                }
            });

        } catch (error) {
            logger.error('Error fetching payment history:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch payment history',
                details: error.message
            });
        }
    },

    /**
     * Handle BTCPay webhook
     * @route POST /api/v1/btcpay/webhook
     */
    async handleWebhook(req, res) {
        try {
            const event = req.body;
            logger.info('BTCPay webhook received:', event);
            logger.info('🔍 Webhook payload completo:', JSON.stringify(event, null, 2));
            logger.info('🔍 Invoice ID ricevuto:', event.invoiceId);
            logger.info('🔍 Event type ricevuto:', event.type);

            const { invoiceId, type } = event;

            if (!invoiceId) {
                logger.error('❌ Missing invoice ID nel webhook');
                return res.status(400).json({ error: 'Missing invoice ID' });
            }

            // Find the transaction
            logger.info(`🔍 Cercando transazione con invoice_id: ${invoiceId}`);
            const transaction = await Transaction.findOne({
                where: { invoice_id: invoiceId } // Changed from invoiceId to invoice_id
            });

            if (!transaction) {
                logger.error(`❌ Transaction not found for invoice ${invoiceId}`);
                return res.status(200).json({ status: 'ignored' });
            }

            logger.info(`✅ Transazione trovata: ID=${transaction.id}, Status attuale=${transaction.status}`);

            // Update transaction based on webhook event
            logger.info(`🔍 Processing event type: ${type}`);
            let newStatus;

            // Mapping corretto per eventi BTCPay (solo valori ENUM consentiti)
            const eventTypeMapping = {
                'InvoiceReceivedPayment': 'pending',
                'InvoiceProcessing': 'pending',
                'InvoiceSettled': 'completed',
                'InvoiceExpired': 'failed',
                'InvoiceInvalid': 'failed',
                // Aggiunti possibili eventi alternativi
                'InvoicePaid': 'completed',
                'InvoiceConfirmed': 'completed',
                'InvoiceComplete': 'completed',
                'InvoicePaymentReceived': 'pending',
                'InvoicePaymentSettled': 'completed'
            };

            if (eventTypeMapping[type]) {
                newStatus = eventTypeMapping[type];
                logger.info(`✅ Evento ${type} mappato a status: ${newStatus}`);
            } else {
                logger.warn(`⚠️ Unhandled webhook event type: ${type}`);
                logger.info(`🔍 Eventi supportati: ${Object.keys(eventTypeMapping).join(', ')}`);
                return res.status(200).json({ status: 'ignored' });
            }

            // Validazione aggiuntiva per assicurarsi che il status sia valido
            const validStatuses = ['pending', 'completed', 'failed', 'cancelled'];
            if (!validStatuses.includes(newStatus)) {
                logger.error(`❌ Status non valido: ${newStatus}`);
                return res.status(400).json({ error: 'Invalid status' });
            }
            logger.info(`✅ Status valido: ${newStatus} in [${validStatuses.join(', ')}]`);

            // Check if status update is needed
            if (transaction.status === newStatus) {
                logger.info(`ℹ️ Transazione ${transaction.id} già in status ${newStatus}, nessun aggiornamento necessario`);
            } else {
                logger.info(`🔄 Aggiornamento transazione ${transaction.id} da ${transaction.status} a ${newStatus}`);

                // Update transaction status
                try {
                    await transaction.update({ status: newStatus });
                    logger.info(`✅ Transazione ${transaction.id} aggiornata con successo a status: ${newStatus}`);
                } catch (updateError) {
                    logger.error(`❌ Errore nell'aggiornamento della transazione ${transaction.id}:`, updateError);
                    throw updateError;
                }
            }

            // If payment is completed, add credits to wallet and send confirmation email
            if (newStatus === 'completed') {
                const user = await User.findByPk(transaction.user_id);
                if (user) {
                    try {
                        // Importa servizi per conversione crediti
                        const exchangeRateService = require('../services/exchange-rate.service');
                        const creditConversion = require('../services/credit-conversion.service');
                        const { Wallet } = require('../database').models;

                        // Recupera il wallet dell'utente
                        const wallet = await Wallet.findOne({ where: { user_id: user.id } });

                        if (wallet) {
                            try {
                                // Calcola crediti convertiti (BTCPay gestisce sempre EUR)
                                const amount = parseFloat(transaction.amount);
                                const currency = 'EUR'; // BTCPay gestisce sempre EUR

                                let credits;
                                if (currency === 'EUR') {
                                    credits = Math.floor(amount * 1000 * 100) / 100; // Arrotondamento a 2 decimali per difetto
                                    logger.info(`[Webhook] Conversione: ${amount} EUR → ${credits} crediti`);
                                } else if (currency === 'USD') {
                                    // Converti USD → EUR → Crediti
                                    const usdToEurRate = await exchangeRateService.getUsdEurRate();
                                    const amountEUR = amount * usdToEurRate;
                                    credits = Math.floor(amountEUR * 1000 * 100) / 100; // Arrotondamento a 2 decimali per difetto
                                    logger.info(`[Webhook] Conversione: ${amount} USD → ${amountEUR} EUR → ${credits} crediti (tasso: ${usdToEurRate})`);
                                } else {
                                    // Fallback a EUR
                                    credits = Math.floor(amount * 1000 * 100) / 100; // Arrotondamento a 2 decimali per difetto
                                    logger.info(`[Webhook] Conversione fallback: ${amount} ${currency} → ${credits} crediti`);
                                }

                                // Validazione limiti database
                                const MAX_BALANCE = 99999999.99; // Limite DECIMAL(10,2)
                                const oldBalance = wallet.balance;
                                const newBalance = parseFloat(wallet.balance) + credits;

                                if (newBalance > MAX_BALANCE) {
                                    logger.warn(`[Webhook] Balance troppo alto: ${newBalance}, limitato a ${MAX_BALANCE}`);
                                    wallet.balance = MAX_BALANCE;
                                } else {
                                    wallet.balance = newBalance;
                                }

                                await wallet.save();
                                logger.info(`[Webhook] Wallet ${wallet.id} aggiornato: ${oldBalance} → ${wallet.balance} crediti`);

                                // Calcola valore BTC per email (EUR convertito in BTC)
                                const btcToEurRate = await exchangeRateService.getBtcEurRate();
                                const amountBTC = amount / btcToEurRate;
                                logger.info(`[Webhook] Currency: ${currency}, Amount: ${amount}, Credits: ${credits}`);
                                logger.info(`[Webhook] Conversione BTC: ${amount} EUR → ${amountBTC} BTC (tasso: ${btcToEurRate})`);
                                logger.info(`[Webhook] BTC Value: ${amountBTC} (senza arrotondamento)`);

                                // Invia email di conferma acquisto con crediti corretti e valore BTC
                                const purchaseNotificationService = require('../services/purchase-notification.service');
                                await purchaseNotificationService.sendBTCPayPurchaseConfirmation(transaction, wallet, credits, amountBTC);
                                logger.info(`[Webhook] Email di conferma acquisto inviata con successo a: ${user.email}`);

                            } catch (conversionError) {
                                logger.error('[Webhook] Errore nella conversione crediti:', conversionError);
                                // Fallback: aggiorna con creditAmount originale
                                const oldBalance = wallet.balance;
                                wallet.balance = parseFloat(wallet.balance) + parseFloat(transaction.creditAmount);
                                await wallet.save();
                                logger.info(`[Webhook] Fallback: Wallet ${wallet.id} aggiornato con creditAmount: ${oldBalance} → ${wallet.balance}`);

                                // Invia email di conferma con fallback
                                const purchaseNotificationService = require('../services/purchase-notification.service');
                                await purchaseNotificationService.sendPurchaseConfirmationForTransaction(transaction, wallet);
                                logger.info(`[Webhook] Email di conferma acquisto (fallback) inviata a: ${user.email}`);
                            }
                        } else {
                            logger.error(`[Webhook] Wallet non trovato per user ${user.id}`);
                        }
                    } catch (error) {
                        logger.error('[Webhook] Errore nell\'aggiornamento wallet:', error);
                        // Non blocchiamo il processo se l'aggiornamento fallisce
                    }
                }
            }

            res.status(200).json({ status: 'processed' });

        } catch (error) {
            logger.error('Error processing webhook:', error);
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    },

    /**
     * Map BTCPay status to internal status
     * @param {string} btcpayStatus - BTCPay invoice status
     * @returns {string} Internal status
     */
    mapBTCPayStatus(btcpayStatus) {
        const statusMap = {
            'New': 'pending',
            'Processing': 'processing',
            'Settled': 'completed',
            'Expired': 'expired',
            'Invalid': 'failed'
        };
        return statusMap[btcpayStatus] || 'pending';
    },

    /**
     * Richiedi un rimborso per una transazione BTC
     * @route POST /api/v1/payments/:id/refund
     */
    async requestRefund(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            // Trova la transazione originale
            const transaction = await Transaction.findOne({
                where: { id, user_id: userId } // Changed from id to id, userId to user_id
            });

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    error: 'Transazione non trovata'
                });
            }

            if (transaction.status !== 'completed') {
                return res.status(400).json({
                    success: false,
                    error: 'Solo le transazioni completate possono essere rimborsate'
                });
            }

            // Trova il wallet dell'utente
            const wallet = await db.models.Wallet.findOne({
                where: { user_id: userId } // Changed from userId to user_id
            });

            if (!wallet) {
                return res.status(404).json({
                    success: false,
                    error: 'Wallet non trovato'
                });
            }

            // Effettua il refund su BTCPay Server
            let refundResult = null;
            if (transaction.invoice_id) { // Changed from invoiceId to invoice_id
                // Scegli il metodo di pagamento usato nella transazione
                let paymentMethod = 'BTC';
                if (transaction.payment_method === 'bitcoin' || transaction.payment_method === 'onchain') {
                    paymentMethod = 'BTC';
                } else if (transaction.payment_method === 'lightning') {
                    paymentMethod = 'BTC-LightningNetwork';
                }
                refundResult = await BTCPayService.refundInvoice(transaction.invoice_id, paymentMethod); // Changed from invoiceId to invoice_id
            }

            // Rimuovi subito il credito dal wallet
            wallet.balance = parseFloat(wallet.balance) - parseFloat(transaction.amount);
            await wallet.save();

            // Crea una nuova transazione di tipo refund in stato 'pending_refund'
            const refundTx = await Transaction.create({
                user_id: userId, // Changed from userId to user_id
                wallet_id: wallet.id,
                amount: -transaction.amount, // importo negativo per il rimborso
                currency: transaction.currency,
                type: 'refund',
                payment_method: transaction.payment_method,
                status: 'pending_refund',
                description: `Rimborso per transazione #${transaction.id}`,
                transaction_id: transaction.transaction_id // puoi aggiungere info extra se serve
            });

            // Aggiorna lo stato della transazione originale a 'pending_refund'
            transaction.status = 'pending_refund';
            await transaction.save();

            return res.json({
                success: true,
                message: 'Rimborso avviato con successo',
                refundTransaction: refundTx,
                btcpayRefund: refundResult // contiene il link per il claim
            });
        } catch (error) {
            logger.error('Errore durante il rimborso:', error);
            res.status(500).json({
                success: false,
                error: 'Errore durante il rimborso',
                details: error.message
            });
        }
    },

    /**
     * Gestisce il webhook di payout/refund da BTCPay Server
     * @route POST /api/v1/payments/refund-webhook
     */
    async handleRefundWebhook(req, res) {
        try {
            const event = req.body;
            // Esempio: event.payoutId, event.status, event.invoiceId
            // Dovrai adattare in base al payload reale di BTCPay
            const { invoiceId, payoutId, status } = event;
            if (!invoiceId || !status) {
                return res.status(400).json({ error: 'Missing invoiceId or status' });
            }
            // Trova la transazione refund associata
            const refundTx = await Transaction.findOne({
                where: { invoice_id: invoiceId, type: 'refund' } // Changed from invoiceId to invoice_id
            });
            if (!refundTx) {
                return res.status(404).json({ error: 'Refund transaction not found' });
            }
            // Aggiorna lo stato in base allo status del payout
            if (status === 'Completed' || status === 'completed' || status === 'Settled') {
                refundTx.status = 'refunded';
                await refundTx.save();
                // Aggiorna anche la transazione originale
                const origTx = await Transaction.findOne({ where: { invoice_id: invoiceId, type: { [db.Sequelize.Op.ne]: 'refund' } } }); // Changed from invoiceId to invoice_id
                if (origTx) {
                    origTx.status = 'refunded';
                    await origTx.save();
                }
            }
            res.status(200).json({ success: true });
        } catch (error) {
            logger.error('Errore webhook refund:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    },

    /**
     * Check payment status using invoice ID (per uso frontend dopo redirect BTCPay)
     * @route GET /api/v1/payments/status/invoice/:invoiceId
     */
    async checkPaymentStatusByInvoiceId(req, res) {
        try {
            const { invoiceId } = req.params;
            // Trova la transazione associata a questa invoice
            const transaction = await Transaction.findOne({ where: { invoice_id: invoiceId } }); // Changed from invoiceId to invoice_id
            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    error: 'Transaction not found for this invoiceId'
                });
            }
            // Ottieni lo stato aggiornato da BTCPay
            let currentStatus = transaction.status;
            if (transaction.invoice_id) { // Changed from invoiceId to invoice_id
                try {
                    const invoice = await BTCPayService.getInvoice(transaction.invoice_id); // Changed from invoiceId to invoice_id
                    currentStatus = this.mapBTCPayStatus(invoice.status);
                    if (currentStatus !== transaction.status) {
                        await transaction.update({ status: currentStatus });
                    }
                } catch (error) {
                    logger.error('Error fetching invoice status:', error);
                }
            }
            res.json({
                success: true,
                data: {
                    transactionId: transaction.id,
                    status: currentStatus,
                    amountUSD: transaction.amountUSD,
                    creditAmount: transaction.creditAmount,
                    createdAt: transaction.createdAt,
                    updatedAt: transaction.updatedAt
                }
            });
        } catch (error) {
            logger.error('Error checking payment status by invoiceId:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to check payment status',
                details: error.message
            });
        }
    },
};

module.exports = PaymentController;
