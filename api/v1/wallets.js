/**
 * Router per la gestione dei wallet
 * @module api/v1/wallets
 */

const express = require('express');
const router = express.Router();
const db = require('../../database');
const { Wallet, Transaction } = db.models;
const authMiddleware = require('../../middlewares/auth.middleware');
const { sequelize } = require('../../database');
const { Op } = require('sequelize');
const stripeService = require('../../services/stripe.service');
const BTCPayService = require('../../services/btc-payments.service');

/**
 * @swagger
 * tags:
 *   name: Wallets
 *   description: API per la gestione dei wallet e delle transazioni
 */

/**
 * @swagger
 * /api/v1/wallets/me:
 *   get:
 *     summary: Ottiene il wallet dell'utente autenticato
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet recuperato con successo (saldo in crediti, 1 EUR = 80 crediti)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     user_id:
 *                       type: integer
 *                     balance:
 *                       type: number
 *                       format: float
 *                       description: Saldo in crediti
 *                     currency:
 *                       type: string
 *                       example: CREDIT
 *                     is_active:
 *                       type: boolean
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Wallet non trovato
 *       500:
 *         description: Errore del server
 */
router.get('/me', authMiddleware.authenticate, async (req, res) => {
  try {
    let wallet = await Wallet.findOne({
      where: {
        user_id: req.user.id
      },
      include: [
        {
          model: Transaction,
          as: 'Transactions',
          limit: 5,
          order: [['created_at', 'DESC']]
        }
      ]
    });

    // Se il wallet non esiste, lo creiamo automaticamente
    if (!wallet) {
      wallet = await Wallet.create({
        user_id: req.user.id,
        balance: 0.00,
        currency: 'EUR'
      });

      // Ricarichiamo il wallet con le transazioni
      wallet = await Wallet.findOne({
        where: {
          user_id: req.user.id
        },
        include: [
          {
            model: Transaction,
            as: 'Transactions',
            limit: 5,
            order: [['created_at', 'DESC']]
          }
        ]
      });
    }

    res.status(200).json({
      success: true,
      data: wallet
    });
  } catch (error) {
    console.error('Errore nel recupero del wallet:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero del wallet'
    });
  }
});

/**
 * @swagger
 * /api/v1/wallets/deposit:
 *   post:
 *     summary: Deposita fondi nel wallet dell'utente (accredito in crediti, conversione automatica da USD/BTC/EUR)
 *     tags: [Wallets]
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
 *                 format: float
 *                 description: Importo da depositare (in valuta del metodo di pagamento)
 *               payment_method:
 *                 type: string
 *                 description: Metodo di pagamento (stripe, bitcoin, ecc.)
 *                 example: stripe
 *               payment_details:
 *                 type: object
 *                 description: Dettagli del pagamento
 *     responses:
 *       200:
 *         description: Se payment_method è 'stripe', viene restituito il clientSecret per completare il pagamento. Il saldo verrà aggiornato solo dopo la conferma del pagamento tramite webhook Stripe. L'accredito avviene in crediti secondo il tasso di cambio BCE/CoinGecko.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     clientSecret:
 *                       type: string
 *                       description: Client secret per Stripe PaymentIntent
 *                     paymentIntentId:
 *                       type: string
 *                       description: ID del PaymentIntent Stripe
 *                     wallet:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         balance:
 *                           type: number
 *                           format: float
 *                           description: Saldo in crediti (simulato, include il deposito richiesto)
 *                         currency:
 *                           type: string
 *                           example: EUR
 *                     bonusCredits:
 *                       type: number
 *                       description: Crediti bonus assegnati in base all'importo
 *                     message:
 *                       type: string
 *                       description: Messaggio informativo sul saldo e la conferma del pagamento
 *                     details:
 *                       type: object
 *                       description: Dettagli del calcolo crediti
 *                       properties:
 *                         creditsBase:
 *                           type: number
 *                           description: Crediti base generati dall'importo
 *                         bonusCredits:
 *                           type: number
 *                           description: Crediti bonus aggiuntivi
 *                         creditsTotal:
 *                           type: number
 *                           description: Totale crediti accreditati (base + bonus)
 *       400:
 *         description: Dati non validi
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore del server
 */
