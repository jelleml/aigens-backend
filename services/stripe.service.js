// services/stripe.service.js
// Stripe payment service: handles payment intents, webhooks, and wallet crediting

const Stripe = require('stripe');
const config = require('../config/config');
const db = require('../database');
const { Wallet, Transaction, User } = db.models;
const sequelize = db.sequelize;
const creditConversion = require('./credit-conversion.service');
const exchangeRateService = require('./exchange-rate.service');
// COMMENTATO: Sistema di logging centralizzato
// const { getLogger } = require('./logging');
// const logger = getLogger('stripe', 'service');

const stripe = Stripe(config.stripe.secretKey);

/**
 * Create a Stripe PaymentIntent per carta, Google Pay, Apple Pay (in EUR)
 * @param {Object} params
 * @param {number} params.amount - Importo in EUR
 * @param {string} params.userId - User ID
 * @returns {Promise<Object>} PaymentIntent
 */
async function createPaymentIntent({ amount, userId, bonusCredits }) {
    const { User, Wallet } = db.models;
    // Stripe si aspetta l'importo in centesimi di euro
    const amountCents = Math.round(amount * 100);
    // Crea (se serve) il customer Stripe
    const user = await User.findByPk(userId);
    let customerId = null;
    if (user) {
        let wallet = await Wallet.findOne({ where: { user_id: userId } });
        if (wallet && wallet.stripe_customer_id) {
            customerId = wallet.stripe_customer_id;
        } else {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { userId: user.id }
            });
            customerId = customer.id;
            if (wallet) {
                await wallet.update({ stripe_customer_id: customerId });
            }
        }
    }
    const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'eur',
        customer: customerId || undefined,
        payment_method_types: ['card'],
        metadata: { userId, bonusCredits },
        description: `Ricarica crediti Aigens per utente ${userId} (EUR)`
    });
    return paymentIntent;
}

/**
 * Handle Stripe webhook events
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhook);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'payment_intent.succeeded': {
            const paymentIntent = event.data.object;
            await creditWalletOnPaymentSuccess(paymentIntent);
            break;
        }
        // Add more event types as needed
        default:
            break;
    }
    res.status(200).send('Received');
}

/**
 * Accredita crediti in base al pagamento Stripe (in EUR)
 * @param {Object} paymentIntent - Stripe PaymentIntent object
 */
async function creditWalletOnPaymentSuccess(paymentIntent) {
    const { Wallet, Transaction, User } = db.models;
    const userId = paymentIntent.metadata.userId;
    const amountEUR = paymentIntent.amount / 100; // EUR
    console.log('[Stripe] creditWalletOnPaymentSuccess', { userId, amountEUR });
    if (!userId || !amountEUR) {
        console.warn('[Stripe] userId o amountEUR non validi');
        return;
    }

    // Trova il wallet e l'utente
    let wallet = await Wallet.findOne({ where: { user_id: userId } });
    if (!wallet) {
        console.warn('[Stripe] Wallet non trovato per userId:', userId);
        return;
    }

    const user = await User.findByPk(userId);
    if (!user) {
        console.warn('[Stripe] Utente non trovato per userId:', userId);
        return;
    }

    // Recupera la transazione per leggere il bonus
    const transaction = await Transaction.findOne({ where: { transaction_id: paymentIntent.id } });
    let bonusCredits = 0;
    if (transaction && transaction.metadata && transaction.metadata.bonusCredits) {
        bonusCredits = Number(transaction.metadata.bonusCredits) || 0;
    } else if (paymentIntent.metadata && paymentIntent.metadata.bonusCredits) {
        bonusCredits = Number(paymentIntent.metadata.bonusCredits) || 0;
    }

    // Calcola i crediti base
    const credits = creditConversion.eurToCredits(amountEUR);
    const totalCredits = credits + bonusCredits;
    console.log('[Stripe] Crediti calcolati (EUR):', credits, 'Bonus:', bonusCredits, 'Totale:', totalCredits);
    if (!totalCredits || isNaN(totalCredits) || totalCredits <= 0) {
        console.warn('[Stripe] Crediti non validi:', totalCredits);
        return;
    }

    let finalTransaction = null;

    // Accredita wallet e aggiorna la transazione
    try {
        await sequelize.transaction(async (t) => {
            wallet.balance = parseFloat(wallet.balance) + totalCredits;
            wallet.last_deposit_at = new Date();
            await wallet.save({ transaction: t });

            if (transaction) {
                transaction.status = 'completed';
                transaction.amount = totalCredits;
                transaction.currency = 'CREDIT';
                transaction.description = `Stripe payment (${amountEUR} EUR, ${credits} crediti${bonusCredits > 0 ? ' + ' + bonusCredits + ' bonus' : ''})`;
                await transaction.save({ transaction: t });
                finalTransaction = transaction;
            } else {
                finalTransaction = await Transaction.create({
                    user_id: userId,
                    wallet_id: wallet.id,
                    amount: totalCredits,
                    currency: 'CREDIT',
                    type: 'deposit',
                    payment_method: 'stripe',
                    status: 'completed',
                    description: `Stripe payment (${amountEUR} EUR, ${credits} crediti${bonusCredits > 0 ? ' + ' + bonusCredits + ' bonus' : ''})`,
                    transaction_id: paymentIntent.id,
                    metadata: { bonusCredits }
                }, { transaction: t });
            }
        });

        console.log('[Stripe] Wallet aggiornato e transazione registrata per userId:', userId);

        // Invia email di conferma acquisto
        try {
            const purchaseNotificationService = require('./purchase-notification.service');
            await purchaseNotificationService.sendStripePurchaseConfirmation(
                paymentIntent,
                finalTransaction,
                wallet,
                credits,
                bonusCredits,
                totalCredits,
                amountEUR
            );
        } catch (emailError) {
            console.error('[Stripe] Errore nell\'invio email di conferma acquisto:', emailError);
            // Non blocchiamo il processo se l'email fallisce
        }

    } catch (err) {
        console.error('[Stripe] Errore durante aggiornamento wallet/transazione:', err);
    }
}

