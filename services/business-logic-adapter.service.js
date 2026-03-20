/**
 * Business Logic Adapter
 * Interfaces AI SDK with existing business logic (costs, wallet, attachments, etc.)
 */

const aiSDKService = require('./ai-sdk.service');
const CostCalculator = require('./cost-calculator.service');
const GoogleCloudStorage = require('./google-cloud-storage.service');
const fileContentExtractor = require('./file-content-extractor.service');
const autoSelectorService = require('./auto-selector.service');
const { preparePromptWithContext } = require('../utils/chat-context');
const db = require('../database');
const { createLogger } = require('../scripts/utils/error-handler');

const { User, Chat, Message, Attachment, Wallet, Transaction, MessageCost } = db.sequelize.models;
const logger = createLogger('business-logic-adapter');
const gcsService = new GoogleCloudStorage();
const costCalculator = new CostCalculator();

/**
 * Business Logic Adapter Service
 * Bridges AI SDK with existing business logic
 */
class BusinessLogicAdapter {
    constructor() {
        this.messageRecovery = require('./message-recovery.service');
    }

    /**
     * Process AI request with full business logic integration
     * @param {Object} params - Request parameters
     * @param {string} params.modelSlug - Internal model slug
     * @param {Array} params.messages - Messages in AI SDK format
     * @param {string} params.chatId - Chat ID
     * @param {string} params.userId - User ID
     * @param {Array} params.attachments - File attachments
     * @param {Object} params.options - Additional options
     * @param {boolean} params.streaming - Whether to use streaming
     * @param {Function} params.onToken - Token callback for streaming
     * @param {Function} params.onFinish - Finish callback for streaming
     * @param {Function} params.onError - Error callback for streaming
     * @returns {Promise<Object>} Processing result
     */
    async processAIRequest(params) {
        const {
            modelSlug,
            messages,
            chatId,
            userId,
            attachments = [],
            options = {},
            streaming = false,
            onToken,
            onFinish,
            onError
        } = params;

        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        logger.info('Processing AI request', { requestId, modelSlug, chatId, userId, streaming });

        try {
            // 1. Validate inputs
            await this.validateRequest({ modelSlug, messages, chatId, userId });

            // 2. Handle auto-selector if needed (before getting model info)
            let finalModelSlug = modelSlug;
            let autoSelectorUsed = false;
            let autoSelectorResult = null;

            if (modelSlug === 'auto') {
                logger.info('Auto-selector requested', { requestId, userId });

                try {
                    const userContent = this.extractUserContent(messages);
                    autoSelectorResult = await autoSelectorService.selectModel({
                        prompt: userContent,
                        userPreferences: options.userPreferences || {},
                        attachments: attachments,
                        userId: userId
                    });

                    finalModelSlug = autoSelectorResult.model_slug;
                    autoSelectorUsed = true;

                    logger.info('Auto-selector completed', {
                        requestId,
                        selectedModel: finalModelSlug,
                        confidence: autoSelectorResult.confidence,
                        category: autoSelectorResult.category
                    });

                } catch (autoSelectorError) {
                    logger.error('Auto-selector failed, using fallback', {
                        requestId,
                        error: autoSelectorError.message
                    });

                    // Use fallback model
                    const fallback = autoSelectorService.getFallbackModel(attachments);
                    finalModelSlug = fallback.model_slug;
                    autoSelectorUsed = true;
                    autoSelectorResult = fallback;
                }
            }

            // 3. Get model and chat info (after finalModelSlug is determined)
            const [modelInfo, chat, user] = await Promise.all([
                this.getModelInfo(finalModelSlug),
                Chat.findByPk(chatId),
                User.findByPk(userId)
            ]);

            if (!chat || chat.user_id !== userId) {
                throw new Error('Chat not found or access denied');
            }

            if (!user) {
                throw new Error('User not found');
            }

            // 5. Process attachments
            const { processedMessages, attachmentRecords } = await this.processAttachments(
                messages,
                attachments,
                chatId,
                userId
            );

            // 6. Add chat context if needed
            const contextMessages = await this.addChatContext(
                processedMessages,
                chatId,
                modelInfo.provider
            );

            // 7. Estimate cost and check funds
            const costEstimate = await this.estimateCost({
                modelSlug: finalModelSlug,
                messages: contextMessages,
                userId
            });

            const hasFunds = await this.checkUserFunds(userId, costEstimate.totalCost);
            if (!hasFunds) {
                throw new Error(`Insufficient credits. Required: ${costEstimate.totalCost.toFixed(6)}, Available: ${hasFunds.available}`);
            }

            // 8. Save user message
            const userMessage = await this.saveUserMessage({
                chatId,
                userId,
                content: this.extractUserContent(messages),
                estimatedTokens: costEstimate.inputTokens,
                attachments: attachmentRecords
            });

            // 9. Create assistant message placeholder
            const assistantMessage = await this.createAssistantMessagePlaceholder({
                chatId,
                userId,
                modelSlug: finalModelSlug,
                autoSelectorUsed,
                autoSelectorResult
            });

            // 10. Process with AI SDK
            let aiResult;
            if (streaming) {
                aiResult = await this.processStreamingRequest({
                    modelSlug: finalModelSlug,
                    messages: contextMessages,
                    options,
                    assistantMessage,
                    userMessage,
                    chatId,
                    userId,
                    onToken,
                    onFinish,
                    onError,
                    requestId,
                    autoSelectorResult
                });
            } else {
                aiResult = await this.processNonStreamingRequest({
                    modelSlug: finalModelSlug,
                    messages: contextMessages,
                    options,
                    assistantMessage,
                    userMessage,
                    chatId,
                    userId,
                    requestId,
                    autoSelectorResult
                });
            }

            logger.info('AI request processed successfully', { requestId, messageId: assistantMessage.id });
            return aiResult;

        } catch (error) {
            logger.error('AI request processing failed', { requestId, error: error.message });
            throw error;
        }
    }

