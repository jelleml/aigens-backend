const request = require('supertest');
const { initializeApp } = require('../../server');
const passwordlessService = require('../../services/passwordless.service');
const { User, Token } = require('../../database').sequelize.models;
const { authenticate, generateToken } = require('../../middlewares/auth.middleware');

// Mock delle dipendenze
jest.mock('../../services/passwordless.service', () => ({
    setupPasswordless: jest.fn().mockReturnValue({
        requestToken: jest.fn((email, callback) => callback(null)),
        acceptToken: jest.fn(() => (req, res, next) => {
            req.user = 'test@example.com';
            next();
        }),
        invalidateUser: jest.fn((email, callback) => callback && callback(null))
    }),
    generateToken: jest.fn().mockReturnValue('mock-token-123'),
    findOrCreateUser: jest.fn().mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        is_email_verified: true
    })
}));

jest.mock('../../middlewares/auth.middleware', () => ({
    isAuthenticated: jest.fn((req, res, next) => {
        req.user = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'test@example.com',
            role: 'user'
        };
        next();
    }),
    generateToken: jest.fn().mockReturnValue('jwt-token-123'),
    authenticate: jest.fn((req, res, next) => next()),
    authorize: jest.fn(() => (req, res, next) => next())
}));

jest.mock('../../database', () => {
    const mockUser = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        is_email_verified: true,
        role: 'user',
        save: jest.fn().mockResolvedValue(true),
        toJSON: jest.fn().mockReturnValue({
            id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'test@example.com',
            first_name: 'Test',
            last_name: 'User',
            role: 'user'
        }),
        validPassword: jest.fn().mockImplementation((password) => {
            return Promise.resolve(password === '!81ria79J');
        })
    };

    return {
        sequelize: {
            models: {
                User: {
                    findOne: jest.fn().mockResolvedValue(mockUser),
                    findByPk: jest.fn().mockResolvedValue(mockUser),
                    create: jest.fn().mockResolvedValue(mockUser)
                },
                Token: {
                    findOne: jest.fn().mockResolvedValue({
                        token: 'valid-token',
                        email: 'test@example.com',
                        is_valid: true,
                        ttl: 3600000,
                        created_at: new Date(),
                        save: jest.fn().mockResolvedValue(true)
                    }),
                    upsert: jest.fn().mockResolvedValue(true),
                    update: jest.fn().mockResolvedValue(true)
                },
                Wallet: {
                    create: jest.fn().mockResolvedValue({
                        id: 1,
                        user_id: '123e4567-e89b-12d3-a456-426614174000',
                        balance: 0.00,
                        currency: 'USD'
                    })
                }
            }
        }
    };
});

describe('Auth API', () => {
    let app;

    beforeEach(() => {
        app = initializeApp();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/v1/auth/login', () => {
        it('dovrebbe autenticare un utente con email e password valide', async () => {
            const response = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: 'test@example.com', password: '!81ria79J' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.token).toBeDefined();
            expect(response.body.data.user).toBeDefined();
            expect(response.body.data.user.email).toBe('test@example.com');
        });

        it('dovrebbe restituire un errore con email non valida', async () => {
            const response = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: 'invalid-email', password: 'password123' });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });

        it('dovrebbe restituire un errore con password non valida', async () => {
            const response = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: 'test@example.com', password: 'wrong-password' });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Credenziali non valide');
        });
    });

    describe('POST /api/v1/auth/login/passwordless', () => {
        it('dovrebbe richiedere un token passwordless con email valida', async () => {
            const response = await request(app)
                .post('/api/v1/auth/login/passwordless')
                .send({ email: 'test@example.com' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Link di accesso inviato');
            expect(passwordlessService.findOrCreateUser).toHaveBeenCalledWith('test@example.com');
        });

        it('dovrebbe restituire un errore con email non valida', async () => {
            const response = await request(app)
                .post('/api/v1/auth/login/passwordless')
                .send({ email: 'invalid-email' });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/auth/passwordless/:token', () => {
        it('dovrebbe autenticare un utente con token valido', async () => {
            const response = await request(app)
                .get('/api/v1/auth/passwordless/valid-token');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.token).toBeDefined();
            expect(response.body.data.user).toBeDefined();
        });
    });

    describe('GET /api/v1/auth/me', () => {
        it('dovrebbe restituire i dati dell\'utente autenticato', async () => {
            const response = await request(app)
                .get('/api/v1/auth/me')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.email).toBe('test@example.com');
        });
    });

    describe('POST /api/v1/auth/refresh-token', () => {
        it('dovrebbe rinnovare il token JWT', async () => {
            const response = await request(app)
                .post('/api/v1/auth/refresh-token')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.token).toBeDefined();
            expect(generateToken).toHaveBeenCalled();
        });
    });

    describe('POST /api/v1/auth/logout', () => {
        it('dovrebbe effettuare il logout dell\'utente', async () => {
            const response = await request(app)
                .post('/api/v1/auth/logout')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Logout effettuato con successo');
        });
    });

    describe('POST /api/v1/auth/logout-all', () => {
        it('dovrebbe effettuare il logout da tutti i dispositivi', async () => {
            const response = await request(app)
                .post('/api/v1/auth/logout-all')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Logout da tutti i dispositivi');
            expect(passwordlessService.setupPasswordless().invalidateUser).toHaveBeenCalledWith('test@example.com');
        });
    });
}); 