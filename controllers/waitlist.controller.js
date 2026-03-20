/**
 * Controller per la gestione della lista d'attesa
 * @module controllers/waitlist
 */

const vboutClient = require('../services/vbout-email-client');
const config = require('../config/config');
const { getLogger } = require('../services/logging');
const logger = getLogger('waitlist', 'controller');

/**
 * Aggiunge un contatto alla lista d'attesa
 * @param {Object} req - La richiesta HTTP
 * @param {Object} res - La risposta HTTP
 * @returns {Promise<void>}
 */
const addToWaitingList = async (req, res) => {
    try {
        const { email, firstname, lastname, ...customfields } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'L\'indirizzo email è obbligatorio'
            });
        }

        // Valida il formato dell'email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Formato email non valido'
            });
        }

        // Prepara i dati del contatto
        const contactData = {
            email,
            firstname,
            lastname
        };

        // Aggiunge campi personalizzati se presenti
        if (Object.keys(customfields).length > 0) {
            contactData.customfields = customfields;
        }

        // Aggiunge il contatto alla lista d'attesa
        const result = await vboutClient.addContactToWaitingList(contactData);

        // Verifica se l'operazione è avvenuta con successo
        if (result && result.status === 'success') {
            return res.status(201).json({
                success: true,
                message: `Email ${email} aggiunta con successo alla lista d'attesa`,
                data: {
                    email,
                    listName: config.vbout.waitingListName,
                    listId: config.vbout.waitingListId
                }
            });
        } else {
            // Gestisce il caso in cui Vbout abbia risposto ma con un errore
            return res.status(400).json({
                success: false,
                message: result?.error || 'Errore durante l\'aggiunta alla lista d\'attesa',
                data: result
            });
        }
    } catch (error) {
        logger.error('Errore nel controller waitlist:', error);

        // Gestisce il caso in cui l'email sia già nella lista
        if (error.response?.data?.error?.includes('already exists')) {
            return res.status(409).json({
                success: false,
                message: 'L\'email è già presente nella lista d\'attesa',
                data: {
                    email: req.body.email
                }
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Errore del server durante l\'aggiunta alla lista d\'attesa',
            error: error.message
        });
    }
};

/**
 * Recupera le liste disponibili
 * @param {Object} req - La richiesta HTTP
 * @param {Object} res - La risposta HTTP
 * @returns {Promise<void>}
 */
const getLists = async (req, res) => {
    try {
        const result = await vboutClient.getMailingLists();

        if (result && result.status === 'success') {
            return res.status(200).json({
                success: true,
                data: result.data
            });
        } else {
            return res.status(400).json({
                success: false,
                message: result?.error || 'Errore durante il recupero delle liste',
                data: result
            });
        }
    } catch (error) {
        logger.error('Errore nel recupero delle liste:', error);
        return res.status(500).json({
            success: false,
            message: 'Errore del server durante il recupero delle liste',
            error: error.message
        });
    }
};

module.exports = {
    addToWaitingList,
    getLists
}; 