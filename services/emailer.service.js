const fs = require('fs').promises;
const path = require('path');
const mjml = require('mjml');
const sgMail = require('@sendgrid/mail');

class EmailerService {
    constructor(config = {}) {
        // Configuration
        this.templatesPath = config.templatesPath || path.join(process.cwd(), 'templates/emails');
        this.sendGridApiKey = config.sendGridApiKey || process.env.SENDGRID_API_KEY;
        this.defaultFrom = config.defaultFrom || process.env.DEFAULT_FROM_EMAIL || 'info@aigens.io';

        // Initialize SendGrid
        if (!this.sendGridApiKey) {
            throw new Error('SendGrid API key is required');
        }
        sgMail.setApiKey(this.sendGridApiKey);

        // Template cache for better performance
        this.templateCache = new Map();
        this.cacheEnabled = config.cacheEnabled !== false; // Default to true

        // Fallback configuration
        this.enableFallback = config.enableFallback !== false; // Default to true
        this.fallbackEmail = config.fallbackEmail || process.env.FALLBACK_EMAIL || 'admin@aigens.io';

        // Queue configuration
        this.enableQueue = config.enableQueue !== false; // Default to true
        this.queuePath = config.queuePath || path.join(process.cwd(), 'temp', 'email-queue');
    }

    /**
     * Load and cache MJML template
     * @param {string} templateName - Name of the template file (without .mjml extension)
     * @returns {Promise<string>} - Raw MJML content
     */
    async loadTemplate(templateName) {
        const cacheKey = templateName;

        // Check cache first
        if (this.cacheEnabled && this.templateCache.has(cacheKey)) {
            return this.templateCache.get(cacheKey);
        }

        try {
            const templatePath = path.join(this.templatesPath, `${templateName}.mjml`);
            const mjmlContent = await fs.readFile(templatePath, 'utf8');

            // Cache the template
            if (this.cacheEnabled) {
                this.templateCache.set(cacheKey, mjmlContent);
            }

            return mjmlContent;
        } catch (error) {
            throw new Error(`Template "${templateName}" not found: ${error.message}`);
        }
    }

    /**
     * Replace placeholders in template with actual values
     * @param {string} template - MJML template content
     * @param {Object} variables - Key-value pairs for replacement
     * @returns {string} - Template with replaced variables
     */
    replaceVariables(template, variables = {}) {
        let processedTemplate = template;

        // Replace **variable** patterns
        Object.keys(variables).forEach(key => {
            const placeholder = `**${key}**`;
            const value = variables[key] || '';
            processedTemplate = processedTemplate.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
        });

        return processedTemplate;
    }

    /**
     * Convert MJML to HTML
     * @param {string} mjmlContent - MJML template content
     * @returns {Object} - Compiled HTML and metadata
     */
    compileTemplate(mjmlContent) {
        try {
            const result = mjml(mjmlContent, {
                validationLevel: 'soft', // Don't fail on warnings
                minify: true, // Minify output HTML
            });

            if (result.errors && result.errors.length > 0) {
                console.warn('MJML compilation warnings:', result.errors);
            }

            return {
                html: result.html,
                errors: result.errors || []
            };
        } catch (error) {
            throw new Error(`MJML compilation failed: ${error.message}`);
        }
    }

    /**
     * Send email using SendGrid with fallback handling
     * @param {Object} emailOptions - Email configuration
     * @returns {Promise<Object>} - SendGrid response
     */
    async sendEmail(emailOptions) {
        const {
            to,
            from = this.defaultFrom,
            subject,
            templateName,
            variables = {},
            attachments = [],
            cc = [],
            bcc = [],
            replyTo
        } = emailOptions;

        try {
            // Validate required fields
            if (!to) throw new Error('Recipient email is required');
            if (!subject) throw new Error('Email subject is required');
            if (!templateName) throw new Error('Template name is required');
            if (!from) throw new Error('From email is required');

            // Load and process template
            const mjmlTemplate = await this.loadTemplate(templateName);
            const processedTemplate = this.replaceVariables(mjmlTemplate, variables);
            const { html, errors } = this.compileTemplate(processedTemplate);

            // Prepare email data
            const msg = {
                to: Array.isArray(to) ? to : [to],
                from,
                subject,
                html,
                ...(cc.length > 0 && { cc }),
                ...(bcc.length > 0 && { bcc }),
                ...(replyTo && { replyTo }),
                ...(attachments.length > 0 && { attachments })
            };

            // Send email
            const response = await sgMail.send(msg);

            return {
                success: true,
                messageId: response[0].headers['x-message-id'],
                statusCode: response[0].statusCode,
                compilationWarnings: errors
            };

        } catch (error) {
            console.error('Email sending failed:', error);

            // Handle SendGrid credit limit error
            if (error.code === 401 && error.response?.body?.errors?.[0]?.message?.includes('Maximum credits exceeded')) {
                console.warn('⚠️ SendGrid credits exceeded. Using fallback notification.');
                return this.handleSendGridCreditLimit(to, subject, templateName, variables);
            }

            throw new Error(`Failed to send email: ${error.message}`);
        }
    }

