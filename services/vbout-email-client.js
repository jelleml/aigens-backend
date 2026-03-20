/**
 * Vbout Email Gateway Client
 * @module services/vbout-email-client
 */

const axios = require('axios');
const config = require('../config/config');

class VboutEmailClient {
    constructor(apiKey = config.vbout.apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.vbout.com/1';
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

    /**
     * Adds parameters to the request URL including the API key
     * @param {Object} params - The parameters to add to the request
     * @returns {Object} - The parameters with the API key added
     */
    addApiKey(params = {}) {
        return {
            ...params,
            api_key: this.apiKey
        };
    }

    /**
     * Processes a Vbout API response
     * @param {Object} response - The raw API response from Vbout
     * @returns {Object} - A standardized response object
     */
    processResponse(response) {
        // Check if response has the expected structure
        if (!response || !response.response || !response.response.header) {
            return {
                status: 'error',
                error: 'Invalid response format from Vbout API',
                data: response
            };
        }

        const { header, data, 'rate-limit': rateLimit } = response.response;

        // Return a standardized response format
        return {
            status: header.status === 'ok' ? 'success' : 'error',
            error: header.status !== 'ok' ? (data?.error || 'Unknown error') : null,
            data: data,
            rateLimit: rateLimit
        };
    }

    /**
     * Sends an email through Vbout's API
     * @param {Object} emailData - The email data
     * @param {string} emailData.from - The sender email address
     * @param {string} emailData.fromName - The sender name
     * @param {string} emailData.to - The recipient email address
     * @param {string} emailData.subject - The email subject
     * @param {string} emailData.html - The email HTML content
     * @param {string} [emailData.text] - The email plain text content
     * @returns {Promise<Object>} - The API response
     */
    async sendEmail(emailData) {
        try {
            const params = this.addApiKey({
                from: emailData.from,
                fromname: emailData.fromName,
                to: emailData.to,
                subject: emailData.subject,
                html_body: emailData.html,
                text_body: emailData.text || ''
            });

            const response = await this.client.get('/email/sendmail.json', {
                params
            });

            return this.processResponse(response.data);
        } catch (error) {
            console.error('Error sending email via Vbout:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Gets all mailing lists
     * @returns {Promise<Object>} - The API response with mailing lists
     */
    async getMailingLists() {
        try {
            const response = await this.client.get('/emailmarketing/getlists.json', {
                params: this.addApiKey()
            });

            const result = this.processResponse(response.data);

            // Add items array for consistent access
            if (result.status === 'success' && result.data && result.data.lists) {
                result.data.items = result.data.lists.items;
            }

            return result;
        } catch (error) {
            console.error('Error fetching mailing lists:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Adds a contact to a mailing list
     * @param {Object} contactData - The contact data
     * @param {string} contactData.email - The contact's email address
     * @param {string} contactData.listid - The ID of the mailing list to add the contact to
     * @param {string} [contactData.firstname] - The contact's first name
     * @param {string} [contactData.lastname] - The contact's last name
     * @param {Object} [contactData.customfields] - Custom fields for the contact
     * @returns {Promise<Object>} - The API response
     */
    async addContactToList(contactData) {
        try {
            const params = this.addApiKey({
                email: contactData.email,
                listid: contactData.listid,
                status: 'active'
            });

            // Add optional fields if provided
            if (contactData.firstname) params.firstname = contactData.firstname;
            if (contactData.lastname) params.lastname = contactData.lastname;

            // Add custom fields if provided
            if (contactData.customfields) {
                Object.entries(contactData.customfields).forEach(([key, value]) => {
                    params[`customfields[${key}]`] = value;
                });
            }

            // Vbout API uses GET requests with query parameters
            const response = await this.client.get('/emailmarketing/addcontact.json', {
                params
            });

            return this.processResponse(response.data);
        } catch (error) {
            console.error('Error adding contact to list:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Adds a contact to the waiting list
     * @param {Object} contactData - The contact data
     * @param {string} contactData.email - The contact's email address
     * @param {string} [contactData.firstname] - The contact's first name
     * @param {string} [contactData.lastname] - The contact's last name
     * @param {Object} [contactData.customfields] - Custom fields for the contact
     * @returns {Promise<Object>} - The API response
     */
    async addContactToWaitingList(contactData) {
        return this.addContactToList({
            ...contactData,
            listid: config.vbout.waitingListId
        });
    }
}

module.exports = new VboutEmailClient(); 