/**
 * Salva un nuovo payment method Stripe per uno user (disattiva i precedenti)
 * @param {number} userId
 * @param {string} paymentMethodId
 * @returns {Promise<object>} L'oggetto payment method salvato
 */
async function saveUserPaymentMethod(userId, paymentMethodId) {
    const { UserPaymentMethod, User, Wallet } = db.models;
    // Verifica che il payment method esista su Stripe
    let paymentMethod;
    try {
        paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    } catch (err) {
        throw new Error('Payment method non valido su Stripe');
    }
    let customerId = paymentMethod.customer;
    // Se il payment method non è associato a un customer, lo associo ora
    if (!customerId) {
        // Recupera o crea il customer Stripe per l'utente
        const user = await User.findByPk(userId);
        if (!user) throw new Error('Utente non trovato');
        let wallet = await Wallet.findOne({ where: { user_id: userId } });
        if (wallet && wallet.stripe_customer_id) {
            customerId = wallet.stripe_customer_id;
        } else {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { userId: user.id }
            });
            customerId = customer.id;
            if (wallet) {
                await wallet.update({ stripe_customer_id: customerId });
            }
        }
        // Associa il payment method al customer
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
        // (Opzionale) Imposta come default payment method
        await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId }
        });
    }
    // Disattiva tutti i payment method attivi precedenti per lo user
    await UserPaymentMethod.update({ is_active: false }, { where: { user_id: userId, is_active: true } });
    // Salva il nuovo payment method come attivo
    const record = await UserPaymentMethod.create({
        user_id: userId,
        stripe_payment_method_id: paymentMethodId,
        is_active: true
    });
    return record;
}

/**
 * Recupera il payment method attivo per uno user
 * @param {number} userId
 * @returns {Promise<object|null>} L'oggetto payment method attivo o null
 */
async function getActiveUserPaymentMethod(userId) {
    const { UserPaymentMethod } = db.models;
    const record = await UserPaymentMethod.findOne({
        where: { user_id: userId, is_active: true }
    });
    return record;
}

/**
 * Recupera i dettagli di un payment method Stripe (last4, brand, expiry, nome, ecc)
 * @param {string} paymentMethodId
 * @returns {Promise<object|null>}
 */
async function getStripePaymentMethodDetails(paymentMethodId) {
    try {
        const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
        if (!pm || pm.type !== 'card') return null;
        return {
            id: pm.id,
            brand: pm.card.brand,
            last4: pm.card.last4,
            exp_month: pm.card.exp_month,
            exp_year: pm.card.exp_year,
            cardholder_name: pm.billing_details?.name || '',
            type: pm.card.brand,
            country: pm.card.country,
        };
    } catch (err) {
        return null;
    }
}

/**
 * Elimina il payment method attivo dell'utente sia dal database che da Stripe
 * @param {string} userId
 * @param {string} paymentMethodId
 */
async function deleteUserPaymentMethod(userId, paymentMethodId) {
    const { UserPaymentMethod } = db.models;
    // Elimina dal database
    await UserPaymentMethod.destroy({ where: { user_id: userId, stripe_payment_method_id: paymentMethodId } });
    // Elimina da Stripe
    try {
        await stripe.paymentMethods.detach(paymentMethodId);
    } catch (err) {
        // Se già eliminato o non trovato, ignora
    }
}

module.exports = {
    createPaymentIntent,
    handleWebhook,
    saveUserPaymentMethod,
    getActiveUserPaymentMethod,
    getStripePaymentMethodDetails,
    deleteUserPaymentMethod
}; 