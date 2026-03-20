/**
 * Purchase Notification Service
 * 
 * Gestisce l'invio di email di conferma acquisto per tutti i metodi di pagamento
 */

const { User, Wallet } = require('../database').models;
const mailerService = require('./mailer.service');
const { getLogger } = require('./logging');

const logger = getLogger('purchase-notification', 'service');

class PurchaseNotificationService {
    /**
     * Invia email di conferma acquisto per Stripe
     * @param {Object} paymentIntent - Stripe PaymentIntent object
     * @param {Object} transaction - Transaction object
     * @param {Object} wallet - Wallet object
     * @param {number} baseCredits - Crediti base acquistati
     * @param {number} bonusCredits - Crediti bonus (opzionale)
     * @param {number} totalCredits - Totale crediti accreditati
     * @param {number} amountPaid - Importo pagato in EUR
     */
    async sendStripePurchaseConfirmation(paymentIntent, transaction, wallet, baseCredits, bonusCredits, totalCredits, amountPaid) {
        try {
            const user = await User.findByPk(paymentIntent.metadata.userId);
            if (!user) {
                logger.warn('[Stripe] Utente non trovato per userId:', paymentIntent.metadata.userId);
                return;
            }

            await mailerService.sendPurchaseConfirmationEmail({
                email: user.email,
                firstName: user.first_name || user.name || 'Utente',
                userId: user.id,
                transaction: transaction,
                wallet: wallet,
                baseCredits: baseCredits,
                bonusCredits: bonusCredits,
                totalCredits: totalCredits,
                paymentMethod: 'stripe',
                amountPaid: amountPaid,
                currency: 'EUR'
            });

            logger.info('[Stripe] Email di conferma acquisto inviata con successo a:', user.email);
        } catch (error) {
            logger.error('[Stripe] Errore nell\'invio email di conferma acquisto:', error);
            // Non blocchiamo il processo se l'email fallisce
        }
    }

    /**
     * Invia email di conferma acquisto per BTCPay
     * @param {Object} transaction - Transaction object
     * @param {Object} wallet - Wallet object
     * @param {number} totalCredits - Totale crediti accreditati
     * @param {number} amountPaid - Importo pagato in BTC
     */
    async sendBTCPayPurchaseConfirmation(transaction, wallet, totalCredits, amountPaid) {
        try {
            const user = await User.findByPk(transaction.user_id);
            if (!user) {
                logger.warn('[BTCPay] Utente non trovato per userId:', transaction.user_id);
                return;
            }

            // Calcola bonus crediti se presenti
            let bonusCredits = 0;
            if (transaction.metadata && transaction.metadata.bonusCredits) {
                bonusCredits = Number(transaction.metadata.bonusCredits) || 0;
            }

            // Calcola crediti base (totali - bonus)
            const baseCredits = totalCredits - bonusCredits;

            await mailerService.sendPurchaseConfirmationEmail({
                email: user.email,
                firstName: user.first_name || user.name || 'Utente',
                userId: user.id,
                transaction: transaction,
                wallet: wallet,
                baseCredits: baseCredits,
                bonusCredits: bonusCredits,
                totalCredits: totalCredits,
                paymentMethod: 'bitcoin',
                amountPaid: amountPaid,
                currency: 'BTC'
            });

            logger.info('[BTCPay] Email di conferma acquisto inviata con successo a:', user.email);
        } catch (error) {
            logger.error('[BTCPay] Errore nell\'invio email di conferma acquisto:', error);
            // Non blocchiamo il processo se l'email fallisce
        }
    }

    /**
     * Invia email di conferma acquisto generica
     * @param {Object} purchaseData - Dati dell'acquisto
     */
    async sendGenericPurchaseConfirmation(purchaseData) {
        try {
            const {
                userId,
                transaction,
                wallet,
                baseCredits,
                bonusCredits = 0,
                totalCredits,
                paymentMethod,
                amountPaid,
                currency
            } = purchaseData;

            const user = await User.findByPk(userId);
            if (!user) {
                logger.warn('[Generic] Utente non trovato per userId:', userId);
                return;
            }

            await mailerService.sendPurchaseConfirmationEmail({
                email: user.email,
                firstName: user.first_name || user.name || 'Utente',
                userId: user.id,
                transaction: transaction,
                wallet: wallet,
                baseCredits: baseCredits,
                bonusCredits: bonusCredits,
                totalCredits: totalCredits,
                paymentMethod: paymentMethod,
                amountPaid: amountPaid,
                currency: currency
            });

            logger.info('[Generic] Email di conferma acquisto inviata con successo a:', user.email);
        } catch (error) {
            logger.error('[Generic] Errore nell\'invio email di conferma acquisto:', error);
            // Non blocchiamo il processo se l'email fallisce
        }
    }

    /**
     * Invia email di conferma acquisto per transazione esistente
     * @param {Object} transaction - Transaction object
     * @param {Object} wallet - Wallet object
     */
    async sendPurchaseConfirmationForTransaction(transaction, wallet) {
        try {
            const user = await User.findByPk(transaction.user_id);
            if (!user) {
                logger.warn('[Transaction] Utente non trovato per userId:', transaction.user_id);
                return;
            }

            // Calcola bonus crediti se presenti
            let bonusCredits = 0;
            if (transaction.metadata && transaction.metadata.bonusCredits) {
                bonusCredits = Number(transaction.metadata.bonusCredits) || 0;
            }

            // Calcola crediti base (totali - bonus)
            const totalCredits = parseFloat(transaction.amount);
            const baseCredits = totalCredits - bonusCredits;

            await mailerService.sendPurchaseConfirmationEmail({
                email: user.email,
                firstName: user.first_name || user.name || 'Utente',
                userId: user.id,
                transaction: transaction,
                wallet: wallet,
                baseCredits: baseCredits,
                bonusCredits: bonusCredits,
                totalCredits: totalCredits,
                paymentMethod: transaction.payment_method,
                amountPaid: parseFloat(transaction.amount),
                currency: transaction.currency || 'EUR'
            });

            logger.info('[Transaction] Email di conferma acquisto inviata con successo a:', user.email);
        } catch (error) {
            logger.error('[Transaction] Errore nell\'invio email di conferma acquisto:', error);
            // Non blocchiamo il processo se l'email fallisce
        }
    }
}

module.exports = new PurchaseNotificationService(); 