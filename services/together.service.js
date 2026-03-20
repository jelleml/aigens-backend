/**
 * Service for Together AI integration
 * @module services/together
 */

const axios = require("axios");
const config = require("../config/config");

// Together API endpoints
const TOGETHER_API_URL = "https://api.together.ai/v1/chat/completions";

/**
 * Send a request to Together AI
 * @param {string|Array} prompt - User prompt or messages array
 * @param {string} model - Model ID (api_model_id from database)
 * @param {string} userId - User ID (unused, kept for compatibility)
 * @param {string} chatId - Chat ID (unused, kept for compatibility)
 * @param {string} agentType - Agent type (unused, kept for compatibility)
 * @param {Array} attachments - Attachments (unused, kept for compatibility)
 * @param {Function} onStream - Stream callback (ignored for Together)
 * @returns {Promise<Object>} API response
 */
const sendRequest = async (prompt, model, userId, chatId, agentType = 'chat', attachments = [], onStream = null) => {
    // Input validation
    if (!prompt) {
        console.error('Together Service: Missing prompt in sendRequest');
        return { fullText: '', inputTokens: 0, outputTokens: 0, error: 'Prompt is required' };
    }

    if (!model) {
        console.error('Together Service: Missing model in sendRequest');
        return { fullText: '', inputTokens: 0, outputTokens: 0, error: 'Model ID is required' };
    }

    console.log(`Together Service: Sending request to model: ${model}`);
    
    // Note: The model parameter should be the api_model_id from the database
    // This is handled by the model resolution logic in the API layer

    try {
        // Format messages for Together API
        let messages = [];
        if (typeof prompt === 'string') {
            messages = [{ role: 'user', content: prompt }];
        } else if (Array.isArray(prompt)) {
            messages = prompt;

            // Validate message format
            const invalidMessage = messages.find(msg => !msg.role || !msg.content);
            if (invalidMessage) {
                console.error('Together Service: Invalid message format in array prompt');
                return { fullText: '', inputTokens: 0, outputTokens: 0, error: 'Invalid message format: each message must have role and content' };
            }
        } else {
            console.error('Together Service: Invalid prompt format', typeof prompt);
            return { fullText: '', inputTokens: 0, outputTokens: 0, error: 'Invalid prompt format' };
        }

        // Validate API key
        if (!config.together || !config.together.apiKey) {
            console.error('Together Service: Missing API key configuration');
            return { fullText: '', inputTokens: 0, outputTokens: 0, error: 'Together API key not configured' };
        }

        // Validate model parameter
        if (!model || typeof model !== 'string' || model.trim() === '') {
            console.error('Together Service: Invalid model parameter');
            return { fullText: '', inputTokens: 0, outputTokens: 0, error: 'Invalid model parameter' };
        }
        
        // Log if model doesn't follow Together.ai format pattern (likely not an api_model_id)
        if (!model.includes('/')) {
            console.warn(`Together Service: Model ID "${model}" may not be a valid Together.ai api_model_id format (expected format: "org/model")`);
        }

        // Make API request with timeout for better error handling
        console.log(`Together Service: Sending request to Together API for model: ${model}`);
        const response = await axios.post(
            TOGETHER_API_URL,
            {
                model: model,
                messages: messages,
                max_tokens: 2048
            },
            {
                headers: {
                    'Authorization': `Bearer ${config.together.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000 // 60 second timeout
            }
        );

        if (!response.data || !response.data.choices || response.data.choices.length === 0) {
            console.error('Together Service: Invalid response structure from Together API');
            throw new Error('Invalid response from Together API');
        }

        // Extract result and usage information
        const result = response.data.choices[0].message.content;
        const inputTokens = response.data.usage.prompt_tokens;
        const outputTokens = response.data.usage.completion_tokens;

        console.log(`Together Service: Request successful, received ${inputTokens} input tokens and ${outputTokens} output tokens`);

        if (onStream) {
            console.log('Together Service: Invoking stream callback with result');
            onStream(result, { input_tokens: inputTokens, output_tokens: outputTokens });
        }

        return { result: result, fullText: result, inputTokens, outputTokens };
    } catch (error) {
        // Handle specific API errors
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;

            console.error(`Together Service: API error (${status}):`, errorData);

            // Handle specific error codes
            if (status === 401) {
                return { fullText: '', inputTokens: 0, outputTokens: 0, error: 'Authentication failed: Invalid API key' };
            } else if (status === 400) {
                return { fullText: '', inputTokens: 0, outputTokens: 0, error: `Bad request: ${errorData.error?.message || 'Invalid parameters'}` };
            } else if (status === 404) {
                return { fullText: '', inputTokens: 0, outputTokens: 0, error: `Model not found: ${model}` };
            } else if (status === 429) {
                return { fullText: '', inputTokens: 0, outputTokens: 0, error: 'Rate limit exceeded. Please try again later.' };
            } else if (status >= 500) {
                return { fullText: '', inputTokens: 0, outputTokens: 0, error: 'Together API server error. Please try again later.' };
            }
        }

        // Network or other errors
        console.error('Together Service: Error sending request:', error);
        return { fullText: '', inputTokens: 0, outputTokens: 0, error: error.message || 'Unknown error occurred' };
    }
};

// Export service functions
module.exports = {
    sendRequest
}; 