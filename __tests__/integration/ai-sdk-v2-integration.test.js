/**
 * Basic Integration Test for AI SDK v2 API
 * Tests the core functionality without external API calls
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Mock the external dependencies
jest.mock('../../services/ai-sdk.service');
jest.mock('../../services/business-logic-adapter.service');
jest.mock('../../database');
jest.mock('../../config/config');

const aiSDKService = require('../../services/ai-sdk.service');
const businessLogicAdapter = require('../../services/business-logic-adapter.service');

describe('AI SDK v2 API Integration', () => {
    let app;
    let authToken;

    beforeAll(() => {
        // Setup Express app with v2 router
        app = express();
        app.use(express.json());

        // Mock authentication middleware
        app.use((req, res, next) => {
            req.user = { id: 1, email: 'test@example.com' };
            next();
        });

        // Mount v2 router
        const v2Router = require('../../api/v2');
        app.use('/api/v2', v2Router);

        // Generate test auth token
        authToken = jwt.sign({ userId: 1 }, 'test-secret');
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Health Check', () => {
        it('should return healthy status', async () => {
            const response = await request(app)
                .get('/api/v2/health')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'healthy',
                version: 'v2',
                aiSDKCompatible: true
            });
        });

        it('should return API info', async () => {
            const response = await request(app)
                .get('/api/v2/info')
                .expect(200);

            expect(response.body).toMatchObject({
                version: 'v2',
                aiSDKCompatible: true,
                features: expect.objectContaining({
                    streaming: expect.objectContaining({
                        supported: true,
                        protocol: 'data-stream-protocol'
                    })
                })
            });
        });
    });

    describe('Cost Estimation', () => {
        it('should estimate cost for valid request', async () => {
            // Mock the business logic adapter
            businessLogicAdapter.estimateCost.mockResolvedValue({
                totalCost: 0.005,
                inputTokens: 100,
                outputTokens: 150,
                totalTokens: 250,
                baseCost: 0.004,
                totalMarkup: 0.001,
                provider: 'openai'
            });

            const response = await request(app)
                .post('/api/v2/messages/estimate-cost')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    messages: [
                        { role: 'user', content: 'Hello, how are you?' }
                    ],
                    id_model: 'gpt-4o-mini'
                })
                .expect(200);

            expect(response.body).toMatchObject({
                estimated_cost: 0.005,
                input_tokens: 100,
                output_tokens_estimated: 150,
                model: 'gpt-4o-mini',
                currency: 'credits'
            });

            expect(businessLogicAdapter.estimateCost).toHaveBeenCalledWith({
                modelSlug: 'gpt-4o-mini',
                messages: [{ role: 'user', content: 'Hello, how are you?' }],
                userId: 1
            });
        });

        it('should return error for missing messages', async () => {
            const response = await request(app)
                .post('/api/v2/messages/estimate-cost')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    id_model: 'gpt-4o-mini'
                })
                .expect(400);

            expect(response.body).toMatchObject({
                error: {
                    type: 'validation_error',
                    code: 'INVALID_MESSAGES'
                }
            });
        });
    });

    describe('Messages Endpoint', () => {
        it('should handle non-streaming message request', async () => {
            // Mock database models
            const mockChat = { id: 1, user_id: 1 };
            require('../../database').sequelize.models.Chat = {
                findOne: jest.fn().mockResolvedValue(mockChat)
            };

            // Mock business logic adapter
            businessLogicAdapter.processAIRequest.mockResolvedValue({
                success: true,
                streaming: false,
                content: 'Hello! How can I help you?',
                usage: { inputTokens: 10, outputTokens: 15, totalTokens: 25 },
                assistantMessage: {
                    id: 123,
                    created_at: new Date().toISOString()
                },
                cost: { total_cost: 0.001 }
            });

            const response = await request(app)
                .post('/api/v2/chats/1/messages')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    messages: [
                        { role: 'user', content: 'Hello' }
                    ],
                    id_model: 'gpt-4o-mini'
                })
                .expect(201);

            expect(response.body).toMatchObject({
                id: '123',
                role: 'assistant',
                content: 'Hello! How can I help you?',
                data: expect.objectContaining({
                    cost: 0.001,
                    input_tokens: 10,
                    output_tokens: 15
                })
            });
        });

        it('should return error for invalid chat', async () => {
            // Mock database to return null (chat not found)
            require('../../database').sequelize.models.Chat = {
                findOne: jest.fn().mockResolvedValue(null)
            };

            const response = await request(app)
                .post('/api/v2/chats/999/messages')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    messages: [
                        { role: 'user', content: 'Hello' }
                    ],
                    id_model: 'gpt-4o-mini'
                })
                .expect(404);

            expect(response.body).toMatchObject({
                error: {
                    type: 'not_found',
                    code: 'CHAT_NOT_FOUND'
                }
            });
        });
    });

    describe('Stream Control', () => {
        it('should return active streams', async () => {
            // Mock AI SDK service
            aiSDKService.getActiveStreams.mockReturnValue(['stream_1', 'stream_2']);

            // Mock database
            require('../../database').sequelize.models.Message = {
                findAll: jest.fn().mockResolvedValue([
                    {
                        id: 1,
                        chat_id: 1,
                        created_at: new Date(),
                        sse_status: 'streaming'
                    }
                ])
            };

            const response = await request(app)
                .get('/api/v2/streams')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body).toMatchObject({
                active_streams: expect.arrayContaining([
                    expect.objectContaining({
                        message_id: '1',
                        chat_id: '1',
                        sse_status: 'streaming'
                    })
                ]),
                sdk_active_streams: 2
            });
        });

        it('should abort stream by ID', async () => {
            aiSDKService.abortStream.mockReturnValue(true);

            const response = await request(app)
                .delete('/api/v2/streams/stream_123')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                stream_id: 'stream_123'
            });

            expect(aiSDKService.abortStream).toHaveBeenCalledWith('stream_123');
        });
    });

    describe('Error Handling', () => {
        it('should handle 404 for unknown endpoints', async () => {
            const response = await request(app)
                .get('/api/v2/unknown-endpoint')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body).toMatchObject({
                error: {
                    type: 'not_found',
                    code: 'ENDPOINT_NOT_FOUND'
                }
            });
        });

        it('should include v2 API headers', async () => {
            const response = await request(app)
                .get('/api/v2/health')
                .expect(200);

            expect(response.headers['x-api-version']).toBe('v2');
            expect(response.headers['x-ai-sdk-compatible']).toBe('true');
        });
    });
});

module.exports = {
    testSuite: 'AI SDK v2 Integration'
};
