/**
 * Unified Cost Calculator Service
 * Handles cost calculation for all AI providers with consistent pricing logic
 */

const db = require('../database');
// Usa Op dal database invece di importarlo direttamente
const Sequelize = require('sequelize');
const { Op } = Sequelize;

class CostCalculator {
  constructor() {
    this.db = db;
  }

  /**
   * Calculate cost for AI provider usage
   * @param {Object} params - Calculation parameters
   * @param {string} params.provider - Provider name (anthropic, openai, deepseek, etc.)
   * @param {number} params.modelId - Database model ID
   * @param {string} params.apiModelId - API model identifier
   * @param {number} params.inputTokens - Number of input tokens
   * @param {number} params.outputTokens - Number of output tokens
   * @param {Object} params.apiResponse - Original API response (optional)
   * @returns {Promise<Object>} Complete cost breakdown
   */
  async calculateCost(params) {
    const {
      provider,
      modelId,
      apiModelId,
      inputTokens,
      outputTokens,
      apiResponse = null
    } = params;

    try {
      // Validate input parameters
      this.validateInput(params);

      // Get model pricing data
      const pricingData = await this.getModelPricing(modelId, apiModelId);

      // Calculate base cost
      const baseCost = this.calculateBaseCost(inputTokens, outputTokens, pricingData);

      // Get markup configuration
      const markupConfig = await this.getMarkupConfiguration(provider);

      // Calculate markup
      const markupCalculation = this.calculateMarkup(baseCost, markupConfig);

      // Calculate total cost in currency
      const totalCost = baseCost + markupCalculation.total_markup;

      // Convert to credits (1 EUR = 1000 credits, assuming 1 USD ≈ 1 EUR for simplicity)
      const creditCost = totalCost * 1000;

      // Return complete cost breakdown
      return {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        price_1m_input_tokens: pricingData.price_1m_input_tokens,
        price_1m_output_tokens: pricingData.price_1m_output_tokens,
        base_cost: baseCost,
        fixed_markup_perc: markupConfig.markup_percentage,
        fixed_markup_value: markupCalculation.fixed_markup,
        markup_perc: markupConfig.markup_percentage,
        markup_value: markupCalculation.percentage_markup,
        total_markup: markupCalculation.total_markup,
        total_cost_for_user: creditCost, // Cost in credits for user
        total_cost_aigens: baseCost,
        total_margin_value: markupCalculation.total_markup,
        credit_cost: creditCost, // Explicit credit cost field

        // Additional fields for compatibility
        baseCost: baseCost,
        fixedMarkup: markupCalculation.fixed_markup,
        percentageMarkup: markupCalculation.percentage_markup,
        totalMarkup: markupCalculation.total_markup,
        totalCost: creditCost, // Total cost in credits
        model: apiModelId,
        modelId: modelId
      };
    } catch (error) {
      console.error('Error calculating cost:', error);
      throw new Error(`Cost calculation failed: ${error.message}`);
    }
  }

  /**
   * Validate input parameters
   * @param {Object} params - Parameters to validate
   */
  validateInput(params) {
    const { provider, modelId, apiModelId, inputTokens, outputTokens } = params;

    if (!provider || typeof provider !== 'string') {
      throw new Error('Provider is required and must be a string');
    }

    if (!modelId || typeof modelId !== 'number') {
      throw new Error('Model ID is required and must be a number');
    }

    if (!apiModelId || typeof apiModelId !== 'string') {
      throw new Error('API Model ID is required and must be a string');
    }

    if (typeof inputTokens !== 'number' || inputTokens < 0) {
      throw new Error('Input tokens must be a non-negative number');
    }

    if (typeof outputTokens !== 'number' || outputTokens < 0) {
      throw new Error('Output tokens must be a non-negative number');
    }
  }

  /**
   * Get model pricing data from models_stats_aa or models_price_score tables
   * @param {number} modelId - Database model ID
   * @param {string} apiModelId - API model identifier
   * @returns {Promise<Object>} Pricing data
   */
  async getModelPricing(modelId, apiModelId) {
    const { Model, ModelStatsAA, ModelModelStatsAA, ModelPriceScore } = this.db.sequelize.models;

    try {
      // Try to get pricing from models_stats_aa via relationship
      const modelStatsRel = await ModelModelStatsAA.findOne({
        where: { id_model: modelId },
        order: [['type', 'ASC']] // Prefer exact_match if present
      });

      if (modelStatsRel) {
        const statsAA = await ModelStatsAA.findByPk(modelStatsRel.id_model_aa);
        if (statsAA) {
          return {
            price_1m_input_tokens: Number(statsAA.price_1m_input_tokens) || 0,
            price_1m_output_tokens: Number(statsAA.price_1m_output_tokens) || 0,
            source: 'models_stats_aa'
          };
        }
      }

      // Try to get pricing from models_price_score table
      const priceScore = await ModelPriceScore.findOne({
        where: { id_model: modelId }
      });

      if (priceScore) {
        return {
          price_1m_input_tokens: Number(priceScore.price_1m_input_tokens) || 0,
          price_1m_output_tokens: Number(priceScore.price_1m_output_tokens) || 0,
          source: 'models_price_score'
        };
      }

      // Fallback: try to get model from database for error context
      const model = await Model.findByPk(modelId);
      if (!model) {
        throw new Error(`Model with ID ${modelId} not found`);
      }

      // Alert for missing pricing data and throw error
      console.error(`❌ Missing pricing data for model ${apiModelId} (Frontend ID: ${modelId})`);
      throw new Error(`Missing pricing data for model ${apiModelId} (Frontend ID: ${modelId}). Please contact support to add pricing for this model.`);

    } catch (error) {
      console.error('Error getting model pricing:', error);
      throw new Error(`Failed to get pricing for model ${apiModelId}: ${error.message}`);
    }
  }



