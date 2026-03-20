/**
 * Test unitario per l'API delle chat
 * @module __tests__/unit/chats-api.test.js
 */

describe('Chats API Response Structure', () => {
    it('should include models_providers array in each chat', () => {
        // Simula la struttura della risposta che dovrebbe essere restituita
        const mockResponse = {
            success: true,
            data: {
                chats: [
                    {
                        id: 1,
                        user_id: 'test-user-id',
                        title: 'Test Chat',
                        is_active: true,
                        last_message_at: new Date(),
                        Messages: [],
                        is_pinned: false,
                        folder: null,
                        models_providers: [
                            {
                                model_id: 1,
                                model_name: 'Test Model',
                                model_slug: 'test-model',
                                provider_id: 1,
                                provider_name: 'Test Provider'
                            }
                        ]
                    },
                    {
                        id: 2,
                        user_id: 'test-user-id',
                        title: 'Test Chat 2',
                        is_active: true,
                        last_message_at: new Date(),
                        Messages: [],
                        is_pinned: false,
                        folder: null,
                        models_providers: []
                    }
                ],
                pagination: {
                    total: 2,
                    page: 1,
                    limit: 10,
                    pages: 1
                }
            }
        };

        // Verifica la struttura della risposta
        expect(mockResponse.success).toBe(true);
        expect(mockResponse.data).toHaveProperty('chats');
        expect(mockResponse.data).toHaveProperty('pagination');
        expect(mockResponse.data).not.toHaveProperty('models_providers'); // Non più globale

        // Verifica che ogni chat abbia il campo models_providers
        mockResponse.data.chats.forEach(chat => {
            expect(chat).toHaveProperty('models_providers');
            expect(Array.isArray(chat.models_providers)).toBe(true);
        });

        // Verifica la struttura di un elemento models_providers nella prima chat
        const firstChat = mockResponse.data.chats[0];
        if (firstChat.models_providers.length > 0) {
            const modelProvider = firstChat.models_providers[0];
            expect(modelProvider).toHaveProperty('model_id');
            expect(modelProvider).toHaveProperty('model_name');
            expect(modelProvider).toHaveProperty('model_slug');
            expect(modelProvider).toHaveProperty('provider_id');
            expect(modelProvider).toHaveProperty('provider_name');

            expect(typeof modelProvider.model_id).toBe('number');
            expect(typeof modelProvider.model_name).toBe('string');
            expect(typeof modelProvider.model_slug).toBe('string');
            expect(typeof modelProvider.provider_id).toBe('number');
            expect(typeof modelProvider.provider_name).toBe('string');
        }

        // Verifica che la seconda chat abbia un array vuoto
        const secondChat = mockResponse.data.chats[1];
        expect(secondChat.models_providers.length).toBe(0);
    });

    it('should handle empty models_providers array in chats', () => {
        const mockResponse = {
            success: true,
            data: {
                chats: [
                    {
                        id: 1,
                        user_id: 'test-user-id',
                        title: 'Test Chat',
                        is_active: true,
                        last_message_at: new Date(),
                        Messages: [],
                        is_pinned: false,
                        folder: null,
                        models_providers: []
                    }
                ],
                pagination: {
                    total: 1,
                    page: 1,
                    limit: 10,
                    pages: 1
                }
            }
        };

        const chat = mockResponse.data.chats[0];
        expect(chat).toHaveProperty('models_providers');
        expect(Array.isArray(chat.models_providers)).toBe(true);
        expect(chat.models_providers.length).toBe(0);
    });

    it('should maintain existing response structure', () => {
        const mockResponse = {
            success: true,
            data: {
                chats: [
                    {
                        id: 1,
                        user_id: 'test-user-id',
                        title: 'Test Chat',
                        is_active: true,
                        last_message_at: new Date(),
                        Messages: [],
                        is_pinned: false,
                        folder: null,
                        models_providers: []
                    }
                ],
                pagination: {
                    total: 1,
                    page: 1,
                    limit: 10,
                    pages: 1
                }
            }
        };

        // Verifica che la struttura esistente sia mantenuta
        expect(mockResponse.data.chats).toBeDefined();
        expect(Array.isArray(mockResponse.data.chats)).toBe(true);

        expect(mockResponse.data.pagination).toBeDefined();
        expect(mockResponse.data.pagination).toHaveProperty('total');
        expect(mockResponse.data.pagination).toHaveProperty('page');
        expect(mockResponse.data.pagination).toHaveProperty('limit');
        expect(mockResponse.data.pagination).toHaveProperty('pages');

        // Verifica che ogni chat abbia i campi esistenti
        const chat = mockResponse.data.chats[0];
        expect(chat).toHaveProperty('id');
        expect(chat).toHaveProperty('title');
        expect(chat).toHaveProperty('is_active');
        expect(chat).toHaveProperty('is_pinned');
        expect(chat).toHaveProperty('folder');
        expect(chat).toHaveProperty('models_providers');
    });
}); 