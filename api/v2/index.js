/**
 * API v2 Main Router
 * Handles all v2 endpoints with AI SDK compatibility
 */

const express = require('express');
const router = express.Router();

// Import v2 endpoint modules
const messagesRouter = require('./messages');
const costEstimationRouter = require('./cost-estimation');
const attachmentsRouter = require('./attachments');
const streamControlRouter = require('./stream-control');
const monitoringRouter = require('./monitoring');

const { createLogger } = require('../../scripts/utils/error-handler');
const logger = createLogger('api-v2-router');

// Middleware for v2 API versioning
router.use((req, res, next) => {
    // Add v2 API headers
    res.set({
        'X-API-Version': 'v2',
        'X-AI-SDK-Compatible': 'true'
    });

    logger.info('V2 API request', {
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id
    });

    next();
});

// Mount endpoint routers
router.use('/chats/:chatId/messages', messagesRouter);
router.use('/chats', streamControlRouter); // For /chats/{chatId}/messages/{messageId}/stream
router.use('/messages', costEstimationRouter);
router.use('/attachments', attachmentsRouter);
router.use('/monitoring', monitoringRouter);
router.use('/', streamControlRouter); // For /streams endpoints

// Health check endpoint for v2 API
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        version: 'v2',
        aiSDKCompatible: true,
        timestamp: new Date().toISOString(),
        features: [
            'ai-sdk-compatibility',
            'data-stream-protocol',
            'experimental-attachments',
            'cost-estimation',
            'streaming-support'
        ]
    });
});

// API information endpoint
router.get('/info', (req, res) => {
    res.json({
        version: 'v2',
        description: 'Aigens Backend API v2 - AI SDK Compatible',
        aiSDKCompatible: true,
        features: {
            streaming: {
                supported: true,
                protocol: 'data-stream-protocol',
                formats: ['text/plain', 'text/event-stream']
            },
            attachments: {
                supported: true,
                maxSize: '10MB',
                maxFiles: 5,
                supportedTypes: [
                    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                    'application/pdf', 'text/plain', 'text/markdown',
                    'application/json', 'text/csv',
                    'video/mp4', 'video/mov'
                ]
            },
            models: {
                autoSelector: true,
                providers: ['openai', 'anthropic', 'deepseek', 'openrouter', 'together']
            },
            costEstimation: {
                supported: true,
                currency: 'credits',
                realTime: true
            }
        },
        endpoints: {
            messages: {
                post: '/api/v2/chats/{chatId}/messages',
                get: '/api/v2/chats/{chatId}/messages'
            },
            costEstimation: '/api/v2/messages/estimate-cost',
            attachments: {
                upload: '/api/v2/attachments/upload',
                get: '/api/v2/attachments/{attachmentId}',
                delete: '/api/v2/attachments/{attachmentId}'
            }
        },
        documentation: '/api/v2/docs'
    });
});

// Error handling middleware for v2 API
router.use((error, req, res, next) => {
    logger.error('V2 API error occurred', {
        path: req.path,
        method: req.method,
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
    });

    // Standardized error response format for v2
    const statusCode = error.statusCode || error.status || 500;
    const errorResponse = {
        error: {
            type: error.type || 'internal_error',
            message: error.message || 'An unexpected error occurred',
            code: error.code || 'INTERNAL_ERROR',
            timestamp: new Date().toISOString(),
            path: req.path,
            method: req.method
        }
    };

    // Add additional error details in development
    if (process.env.NODE_ENV === 'development') {
        errorResponse.error.stack = error.stack;
    }

    res.status(statusCode).json(errorResponse);
});

// 404 handler for v2 API
router.use('*', (req, res) => {
    res.status(404).json({
        error: {
            type: 'not_found',
            message: `Endpoint ${req.method} ${req.originalUrl} not found in API v2`,
            code: 'ENDPOINT_NOT_FOUND',
            timestamp: new Date().toISOString(),
            availableEndpoints: [
                'GET /api/v2/health',
                'GET /api/v2/info',
                'POST /api/v2/chats/{chatId}/messages',
                'GET /api/v2/chats/{chatId}/messages',
                'POST /api/v2/messages/estimate-cost',
                'POST /api/v2/attachments/upload',
                'GET /api/v2/attachments/{attachmentId}',
                'DELETE /api/v2/attachments/{attachmentId}'
            ]
        }
    });
});

module.exports = router;
