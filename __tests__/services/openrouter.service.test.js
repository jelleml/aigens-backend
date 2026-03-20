const axios = require('axios');
const openrouterService = require('../../services/openrouter.service');

jest.mock('axios');

describe('OpenRouter Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('sendRequest', () => {
        it('should successfully send a request with a string prompt', async () => {
            axios.post.mockResolvedValue({
                data: {
                    choices: [{ message: { content: 'Risposta mock' } }],
                    usage: { prompt_tokens: 10, completion_tokens: 20 }
                }
            });
            
            const response = await openrouterService.sendRequest('Ciao', 'openai/gpt-4o');
            
            expect(response.result).toBe('Risposta mock');
            expect(response.fullText).toBe('Risposta mock');
            expect(response.inputTokens).toBe(10);
            expect(response.outputTokens).toBe(20);
            
            // Verify that axios called the API correctly
            expect(axios.post).toHaveBeenCalledWith(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: 'openai/gpt-4o',
                    messages: [{ role: 'user', content: 'Ciao' }],
                    max_tokens: 2048
                },
                expect.any(Object)
            );
        });

        it('should successfully send a request with a messages array', async () => {
            const messages = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Test prompt' }
            ];
            
            axios.post.mockResolvedValue({
                data: {
                    choices: [{ message: { content: 'Risposta test' } }],
                    usage: { prompt_tokens: 5, completion_tokens: 15 }
                }
            });
            
            const response = await openrouterService.sendRequest(messages, 'openai/gpt-4o', 1, 1);
            
            expect(response.result).toBe('Risposta test');
            expect(response.fullText).toBe('Risposta test');
            expect(response.inputTokens).toBe(5);
            expect(response.outputTokens).toBe(15);
            
            // Verify that axios called the API correctly with the messages array
            expect(axios.post).toHaveBeenCalledWith(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: 'openai/gpt-4o',
                    messages: messages,
                    max_tokens: 2048
                },
                expect.any(Object)
            );
        });

        it('should throw an error for invalid prompt format', async () => {
            const prompt = { invalid: 'format' }; // Neither string nor array
            const model = 'openai/gpt-4o';
            const userId = 1;
            const chatId = 1;
            
            const response = await openrouterService.sendRequest(prompt, model, userId, chatId);
            
            expect(response.error).toBe('Invalid prompt format');
            expect(response.fullText).toBe('');
            expect(response.inputTokens).toBe(0);
            expect(response.outputTokens).toBe(0);
        });

        it('should handle API errors gracefully', async () => {
            // Mock API failure
            axios.post.mockRejectedValueOnce(new Error('API request failed'));

            const prompt = 'Test prompt';
            const model = 'openai/gpt-4o';
            const userId = 1;
            const chatId = 1;
            
            const response = await openrouterService.sendRequest(prompt, model, userId, chatId);
            
            expect(response.error).toBe('API request failed');
            expect(response.fullText).toBe('');
            expect(response.inputTokens).toBe(0);
            expect(response.outputTokens).toBe(0);
        });
    });

    // Tests for removed functions
    describe('removed functions', () => {
        it('should not have calculateCost function', () => {
            expect(openrouterService.calculateCost).toBeUndefined();
        });

        it('should not have isModelAvailable function', () => {
            expect(openrouterService.isModelAvailable).toBeUndefined();
        });

        it('should not have getAvailableModels function', () => {
            expect(openrouterService.getAvailableModels).toBeUndefined();
        });
        
        it('should not have initializeModels function', () => {
            expect(openrouterService.initializeModels).toBeUndefined();
        });
        
        it('should only export sendRequest function', () => {
            const exportedFunctions = Object.keys(openrouterService);
            expect(exportedFunctions).toHaveLength(1);
            expect(exportedFunctions).toContain('sendRequest');
        });
    });
});