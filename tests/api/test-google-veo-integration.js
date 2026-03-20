const request = require('supertest');
const app = require('../../server');
const db = require('../../database');

describe('Google Veo Integration Tests', () => {
    let testUser;
    let testChat;
    let testModel;
    let authToken;

    beforeAll(async () => {
        // Inizializza il database
        await db.initialize();

        // Crea un utente di test
        testUser = await db.models.User.create({
            email: 'test-google-veo@example.com',
            password: 'testpassword123',
            is_verified: true
        });

        // Crea un wallet per l'utente
        await db.models.Wallet.create({
            user_id: testUser.id,
            balance: 1000 // 1000 crediti
        });

        // Crea una chat di test
        testChat = await db.models.Chat.create({
            user_id: testUser.id,
            title: 'Test Google Veo Chat'
        });

        // Trova un modello Google Veo
        testModel = await db.models.Model.findOne({
            where: {
                id_provider: await db.models.Provider.findOne({ where: { name: 'google-veo' } }).then(p => p.id)
            }
        });

        if (!testModel) {
            throw new Error('Nessun modello Google Veo trovato nel database');
        }

        // Genera un token di autenticazione
        const jwt = require('jsonwebtoken');
        const config = require('../../config/config');
        authToken = jwt.sign({ id: testUser.id }, config.jwt.secret, { expiresIn: '1h' });
    });

    afterAll(async () => {
        // Cleanup
        if (testUser) {
            await db.models.Wallet.destroy({ where: { user_id: testUser.id } });
            await db.models.User.destroy({ where: { id: testUser.id } });
        }
        if (testChat) {
            await db.models.Chat.destroy({ where: { id: testChat.id } });
        }
    });

    describe('POST /api/v1/messages', () => {
        it('should handle Google Veo video generation request', async () => {
            const response = await request(app)
                .post(`/api/v1/chats/${testChat.id}/messages`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    content: 'Genera un video di un gatto che gioca con una palla',
                    agent_type: 'video',
                    id_model: testModel.id
                })
                .expect(200);

            // Verifica che la risposta sia uno stream di eventi
            expect(response.headers['content-type']).toContain('text/event-stream');
        });

        it('should return video generation events', async () => {
            const response = await request(app)
                .post(`/api/v1/chats/${testChat.id}/messages`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    content: 'Genera un video di un cane che corre nel parco',
                    agent_type: 'video',
                    id_model: testModel.id
                })
                .expect(200);

            // Verifica che la risposta contenga eventi di generazione video
            const responseText = response.text;
            expect(responseText).toContain('video-generation-started');
            expect(responseText).toContain('video-generation-progress');
            expect(responseText).toContain('video-generation-completed');
        });

        it('should handle errors gracefully', async () => {
            const response = await request(app)
                .post(`/api/v1/chats/${testChat.id}/messages`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    content: '', // Contenuto vuoto per testare l'errore
                    agent_type: 'video',
                    id_model: testModel.id
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
        });
    });

    describe('Google Veo Service Tests', () => {
        const googleVeoService = require('../../services/google-veo.service');

        it('should get available models', async () => {
            const models = await googleVeoService.getAvailableModels();
            expect(Array.isArray(models)).toBe(true);
            expect(models.length).toBeGreaterThan(0);
        });

        it('should check if model is available', async () => {
            const isAvailable = await googleVeoService.isModelAvailable('google-veo-1.0');
            expect(typeof isAvailable).toBe('boolean');
        });

        it('should calculate cost for video generation', async () => {
            const cost = await googleVeoService.calculateCost(testModel.id, 1, 'Generate');
            expect(cost).toBeDefined();
            expect(cost.estimatedCost).toBeDefined();
            expect(cost.currency).toBe('EUR');
        });

        it('should check user funds', async () => {
            const hasFunds = await googleVeoService.checkUserFunds(testUser.id, 0.01);
            expect(typeof hasFunds).toBe('boolean');
            expect(hasFunds).toBe(true); // L'utente ha 1000 crediti
        });
    });
}); 