router.post('/deposit', authMiddleware.authenticate, async (req, res) => {
  try {
    const { amount, payment_method = 'stripe' } = req.body;

    // Validazione importo
    const allowedAmounts = [5, 10, 25];
    if (!allowedAmounts.includes(Number(amount))) {
      return res.status(400).json({
        success: false,
        error: 'L\'importo deve essere uno tra 5, 10 o 25 euro'
      });
    }

    // Calcolo bonus crediti
    let bonusCredits = 0;
    if (Number(amount) === 10) bonusCredits = 500;
    if (Number(amount) === 25) bonusCredits = 5000;

    // Trova il wallet dell'utente
    const wallet = await Wallet.findOne({
      where: {
        user_id: req.user.id
      }
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet non trovato'
      });
    }

    if (payment_method === 'stripe') {
      // Crea un PaymentIntent Stripe
      try {
        const paymentIntent = await stripeService.createPaymentIntent({
          amount,
          userId: req.user.id,
          bonusCredits // Passa il bonus come metadata
        });
        // Crea una transazione 'pending' collegata al PaymentIntent
        const newTransaction = await Transaction.create({
          user_id: req.user.id,
          wallet_id: wallet.id,
          amount: amount, // in EUR
          currency: 'EUR',
          type: 'deposit',
          payment_method: 'stripe',
          status: 'pending',
          description: `Deposito tramite Stripe${bonusCredits > 0 ? ' (+ ' + bonusCredits + ' crediti bonus)' : ''}`,
          transaction_id: paymentIntent.id,
          metadata: { bonusCredits }
        });
        return res.status(200).json({
          success: true,
          data: {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            wallet: {
              id: wallet.id,
              balance: (parseFloat(wallet.balance) + ((Number(amount) * 1000) + bonusCredits)),
              currency: wallet.currency
            },
            transaction: newTransaction,
            bonusCredits,
            message: 'Il saldo verrà aggiornato dopo la conferma del pagamento. Ricarica la pagina o aggiorna il wallet dopo la conferma.',
            details: {
              creditsBase: Number(amount) * 1000,
              bonusCredits: bonusCredits,
              creditsTotal: (Number(amount) * 1000) + bonusCredits
            }
          }
        });
      } catch (stripeError) {
        console.error('Errore Stripe:', stripeError);
        return res.status(500).json({
          success: false,
          error: 'Errore nella creazione del pagamento Stripe'
        });
      }
    }

    // GESTIONE BITCOIN/BTC PAY
    if (payment_method === 'bitcoin' || payment_method === 'btcpay') {
      try {
        // Applica sconto 5% sull'importo da pagare
        const discountedAmount = Math.round((amount * 0.95) * 100) / 100;
        // Genera un transaction_id custom (puoi usare uuid o altro)
        const transaction_id = `btc_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        // Crea la invoice su BTCPay (lato invoice e pagamento, amount scontato; lato crediti, amount pieno)
        const btcInvoice = await BTCPayService.createInvoice(
          req.user.id,
          discountedAmount, // amount da pagare (scontato)
          amount, // creditAmount: amount pieno per calcolo crediti lato webhook
          transaction_id
        );
        // Salva la transazione con invoice_id
        const newTransaction = await Transaction.create({
          user_id: req.user.id,
          wallet_id: wallet.id,
          amount: parseFloat(amount), // amount pieno per crediti
          currency: wallet.currency,
          type: 'deposit',
          payment_method: 'bitcoin',
          status: 'pending',
          description: `Deposito tramite Bitcoin/BTCPay (paghi solo ${discountedAmount}€, ricevi crediti per ${amount}€${bonusCredits > 0 ? ' + ' + bonusCredits + ' bonus' : ''})`,
          transaction_id,
          invoice_id: btcInvoice.invoiceId,
          metadata: { bonusCredits, discountedAmount }
        });
        return res.status(200).json({
          success: true,
          data: {
            invoiceId: btcInvoice.invoiceId,
            checkoutLink: btcInvoice.checkoutLink,
            amount: btcInvoice.amount,
            currency: btcInvoice.currency,
            status: btcInvoice.status,
            expirationTime: btcInvoice.expirationTime,
            createdTime: btcInvoice.createdTime,
            orderId: btcInvoice.orderId,
            paymentMethods: btcInvoice.paymentMethods,
            transaction: newTransaction,
            bonusCredits,
            discountedAmount
          }
        });
      } catch (btcError) {
        console.error('Errore BTCPay:', btcError);
        return res.status(500).json({
          success: false,
          error: 'Errore nella creazione della invoice BTCPay',
          details: btcError.message
        });
      }
    }

    return res.status(400).json({
      success: false,
      error: 'Metodo di pagamento non supportato'
    });
  } catch (error) {
    console.error('Errore durante il deposito:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il deposito'
    });
  }
});

/**
 * @swagger
 * /api/v1/wallets/withdrawal:
 *   post:
 *     summary: Preleva fondi dal wallet dell'utente
 *     tags: [Wallets]
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
 *                 format: float
 *                 description: Importo da prelevare
 *               withdrawal_method:
 *                 type: string
 *                 description: Metodo di prelievo
 *                 example: bank_transfer
 *               withdrawal_details:
 *                 type: object
 *                 description: Dettagli del prelievo
 *     responses:
 *       200:
 *         description: Prelievo effettuato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     wallet:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         balance:
 *                           type: number
 *                           format: float
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         amount:
 *                           type: number
 *                           format: float
 *                         type:
 *                           type: string
 *                           example: withdrawal
 *       400:
 *         description: Dati non validi o fondi insufficienti
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Wallet non trovato
 *       500:
 *         description: Errore del server
 */
router.post('/withdrawal', authMiddleware.authenticate, async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { amount, withdrawal_method, withdrawal_details } = req.body;

    if (!amount || amount <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'L\'importo deve essere maggiore di zero'
      });
    }

    // Trova il wallet dell'utente
    const wallet = await Wallet.findOne({
      where: {
        user_id: req.user.id
      },
      transaction
    });

    if (!wallet) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'Wallet non trovato'
      });
    }

    // Verifica che ci siano fondi sufficienti
    if (parseFloat(wallet.balance) < parseFloat(amount)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Fondi insufficienti'
      });
    }

    // Aggiorna il saldo
    const newBalance = parseFloat(wallet.balance) - parseFloat(amount);
    wallet.balance = newBalance;
    wallet.last_withdrawal_at = new Date();
    await wallet.save({ transaction });

    // Registra la transazione
    const newTransaction = await Transaction.create({
      user_id: req.user.id,
      wallet_id: wallet.id,
      amount: -parseFloat(amount),
      currency: wallet.currency,
      type: 'withdrawal',
      payment_method: withdrawal_method || 'bank_transfer',
      status: 'completed',
      description: 'Prelievo fondi',
      payment_details: withdrawal_details || {},
    }, { transaction });

    await transaction.commit();

    res.status(200).json({
      success: true,
      data: {
        wallet: {
          id: wallet.id,
          balance: wallet.balance,
          currency: wallet.currency,
          last_withdrawal_at: wallet.last_withdrawal_at
        },
        transaction: newTransaction
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Errore durante il prelievo:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante il prelievo'
    });
  }
});

/**
 * @swagger
 * /api/v1/wallets/transactions:
 *   get:
 *     summary: Ottiene la lista delle transazioni del wallet dell'utente
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numero di pagina
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Numero di elementi per pagina
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [deposit, withdrawal, payment]
 *         description: Filtra per tipo di transazione
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed]
 *         description: Filtra per stato della transazione
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Data di inizio per filtrare le transazioni
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Data di fine per filtrare le transazioni
 *     responses:
 *       200:
 *         description: Lista delle transazioni recuperata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           wallet_id:
 *                             type: integer
 *                           amount:
 *                             type: number
 *                             format: float
 *                           type:
 *                             type: string
 *                             enum: [deposit, withdrawal, payment]
 *                           status:
 *                             type: string
 *                             enum: [pending, completed, failed]
 *                           payment_method:
 *                             type: string
 *                           description:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Wallet non trovato
 *       500:
 *         description: Errore del server
 */
router.get('/transactions', authMiddleware.authenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      status,
      start_date,
      end_date
    } = req.query;

    const offset = (page - 1) * limit;

    // Trova il wallet dell'utente
    const wallet = await Wallet.findOne({
      where: {
        user_id: req.user.id
      }
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet non trovato'
      });
    }

    // Costruisci le condizioni di ricerca
    const whereConditions = {
      wallet_id: wallet.id
    };

    if (type) {
      whereConditions.type = type;
    }

    if (status) {
      whereConditions.status = status;
    }

    if (start_date && end_date) {
      whereConditions.created_at = {
        [Op.between]: [new Date(start_date), new Date(end_date)]
      };
    } else if (start_date) {
      whereConditions.created_at = {
        [Op.gte]: new Date(start_date)
      };
    } else if (end_date) {
      whereConditions.created_at = {
        [Op.lte]: new Date(end_date)
      };
    }

    // Ottieni le transazioni con paginazione
    const { count, rows: transactions } = await Transaction.findAndCountAll({
      where: whereConditions,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Errore nel recupero delle transazioni:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero delle transazioni'
    });
  }
});

/**
 * @route GET /api/v1/wallets/balance
 * @description Ottiene il saldo del wallet dell'utente
 * @access Private
 */
router.get('/balance', authMiddleware.authenticate, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({
      where: {
        user_id: req.user.id
      },
      attributes: ['id', 'balance', 'currency']
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet non trovato'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        currency: wallet.currency
      }
    });
  } catch (error) {
    console.error('Errore nel recupero del saldo:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero del saldo'
    });
  }
});

/**
 * @route POST /api/v1/wallets/create
 * @description Crea un nuovo wallet per l'utente (se non esiste già)
 * @access Private
 */
router.post('/create', authMiddleware.authenticate, async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    // Verifica se l'utente ha già un wallet
    const existingWallet = await Wallet.findOne({
      where: {
        user_id: req.user.id
      },
      transaction
    });

    if (existingWallet) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'L\'utente ha già un wallet'
      });
    }

    // Crea un nuovo wallet
    const wallet = await Wallet.create({
      user_id: req.user.id,
      balance: 0.00,
      currency: 'EUR'
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      data: wallet
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Errore nella creazione del wallet:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella creazione del wallet'
    });
  }
});

/**
 * Verifica lo stato di pagamento di una transazione BTC tramite transaction_id
 * @route GET /api/v1/wallets/payment-status/:id
 */
router.get('/payment-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Trova la transazione per invoice_id (come passa il frontend)
    const transaction = await Transaction.findOne({ where: { invoice_id: id } });
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transazione non trovata' });
    }
    if (!transaction.invoice_id) {
      return res.status(400).json({ success: false, error: 'Transazione senza invoice associata' });
    }

    // Se la transazione è già completata, restituisci direttamente senza chiamare BTCPay
    if (transaction.status === 'completed') {
      console.log(`[Wallets] Transazione ${transaction.id} già completata, restituendo status paid`);
      return res.json({ success: true, status: 'paid', message: 'Pagamento già completato', transactionId: transaction.id });
    }

    // Recupera lo stato della invoice da BTCPay
    let invoice;
    try {
      invoice = await BTCPayService.getInvoice(transaction.invoice_id);
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Errore nel recupero invoice da BTCPay', details: error.message });
    }
    // Mappa lo stato
    const status = invoice.status;
    if (status === 'Settled' || status === 'settled' || status === 'Completed' || status === 'completed') {
      // Se la transazione non è già marcata come completata, aggiorna e accredita il wallet
      if (transaction.status !== 'completed') {
        console.log(`[Wallets] Aggiornamento transazione ${transaction.id} da ${transaction.status} a completed`);
        transaction.status = 'completed';
        await transaction.save();

        // Aggiorna il wallet con conversione crediti
        const wallet = await Wallet.findOne({ where: { id: transaction.wallet_id } });
        if (wallet) {
          try {
            // Importa servizi per conversione
            const exchangeRateService = require('../../services/exchange-rate.service');

            // Calcola crediti convertiti (BTCPay gestisce sempre EUR)
            const amount = parseFloat(transaction.amount);
            const currency = 'EUR'; // BTCPay gestisce sempre EUR

            let credits;
            if (currency === 'EUR') {
              credits = Math.floor(amount * 1000 * 100) / 100; // Arrotondamento a 2 decimali per difetto
              console.log(`[Wallets] Conversione: ${amount} EUR → ${credits} crediti`);
            } else if (currency === 'USD') {
              // Converti USD → EUR → Crediti
              const usdToEurRate = await exchangeRateService.getUsdEurRate();
              const amountEUR = amount * usdToEurRate;
              credits = Math.floor(amountEUR * 1000 * 100) / 100; // Arrotondamento a 2 decimali per difetto
              console.log(`[Wallets] Conversione: ${amount} USD → ${amountEUR} EUR → ${credits} crediti (tasso: ${usdToEurRate})`);
            } else {
              // Fallback a EUR
              credits = Math.floor(amount * 1000 * 100) / 100; // Arrotondamento a 2 decimali per difetto
              console.log(`[Wallets] Conversione fallback: ${amount} ${currency} → ${credits} crediti`);
            }

            // Validazione limiti database
            const MAX_BALANCE = 99999999.99; // Limite DECIMAL(10,2)
            const oldBalance = wallet.balance;
            const newBalance = parseFloat(wallet.balance) + credits;

            if (newBalance > MAX_BALANCE) {
              console.warn(`[Wallets] Balance troppo alto: ${newBalance}, limitato a ${MAX_BALANCE}`);
              wallet.balance = MAX_BALANCE;
            } else {
              wallet.balance = newBalance;
            }

            await wallet.save();
            console.log(`[Wallets] Wallet ${wallet.id} aggiornato: ${oldBalance} → ${wallet.balance} crediti`);

            // Calcola valore BTC per email (EUR convertito in BTC)
            const btcToEurRate = await exchangeRateService.getBtcEurRate();
            const amountBTC = amount / btcToEurRate;
            console.log(`[Wallets] Currency: ${currency}, Amount: ${amount}, Credits: ${credits}`);
            console.log(`[Wallets] Conversione BTC: ${amount} EUR → ${amountBTC} BTC (tasso: ${btcToEurRate})`);
            console.log(`[Wallets] BTC Value: ${amountBTC} (senza arrotondamento)`);

            // Invia email di conferma acquisto con crediti corretti e valore BTC
            try {
              const purchaseNotificationService = require('../../services/purchase-notification.service');
              await purchaseNotificationService.sendBTCPayPurchaseConfirmation(transaction, wallet, credits, amountBTC);
            } catch (emailError) {
              console.error('[Wallets] Errore nell\'invio email di conferma acquisto:', emailError);
              // Non blocchiamo il processo se l'email fallisce
            }
          } catch (conversionError) {
            console.error('[Wallets] Errore nella conversione crediti:', conversionError);
            // Fallback: aggiorna con importo EUR (comportamento precedente)
            const oldBalance = wallet.balance;
            wallet.balance = parseFloat(wallet.balance) + parseFloat(transaction.amount);
            await wallet.save();
            console.log(`[Wallets] Fallback: Wallet ${wallet.id} aggiornato con EUR: ${oldBalance} → ${wallet.balance}`);

            // Invia email di conferma con fallback
            try {
              const purchaseNotificationService = require('../../services/purchase-notification.service');
              await purchaseNotificationService.sendPurchaseConfirmationForTransaction(transaction, wallet);
            } catch (emailError) {
              console.error('[Wallets] Errore nell\'invio email di conferma acquisto (fallback):', emailError);
            }
          }
        }
      } else {
        console.log(`[Wallets] Transazione ${transaction.id} già completata, nessun aggiornamento necessario`);
      }
      return res.json({ success: true, status: 'paid', message: 'Pagamento ricevuto e accreditato', transactionId: transaction.id });
    } else {
      console.log(`[Wallets] Invoice ${invoice.id} ancora in attesa: ${status}`);
      return res.json({ success: true, status: 'pending', message: 'Pagamento ancora in attesa', transactionId: transaction.id });
    }
  } catch (error) {
    console.error('Errore in payment-status:', error);
    res.status(500).json({ success: false, error: 'Errore interno', details: error.message });
  }
});

module.exports = router; 