  /**
   * Calculate base cost from tokens and pricing
   * @param {number} inputTokens - Number of input tokens
   * @param {number} outputTokens - Number of output tokens
   * @param {Object} pricingData - Pricing data object
   * @returns {number} Base cost in USD
   */
  calculateBaseCost(inputTokens, outputTokens, pricingData) {
    const inputCost = (inputTokens * pricingData.price_1m_input_tokens) / 1_000_000;
    const outputCost = (outputTokens * pricingData.price_1m_output_tokens) / 1_000_000;
    return inputCost + outputCost;
  }

  /**
   * Get markup configuration from aggregator_pricing_tiers
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} Markup configuration
   */
  async getMarkupConfiguration(provider) {
    const { Provider, AggregatorPricingTier } = this.db.sequelize.models;

    try {
      // Get provider ID
      const providerRecord = await Provider.findOne({
        where: { name: provider }
      });

      if (!providerRecord) {
        throw new Error(`Provider ${provider} not found`);
      }

      // Get current date for validity check
      const currentDate = new Date();

      // Get pricing tier with validity date checks
      const pricingTier = await AggregatorPricingTier.findOne({
        where: {
          id_aggregator_provider: providerRecord.id,
          tier_name: 'pay_as_you_go',
          is_active: true,
          effective_from: {
            [Op.lte]: currentDate
          },
          effective_until: {
            [Op.or]: [
              null,
              {
                [Op.gt]: currentDate
              }
            ]
          }
        },
        order: [['effective_from', 'DESC']] // Get the most recent valid tier
      });

      if (!pricingTier) {
        console.warn(`⚠️  No valid pricing tier found for provider ${provider}, using default markup`);
        return {
          markup_percentage: 15.0,
          markup_fixed: 0.005
        };
      }

      console.log(`✅ Using pricing tier for provider ${provider}:`, {
        tier_name: pricingTier.tier_name,
        markup_percentage: pricingTier.markup_percentage,
        markup_fixed: pricingTier.markup_fixed,
        effective_from: pricingTier.effective_from,
        effective_until: pricingTier.effective_until
      });

      return {
        markup_percentage: Number(pricingTier.markup_percentage) || 15.0,
        markup_fixed: Number(pricingTier.markup_fixed) || 0.005
      };

    } catch (error) {
      console.error('Error getting markup configuration:', error);
      // Return default markup configuration
      return {
        markup_percentage: 15.0,
        markup_fixed: 0.005
      };
    }
  }

  /**
   * Calculate markup based on base cost and markup configuration
   * @param {number} baseCost - Base cost in USD
   * @param {Object} markupConfig - Markup configuration
   * @returns {Object} Markup calculation breakdown
   */
  calculateMarkup(baseCost, markupConfig) {
    const fixedMarkup = markupConfig.markup_fixed;
    const percentageMarkup = baseCost * (markupConfig.markup_percentage / 100);
    const totalMarkup = fixedMarkup + percentageMarkup;

    return {
      fixed_markup: fixedMarkup,
      percentage_markup: percentageMarkup,
      total_markup: totalMarkup
    };
  }

  /**
   * Extract token usage from provider API response
   * @param {string} provider - Provider name
   * @param {Object} apiResponse - API response object
   * @returns {Object} Token usage {inputTokens, outputTokens}
   */
  extractTokensFromResponse(provider, apiResponse) {
    if (!apiResponse || !apiResponse.usage) {
      return { inputTokens: 0, outputTokens: 0 };
    }

    switch (provider.toLowerCase()) {
      case 'anthropic':
        return {
          inputTokens: apiResponse.usage.input_tokens || 0,
          outputTokens: apiResponse.usage.output_tokens || 0
        };

      case 'openai':
      case 'deepseek':
        return {
          inputTokens: apiResponse.usage.prompt_tokens || 0,
          outputTokens: apiResponse.usage.completion_tokens || 0
        };

      case 'together':
        return {
          inputTokens: apiResponse.usage.prompt_tokens || 0,
          outputTokens: apiResponse.usage.completion_tokens || 0
        };

      default:
        // Generic extraction
        return {
          inputTokens: apiResponse.usage.input_tokens || apiResponse.usage.prompt_tokens || 0,
          outputTokens: apiResponse.usage.output_tokens || apiResponse.usage.completion_tokens || 0
        };
    }
  }
}

module.exports = CostCalculator;