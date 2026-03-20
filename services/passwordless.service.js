/**
 * Service per la gestione dell'autenticazione passwordless
 * @module services/passwordless.service
 */

const passwordless = require('passwordless');
const PasswordlessSequelizeStore = require('passwordless-sequelize');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Token, User, Wallet } = require('../database').sequelize.models;
const config = require('../config/config');

/**
 * Configurazione del transport per l'invio delle email
 */
const smtpTransport = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
        user: config.email.user,
        pass: config.email.password
    }
});

/**
 * TokenStore personalizzato che utilizza il modello Token di Sequelize
 */
class SequelizeTokenStore {
    constructor() {
        this.name = 'SequelizeTokenStore';
    }

    /**
     * Salva un nuovo token
     * @param {string} token - Token generato per l'autenticazione
     * @param {string} uid - Identificativo dell'utente (email)
     * @param {number} msToLive - Durata di validità del token in millisecondi
     * @param {Object} originUrl - URL di origine
     * @param {Function} callback - Funzione di callback
     */
    async storeOrUpdate(token, uid, msToLive, originUrl, callback) {
        try {
            const now = new Date();
            const validUntil = new Date(now.getTime() + msToLive);

            // Cerca l'utente dalla email
            const user = await User.findOne({ where: { email: uid } });

            await Token.upsert({
                token: token,
                email: uid,
                user_id: user ? user.id : null,
                ttl: msToLive,
                is_valid: true,
                created_at: now
            });

            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    /**
     * Verifica se un token è valido
     * @param {string} token - Token da verificare
     * @param {Function} callback - Funzione di callback
     */
    async authenticate(token, callback) {
        try {
            const now = new Date();
            const tokenRecord = await Token.findOne({ where: { token } });

            if (!tokenRecord || !tokenRecord.is_valid) {
                return callback(null, false, null);
            }

            const creationDate = new Date(tokenRecord.created_at);
            const validUntil = new Date(creationDate.getTime() + tokenRecord.ttl);

            if (now > validUntil) {
                return callback(null, false, null);
            }

            // Invalida il token dopo l'uso (one-time use)
            tokenRecord.is_valid = false;
            await tokenRecord.save();

            callback(null, true, tokenRecord.email);
        } catch (error) {
            callback(error, false, null);
        }
    }

    /**
     * Invalida tutti i token di un utente
     * @param {string} uid - Identificativo dell'utente (email)
     * @param {Function} callback - Funzione di callback
     */
    async invalidateUser(uid, callback) {
        try {
            await Token.update(
                { is_valid: false },
                { where: { email: uid } }
            );
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    /**
     * Rimuove i token scaduti
     * @param {Function} callback - Funzione di callback
     */
    async removeTokens(callback) {
        try {
            const now = new Date();

            await Token.destroy({
                where: {
                    created_at: {
                        [Op.lt]: new Date(now.getTime() - 24 * 60 * 60 * 1000) // Rimuove token più vecchi di 24 ore
                    }
                }
            });

            callback(null);
        } catch (error) {
            callback(error);
        }
    }
}

/**
 * Funzione per inviare il token tramite email
 * @param {string} tokenToSend - Token da inviare
 * @param {string} uidToSend - Email dell'utente
 * @param {string} recipient - Indirizzo email del destinatario
 * @param {Function} callback - Funzione di callback
 */
const sendTokenByEmail = (tokenToSend, uidToSend, recipient, callback) => {
    // Genera URL per l'autenticazione
    const loginUrl = `${config.appUrl}/auth/passwordless/${tokenToSend}`;

    const mailOptions = {
        from: config.email.from,
        to: recipient,
        subject: 'Il tuo codice di accesso per AIGens',
        text: `Ciao!\n\nEcco il tuo link per accedere a AIGens: ${loginUrl}\n\nQuesto link scadrà tra un'ora.\n\nSe non hai richiesto questo codice, puoi ignorare questa email.\n\nGrazie,\nIl team di AIGens`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Accedi a AIGens</h2>
        <p>Ciao!</p>
        <p>Ecco il tuo link per accedere a AIGens:</p>
        <p style="text-align: center;">
          <a href="${loginUrl}" style="display: inline-block; background-color: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Accedi ora</a>
        </p>
        <p style="color: #7f8c8d; font-size: 0.9em;">Questo link scadrà tra un'ora.</p>
        <p>Se non hai richiesto questo codice, puoi ignorare questa email.</p>
        <p>Grazie,<br>Il team di AIGens</p>
      </div>
    `
    };

    smtpTransport.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Errore nell\'invio dell\'email:', error);
            return callback(error);
        }

        console.log('Email inviata:', info.response);
        callback(null);
    });
};

/**
 * Configura Passwordless con il TokenStore personalizzato
 */
const setupPasswordless = () => {
    // Inizializza Passwordless con il TokenStore
    const tokenStore = new SequelizeTokenStore();
    passwordless.init(tokenStore);

    // Configura la strategia di delivery delle email
    passwordless.addDelivery(sendTokenByEmail);

    return passwordless;
};

/**
 * Genera un token per l'autenticazione
 * @returns {string} Token univoco
 */
const generateToken = () => {
    // Genera un token di 16 caratteri alfanumerici usando crypto nativo
    return crypto.randomBytes(8).toString('hex');
};

/**
 * Trova o crea un utente basato sull'email
 * @param {string} email - Email dell'utente
 * @param {Object} profile - Profilo dell'utente (opzionale, per social login)
 * @returns {Promise<User>} Istanza dell'utente
 */
const findOrCreateUser = async (email, profile = {}) => {
    try {
        let user = await User.findOne({ where: { email } });

        if (!user) {
            // Crea un nuovo utente
            user = await User.create({
                id: uuidv4(),
                email,
                first_name: profile.firstName || '',
                last_name: profile.lastName || '',
                is_email_verified: profile.provider ? true : false // Verifica automatica per login social
            });

            // Crea un wallet per il nuovo utente
            await Wallet.create({
                user_id: user.id,
                balance: 0.00,
                currency: 'USD'
            });
        } else if (profile.provider) {
            // Aggiorna le informazioni del profilo se è un login social
            const updateData = {};

            // Aggiorna gli ID social se forniti
            if (profile.provider === 'google' && !user.google_id) {
                updateData.google_id = profile.id;
            } else if (profile.provider === 'microsoft' && !user.microsoft_id) {
                updateData.microsoft_id = profile.id;
            } else if (profile.provider === 'github' && !user.github_id) {
                updateData.github_id = profile.id;
            }

            // Aggiorna nome e cognome se non impostati
            if (profile.firstName && !user.first_name) {
                updateData.first_name = profile.firstName;
            }

            if (profile.lastName && !user.last_name) {
                updateData.last_name = profile.lastName;
            }

            // Imposta la verifica email a true per i login social
            if (!user.is_email_verified) {
                updateData.is_email_verified = true;
            }

            if (Object.keys(updateData).length > 0) {
                await user.update(updateData);
            }
        }

        return user;
    } catch (error) {
        console.error('Errore in findOrCreateUser:', error);
        throw error;
    }
};

module.exports = {
    setupPasswordless,
    generateToken,
    findOrCreateUser
}; 