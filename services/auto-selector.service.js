/**
 * Auto-Selector Service for AI SDK Integration
 * Handles automatic model selection based on user preferences and prompt analysis
 */

const pythonAddonService = require('./python-addon.service');
const { getProvider, getModelIdentifier, getProviderFromModel } = require('../config/ai-sdk-providers');
const db = require('../database');
const { createLogger } = require('../scripts/utils/error-handler');

const { Model, Provider } = db.sequelize.models;
const logger = createLogger('auto-selector-service');

/**
 * Default user preferences for model selection
 */
const DEFAULT_PREFERENCES = {
    costs: 0.5,      // 0 = cheapest, 1 = most expensive
    quality: 0.7,    // 0 = lowest quality, 1 = highest quality  
    speed: 0.6       // 0 = slowest, 1 = fastest
};

/**
 * Model categories for auto-selection
 */
const MODEL_CATEGORIES = {
    TEXT: 'text',
    IMAGE: 'image',
    VIDEO: 'video',
    CODE: 'code',
    REASONING: 'reasoning'
};

/**
 * Auto-Selector Service Class
 */
class AutoSelectorService {
    constructor() {
        this.pythonAddon = pythonAddonService;
        this.modelCache = new Map();
        this.lastCacheUpdate = null;
        this.cacheExpiryMs = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Select best model based on prompt and user preferences
     * @param {Object} params - Selection parameters
     * @param {string} params.prompt - User prompt
     * @param {Object} params.userPreferences - User preferences (costs, quality, speed)
     * @param {Array} params.attachments - Optional attachments
     * @param {string} params.userId - User ID for personalization
     * @returns {Promise<Object>} Selected model information
     */
    async selectModel(params) {
        const {
            prompt,
            userPreferences = DEFAULT_PREFERENCES,
            attachments = [],
            userId
        } = params;

        const requestId = `auto_select_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            logger.info('Auto-selector: Starting model selection', {
                requestId,
                userId,
                promptLength: prompt?.length,
                attachmentCount: attachments.length,
                preferences: userPreferences
            });

            // 1. Analyze prompt to determine category and requirements
            const promptAnalysis = await this.analyzePrompt(prompt, attachments);

            // 2. Get available models for the detected category
            const availableModels = await this.getAvailableModels(promptAnalysis.category);

            // 3. Filter models based on capabilities
            const compatibleModels = this.filterModelsByCapabilities(
                availableModels,
                promptAnalysis.requiredCapabilities
            );

            if (compatibleModels.length === 0) {
                throw new Error('No compatible models found for the given prompt and requirements');
            }

            // 4. Score models based on user preferences
            const scoredModels = await this.scoreModels(
                compatibleModels,
                userPreferences,
                promptAnalysis
            );

            // 5. Select best model
            const selectedModel = scoredModels[0]; // Already sorted by score

            logger.info('Auto-selector: Model selected successfully', {
                requestId,
                selectedModel: selectedModel.model_slug,
                provider: selectedModel.provider.name,
                score: selectedModel.score,
                category: promptAnalysis.category
            });

            return {
                model_slug: selectedModel.model_slug,
                model_id: selectedModel.id,
                provider: selectedModel.provider.name,
                category: promptAnalysis.category,
                confidence: selectedModel.score,
                analysis: promptAnalysis,
                alternatives: scoredModels.slice(1, 4), // Top 3 alternatives
                selection_reason: this.generateSelectionReason(selectedModel, promptAnalysis, userPreferences)
            };

        } catch (error) {
            logger.error('Auto-selector: Model selection failed', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            // Fallback to default model
            return this.getFallbackModel(attachments);
        }
    }

    /**
     * Analyze prompt to determine category and requirements
     * @param {string} prompt - User prompt
     * @param {Array} attachments - Optional attachments
     * @returns {Promise<Object>} Prompt analysis result
     */
    async analyzePrompt(prompt, attachments = []) {
        try {
            // Determine category based on prompt content and attachments
            let category = MODEL_CATEGORIES.TEXT;
            let requiredCapabilities = ['text'];

            // Check for image-related requests
            if (this.isImageRequest(prompt) || attachments.some(att => att.contentType?.startsWith('image/'))) {
                if (this.isImageGenerationRequest(prompt)) {
                    category = MODEL_CATEGORIES.IMAGE;
                    requiredCapabilities = ['image_generation'];
                } else {
                    category = MODEL_CATEGORIES.TEXT;
                    requiredCapabilities = ['text', 'vision'];
                }
            }

            // Check for video-related requests
            if (this.isVideoRequest(prompt) || attachments.some(att => att.contentType?.startsWith('video/'))) {
                category = MODEL_CATEGORIES.VIDEO;
                requiredCapabilities = ['video'];
            }

            // Check for code-related requests
            if (this.isCodeRequest(prompt)) {
                category = MODEL_CATEGORIES.CODE;
                requiredCapabilities = ['text', 'code'];
            }

            // Check for reasoning-heavy requests
            if (this.isReasoningRequest(prompt)) {
                category = MODEL_CATEGORIES.REASONING;
                requiredCapabilities = ['text', 'reasoning'];
            }

            // Use Python addon for advanced categorization (optional)
            let pythonAnalysis = null;
            try {
                pythonAnalysis = await this.pythonAddon.categorizePrompt(prompt, false);
            } catch (error) {
                logger.warn('Auto-selector: Python addon categorization failed', { error: error.message });
            }

            return {
                category,
                requiredCapabilities,
                promptLength: prompt.length,
                hasAttachments: attachments.length > 0,
                attachmentTypes: attachments.map(att => att.contentType),
                complexity: this.estimateComplexity(prompt),
                pythonAnalysis
            };

        } catch (error) {
            logger.error('Auto-selector: Prompt analysis failed', { error: error.message });

            // Fallback analysis
            return {
                category: MODEL_CATEGORIES.TEXT,
                requiredCapabilities: ['text'],
                promptLength: prompt.length,
                hasAttachments: attachments.length > 0,
                complexity: 'medium'
            };
        }
    }

    /**
     * Get available models for a specific category
     * @param {string} category - Model category
     * @returns {Promise<Array>} Available models
     */
    async getAvailableModels(category) {
        try {
            // Check cache first
            const cacheKey = `models_${category}`;
            if (this.modelCache.has(cacheKey) && this.isCacheValid()) {
                return this.modelCache.get(cacheKey);
            }

            // Query database for active models
            const models = await Model.findAll({
                where: { is_active: true },
                include: [
                    {
                        model: Provider,
                        as: 'provider',
                        where: { is_active: true }
                    }
                ],
                order: [['updated_at', 'DESC']]
            });

            // Filter models by category capabilities
            const filteredModels = models.filter(model => {
                const capabilities = model.capabilities || [];

                switch (category) {
                    case MODEL_CATEGORIES.IMAGE:
                        return capabilities.includes('image_generation') ||
                            model.model_slug.includes('ideogram') ||
                            model.model_slug.includes('dall-e');

                    case MODEL_CATEGORIES.VIDEO:
                        return capabilities.includes('video') ||
                            model.model_slug.includes('veo') ||
                            model.model_slug.includes('runway');

                    case MODEL_CATEGORIES.CODE:
                        return capabilities.includes('code') ||
                            model.model_slug.includes('code') ||
                            model.model_slug.includes('deepseek');

                    case MODEL_CATEGORIES.REASONING:
                        return capabilities.includes('reasoning') ||
                            model.model_slug.includes('claude') ||
                            model.model_slug.includes('gpt-4');

                    default: // TEXT
                        return capabilities.includes('text') ||
                            (!capabilities.includes('image_generation') && !capabilities.includes('video'));
                }
            });

            // Update cache
            this.modelCache.set(cacheKey, filteredModels);
            this.lastCacheUpdate = Date.now();

            return filteredModels;

        } catch (error) {
            logger.error('Auto-selector: Failed to get available models', {
                category,
                error: error.message
            });
            return [];
        }
    }

    /**
     * Filter models by required capabilities
     * @param {Array} models - Available models
     * @param {Array} requiredCapabilities - Required capabilities
     * @returns {Array} Compatible models
     */
    filterModelsByCapabilities(models, requiredCapabilities) {
        return models.filter(model => {
            const modelCapabilities = model.capabilities || [];

            // Check if model supports all required capabilities
            return requiredCapabilities.every(capability => {
                switch (capability) {
                    case 'text':
                        return !modelCapabilities.includes('image_generation') &&
                            !modelCapabilities.includes('video');

                    case 'vision':
                        return modelCapabilities.includes('vision') ||
                            model.model_slug.includes('vision') ||
                            model.model_slug.includes('gpt-4');

                    case 'image_generation':
                        return modelCapabilities.includes('image_generation') ||
                            model.model_slug.includes('ideogram') ||
                            model.model_slug.includes('dall-e');

                    case 'video':
                        return modelCapabilities.includes('video') ||
                            model.model_slug.includes('veo') ||
                            model.model_slug.includes('runway');

                    case 'code':
                        return modelCapabilities.includes('code') ||
                            model.model_slug.includes('code') ||
                            model.model_slug.includes('deepseek');

                    case 'reasoning':
                        return modelCapabilities.includes('reasoning') ||
                            model.model_slug.includes('claude') ||
                            model.model_slug.includes('gpt-4');

                    default:
                        return true;
                }
            });
        });
    }

    /**
     * Score models based on user preferences
     * @param {Array} models - Compatible models
     * @param {Object} userPreferences - User preferences
     * @param {Object} promptAnalysis - Prompt analysis
     * @returns {Promise<Array>} Scored and sorted models
     */
    async scoreModels(models, userPreferences, promptAnalysis) {
        const scoredModels = [];

        for (const model of models) {
            try {
                const score = await this.calculateModelScore(model, userPreferences, promptAnalysis);
                scoredModels.push({
                    ...model.toJSON(),
                    score
                });
            } catch (error) {
                logger.warn('Auto-selector: Failed to score model', {
                    modelSlug: model.model_slug,
                    error: error.message
                });
            }
        }

        // Sort by score (highest first)
        return scoredModels.sort((a, b) => b.score - a.score);
    }

    /**
     * Calculate score for a specific model
     * @param {Object} model - Model to score
     * @param {Object} userPreferences - User preferences
     * @param {Object} promptAnalysis - Prompt analysis
     * @returns {Promise<number>} Model score (0-1)
     */
    async calculateModelScore(model, userPreferences, promptAnalysis) {
        let score = 0;
        const weights = {
            cost: userPreferences.costs || 0.5,
            quality: userPreferences.quality || 0.7,
            speed: userPreferences.speed || 0.6
        };

        // Cost score (lower cost = higher score if user prefers cost)
        const costScore = this.calculateCostScore(model, weights.cost);

        // Quality score based on model reputation and capabilities
        const qualityScore = this.calculateQualityScore(model, promptAnalysis);

        // Speed score based on model performance characteristics
        const speedScore = this.calculateSpeedScore(model);

        // Weighted average
        score = (
            costScore * (1 - weights.cost) + // Invert cost preference
            qualityScore * weights.quality +
            speedScore * weights.speed
        ) / 3;

        // Apply category-specific bonuses
        score += this.getCategoryBonus(model, promptAnalysis.category);

        // Apply provider reliability bonus
        score += this.getProviderReliabilityBonus(model.provider);

        return Math.min(1, Math.max(0, score));
    }

    /**
     * Helper methods for scoring
     */
    calculateCostScore(model, costPreference) {
        // Simplified cost scoring based on model type
        const costMap = {
            'gpt-4': 0.2,
            'gpt-4-turbo': 0.3,
            'gpt-4o': 0.4,
            'gpt-4o-mini': 0.8,
            'claude-3-opus': 0.1,
            'claude-3-sonnet': 0.5,
            'claude-3-haiku': 0.9,
            'deepseek': 0.9
        };

        const modelKey = Object.keys(costMap).find(key =>
            model.model_slug.toLowerCase().includes(key.toLowerCase())
        );

        return modelKey ? costMap[modelKey] : 0.5;
    }

    calculateQualityScore(model, promptAnalysis) {
        // Quality scoring based on model reputation
        const qualityMap = {
            'gpt-4': 0.95,
            'claude-3-opus': 0.95,
            'claude-3-sonnet': 0.85,
            'gpt-4-turbo': 0.9,
            'gpt-4o': 0.9,
            'claude-3-haiku': 0.7,
            'deepseek': 0.8
        };

        const modelKey = Object.keys(qualityMap).find(key =>
            model.model_slug.toLowerCase().includes(key.toLowerCase())
        );

        return modelKey ? qualityMap[modelKey] : 0.6;
    }

    calculateSpeedScore(model) {
        // Speed scoring based on model characteristics
        const speedMap = {
            'gpt-4o-mini': 0.95,
            'claude-3-haiku': 0.9,
            'gpt-4o': 0.8,
            'claude-3-sonnet': 0.7,
            'gpt-4-turbo': 0.6,
            'gpt-4': 0.5,
            'claude-3-opus': 0.4
        };

        const modelKey = Object.keys(speedMap).find(key =>
            model.model_slug.toLowerCase().includes(key.toLowerCase())
        );

        return modelKey ? speedMap[modelKey] : 0.6;
    }

    getCategoryBonus(model, category) {
        const bonuses = {
            [MODEL_CATEGORIES.IMAGE]: {
                'ideogram': 0.2,
                'dall-e': 0.15
            },
            [MODEL_CATEGORIES.VIDEO]: {
                'veo': 0.2,
                'runway': 0.15
            },
            [MODEL_CATEGORIES.CODE]: {
                'deepseek': 0.2,
                'code': 0.1
            },
            [MODEL_CATEGORIES.REASONING]: {
                'claude': 0.15,
                'gpt-4': 0.1
            }
        };

        const categoryBonuses = bonuses[category] || {};

        for (const [keyword, bonus] of Object.entries(categoryBonuses)) {
            if (model.model_slug.toLowerCase().includes(keyword)) {
                return bonus;
            }
        }

        return 0;
    }

    getProviderReliabilityBonus(provider) {
        const reliabilityMap = {
            'openai': 0.05,
            'anthropic': 0.05,
            'deepseek': 0.03,
            'ideogram': 0.03,
            'openrouter': 0.02,
            'together': 0.02
        };

        return reliabilityMap[provider.name.toLowerCase()] || 0;
    }

    /**
     * Pattern detection methods
     */
    isImageRequest(prompt) {
        const imageKeywords = [
            'generate image', 'create image', 'draw', 'illustrate', 'picture',
            'photo', 'artwork', 'design', 'visual', 'graphic'
        ];

        return imageKeywords.some(keyword =>
            prompt.toLowerCase().includes(keyword)
        );
    }

    isImageGenerationRequest(prompt) {
        const generationKeywords = [
            'generate', 'create', 'make', 'produce', 'design', 'draw'
        ];

        return generationKeywords.some(keyword =>
            prompt.toLowerCase().includes(keyword)
        );
    }

    isVideoRequest(prompt) {
        const videoKeywords = [
            'video', 'movie', 'film', 'animation', 'motion', 'clip'
        ];

        return videoKeywords.some(keyword =>
            prompt.toLowerCase().includes(keyword)
        );
    }

    isCodeRequest(prompt) {
        const codeKeywords = [
            'code', 'program', 'function', 'algorithm', 'script', 'debug',
            'javascript', 'python', 'java', 'c++', 'html', 'css', 'sql'
        ];

        return codeKeywords.some(keyword =>
            prompt.toLowerCase().includes(keyword)
        );
    }

    isReasoningRequest(prompt) {
        const reasoningKeywords = [
            'analyze', 'explain', 'reasoning', 'logic', 'solve', 'problem',
            'think', 'understand', 'complex', 'detailed'
        ];

        return reasoningKeywords.some(keyword =>
            prompt.toLowerCase().includes(keyword)
        ) || prompt.length > 500;
    }

    estimateComplexity(prompt) {
        if (prompt.length < 100) return 'simple';
        if (prompt.length < 500) return 'medium';
        return 'complex';
    }

    /**
     * Generate human-readable selection reason
     */
    generateSelectionReason(selectedModel, promptAnalysis, userPreferences) {
        const reasons = [];

        if (promptAnalysis.category !== MODEL_CATEGORIES.TEXT) {
            reasons.push(`specialized for ${promptAnalysis.category} tasks`);
        }

        if (userPreferences.costs < 0.3) {
            reasons.push('cost-effective option');
        } else if (userPreferences.quality > 0.8) {
            reasons.push('high-quality results');
        }

        if (userPreferences.speed > 0.8) {
            reasons.push('fast response time');
        }

        return reasons.length > 0
            ? `Selected for ${reasons.join(', ')}`
            : 'Best overall match for your request';
    }

    /**
     * Get fallback model when auto-selection fails
     */
    getFallbackModel(attachments = []) {
        // Determine fallback based on attachments
        if (attachments.some(att => att.contentType?.startsWith('image/'))) {
            return {
                model_slug: 'gpt-4o',
                provider: 'openai',
                category: MODEL_CATEGORIES.TEXT,
                confidence: 0.5,
                selection_reason: 'Fallback model with vision capabilities'
            };
        }

        return {
            model_slug: 'gpt-4o-mini',
            provider: 'openai',
            category: MODEL_CATEGORIES.TEXT,
            confidence: 0.5,
            selection_reason: 'Default fallback model'
        };
    }

    /**
     * Check if model cache is valid
     */
    isCacheValid() {
        return this.lastCacheUpdate &&
            (Date.now() - this.lastCacheUpdate) < this.cacheExpiryMs;
    }

    /**
     * Clear model cache
     */
    clearCache() {
        this.modelCache.clear();
        this.lastCacheUpdate = null;
    }
}

// Export singleton instance
const autoSelectorService = new AutoSelectorService();

module.exports = autoSelectorService;
