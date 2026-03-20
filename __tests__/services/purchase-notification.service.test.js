/**
 * Test per il servizio di notifica acquisti
 */

const purchaseNotificationService = require('../../services/purchase-notification.service');
const mailerService = require('../../services/mailer.service');

// Mock del servizio mailer
jest.mock('../../services/mailer.service');

// Mock del servizio emailer
jest.mock('../../services/emailer.service');

// Mock dei modelli del database
jest.mock('../../database', () => ({
    models: {
        User: {
            findByPk: jest.fn()
        },
        Wallet: {
            findOne: jest.fn()
        }
    },
    sequelize: {
        models: {
            Inbox: {
                create: jest.fn(),
                update: jest.fn()
            }
        }
    }
}));

describe('PurchaseNotificationService', () => {
    const { User } = require('../../database').models;

    beforeEach(() => {
        jest.clearAllMocks();

        // Configura mock utente di default
        User.findByPk.mockResolvedValue({
            id: 'test-user-id',
            email: 'test@example.com',
            first_name: 'Test',
            name: 'Test User'
        });
    });

    describe('sendStripePurchaseConfirmation', () => {
        it('dovrebbe inviare email di conferma per acquisto Stripe', async () => {
            // Mock dei dati
            const paymentIntent = {
                metadata: { userId: 'test-user-id' }
            };
            const transaction = { id: 1, created_at: new Date() };
            const wallet = { balance: 1000 };
            const baseCredits = 500;
            const bonusCredits = 100;
            const totalCredits = 600;
            const amountPaid = 5.00;

            // Mock del servizio mailer
            mailerService.sendPurchaseConfirmationEmail.mockResolvedValue({
                success: true,
                inbox_id: 'test-inbox-id'
            });

            // Esegui il test
            await purchaseNotificationService.sendStripePurchaseConfirmation(
                paymentIntent,
                transaction,
                wallet,
                baseCredits,
                bonusCredits,
                totalCredits,
                amountPaid
            );

            // Verifica che il servizio mailer sia stato chiamato
            expect(mailerService.sendPurchaseConfirmationEmail).toHaveBeenCalledWith({
                email: expect.any(String),
                firstName: expect.any(String),
                userId: 'test-user-id',
                transaction: transaction,
                wallet: wallet,
                baseCredits: baseCredits,
                bonusCredits: bonusCredits,
                totalCredits: totalCredits,
                paymentMethod: 'stripe',
                amountPaid: amountPaid,
                currency: 'EUR'
            });
        });
    });

    describe('sendBTCPayPurchaseConfirmation', () => {
        it('dovrebbe inviare email di conferma per acquisto BTCPay', async () => {
            // Mock dei dati
            const transaction = {
                id: 1,
                user_id: 'test-user-id',
                created_at: new Date(),
                metadata: { bonusCredits: 50 }
            };
            const wallet = { balance: 1000 };
            const totalCredits = 550;
            const amountPaid = 0.001;

            // Mock del servizio mailer
            mailerService.sendPurchaseConfirmationEmail.mockResolvedValue({
                success: true,
                inbox_id: 'test-inbox-id'
            });

            // Esegui il test
            await purchaseNotificationService.sendBTCPayPurchaseConfirmation(
                transaction,
                wallet,
                totalCredits,
                amountPaid
            );

            // Verifica che il servizio mailer sia stato chiamato
            expect(mailerService.sendPurchaseConfirmationEmail).toHaveBeenCalledWith({
                email: expect.any(String),
                firstName: expect.any(String),
                userId: 'test-user-id',
                transaction: transaction,
                wallet: wallet,
                baseCredits: 500, // totalCredits - bonusCredits
                bonusCredits: 50,
                totalCredits: totalCredits,
                paymentMethod: 'bitcoin',
                amountPaid: amountPaid,
                currency: 'BTC'
            });
        });
    });

    describe('sendGenericPurchaseConfirmation', () => {
        it('dovrebbe inviare email di conferma generica', async () => {
            // Mock dei dati
            const purchaseData = {
                userId: 'test-user-id',
                transaction: { id: 1, created_at: new Date() },
                wallet: { balance: 1000 },
                baseCredits: 400,
                bonusCredits: 100,
                totalCredits: 500,
                paymentMethod: 'test-method',
                amountPaid: 10.00,
                currency: 'USD'
            };

            // Mock del servizio mailer
            mailerService.sendPurchaseConfirmationEmail.mockResolvedValue({
                success: true,
                inbox_id: 'test-inbox-id'
            });

            // Esegui il test
            await purchaseNotificationService.sendGenericPurchaseConfirmation(purchaseData);

            // Verifica che il servizio mailer sia stato chiamato
            expect(mailerService.sendPurchaseConfirmationEmail).toHaveBeenCalledWith({
                email: expect.any(String),
                firstName: expect.any(String),
                userId: 'test-user-id',
                transaction: purchaseData.transaction,
                wallet: purchaseData.wallet,
                baseCredits: purchaseData.baseCredits,
                bonusCredits: purchaseData.bonusCredits,
                totalCredits: purchaseData.totalCredits,
                paymentMethod: purchaseData.paymentMethod,
                amountPaid: purchaseData.amountPaid,
                currency: purchaseData.currency
            });
        });
    });

    describe('sendPurchaseConfirmationForTransaction', () => {
        it('dovrebbe inviare email di conferma per transazione esistente', async () => {
            // Mock dei dati
            const transaction = {
                id: 1,
                user_id: 'test-user-id',
                amount: 600,
                payment_method: 'stripe',
                currency: 'EUR',
                metadata: { bonusCredits: 100 },
                created_at: new Date()
            };
            const wallet = { balance: 1000 };

            // Mock del servizio mailer
            mailerService.sendPurchaseConfirmationEmail.mockResolvedValue({
                success: true,
                inbox_id: 'test-inbox-id'
            });

            // Esegui il test
            await purchaseNotificationService.sendPurchaseConfirmationForTransaction(transaction, wallet);

            // Verifica che il servizio mailer sia stato chiamato
            expect(mailerService.sendPurchaseConfirmationEmail).toHaveBeenCalledWith({
                email: expect.any(String),
                firstName: expect.any(String),
                userId: 'test-user-id',
                transaction: transaction,
                wallet: wallet,
                baseCredits: 500, // 600 - 100 bonus
                bonusCredits: 100,
                totalCredits: 600,
                paymentMethod: 'stripe',
                amountPaid: 600,
                currency: 'EUR'
            });
        });
    });
}); 