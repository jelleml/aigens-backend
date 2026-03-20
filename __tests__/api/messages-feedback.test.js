const request = require('supertest');
const app = require('../../server');
const db = require('../../database');
const { User, Chat, Message } = db.models;

describe('Messages Feedback API', () => {
    let testUser;
    let testChat;
    let testMessage;
    let authToken;

    beforeAll(async () => {
        // Crea un utente di test
        testUser = await User.create({
            email: 'test-feedback@example.com',
            password: 'password123',
            is_active: true
        });

        // Crea una chat di test
        testChat = await Chat.create({
            user_id: testUser.id,
            title: 'Test Chat for Feedback',
            is_active: true
        });

        // Crea un messaggio di test
        testMessage = await Message.create({
            chat_id: testChat.id,
            role: 'assistant',
            content: 'Test message for feedback',
            agent_type: 'chat',
            agent_model: 'test-model'
        });

        // Login per ottenere il token
        const loginResponse = await request(app)
            .post('/api/v1/auth/login')
            .send({
                email: 'test-feedback@example.com',
                password: 'password123'
            });

        authToken = loginResponse.body.data.token;
    });

    afterAll(async () => {
        // Cleanup
        await Message.destroy({ where: { chat_id: testChat.id } });
        await Chat.destroy({ where: { id: testChat.id } });
        await User.destroy({ where: { id: testUser.id } });
        await db.sequelize.close();
    });

    describe('GET /api/v1/chats/{chatId}/messages', () => {
        it('should include user_like and user_dislike fields in message payload', async () => {
            const response = await request(app)
                .get(`/api/v1/chats/${testChat.id}/messages`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.messages).toBeDefined();
            expect(response.body.data.messages.length).toBeGreaterThan(0);

            const message = response.body.data.messages[0];
            expect(message).toHaveProperty('user_like');
            expect(message).toHaveProperty('user_dislike');
            expect(message.user_like).toBeNull();
            expect(message.user_dislike).toBeNull();
        });
    });

    describe('GET /api/v1/chats/{chatId}/messages/{id}', () => {
        it('should include user_like and user_dislike fields in single message payload', async () => {
            const response = await request(app)
                .get(`/api/v1/chats/${testChat.id}/messages/${testMessage.id}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('user_like');
            expect(response.body.data).toHaveProperty('user_dislike');
            expect(response.body.data.user_like).toBeNull();
            expect(response.body.data.user_dislike).toBeNull();
        });
    });

    describe('POST /api/v1/chats/{chatId}/messages/{id}/like', () => {
        it('should set user_like to true and user_dislike to false', async () => {
            const response = await request(app)
                .post(`/api/v1/chats/${testChat.id}/messages/${testMessage.id}/like`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.user_like).toBe(true);
            expect(response.body.data.user_dislike).toBe(false);

            // Verifica che il messaggio sia stato aggiornato nel database
            const updatedMessage = await Message.findByPk(testMessage.id);
            expect(updatedMessage.user_like).toBe(true);
            expect(updatedMessage.user_dislike).toBe(false);
        });
    });

    describe('POST /api/v1/chats/{chatId}/messages/{id}/dislike', () => {
        it('should set user_dislike to true and user_like to false', async () => {
            const response = await request(app)
                .post(`/api/v1/chats/${testChat.id}/messages/${testMessage.id}/dislike`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.user_like).toBe(false);
            expect(response.body.data.user_dislike).toBe(true);

            // Verifica che il messaggio sia stato aggiornato nel database
            const updatedMessage = await Message.findByPk(testMessage.id);
            expect(updatedMessage.user_like).toBe(false);
            expect(updatedMessage.user_dislike).toBe(true);
        });
    });

    describe('DELETE /api/v1/chats/{chatId}/messages/{id}/feedback', () => {
        it('should remove feedback by setting both user_like and user_dislike to null', async () => {
            const response = await request(app)
                .delete(`/api/v1/chats/${testChat.id}/messages/${testMessage.id}/feedback`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.user_like).toBeNull();
            expect(response.body.data.user_dislike).toBeNull();

            // Verifica che il messaggio sia stato aggiornato nel database
            const updatedMessage = await Message.findByPk(testMessage.id);
            expect(updatedMessage.user_like).toBeNull();
            expect(updatedMessage.user_dislike).toBeNull();
        });
    });

    describe('GET /api/v1/chats/{id} with messages', () => {
        it('should include user_like and user_dislike fields in messages array', async () => {
            const response = await request(app)
                .get(`/api/v1/chats/${testChat.id}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.Messages).toBeDefined();
            expect(response.body.data.Messages.length).toBeGreaterThan(0);

            const message = response.body.data.Messages[0];
            expect(message).toHaveProperty('user_like');
            expect(message).toHaveProperty('user_dislike');
        });
    });
}); 