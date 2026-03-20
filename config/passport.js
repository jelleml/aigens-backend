/**
 * Configurazione di Passport.js
 * @module config/passport
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const { Op } = require('sequelize');
const config = require('./config');
const { findOrCreateUser } = require('../services/passwordless.service');
const OAuth2Strategy = require('passport-oauth2');

// Utility function to log only in development
const devLog = (message, data) => {
    if (process.env.NODE_ENV !== 'production' && process.env.DEBUG === 'true') {
        if (data) {
            console.log(message, data);
        } else {
            console.log(message);
        }
    }
};

/**
 * Inizializza Passport con le strategie di autenticazione
 * @param {Express} app - Istanza dell'applicazione Express
 */
const setupPassport = (app, models) => {
    const User = models.User;
    const Wallet = models.Wallet;
    if (!User || !Wallet) {
        throw new Error('User or Wallet model not found in models. Make sure db.initialize() has been called before setupPassport.');
    }
    if (!User.findOne || !Wallet.create) {
        throw new Error('Models not fully initialized – are you sure db.initialize() was called first?');
    }
    // Serializzazione dell'utente per la sessione
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    // Deserializzazione dell'utente dalla sessione
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findByPk(id, {
                attributes: { exclude: ['password'] }
            });
            done(null, user);
        } catch (error) {
            done(error, null);
        }
    });

    // Strategia Alby
    if (config.oauth.alby.clientID && config.oauth.alby.clientSecret) {
        devLog('=== Alby OAuth Debug ===');
        devLog('Client ID:', config.oauth.alby.clientID);
        devLog('Callback URL:', `${config.appUrl}${config.oauth.alby.callbackURL}`);
        devLog('Client Secret is set:', !!config.oauth.alby.clientSecret);
        devLog('=== End Alby OAuth Debug ===');

        passport.use('alby', new OAuth2Strategy({
            authorizationURL: 'https://getalby.com/oauth',
            tokenURL: 'https://api.getalby.com/oauth/token',
            clientID: config.oauth.alby.clientID,
            clientSecret: config.oauth.alby.clientSecret,
            callbackURL: `${config.appUrl}${config.oauth.alby.callbackURL}`,
            state: true
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                devLog('Alby OAuth - Access token received:', !!accessToken);

                const response = await fetch('https://api.getalby.com/user/me', {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });

                if (!response.ok) {
                    devLog('Alby API error:', response.status, response.statusText);
                    return done(new Error(`Alby API error: ${response.status}`), null);
                }

                // Estrai informazioni dal profilo
                const userInfo = await response.json();
                devLog('Alby user info:', userInfo);

                const email = userInfo.email;
                if (!email) {
                    return done(new Error('Email not available from Alby account'), null);
                }

                let user = await User.findOne({ where: { email } });

                if (!user) {
                    // Crea un nuovo utente
                    user = await User.create({
                        id: uuidv4(),
                        email,
                        first_name: userInfo.name || 'Alby',
                        is_email_verified: true
                    });

                    // Crea un wallet per il nuovo utente
                    await Wallet.create({ user_id: user.id, balance: 0.00, currency: 'USD' });
                    devLog('New user created from Alby OAuth:', user.id);
                } else {
                    devLog('Existing user found from Alby OAuth:', user.id);
                }

                // Aggiorna l'ultimo accesso
                user.last_login = new Date();
                await user.save();

                return done(null, user);
            } catch (error) {
                console.error('Errore nell\'autenticazione Alby:', error);
                return done(error, null);
            }
        }));
    }

    // Strategia Google
    if (config.oauth.google.clientID && config.oauth.google.clientSecret) {
        passport.use(new GoogleStrategy({
            clientID: config.oauth.google.clientID,
            clientSecret: config.oauth.google.clientSecret,
            callbackURL: `${config.appUrl}${config.oauth.google.callbackURL}`,
            userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo',
            scope: ['profile', 'email']
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                devLog('Google profile data:', JSON.stringify(profile, null, 2));

                // Estrai informazioni dal profilo
                const email = profile.emails?.[0]?.value;
                const firstName = profile.name?.givenName || '';
                const lastName = profile.name?.familyName || '';
                const displayName = profile.displayName || '';

                if (!email) {
                    return done(new Error('Email not available from Google account'), null);
                }

                let user = await User.findOne({
                    where: {
                        [Op.or]: [
                            { email },
                            { google_id: profile.id }
                        ]
                    }
                });

                if (!user) {
                    // Crea un nuovo utente
                    user = await User.create({
                        id: uuidv4(),
                        email,
                        google_id: profile.id,
                        first_name: firstName,
                        last_name: lastName,
                        is_email_verified: true
                    });

                    devLog('New user created from Google OAuth:', user.id);

                    // Crea un wallet per il nuovo utente
                    await Wallet.create({
                        user_id: user.id,
                        balance: 0.00,
                        currency: 'USD'
                    });
                } else if (!user.google_id) {
                    // Collega l'account Google all'utente esistente
                    user.google_id = profile.id;

                    // Aggiorna nome e cognome se non impostati
                    if (!user.first_name && firstName) {
                        user.first_name = firstName;
                    }

                    if (!user.last_name && lastName) {
                        user.last_name = lastName;
                    }

                    // Verifica l'email automaticamente
                    user.is_email_verified = true;

                    await user.save();
                    devLog('Existing user linked with Google OAuth:', user.id);
                } else {
                    // Aggiorna le informazioni dell'utente se sono cambiate
                    let hasChanges = false;

                    if (user.first_name !== firstName && firstName) {
                        user.first_name = firstName;
                        hasChanges = true;
                    }

                    if (user.last_name !== lastName && lastName) {
                        user.last_name = lastName;
                        hasChanges = true;
                    }

                    if (hasChanges) {
                        await user.save();
                        devLog('User information updated from Google OAuth:', user.id);
                    }
                }

                // Aggiorna l'ultimo accesso
                user.last_login = new Date();
                await user.save();

                return done(null, user);
            } catch (error) {
                console.error('Errore nell\'autenticazione Google:', error);
                return done(error, null);
            }
        }));
    }

    // Strategia Microsoft
    if (config.oauth.microsoft.clientID && config.oauth.microsoft.clientSecret) {
        // Force correct client ID if it's the placeholder
        if (config.oauth.microsoft.clientID === 'your-microsoft-client-id') {
            console.log('⚠️ Overriding placeholder Microsoft client ID with correct value');
            config.oauth.microsoft.clientID = '58eef7aa-5940-4306-9820-946dd9d04164';
        }

        // Ensure scopes is always an array
        const microsoftScopes = Array.isArray(config.oauth.microsoft.scopes)
            ? config.oauth.microsoft.scopes
            : ['user.read', 'openid', 'profile', 'email'];

        passport.use(new MicrosoftStrategy({
            clientID: config.oauth.microsoft.clientID,
            clientSecret: config.oauth.microsoft.clientSecret,
            callbackURL: `${config.appUrl}${config.oauth.microsoft.callbackURL}`,
            scope: microsoftScopes,
            tenant: config.oauth.microsoft.tenantID,
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                devLog('Microsoft authentication response received');

                // Ensure profile and emails exist
                if (!profile || !profile.emails || !profile.emails.length) {
                    devLog('No profile or email information received from Microsoft');
                    return done(new Error('Email not available from Microsoft account'), null);
                }

                const email = profile.emails[0].value;
                devLog('Microsoft authentication successful for email:', email);

                let user = await User.findOne({
                    where: {
                        [Op.or]: [
                            { email },
                            { microsoft_id: profile.id }
                        ]
                    }
                });

                if (!user) {
                    // Create a new user
                    user = await User.create({
                        id: uuidv4(),
                        email,
                        microsoft_id: profile.id,
                        first_name: profile.name?.givenName || '',
                        last_name: profile.name?.familyName || '',
                        is_email_verified: true
                    });

                    devLog('New user created from Microsoft OAuth:', user.id);

                    // Create a wallet for the new user
                    await Wallet.create({
                        user_id: user.id,
                        balance: 0.00,
                        currency: 'USD'
                    });
                } else if (!user.microsoft_id) {
                    // Link the Microsoft account to the existing user
                    user.microsoft_id = profile.id;

                    // Update name if not set
                    if (!user.first_name && profile.name?.givenName) {
                        user.first_name = profile.name.givenName;
                    }

                    if (!user.last_name && profile.name?.familyName) {
                        user.last_name = profile.name.familyName;
                    }

                    // Verify email automatically
                    user.is_email_verified = true;

                    await user.save();
                    devLog('Existing user linked with Microsoft OAuth:', user.id);
                }

                // Update the last login
                user.last_login = new Date();
                await user.save();

                return done(null, user);
            } catch (error) {
                if (process.env.NODE_ENV !== 'production') {
                    console.error('Error in Microsoft authentication:', error);
                }
                return done(error, null);
            }
        }));
    }

    // Strategia GitHub
    if (config.oauth.github.clientID && config.oauth.github.clientSecret) {
        // Force correct scope
        const githubScopes = Array.isArray(config.oauth.github.scope)
            ? config.oauth.github.scope
            : ['user:email'];

        devLog('=== GitHub OAuth Debug ===');
        devLog('Client ID:', config.oauth.github.clientID);
        devLog('Callback URL:', `${config.appUrl}${config.oauth.github.callbackURL}`);
        devLog('Scopes:', githubScopes);
        devLog('Client Secret is set:', !!config.oauth.github.clientSecret);
        devLog('=== End GitHub OAuth Debug ===');

        passport.use(new GitHubStrategy({
            clientID: config.oauth.github.clientID,
            clientSecret: config.oauth.github.clientSecret,
            callbackURL: `${config.appUrl}${config.oauth.github.callbackURL}`,
            scope: githubScopes
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                devLog('GitHub authentication response received');

                // Trova l'email primaria
                const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;

                if (!email) {
                    devLog('No email information received from GitHub');
                    return done(new Error('Email non disponibile dall\'account GitHub'), null);
                }

                devLog('GitHub authentication successful for email:', email);

                let user = await User.findOne({
                    where: {
                        [Op.or]: [
                            { email },
                            { github_id: profile.id }
                        ]
                    }
                });

                if (!user) {
                    // Estrai nome e cognome se disponibili
                    let firstName = '';
                    let lastName = '';

                    if (profile.displayName) {
                        const nameParts = profile.displayName.split(' ');
                        firstName = nameParts[0] || '';
                        lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
                    }

                    // Crea un nuovo utente
                    user = await User.create({
                        id: uuidv4(),
                        email,
                        github_id: profile.id,
                        first_name: firstName,
                        last_name: lastName,
                        is_email_verified: true
                    });

                    devLog('New user created from GitHub OAuth:', user.id);

                    // Crea un wallet per il nuovo utente
                    await Wallet.create({
                        user_id: user.id,
                        balance: 0.00,
                        currency: 'USD'
                    });
                } else if (!user.github_id) {
                    // Collega l'account GitHub all'utente esistente
                    user.github_id = profile.id;

                    // Aggiorna nome e cognome se non impostati e disponibili
                    if (profile.displayName && (!user.first_name || !user.last_name)) {
                        const nameParts = profile.displayName.split(' ');

                        if (!user.first_name && nameParts[0]) {
                            user.first_name = nameParts[0];
                        }

                        if (!user.last_name && nameParts.length > 1) {
                            user.last_name = nameParts.slice(1).join(' ');
                        }
                    }

                    // Verifica l'email automaticamente
                    user.is_email_verified = true;

                    await user.save();
                    devLog('Existing user linked with GitHub OAuth:', user.id);
                }

                // Aggiorna l'ultimo accesso
                user.last_login = new Date();
                await user.save();

                return done(null, user);
            } catch (error) {
                if (process.env.NODE_ENV !== 'production') {
                    console.error('Errore nell\'autenticazione GitHub:', error);
                }
                return done(error, null);
            }
        }));
    }

    // Inizializza Passport
    app.use(passport.initialize());
    app.use(passport.session());
};

module.exports = {
    setupPassport
}; 