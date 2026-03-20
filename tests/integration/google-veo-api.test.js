const request = require('supertest');
const app = require('../../app');
const db = require('../../database');

describe('Google Veo API Integration Tests', () => {
    let testUser;
    let testChat;
    let authToken;

    beforeAll(async () => {
        await db.initialize();
        
        // Crea un utente di test
        testUser = await db.models.User.create({
            email: 'test-google-veo@example.com',
            password: 'testpassword123',
            name: 'Test User',
            is_active: true
        });

        // Crea un wallet per l'utente
        await db.models.Wallet.create({
            id_user: testUser.id,
            balance: 100.0
        });

        // Crea una chat di test
        testChat = await db.models.Chat.create({
            user_id: testUser.id,
            title: 'Test Chat for Google Veo',
            is_active: true
        });

        // Simula autenticazione
        authToken = 'test-token-' + Date.now();
    });

    afterAll(async () => {
        // Cleanup
        if (testUser) {
            await db.models.Wallet.destroy({ where: { id_user: testUser.id } });
            await db.models.Chat.destroy({ where: { user_id: testUser.id } });
            await db.models.User.destroy({ where: { id: testUser.id } });
        }
        
        await db.sequelize.close();
    });

    describe('POST /api/v1/chats/:chatId/messages', () => {
        it('should create a video generation request', async () => {
            const messageData = {
                content: 'Genera un video di un gatto che gioca',
                model_id: 1, // Assumiamo che il modello Google Veo abbia ID 1
                agent_type: 'video'
            };

            const response = await request(app)
                .post(`/api/v1/chats/${testChat.id}/messages`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(messageData)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('messageId');
            expect(response.body).toHaveProperty('videoUrl');
        });

        it('should handle invalid model ID', async () => {
            const messageData = {
                content: 'Genera un video di un gatto che gioca',
                model_id: 999, // ID non esistente
                agent_type: 'video'
            };

            const response = await request(app)
                .post(`/api/v1/chats/${testChat.id}/messages`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(messageData)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should handle insufficient funds', async () => {
            // Aggiorna il wallet con saldo insufficiente
            await db.models.Wallet.update(
                { balance: 0.0 },
                { where: { id_user: testUser.id } }
            );

            const messageData = {
                content: 'Genera un video di un gatto che gioca',
                model_id: 1,
                agent_type: 'video'
            };

            const response = await request(app)
                .post(`/api/v1/chats/${testChat.id}/messages`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(messageData)
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Fondi insufficienti');

            // Ripristina il saldo
            await db.models.Wallet.update(
                { balance: 100.0 },
                { where: { id_user: testUser.id } }
            );
        });

        it('should handle empty content', async () => {
            const messageData = {
                content: '',
                model_id: 1,
                agent_type: 'video'
            };

            const response = await request(app)
                .post(`/api/v1/chats/${testChat.id}/messages`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(messageData)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should handle missing model_id', async () => {
            const messageData = {
                content: 'Genera un video di un gatto che gioca',
                agent_type: 'video'
            };

            const response = await request(app)
                .post(`/api/v1/chats/${testChat.id}/messages`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(messageData)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('GET /api/v1/models', () => {
        it('should return Google Veo models', async () => {
            const response = await request(app)
                .get('/api/v1/models')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('models');
            expect(Array.isArray(response.body.models)).toBe(true);

            // Verifica che ci siano modelli Google Veo
            const googleVeoModels = response.body.models.filter(
                model => model.provider?.name === 'google-veo'
            );
            expect(googleVeoModels.length).toBeGreaterThan(0);
        });
    });

    describe('Error handling', () => {
        it('should handle network errors gracefully', async () => {
            // Simula un errore di rete
            jest.spyOn(console, 'error').mockImplementation(() => {});

            const messageData = {
                content: 'Genera un video di un gatto che gioca',
                model_id: 1,
                agent_type: 'video'
            };

            const response = await request(app)
                .post(`/api/v1/chats/${testChat.id}/messages`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(messageData)
                .expect(500);

            expect(response.body).toHaveProperty('error');
        });

        it('should handle invalid chat ID', async () => {
            const messageData = {
                content: 'Genera un video di un gatto che gioca',
                model_id: 1,
                agent_type: 'video'
            };

            const response = await request(app)
                .post('/api/v1/chats/999999/messages')
                .set('Authorization', `Bearer ${authToken}`)
                .send(messageData)
                .expect(404);

            expect(response.body).toHaveProperty('error');
        });
    });
}); 