    /**
     * Handle SendGrid credit limit by sending notification to admin
     * @param {string} originalTo - Original recipient
     * @param {string} subject - Email subject
     * @param {string} templateName - Template name
     * @param {Object} variables - Template variables
     * @returns {Promise<Object>} - Fallback result
     */
    async handleSendGridCreditLimit(originalTo, subject, templateName, variables) {
        if (!this.enableFallback) {
            throw new Error('SendGrid credits exceeded and fallback is disabled');
        }

        try {
            // Try to send fallback notification
            const fallbackSubject = `[FALLBACK] ${subject}`;
            const fallbackHtml = `
                <h2>Email non inviata - Limite SendGrid raggiunto</h2>
                <p><strong>Destinatario originale:</strong> ${originalTo}</p>
                <p><strong>Oggetto:</strong> ${subject}</p>
                <p><strong>Template:</strong> ${templateName}</p>
                <p><strong>Variabili:</strong> ${JSON.stringify(variables, null, 2)}</p>
                <p><strong>Data:</strong> ${new Date().toISOString()}</p>
                <hr>
                <p><em>Questo è un messaggio automatico generato dal sistema di fallback.</em></p>
            `;

            const fallbackMsg = {
                to: this.fallbackEmail,
                from: this.defaultFrom,
                subject: fallbackSubject,
                html: fallbackHtml
            };

            const response = await sgMail.send(fallbackMsg);

            return {
                success: false,
                fallback: true,
                messageId: response[0].headers['x-message-id'],
                statusCode: response[0].statusCode,
                originalRecipient: originalTo,
                note: 'Email not sent due to SendGrid credit limit. Admin notified.'
            };

        } catch (fallbackError) {
            console.error('Fallback email also failed:', fallbackError);

            // If fallback also fails, queue the email
            if (this.enableQueue) {
                return this.queueEmail(originalTo, subject, templateName, variables);
            }

            return {
                success: false,
                fallback: false,
                error: 'Both primary and fallback email sending failed',
                originalRecipient: originalTo
            };
        }
    }