    /**
     * Process streaming AI request
     */
    async processStreamingRequest(params) {
        const {
            modelSlug,
            messages,
            options,
            assistantMessage,
            userMessage,
            chatId,
            userId,
            onToken,
            onFinish,
            onError,
            requestId
        } = params;

        let fullContent = '';
        let streamId = null;

        try {
            const streamControl = await aiSDKService.streamText({
                modelSlug,
                messages,
                options,
                onToken: (delta, accumulated) => {
                    fullContent = accumulated;
                    if (onToken) {
                        onToken(delta, accumulated);
                    }
                },
                onFinish: async (result) => {
                    try {
                        // Finalize the message and handle business logic
                        await this.finalizeMessage({
                            assistantMessage,
                            content: result.content,
                            usage: result.usage,
                            modelSlug,
                            chatId,
                            userId,
                            userMessage
                        });

                        if (onFinish) {
                            onFinish(result);
                        }
                    } catch (error) {
                        logger.error('Error finalizing streaming message', { requestId, error: error.message });
                        if (onError) {
                            onError(error);
                        }
                    }
                },
                onError: (error) => {
                    logger.error('Streaming error occurred', { requestId, error: error.message });

                    // Save partial content if any
                    if (fullContent) {
                        this.finalizeMessage({
                            assistantMessage,
                            content: fullContent,
                            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                            modelSlug,
                            chatId,
                            userId,
                            userMessage,
                            isPartial: true,
                            error: error.message
                        }).catch(err => {
                            logger.error('Error saving partial message', { requestId, error: err.message });
                        });
                    }

                    if (onError) {
                        onError(error);
                    }
                }
            });

            streamId = streamControl.id;

            return {
                success: true,
                streaming: true,
                streamId,
                userMessage,
                assistantMessage,
                streamControl
            };

        } catch (error) {
            logger.error('Failed to start streaming', { requestId, error: error.message });
            throw error;
        }
    }

