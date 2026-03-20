/**
 * Unified AI SDK Service
 * Replaces provider-specific services using Vercel AI SDK
 */

const { generateText, streamText, generateObject } = require('ai');
const { getProvider, getModelIdentifier, getProviderFromModel, supportsCapability } = require('../config/ai-sdk-providers');
const { createLogger } = require('../scripts/utils/error-handler');

const logger = createLogger('ai-sdk-service');

/**
 * Unified AI Service using Vercel AI SDK
 */
class AISDKService {
    constructor() {
        this.activeStreams = new Map(); // Track active streaming connections
    }

    /**
     * Resolve the correct AI SDK model interface based on capabilities and operation type
     * @param {Object} provider - Provider configuration object
     * @param {string} modelId - AI SDK model identifier
     * @param {string} modelSlug - Internal model slug
     * @param {Array} messages - Message array (to detect vision/image tasks)
     * @param {string} capabilityHint - Hint about the operation type ('text', 'embedding', 'vision', 'image')
     * @returns {Object} AI SDK model instance
     */
    resolveModelInterface(provider, modelId, modelSlug, messages = [], capabilityHint = 'text') {
        const providerName = getProviderFromModel(modelSlug);

        // Debug logging
        logger.debug('Resolving model interface', {
            modelSlug,
            modelId,
            providerName,
            capabilityHint,
            providerType: typeof provider,
            providerSdkType: typeof provider.sdk,
            hasConfig: !!provider.config,
            hasImageAttachments: messages.some(msg =>
                msg.experimental_attachments?.some(att => att.contentType?.startsWith('image/')) ||
                (Array.isArray(msg.content) && msg.content.some(part => part.type === 'image'))
            )
        });

        // Verify that provider.sdk is a function
        if (typeof provider.sdk !== 'function') {
            throw new Error(`Provider SDK is not a function. Type: ${typeof provider.sdk}, Provider: ${providerName}`);
        }

        // For AI SDK 2.x, we handle different provider configurations
        if (provider.config) {
            // Providers that need custom configuration (OpenRouter, DeepSeek, Together)
            // These use OpenAI-compatible APIs with custom base URLs

            // For now, we'll use environment variables and direct calls
            // TODO: Implement proper configuration passing for custom providers
            logger.warn('Custom provider configuration not fully implemented yet', { providerName });
            return provider.sdk(modelId);
        } else {
            // Direct providers (OpenAI, Anthropic) - use environment variables
            return provider.sdk(modelId);
        }
    }

    /**
     * Generate text completion using AI SDK
     * @param {Object} params - Generation parameters
     * @param {string} params.modelSlug - Internal model slug
     * @param {Array} params.messages - Message array in AI SDK format
     * @param {Object} params.options - Additional options
     * @returns {Promise<Object>} Generation result with usage info
     */
    async generateText(params) {
        const { modelSlug, messages, options = {} } = params;

        try {
            logger.info('Generating text completion', { modelSlug, messageCount: messages.length });

            // Get provider and model configuration
            const providerName = getProviderFromModel(modelSlug);
            const provider = getProvider(providerName);
            const modelId = getModelIdentifier(modelSlug);

            // Convert messages to AI SDK format if needed
            const aiMessages = this.convertMessagesToAIFormat(messages);

            // Resolve the correct model interface
            const model = this.resolveModelInterface(provider, modelId, modelSlug, aiMessages, options.capabilityHint || 'text');

            // Generate text using AI SDK
            const result = await generateText({
                model,
                messages: aiMessages,
                maxTokens: options.maxTokens || 4000,
                temperature: options.temperature || 0.7,
                topP: options.topP,
                frequencyPenalty: options.frequencyPenalty,
                presencePenalty: options.presencePenalty,
                seed: options.seed,
                ...options.additionalParams
            });

            logger.info('Text generation completed', {
                modelSlug,
                inputTokens: result.usage.promptTokens,
                outputTokens: result.usage.completionTokens
            });

            return {
                content: result.text,
                usage: {
                    inputTokens: result.usage.promptTokens,
                    outputTokens: result.usage.completionTokens,
                    totalTokens: result.usage.totalTokens
                },
                finishReason: result.finishReason,
                model: modelSlug,
                provider: providerName
            };

        } catch (error) {
            logger.error('Text generation failed', { modelSlug, error: error.message });
            throw this.handleAISDKError(error, modelSlug);
        }
    }