    /**
     * Queue email for later sending
     * @param {string} to - Recipient email
     * @param {string} subject - Email subject
     * @param {string} templateName - Template name
     * @param {Object} variables - Template variables
     * @returns {Promise<Object>} - Queue result
     */
    async queueEmail(to, subject, templateName, variables) {
        try {
            // Ensure queue directory exists
            await fs.mkdir(this.queuePath, { recursive: true });

            // Create queue entry
            const queueEntry = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                to,
                subject,
                templateName,
                variables,
                createdAt: new Date().toISOString(),
                retryCount: 0,
                maxRetries: 3
            };

            // Save to queue file
            const queueFile = path.join(this.queuePath, `${queueEntry.id}.json`);
            await fs.writeFile(queueFile, JSON.stringify(queueEntry, null, 2));

            console.log(`📧 Email accodata: ${queueEntry.id}`);

            return {
                success: false,
                queued: true,
                queueId: queueEntry.id,
                originalRecipient: to,
                note: 'Email queued for later sending due to SendGrid issues'
            };

        } catch (queueError) {
            console.error('Failed to queue email:', queueError);
            return {
                success: false,
                queued: false,
                error: 'Failed to queue email',
                originalRecipient: to
            };
        }
    }

    /**
     * Process queued emails
     * @returns {Promise<Array>} - Processing results
     */
    async processQueuedEmails() {
        try {
            // Ensure queue directory exists
            await fs.mkdir(this.queuePath, { recursive: true });

            const files = await fs.readdir(this.queuePath);
            const jsonFiles = files.filter(file => file.endsWith('.json'));

            const results = [];

            for (const file of jsonFiles) {
                try {
                    const filePath = path.join(this.queuePath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const queueEntry = JSON.parse(content);

                    // Try to send the email
                    const result = await this.sendEmail({
                        to: queueEntry.to,
                        subject: queueEntry.subject,
                        templateName: queueEntry.templateName,
                        variables: queueEntry.variables
                    });

                    if (result.success) {
                        // Remove from queue on success
                        await fs.unlink(filePath);
                        results.push({
                            queueId: queueEntry.id,
                            success: true,
                            message: 'Email sent successfully'
                        });
                    } else {
                        // Update retry count
                        queueEntry.retryCount++;
                        if (queueEntry.retryCount >= queueEntry.maxRetries) {
                            // Remove from queue after max retries
                            await fs.unlink(filePath);
                            results.push({
                                queueId: queueEntry.id,
                                success: false,
                                message: 'Max retries exceeded, removed from queue'
                            });
                        } else {
                            // Update queue file
                            await fs.writeFile(filePath, JSON.stringify(queueEntry, null, 2));
                            results.push({
                                queueId: queueEntry.id,
                                success: false,
                                message: `Retry ${queueEntry.retryCount}/${queueEntry.maxRetries}`
                            });
                        }
                    }

                } catch (error) {
                    results.push({
                        queueId: file,
                        success: false,
                        error: error.message
                    });
                }
            }

            return results;

        } catch (error) {
            console.error('Error processing queued emails:', error);
            return [];
        }
    }

    /**
     * Get queue statistics
     * @returns {Promise<Object>} - Queue statistics
     */
    async getQueueStats() {
        try {
            await fs.mkdir(this.queuePath, { recursive: true });

            const files = await fs.readdir(this.queuePath);
            const jsonFiles = files.filter(file => file.endsWith('.json'));

            let totalRetries = 0;
            const retryCounts = {};

            for (const file of jsonFiles) {
                try {
                    const filePath = path.join(this.queuePath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const queueEntry = JSON.parse(content);

                    totalRetries += queueEntry.retryCount;
                    retryCounts[queueEntry.retryCount] = (retryCounts[queueEntry.retryCount] || 0) + 1;
                } catch (error) {
                    // Skip corrupted files
                }
            }

            return {
                totalQueued: jsonFiles.length,
                totalRetries,
                retryDistribution: retryCounts,
                averageRetries: jsonFiles.length > 0 ? (totalRetries / jsonFiles.length).toFixed(2) : 0
            };

        } catch (error) {
            console.error('Error getting queue stats:', error);
            return { totalQueued: 0, totalRetries: 0, retryDistribution: {}, averageRetries: 0 };
        }
    }

    /**
     * Send bulk emails (useful for newsletters, notifications)
     * @param {Array} recipients - Array of recipient objects
     * @param {Object} commonEmailOptions - Common email options
     * @returns {Promise<Array>} - Array of results
     */
    async sendBulkEmails(recipients, commonEmailOptions) {
        const results = [];

        for (const recipient of recipients) {
            try {
                const emailOptions = {
                    ...commonEmailOptions,
                    to: recipient.email,
                    variables: {
                        ...commonEmailOptions.variables,
                        ...recipient.variables
                    }
                };

                const result = await this.sendEmail(emailOptions);
                results.push({
                    email: recipient.email,
                    success: true,
                    result
                });
            } catch (error) {
                results.push({
                    email: recipient.email,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Preview email HTML (useful for testing)
     * @param {string} templateName - Template name
     * @param {Object} variables - Template variables
     * @returns {Promise<string>} - Compiled HTML
     */
    async previewEmail(templateName, variables = {}) {
        const mjmlTemplate = await this.loadTemplate(templateName);
        const processedTemplate = this.replaceVariables(mjmlTemplate, variables);
        const { html } = this.compileTemplate(processedTemplate);
        return html;
    }

    /**
     * Clear template cache
     */
    clearCache() {
        this.templateCache.clear();
    }

    /**
     * Get available templates
     * @returns {Promise<Array>} - Array of template names
     */
    async getAvailableTemplates() {
        try {
            const files = await fs.readdir(this.templatesPath);
            return files
                .filter(file => path.extname(file) === '.mjml')
                .map(file => path.basename(file, '.mjml'));
        } catch (error) {
            throw new Error(`Failed to read templates directory: ${error.message}`);
        }
    }
}

module.exports = EmailerService;