    /**
     * Process non-streaming AI request
     */
    async processNonStreamingRequest(params) {
        const {
            modelSlug,
            messages,
            options,
            assistantMessage,
            userMessage,
            chatId,
            userId,
            requestId
        } = params;

        try {
            const result = await aiSDKService.generateText({
                modelSlug,
                messages,
                options
            });

            // Finalize the message with actual results
            await this.finalizeMessage({
                assistantMessage,
                content: result.content,
                usage: result.usage,
                modelSlug,
                chatId,
                userId,
                userMessage
            });

            return {
                success: true,
                streaming: false,
                content: result.content,
                usage: result.usage,
                userMessage,
                assistantMessage,
                cost: await this.getMessageCost(assistantMessage.id)
            };

        } catch (error) {
            logger.error('Non-streaming request failed', { requestId, error: error.message });
            throw error;
        }
    }

    /**
     * Finalize message with business logic (cost calculation, wallet update, etc.)
     */
    async finalizeMessage(params) {
        const {
            assistantMessage,
            content,
            usage,
            modelSlug,
            chatId,
            userId,
            userMessage,
            isPartial = false,
            error = null
        } = params;

        try {
            // Update assistant message with final content
            await assistantMessage.update({
                content,
                tokens_used: usage.outputTokens,
                is_complete: !isPartial && !error,
                sse_status: error ? 'error' : (isPartial ? 'interrupted' : 'completed'),
                sse_error: error
            });

            // Mark as complete in message recovery system
            if (!isPartial && !error) {
                await this.messageRecovery.markMessageAsComplete(assistantMessage.id, content);
            }

            // Calculate actual cost using AI SDK token counts
            const actualCost = await costCalculator.calculateCost({
                provider: aiSDKService.getModelInfo(modelSlug).provider,
                modelId: assistantMessage.id, // This should be the DB model ID, need to resolve
                apiModelId: modelSlug,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens
            });

            // Save cost details
            await this.saveMessageCost(actualCost, assistantMessage.id, chatId, userId);

            // Update wallet balance (subtract cost)
            if (!isPartial && !error) {
                await this.updateWalletBalance(userId, -actualCost.totalCost);
            }

            // Update chat timestamp
            await Chat.update(
                { last_message_at: new Date() },
                { where: { id: chatId } }
            );

            logger.info('Message finalized successfully', {
                messageId: assistantMessage.id,
                cost: actualCost.totalCost,
                tokens: usage.totalTokens,
                isPartial,
                hasError: !!error
            });

        } catch (finalizationError) {
            logger.error('Failed to finalize message', {
                messageId: assistantMessage.id,
                error: finalizationError.message
            });
            throw finalizationError;
        }
    }

