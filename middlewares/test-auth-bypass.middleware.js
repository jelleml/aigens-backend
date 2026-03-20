// Middleware di test per bypassare l'autenticazione
const testAuthBypass = (req, res, next) => {
    // Solo in ambiente di sviluppo e solo per test
    if (process.env.NODE_ENV === 'development' && req.headers['x-test-bypass'] === 'true') {
        // Simula un utente autenticato con l'ID del proprietario della chat 2
        req.user = {
            id: '5477eac6-2000-4991-a3c6-11d2951794ce',
            email: 'mr.simone.landi@gmail.com'
        };
        console.log('🧪 Test bypass: User authenticated as', req.user.email);
        return next();
    }

    // Altrimenti procedi con l'autenticazione normale
    next();
};

module.exports = testAuthBypass;

