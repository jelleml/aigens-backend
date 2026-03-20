// services/btcpayService.js
const { OpenAPI, InvoicesService, StoreInvoicesService } = require('btcpay-greenfield-node-client');
const QRCode = require('qrcode');
const config = require('../config/config');
const db = require('../database');
const Transaction = db.models.Transaction;

// Configure OpenAPI client
OpenAPI.BASE = process.env.BTCPAY_SERVER_URL || 'https://payments.aigens.io';
OpenAPI.TOKEN = process.env.BTCPAY_API_KEY;

const BTCPayService = {
    /**
     * Create a new invoice with Lightning Network support
     * @param {string} userId - User ID
     * @param {number} amountEUR - Amount in EUR
     * @param {number} creditAmount - Credit amount for user
     * @param {string} transactionId - Internal transaction ID
     * @param {Object} options - Additional options
     * @returns {Object} Invoice data with QR codes
     */
    async createInvoice(userId, amountEUR, creditAmount, transactionId, options = {}) {

        try {
            const invoiceData = {
                amount: amountEUR,
                currency: options.currency || 'EUR',
                orderId: `user_${userId}_${Date.now()}`,
                metadata: {
                    userId: userId,
                    creditAmount: creditAmount,
                    type: 'credit_purchase',
                    transactionId: transactionId,
                    createdAt: new Date().toISOString()
                },
                checkout: {
                    // Enable Lightning as preferred payment method
                    speedPolicy: 'HighSpeed', // Faster confirmation for Lightning
                    paymentMethods: ['BTC', 'BTC-LightningNetwork'], // Include both on-chain and Lightning
                    defaultPaymentMethod: 'BTC-LightningNetwork', // Prefer Lightning
                    expirationMinutes: options.expirationMinutes || 60,
                    monitoringMinutes: options.monitoringMinutes || 60,
                    paymentTolerance: 0, // No tolerance for exact amounts
                    redirectAutomatically: false
                },
                additionalBuyerInfo: {
                    name: options.buyerName,
                    email: options.buyerEmail
                }
            };

            // Add redirect and notification URLs if provided
            if (options.redirectUrl || config.frontendUrl) {
                invoiceData.redirectUrl = options.redirectUrl || `${config.frontendUrl}/payment/success`;
            }

            if (options.notificationUrl || config.appUrl) {
                invoiceData.notificationUrl = options.notificationUrl || `${config.appUrl}/api/v1/payments/webhook`;
            }

            const invoice = await InvoicesService.invoicesCreateInvoice({
                storeId: process.env.BTCPAY_STORE_ID,
                requestBody: invoiceData
            });

            // PATCH: aggiorno la Transaction con l'invoice_id appena ricevuto
            if (transactionId) {
                await Transaction.update(
                    { invoice_id: invoice.id },
                    { where: { id: transactionId } }
                );
            }

            // Generate QR codes for different payment methods
            const paymentData = await this.generatePaymentQRCodes(invoice);

            return {
                invoiceId: invoice.id,
                checkoutLink: invoice.checkoutLink,
                amount: invoice.amount,
                currency: invoice.currency,
                status: invoice.status,
                expirationTime: invoice.expirationTime,
                createdTime: invoice.createdTime,
                orderId: invoice.metadata?.orderId,
                ...paymentData
            };

        } catch (error) {
            console.error('BTCPay invoice creation failed:', error);
            throw new Error(`BTCPay invoice creation failed: ${error.message}`);
        }
    },

    /**
     * Generate QR codes for available payment methods
     * @param {Object} invoice - BTCPay invoice object
     * @returns {Object} Payment data with QR codes
     */
    async generatePaymentQRCodes(invoice) {
        const paymentMethods = {};

        try {
            // Get detailed invoice to access payment methods
            const detailedInvoice = await this.getInvoice(invoice.id);

            if (detailedInvoice.availableStatusesForManualMarking && detailedInvoice.checkout) {
                // Lightning Network payment method
                const lightningMethod = detailedInvoice.checkout.paymentMethods?.find(
                    pm => pm.includes('LightningNetwork') || pm.includes('Lightning')
                );

                if (lightningMethod && detailedInvoice.cryptoInfo) {
                    const lightningInfo = detailedInvoice.cryptoInfo.find(
                        ci => ci.cryptoCode === 'BTC' && ci.paymentType === 'LightningNetwork'
                    );

                    if (lightningInfo && lightningInfo.destination) {
                        paymentMethods.lightning = {
                            paymentMethod: 'Lightning Network',
                            address: lightningInfo.destination,
                            amount: lightningInfo.due,
                            qrCode: await QRCode.toDataURL(lightningInfo.destination, {
                                errorCorrectionLevel: 'M',
                                type: 'image/png',
                                quality: 0.92,
                                margin: 1,
                                color: {
                                    dark: '#000000',
                                    light: '#FFFFFF'
                                }
                            })
                        };
                    }
                }

                // On-chain Bitcoin payment method
                const btcMethod = detailedInvoice.checkout.paymentMethods?.find(
                    pm => pm === 'BTC' || pm === 'BTC-OnChain'
                );

                if (btcMethod && detailedInvoice.cryptoInfo) {
                    const btcInfo = detailedInvoice.cryptoInfo.find(
                        ci => ci.cryptoCode === 'BTC' && (!ci.paymentType || ci.paymentType === 'BTCLike')
                    );

                    if (btcInfo && btcInfo.destination) {
                        const btcUri = `bitcoin:${btcInfo.destination}?amount=${btcInfo.due}`;
                        paymentMethods.onchain = {
                            paymentMethod: 'Bitcoin On-Chain',
                            address: btcInfo.destination,
                            amount: btcInfo.due,
                            uri: btcUri,
                            qrCode: await QRCode.toDataURL(btcUri, {
                                errorCorrectionLevel: 'M',
                                type: 'image/png',
                                quality: 0.92,
                                margin: 1,
                                color: {
                                    dark: '#000000',
                                    light: '#FFFFFF'
                                }
                            })
                        };
                    }
                }
            }

            // If we couldn't get payment methods from the detailed invoice, use the checkout link
            if (Object.keys(paymentMethods).length === 0) {
                paymentMethods.checkout = {
                    paymentMethod: 'BTCPay Checkout',
                    checkoutUrl: invoice.checkoutLink,
                    qrCode: await QRCode.toDataURL(invoice.checkoutLink, {
                        errorCorrectionLevel: 'M',
                        type: 'image/png',
                        quality: 0.92,
                        margin: 1,
                        color: {
                            dark: '#000000',
                            light: '#FFFFFF'
                        }
                    })
                };
            }

            return { paymentMethods };

        } catch (error) {
            console.error('Error generating QR codes:', error);
            // Fallback to checkout link QR code
            return {
                paymentMethods: {
                    checkout: {
                        paymentMethod: 'BTCPay Checkout',
                        checkoutUrl: invoice.checkoutLink,
                        qrCode: await QRCode.toDataURL(invoice.checkoutLink)
                    }
                }
            };
        }
    },

    /**
     * Get invoice details
     * @param {string} invoiceId - BTCPay invoice ID
     * @returns {Object} Invoice details
     */
    async getInvoice(invoiceId) {
        try {
            return await InvoicesService.invoicesGetInvoice({
                storeId: process.env.BTCPAY_STORE_ID,
                invoiceId
            });
        } catch (error) {
            console.error('BTCPay getInvoice failed:', error);
            throw new Error(`BTCPay getInvoice failed: ${error.message}`);
        }
    },

    /**
     * Get invoice with payment methods (more detailed)
     * @param {string} invoiceId - BTCPay invoice ID
     * @returns {Object} Detailed invoice with payment methods
     */
    async getInvoiceWithPaymentMethods(invoiceId) {
        try {
            const invoice = await this.getInvoice(invoiceId);
            const paymentData = await this.generatePaymentQRCodes(invoice);

            return {
                ...invoice,
                ...paymentData
            };
        } catch (error) {
            console.error('Error getting invoice with payment methods:', error);
            throw error;
        }
    },

    /**
     * Check if Lightning Network is available for the store
     * @returns {boolean} True if Lightning is available
     */
    async isLightningAvailable() {
        try {
            // This would require checking store payment methods
            // For now, we assume it's available if Lightning is configured
            return true;
        } catch (error) {
            console.error('Error checking Lightning availability:', error);
            return false;
        }
    },

    /**
     * Get Lightning Network invoice (BOLT11)
     * @param {string} invoiceId - BTCPay invoice ID
     * @returns {string|null} Lightning invoice string
     */
    async getLightningInvoice(invoiceId) {
        try {
            const invoice = await this.getInvoice(invoiceId);

            if (invoice.cryptoInfo) {
                const lightningInfo = invoice.cryptoInfo.find(
                    ci => ci.cryptoCode === 'BTC' && ci.paymentType === 'LightningNetwork'
                );

                return lightningInfo?.destination || null;
            }

            return null;
        } catch (error) {
            console.error('Error getting Lightning invoice:', error);
            return null;
        }
    },

    /**
     * Create a Lightning-only invoice
     * @param {string} userId - User ID
     * @param {number} amountEUR - Amount in EUR
     * @param {number} creditAmount - Credit amount
     * @param {string} transactionId - Transaction ID
     * @param {Object} options - Additional options
     * @returns {Object} Lightning invoice data
     */
    async createLightningInvoice(userId, amountEUR, creditAmount, transactionId, options = {}) {
        const invoiceOptions = {
            ...options,
            expirationMinutes: options.expirationMinutes || 15, // Shorter expiration for Lightning
            monitoringMinutes: options.monitoringMinutes || 15
        };

        try {
            const testAmount = testMode ? 0.01 : amountEUR;

            const invoice = await InvoicesService.invoicesCreateInvoice({
                storeId: process.env.BTCPAY_STORE_ID,
                requestBody: {
                    amount: testAmount,
                    currency: 'EUR',
                    orderId: `${testMode ? 'TEST_' : ''}ln_${userId}_${Date.now()}`,
                    metadata: {
                        userId: userId,
                        creditAmount: creditAmount,
                        type: 'lightning_credit_purchase',
                        transactionId: transactionId
                    },
                    checkout: {
                        speedPolicy: 'HighSpeed',
                        paymentMethods: ['BTC-LightningNetwork'], // Lightning only
                        defaultPaymentMethod: 'BTC-LightningNetwork',
                        expirationMinutes: invoiceOptions.expirationMinutes,
                        monitoringMinutes: invoiceOptions.monitoringMinutes,
                        paymentTolerance: 0
                    },
                    redirectUrl: invoiceOptions.redirectUrl || `${config.frontendUrl}/payment/success`,
                    notificationUrl: invoiceOptions.notificationUrl || `${config.appUrl}/api/v1/btcpay/webhook`
                }
            });

            // Get Lightning-specific payment data
            const lightningInvoice = await this.getLightningInvoice(invoice.id);

            let qrCode = null;
            if (lightningInvoice) {
                qrCode = await QRCode.toDataURL(lightningInvoice, {
                    errorCorrectionLevel: 'M',
                    type: 'image/png',
                    quality: 0.92,
                    margin: 1
                });
            }

            return {
                invoiceId: invoice.id,
                checkoutLink: invoice.checkoutLink,
                amount: invoice.amount,
                currency: invoice.currency,
                status: invoice.status,
                expirationTime: invoice.expirationTime,
                lightningInvoice: lightningInvoice,
                qrCode: qrCode,
                paymentMethod: 'Lightning Network'
            };

        } catch (error) {
            console.error('Lightning invoice creation failed:', error);
            throw new Error(`Lightning invoice creation failed: ${error.message}`);
        }
    },

    /**
     * Richiedi un rimborso per una invoice su BTCPay Server
     * @param {string} invoiceId - ID della invoice BTCPay
     * @param {string} paymentMethod - 'BTC' o 'BTC-LightningNetwork'
     * @param {string} [refundVariant='CurrentRate'] - Variante di rimborso (CurrentRate, etc)
     * @returns {Object} Dati del rimborso (incluso il link per il claim)
     */
    async refundInvoice(invoiceId, paymentMethod = 'BTC', refundVariant = 'CurrentRate') {
        try {
            const response = await fetch(`${OpenAPI.BASE}/api/v1/stores/${process.env.BTCPAY_STORE_ID}/invoices/${invoiceId}/refund`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'token ' + OpenAPI.TOKEN
                },
                body: JSON.stringify({
                    refundVariant,
                    paymentMethod
                })
            });
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Errore refund BTCPay: ${err}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Errore refund invoice BTCPay:', error);
            throw error;
        }
    }
};

module.exports = BTCPayService;