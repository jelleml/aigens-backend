/**
 * Middleware per la validazione dei webhook di BTCPay
 * @module middlewares/btcpayWebhook
 */

const crypto = require('crypto');
const config = require('../config/config');
const { getLogger } = require('../services/logging');
const logger = getLogger('btcpayWebhook', 'middleware');

/**
 * Valida la firma del webhook di BTCPay
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
const validateWebhook = (req, res, next) => {
    try {
        // Ottieni la firma dall'header
        const signature = req.headers['btcpay-sig'];
        if (!signature) {
            return res.status(401).json({ error: 'Missing BTCPay signature' });
        }

        // Verifica che il formato della firma sia corretto
        if (!signature.startsWith('sha256=')) {
            return res.status(401).json({ error: 'Invalid signature format' });
        }

        // Estrai l'hash dalla firma
        const receivedHash = signature.substring(7);

        // Calcola l'hash del payload
        const payload = JSON.stringify(req.body);
        const expectedHash = crypto
            .createHmac('sha256', config.btcpay.webhookSecret)
            .update(payload)
            .digest('hex');

        // Confronta gli hash
        if (receivedHash !== expectedHash) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Se la firma è valida, procedi
        next();
    } catch (error) {
        logger.error('Error validating BTCPay webhook:', error);
        res.status(500).json({ error: 'Error validating webhook' });
    }
};

module.exports = {
    validateWebhook
}; 