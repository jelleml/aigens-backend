const EmailerService = require('./emailer.service');
const { Inbox } = require('../database').sequelize.models;

class MailerService extends EmailerService {
    constructor(config = {}) {
        super(config);

        // Fallback per email mittente se non configurato
        if (!this.defaultFrom) {
            this.defaultFrom = 'info@aigens.io';
            console.log('Using fallback email:', this.defaultFrom);
        }
    }

    /**
 * Send email with Inbox tracking
 * @param {Object} emailOptions - Email configuration
 * @returns {Promise<Object>} - SendGrid response with Inbox tracking
 */
    async sendEmailWithTracking(emailOptions) {
        const {
            to,
            from = this.defaultFrom,
            subject,
            templateName,
            variables = {},
            user_id = null,
            ...otherOptions
        } = emailOptions;

        let inboxRecord = null;

        try {
            // Create Inbox record first
            inboxRecord = await Inbox.create({
                user_id,
                recipient: to,
                email_slug: templateName,
                subject,
                content: '', // Will be updated after compilation
                replacements: variables,
                status: 'pending'
            });

            // Send email using parent class
            const result = await this.sendEmail({
                to,
                from,
                subject,
                templateName,
                variables,
                ...otherOptions
            });

            // Update Inbox record with success
            await inboxRecord.update({
                status: 'sent',
                sent_at: new Date(),
                content: result.html || 'Email sent successfully'
            });

            return {
                ...result,
                inbox_id: inboxRecord.id
            };

        } catch (error) {
            // Update Inbox record with error
            if (inboxRecord) {
                await inboxRecord.update({
                    status: 'error',
                    error_message: error.message,
                    retry_count: inboxRecord.retry_count + 1
                });
            }
            throw error;
        }
    }

    /**
     * Send verification email
     * @param {string} email - Recipient email
     * @param {string} verificationCode - 6-digit verification code
     * @param {string} firstName - User's first name
     * @param {string} userId - User ID for tracking
     * @returns {Promise<Object>} - Send result
     */
    async sendVerificationEmail(email, verificationCode, firstName, userId = null) {
        return this.sendEmailWithTracking({
            to: email,
            templateName: 'verification',
            subject: 'Verifica il tuo account Aigens',
            variables: {
                verification_code: verificationCode,
                first_name: firstName,
                app_name: 'Aigens',
                support_email: 'support@aigens.com'
            },
            user_id: userId
        });
    }

    /**
     * Send magic link email
     * @param {string} email - Recipient email
     * @param {string} magicCode - 6-digit magic link code
     * @param {string} firstName - User's first name
     * @param {string} userId - User ID for tracking
     * @returns {Promise<Object>} - Send result
     */
    async sendMagicLinkEmail(email, magicCode, firstName, userId = null) {
        return this.sendEmailWithTracking({
            to: email,
            templateName: 'magic-link',
            subject: 'Il tuo codice di accesso Aigens',
            variables: {
                magic_code: magicCode,
                first_name: firstName,
                app_name: 'Aigens',
                support_email: 'support@aigens.com'
            },
            user_id: userId
        });
    }

    /**
     * Send purchase confirmation email
     * @param {Object} purchaseData - Purchase data
     * @param {string} purchaseData.email - Recipient email
     * @param {string} purchaseData.firstName - User's first name
     * @param {string} purchaseData.userId - User ID for tracking
     * @param {Object} purchaseData.transaction - Transaction object
     * @param {Object} purchaseData.wallet - Wallet object with updated balance
     * @param {number} purchaseData.baseCredits - Base credits purchased
     * @param {number} purchaseData.bonusCredits - Bonus credits (optional)
     * @param {number} purchaseData.totalCredits - Total credits credited
     * @param {string} purchaseData.paymentMethod - Payment method used
     * @param {number} purchaseData.amountPaid - Amount paid in original currency
     * @param {string} purchaseData.currency - Original currency
     * @returns {Promise<Object>} - Send result
     */
    async sendPurchaseConfirmationEmail(purchaseData) {
        const {
            email,
            firstName,
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

        // Format payment method for display
        const paymentMethodDisplay = this.formatPaymentMethod(paymentMethod);

        // Format transaction date
        const transactionDate = new Date(transaction.created_at).toLocaleDateString('it-IT', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Prepare bonus credits section
        let bonusCreditsSection = '';
        if (bonusCredits > 0) {
            bonusCreditsSection = `<mj-text font-size="16px" color="#4a5568" line-height="20px">
                <strong>Crediti Bonus:</strong> +${bonusCredits} crediti
            </mj-text>`;
        }

        return this.sendEmailWithTracking({
            to: email,
            templateName: 'purchase-confirmation',
            subject: 'Conferma Acquisto Crediti - Aigens',
            variables: {
                first_name: firstName,
                app_name: 'Aigens',
                support_email: 'support@aigens.com',
                transaction_id: transaction.id,
                transaction_date: transactionDate,
                payment_method: paymentMethodDisplay,
                amount_paid: currency === 'BTC' ? amountPaid.toString() : amountPaid.toFixed(2),
                currency: currency,
                base_credits: baseCredits,
                bonus_credits_section: bonusCreditsSection,
                total_credits: totalCredits,
                new_balance: wallet.balance
            },
            user_id: userId
        });
    }

    /**
     * Format payment method for display
     * @param {string} paymentMethod - Raw payment method
     * @returns {string} - Formatted payment method
     */
    formatPaymentMethod(paymentMethod) {
        const methodMap = {
            'stripe': 'Carta di Credito/Debito',
            'bitcoin': 'Bitcoin',
            'btcpay': 'Bitcoin (BTCPay)',
            'system': 'Sistema'
        };

        return methodMap[paymentMethod] || paymentMethod;
    }

    /**
     * Retry failed emails
     * @returns {Promise<Array>} - Retry results
     */
    async retryFailedEmails() {
        const { Op } = require('sequelize');

        const failedEmails = await Inbox.findAll({
            where: {
                status: 'error',
                retry_count: { [Op.lt]: 3 }
            }
        });

        const results = [];

        for (const emailRecord of failedEmails) {
            try {
                const result = await this.sendEmailWithTracking({
                    to: emailRecord.recipient,
                    templateName: emailRecord.email_slug,
                    subject: emailRecord.subject,
                    variables: emailRecord.replacements,
                    user_id: emailRecord.user_id
                });

                results.push({
                    inbox_id: emailRecord.id,
                    success: true,
                    result
                });
            } catch (error) {
                results.push({
                    inbox_id: emailRecord.id,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Get email statistics
     * @returns {Promise<Object>} - Email statistics
     */
    async getEmailStats() {
        const { Op } = require('sequelize');

        const stats = await Inbox.findAll({
            attributes: [
                'status',
                [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
            ],
            group: ['status']
        });

        const total = await Inbox.count();
        const pending = await Inbox.count({ where: { status: 'pending' } });
        const sent = await Inbox.count({ where: { status: 'sent' } });
        const error = await Inbox.count({ where: { status: 'error' } });

        return {
            total,
            pending,
            sent,
            error,
            success_rate: total > 0 ? ((sent / total) * 100).toFixed(2) : 0
        };
    }
}

module.exports = new MailerService(); 