    /**
     * Validate request parameters
     */
    async validateRequest({ modelSlug, messages, chatId, userId }) {
        if (!modelSlug || !messages || !chatId || !userId) {
            throw new Error('Missing required parameters: modelSlug, messages, chatId, userId');
        }

        if (!Array.isArray(messages) || messages.length === 0) {
            throw new Error('Messages must be a non-empty array');
        }

        // Validate model capability if needed
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.experimental_attachments?.some(att => att.contentType?.startsWith('image/'))) {
            if (!aiSDKService.validateModelCapability(modelSlug, 'vision')) {
                throw new Error(`Model ${modelSlug} does not support vision capabilities`);
            }
        }
    }

    /**
     * Get model information from database
     */
    async getModelInfo(modelSlug) {
        const Model = db.models.Model;
        const Provider = db.models.Provider;

        const model = await Model.findOne({
            where: { model_slug: modelSlug },
            include: [{ model: Provider, as: 'provider' }]
        });

        if (!model) {
            throw new Error(`Model ${modelSlug} not found in database`);
        }

        return {
            id: model.id,
            slug: model.model_slug,
            name: model.name,
            provider: model.provider.name,
            capabilities: model.capabilities || []
        };
    }

    /**
     * Process attachments and convert to AI SDK format
     */
    async processAttachments(messages, attachments, chatId, userId) {
        // Implementation for processing attachments
        // This would handle file uploads, GCS storage, content extraction, etc.
        // For now, return messages as-is
        return {
            processedMessages: messages,
            attachmentRecords: []
        };
    }

    /**
     * Add chat context to messages
     */
    async addChatContext(messages, chatId, providerName) {
        // Skip context for certain providers
        if (['ideogram', 'google-veo'].includes(providerName)) {
            return messages;
        }

        try {
            const lastUserMessage = messages[messages.length - 1];
            if (lastUserMessage && lastUserMessage.role === 'user') {
                const contextualContent = await preparePromptWithContext(
                    lastUserMessage.content,
                    chatId,
                    providerName
                );

                // Update the last message with context
                const updatedMessages = [...messages];
                updatedMessages[updatedMessages.length - 1] = {
                    ...lastUserMessage,
                    content: contextualContent
                };

                return updatedMessages;
            }
        } catch (error) {
            logger.warn('Failed to add chat context', { chatId, error: error.message });
        }

        return messages;
    }

    /**
     * Estimate cost for request
     */
    async estimateCost({ modelSlug, messages, userId }) {
        // Get rough token estimate from content length
        const totalContent = messages.map(m =>
            typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        ).join(' ');

        const estimatedInputTokens = Math.ceil(totalContent.length / 4);
        const estimatedOutputTokens = Math.min(estimatedInputTokens * 0.5, 1000); // Conservative estimate

        const modelInfo = await this.getModelInfo(modelSlug);

        return costCalculator.calculateCost({
            provider: modelInfo.provider,
            modelId: modelInfo.id,
            apiModelId: modelSlug,
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens
        });
    }

    /**
     * Check if user has sufficient funds
     */
    async checkUserFunds(userId, estimatedCost) {
        const wallet = await Wallet.findOne({ where: { user_id: userId } });

        if (!wallet) {
            throw new Error('User wallet not found');
        }

        const available = parseFloat(wallet.balance);
        const sufficient = available >= estimatedCost;

        return sufficient ? true : { sufficient: false, available, required: estimatedCost };
    }

    // Additional helper methods...
    async saveUserMessage({ chatId, userId, content, estimatedTokens, attachments }) {
        return Message.create({
            chat_id: chatId,
            role: 'user',
            content,
            tokens_used: estimatedTokens,
            agent_type: 'chat',
            is_complete: true
        });
    }

    async createAssistantMessagePlaceholder({ chatId, userId, modelSlug, autoSelectorUsed = false, autoSelectorResult = null }) {
        const messageData = {
            chat_id: chatId,
            role: 'assistant',
            content: '[Processing...]',
            tokens_used: 0,
            agent_type: 'chat',
            agent_model: modelSlug,
            is_complete: false,
            sse_status: 'streaming'
        };

        // Add auto-selector metadata if used
        if (autoSelectorUsed && autoSelectorResult) {
            messageData.auto_selector_used = true;
            messageData.auto_selector_confidence = autoSelectorResult.confidence;
            messageData.auto_selector_category = autoSelectorResult.category;
            messageData.auto_selector_reason = autoSelectorResult.selection_reason;
        }

        return Message.create(messageData);
    }

    extractUserContent(messages) {
        const userMessage = messages.find(m => m.role === 'user');
        return typeof userMessage?.content === 'string'
            ? userMessage.content
            : JSON.stringify(userMessage?.content || '');
    }

    async saveMessageCost(cost, messageId, chatId, userId) {
        return MessageCost.create({
            message_id: messageId,
            chat_id: chatId,
            user_id: userId,
            input_tokens: cost.inputTokens,
            output_tokens: cost.outputTokens,
            total_tokens: cost.totalTokens,
            base_cost: cost.baseCost,
            markup: cost.totalMarkup,
            total_cost: cost.totalCost,
            currency: 'USD'
        });
    }

    async updateWalletBalance(userId, amount) {
        const wallet = await Wallet.findOne({ where: { user_id: userId } });

        wallet.balance = parseFloat(wallet.balance) + amount;
        await wallet.save();

        await Transaction.create({
            user_id: userId,
            wallet_id: wallet.id,
            amount,
            currency: wallet.currency,
            type: 'usage',
            payment_method: 'system',
            status: 'completed',
            description: 'AI service usage'
        });

        return wallet;
    }

    async getMessageCost(messageId) {
        return MessageCost.findOne({ where: { message_id: messageId } });
    }
}

// Export singleton instance
const businessLogicAdapter = new BusinessLogicAdapter();

module.exports = businessLogicAdapter;