    /**
     * Generate streaming text completion using AI SDK
     * @param {Object} params - Generation parameters
     * @param {string} params.modelSlug - Internal model slug
     * @param {Array} params.messages - Message array in AI SDK format
     * @param {Object} params.options - Additional options
     * @param {Function} params.onToken - Callback for each token
     * @param {Function} params.onFinish - Callback when stream finishes
     * @param {Function} params.onError - Callback for errors
     * @returns {Promise<Object>} Stream control object
     */
    async streamText(params) {
        const { modelSlug, messages, options = {}, onToken, onFinish, onError } = params;
        const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            logger.info('Starting text streaming', { modelSlug, messageCount: messages.length, streamId });

            // Get provider and model configuration
            const providerName = getProviderFromModel(modelSlug);
            const provider = getProvider(providerName);
            const modelId = getModelIdentifier(modelSlug);

            // Convert messages to AI SDK format if needed
            const aiMessages = this.convertMessagesToAIFormat(messages);

            // Resolve the correct model interface
            const model = this.resolveModelInterface(provider, modelId, modelSlug, aiMessages, options.capabilityHint || 'text');

            // Start streaming with AI SDK
            const result = await streamText({
                model,
                messages: aiMessages,
                maxTokens: options.maxTokens || 4000,
                temperature: options.temperature || 0.7,
                topP: options.topP,
                frequencyPenalty: options.frequencyPenalty,
                presencePenalty: options.presencePenalty,
                seed: options.seed,
                ...options.additionalParams
            });

            // Track active stream
            const streamControl = {
                id: streamId,
                abort: () => {
                    logger.info('Aborting stream', { streamId });
                    this.activeStreams.delete(streamId);
                    // AI SDK streams are automatically abortable via the result object
                }
            };

            this.activeStreams.set(streamId, streamControl);

            // Process stream
            let fullContent = '';
            let usage = null;

            // Handle text deltas
            for await (const delta of result.textStream) {
                if (!this.activeStreams.has(streamId)) {
                    logger.info('Stream was aborted', { streamId });
                    break;
                }

                fullContent += delta;
                if (onToken) {
                    onToken(delta, fullContent);
                }
            }

            // Get final usage information
            const finalResult = await result.usage;
            usage = {
                inputTokens: finalResult.promptTokens,
                outputTokens: finalResult.completionTokens,
                totalTokens: finalResult.totalTokens
            };

            // Clean up
            this.activeStreams.delete(streamId);

            logger.info('Text streaming completed', {
                streamId,
                modelSlug,
                contentLength: fullContent.length,
                usage
            });

            const finalResponse = {
                content: fullContent,
                usage,
                finishReason: result.finishReason,
                model: modelSlug,
                provider: providerName,
                streamId
            };

            if (onFinish) {
                onFinish(finalResponse);
            }

            return streamControl;

        } catch (error) {
            logger.error('Text streaming failed', { modelSlug, streamId, error: error.message });
            this.activeStreams.delete(streamId);

            const aiError = this.handleAISDKError(error, modelSlug);
            if (onError) {
                onError(aiError);
            }
            throw aiError;
        }
    }

    /**
     * Generate embeddings using AI SDK
     * @param {Object} params - Generation parameters
     * @param {string} params.modelSlug - Internal model slug
     * @param {string|Array} params.input - Input text or array of texts
     * @param {Object} params.options - Additional options
     * @returns {Promise<Object>} Embedding result
     */
    async generateEmbedding(params) {
        const { modelSlug, input, options = {} } = params;

        try {
            logger.info('Generating embeddings', { modelSlug, inputType: Array.isArray(input) ? 'array' : 'string' });

            // Get provider and model configuration
            const providerName = getProviderFromModel(modelSlug);
            const provider = getProvider(providerName);
            const modelId = getModelIdentifier(modelSlug);

            // Resolve the correct model interface for embeddings
            const model = this.resolveModelInterface(provider, modelId, modelSlug, [], 'embedding');

            // Generate embeddings using AI SDK
            const result = await generateObject({
                model,
                prompt: Array.isArray(input) ? input.join('\n') : input,
                ...options.additionalParams
            });

            logger.info('Embedding generation completed', {
                modelSlug,
                inputLength: Array.isArray(input) ? input.length : input.length
            });

            return {
                embeddings: result.embeddings || [result.embedding],
                usage: result.usage,
                model: modelSlug,
                provider: providerName
            };

        } catch (error) {
            logger.error('Embedding generation failed', { modelSlug, error: error.message });
            throw this.handleAISDKError(error, modelSlug);
        }
    }

    /**
     * Generate image using AI SDK
     * @param {Object} params - Generation parameters
     * @param {string} params.modelSlug - Internal model slug
     * @param {string} params.prompt - Image generation prompt
     * @param {Object} params.options - Additional options (size, quality, etc.)
     * @returns {Promise<Object>} Image generation result
     */
    async generateImage(params) {
        const { modelSlug, prompt, options = {} } = params;

        try {
            logger.info('Generating image', { modelSlug, promptLength: prompt.length });

            // Get provider and model configuration
            const providerName = getProviderFromModel(modelSlug);
            const provider = getProvider(providerName);
            const modelId = getModelIdentifier(modelSlug);

            // Resolve the correct model interface for image generation
            const model = this.resolveModelInterface(provider, modelId, modelSlug, [], 'image');

            // Generate image using AI SDK
            const result = await generateObject({
                model,
                prompt,
                size: options.size || '1024x1024',
                quality: options.quality || 'standard',
                n: options.n || 1,
                ...options.additionalParams
            });

            logger.info('Image generation completed', {
                modelSlug,
                imageCount: result.data?.length || 1
            });

            return {
                images: result.data || [{ url: result.url }],
                usage: result.usage,
                model: modelSlug,
                provider: providerName
            };

        } catch (error) {
            logger.error('Image generation failed', { modelSlug, error: error.message });
            throw this.handleAISDKError(error, modelSlug);
        }
    }

    /**
     * Abort an active stream
     * @param {string} streamId - Stream ID to abort
     * @returns {boolean} Whether stream was found and aborted
     */
    abortStream(streamId) {
        const stream = this.activeStreams.get(streamId);
        if (stream) {
            stream.abort();
            return true;
        }
        return false;
    }

    /**
     * Get list of active streams
     * @returns {Array<string>} Array of active stream IDs
     */
    getActiveStreams() {
        return Array.from(this.activeStreams.keys());
    }

    /**
     * Convert internal message format to AI SDK format
     * @param {Array} messages - Messages in internal format
     * @returns {Array} Messages in AI SDK format
     */
    convertMessagesToAIFormat(messages) {
        return messages.map(msg => {
            const aiMessage = {
                role: msg.role,
                content: msg.content
            };

            // Handle attachments for vision models
            if (msg.experimental_attachments && msg.experimental_attachments.length > 0) {
                // Convert to AI SDK multimodal format
                const content = [
                    { type: 'text', text: msg.content }
                ];

                for (const attachment of msg.experimental_attachments) {
                    if (attachment.contentType?.startsWith('image/')) {
                        content.push({
                            type: 'image',
                            image: attachment.url // Can be data URL or remote URL
                        });
                    }
                }

                aiMessage.content = content;
            }

            return aiMessage;
        });
    }

    /**
     * Convert AI SDK format back to internal format
     * @param {Array} aiMessages - Messages in AI SDK format
     * @returns {Array} Messages in internal format
     */
    convertFromAIFormat(aiMessages) {
        return aiMessages.map(msg => {
            const internalMessage = {
                role: msg.role,
                content: typeof msg.content === 'string' ? msg.content : '',
                experimental_attachments: []
            };

            // Handle multimodal content
            if (Array.isArray(msg.content)) {
                const textParts = msg.content.filter(part => part.type === 'text');
                const imageParts = msg.content.filter(part => part.type === 'image');

                internalMessage.content = textParts.map(part => part.text).join(' ');
                internalMessage.experimental_attachments = imageParts.map(part => ({
                    contentType: 'image/jpeg', // Default, should be detected properly
                    url: part.image
                }));
            }

            return internalMessage;
        });
    }

    /**
     * Handle AI SDK errors and convert to internal error format
     * @param {Error} error - AI SDK error
     * @param {string} modelSlug - Model that caused the error
     * @returns {Error} Standardized error
     */
    handleAISDKError(error, modelSlug) {
        logger.error('AI SDK error occurred', { modelSlug, error: error.message, stack: error.stack });

        // Map AI SDK errors to our internal error types
        if (error.message.includes('rate limit') || error.message.includes('429')) {
            const customError = new Error(`Rate limit exceeded for model ${modelSlug}`);
            customError.type = 'rate_limit';
            customError.code = 'RATE_LIMIT_EXCEEDED';
            customError.statusCode = 429;
            return customError;
        }

        if (error.message.includes('insufficient') || error.message.includes('quota')) {
            const customError = new Error(`Quota exceeded for model ${modelSlug}`);
            customError.type = 'quota_exceeded';
            customError.code = 'QUOTA_EXCEEDED';
            customError.statusCode = 402;
            return customError;
        }

        if (error.message.includes('context length') || error.message.includes('token limit')) {
            const customError = new Error(`Context length exceeded for model ${modelSlug}`);
            customError.type = 'context_length_exceeded';
            customError.code = 'CONTEXT_LENGTH_EXCEEDED';
            customError.statusCode = 400;
            return customError;
        }

        if (error.message.includes('unauthorized') || error.message.includes('401')) {
            const customError = new Error(`Authentication failed for model ${modelSlug}`);
            customError.type = 'authentication_error';
            customError.code = 'AUTHENTICATION_ERROR';
            customError.statusCode = 401;
            return customError;
        }

        if (error.message.includes('not found') || error.message.includes('404')) {
            const customError = new Error(`Model ${modelSlug} not found or unavailable`);
            customError.type = 'model_unavailable';
            customError.code = 'MODEL_UNAVAILABLE';
            customError.statusCode = 404;
            return customError;
        }

        // Default internal error
        const customError = new Error(`AI service error: ${error.message}`);
        customError.type = 'internal_error';
        customError.code = 'INTERNAL_ERROR';
        customError.statusCode = 500;
        customError.originalError = error;
        return customError;
    }

    /**
     * Validate model capabilities
     * @param {string} modelSlug - Model to validate
     * @param {string} capability - Capability to check ('text', 'vision', 'tools')
     * @returns {boolean} Whether model supports capability
     */
    validateModelCapability(modelSlug, capability) {
        try {
            const providerName = getProviderFromModel(modelSlug);
            return supportsCapability(providerName, capability);
        } catch (error) {
            logger.warn('Could not validate model capability', { modelSlug, capability, error: error.message });
            return false;
        }
    }

    /**
     * Get model information
     * @param {string} modelSlug - Internal model slug
     * @returns {Object} Model information
     */
    getModelInfo(modelSlug) {
        try {
            const providerName = getProviderFromModel(modelSlug);
            const provider = getProvider(providerName);
            const modelId = getModelIdentifier(modelSlug);

            return {
                modelSlug,
                modelId,
                provider: providerName,
                type: provider.type,
                capabilities: provider.supportedCapabilities
            };
        } catch (error) {
            logger.error('Could not get model info', { modelSlug, error: error.message });
            throw error;
        }
    }
}

// Export singleton instance
const aiSDKService = new AISDKService();

module.exports = aiSDKService;
