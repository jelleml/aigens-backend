/**
 * Model Management Utilities
 * 
 * Common utility functions for model formatting, validation, and processing
 * used across all provider adapters in the unified model management system.
 */

/**
 * Validates a StandardModel object against the expected schema
 * @param {Object} model - Model object to validate
 * @throws {Error} If validation fails
 */
function validateStandardModel(model) {
  const requiredFields = [
    'model_slug',
    'api_model_id', 
    'id_provider',
    'name',
    'description',
    'max_tokens',
    'is_active'
  ];

  // Check required fields
  for (const field of requiredFields) {
    if (!(field in model) || model[field] === null || model[field] === undefined) {
      throw new Error(`Required field '${field}' is missing or null in model object`);
    }
  }

  // Validate field types
  const typeValidations = {
    model_slug: 'string',
    api_model_id: 'string',
    id_provider: 'number',
    name: 'string',
    description: 'string',
    max_tokens: 'number',
    is_active: 'boolean'
  };

  for (const [field, expectedType] of Object.entries(typeValidations)) {
    const actualType = typeof model[field];
    if (actualType !== expectedType) {
      throw new Error(`Field '${field}' should be ${expectedType}, got ${actualType}`);
    }
  }

  // Validate field constraints
  if (model.model_slug.length === 0) {
    throw new Error('model_slug cannot be empty');
  }

  if (model.api_model_id.length === 0) {
    throw new Error('api_model_id cannot be empty');
  }

  if (model.max_tokens <= 0) {
    throw new Error('max_tokens must be greater than 0');
  }

  if (model.id_provider <= 0) {
    throw new Error('id_provider must be greater than 0');
  }

  // Validate optional pricing info if present
  if (model.pricing) {
    validatePricingInfo(model.pricing);
  }

  // Validate optional metadata if present
  if (model.metadata) {
    validateModelMetadata(model.metadata);
  }
}

/**
 * Validates pricing information object
 * @param {Object} pricing - Pricing object to validate
 * @throws {Error} If validation fails
 */
function validatePricingInfo(pricing) {
  const requiredFields = ['price_1m_input_tokens', 'price_1m_output_tokens'];
  
  for (const field of requiredFields) {
    if (!(field in pricing) || typeof pricing[field] !== 'number' || pricing[field] < 0) {
      throw new Error(`Pricing field '${field}' must be a non-negative number`);
    }
  }

  // Validate optional score fields
  const optionalScoreFields = ['score_cost_per_1k_tokens', 'score_intelligence', 'score_speed', 'score_overall'];
  
  for (const field of optionalScoreFields) {
    if (field in pricing && (typeof pricing[field] !== 'number' || pricing[field] < 0)) {
      throw new Error(`Pricing field '${field}' must be a non-negative number if provided`);
    }
  }
}

/**
 * Validates model metadata object
 * @param {Object} metadata - Metadata object to validate
 * @throws {Error} If validation fails
 */
function validateModelMetadata(metadata) {
  if (typeof metadata !== 'object' || metadata === null) {
    throw new Error('metadata must be an object');
  }

  // Validate optional fields if present
  const stringFields = ['owned_by', 'model_type'];
  const numberFields = ['context_length'];
  const arrayFields = ['supported_formats'];

  for (const field of stringFields) {
    if (field in metadata && typeof metadata[field] !== 'string') {
      throw new Error(`Metadata field '${field}' must be a string if provided`);
    }
  }

  for (const field of numberFields) {
    if (field in metadata && (typeof metadata[field] !== 'number' || metadata[field] <= 0)) {
      throw new Error(`Metadata field '${field}' must be a positive number if provided`);
    }
  }

  for (const field of arrayFields) {
    if (field in metadata && !Array.isArray(metadata[field])) {
      throw new Error(`Metadata field '${field}' must be an array if provided`);
    }
  }
}

/**
 * Normalizes a model slug to ensure consistency
 * @param {string} slug - Model slug to normalize
 * @returns {string} Normalized slug
 */
function normalizeModelSlug(slug) {
  if (typeof slug !== 'string') {
    throw new Error('Model slug must be a string');
  }

  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, '-') // Replace invalid chars with hyphens (removed . from allowed chars)
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 100); // Limit length to 100 characters
}

/**
 * Normalizes an API model ID to ensure consistency
 * @param {string} apiModelId - API model ID to normalize
 * @returns {string} Normalized API model ID
 */
function normalizeApiModelId(apiModelId) {
  if (typeof apiModelId !== 'string') {
    throw new Error('API model ID must be a string');
  }

  return apiModelId.trim();
}

/**
 * Creates a standardized model name from various inputs
 * @param {Object} options - Options for name creation
 * @param {string} options.apiModelId - API model identifier
 * @param {string} options.providerName - Provider name
 * @param {string} [options.displayName] - Optional display name from API
 * @param {string} [options.description] - Optional description from API
 * @returns {string} Standardized model name
 */
function createStandardModelName({ apiModelId, providerName, displayName, description }) {
  if (!apiModelId || !providerName) {
    throw new Error('apiModelId and providerName are required');
  }

  // Use display name if available, otherwise use API model ID
  let baseName = displayName || apiModelId;
  
  // Clean up the base name
  baseName = baseName.trim();
  
  // Add provider suffix if not already present
  const providerSuffix = `(${providerName})`;
  if (!baseName.includes(providerSuffix)) {
    baseName += ` ${providerSuffix}`;
  }

  return baseName;
}

/**
 * Creates a standardized model description
 * @param {Object} options - Options for description creation
 * @param {string} options.apiModelId - API model identifier
 * @param {string} options.providerName - Provider name
 * @param {string} [options.description] - Optional description from API
 * @param {string} [options.modelType] - Optional model type
 * @returns {string} Standardized model description
 */
function createStandardModelDescription({ apiModelId, providerName, description, modelType }) {
  if (!apiModelId || !providerName) {
    throw new Error('apiModelId and providerName are required');
  }

  // Use provided description if available
  if (description && description.trim().length > 0) {
    return description.trim();
  }

  // Generate description based on available information
  let desc = `${providerName} ${apiModelId} model`;
  
  if (modelType) {
    desc = `${providerName} ${apiModelId} ${modelType} model`;
  }

  return desc;
}

/**
 * Determines max tokens based on various inputs and fallbacks
 * @param {Object} options - Options for max tokens determination
 * @param {number} [options.maxTokens] - Explicit max tokens from API
 * @param {number} [options.contextLength] - Context length from API
 * @param {string} [options.apiModelId] - API model ID for pattern matching
 * @param {number} [options.defaultMaxTokens] - Default fallback value
 * @returns {number} Determined max tokens value
 */
function determineMaxTokens({ maxTokens, contextLength, apiModelId, defaultMaxTokens = 16000 }) {
  // Use explicit max tokens if provided
  if (maxTokens && typeof maxTokens === 'number' && maxTokens > 0) {
    return maxTokens;
  }

  // Use context length if provided
  if (contextLength && typeof contextLength === 'number' && contextLength > 0) {
    return contextLength;
  }

  // Try to determine from model ID patterns (common patterns)
  if (apiModelId && typeof apiModelId === 'string') {
    const modelId = apiModelId.toLowerCase();
    
    // Common high-context models
    if (modelId.includes('gpt-4o') || modelId.includes('claude-3') || modelId.includes('gemini-pro')) {
      return 128000;
    }
    
    // Medium context models
    if (modelId.includes('gpt-4') || modelId.includes('claude-2')) {
      return 32000;
    }
    
    // 16k context models
    if (modelId.includes('16k') || modelId.includes('gpt-3.5-turbo')) {
      return 16385;
    }
    
    // 8k context models
    if (modelId.includes('8k') || modelId.includes('gpt-4-base')) {
      return 8192;
    }
    
    // 4k context models (older models)
    if (modelId.includes('4k') || modelId.includes('davinci') || modelId.includes('curie')) {
      return 4096;
    }
  }

  // Return default fallback
  return defaultMaxTokens;
}

/**
 * Extracts and normalizes pricing information from raw provider data
 * @param {Object} rawPricing - Raw pricing data from provider
 * @param {Object} [fallbackPricing] - Fallback pricing if raw data is incomplete
 * @returns {Object|null} Normalized pricing object or null if no pricing available
 */
function extractPricingInfo(rawPricing, fallbackPricing = null) {
  if (!rawPricing && !fallbackPricing) {
    return null;
  }

  const pricing = rawPricing || fallbackPricing;
  
  // Extract input and output pricing
  const inputPrice = pricing.input_price || pricing.price_1m_input_tokens || pricing.input || 0;
  const outputPrice = pricing.output_price || pricing.price_1m_output_tokens || pricing.output || 0;

  if (inputPrice === 0 && outputPrice === 0) {
    return null;
  }

  const pricingInfo = {
    price_1m_input_tokens: Number(inputPrice),
    price_1m_output_tokens: Number(outputPrice)
  };

  // Add optional score fields if available
  if (pricing.score_cost_per_1k_tokens !== undefined) {
    pricingInfo.score_cost_per_1k_tokens = Number(pricing.score_cost_per_1k_tokens);
  }

  if (pricing.score_intelligence !== undefined) {
    pricingInfo.score_intelligence = Number(pricing.score_intelligence);
  }

  if (pricing.score_speed !== undefined) {
    pricingInfo.score_speed = Number(pricing.score_speed);
  }

  if (pricing.score_overall !== undefined) {
    pricingInfo.score_overall = Number(pricing.score_overall);
  }

  return pricingInfo;
}

/**
 * Compares two models to determine if they are equivalent
 * @param {Object} model1 - First model to compare
 * @param {Object} model2 - Second model to compare
 * @returns {boolean} True if models are equivalent
 */
function areModelsEquivalent(model1, model2) {
  if (!model1 || !model2) {
    return false;
  }

  // Compare key identifying fields
  return (
    model1.api_model_id === model2.api_model_id &&
    model1.id_provider === model2.id_provider &&
    model1.model_slug === model2.model_slug
  );
}

/**
 * Detects if a model has significant changes that warrant an update
 * @param {Object} existingModel - Existing model from database
 * @param {Object} newModel - New model data from provider
 * @returns {boolean} True if model has significant changes
 */
function hasSignificantChanges(existingModel, newModel) {
  if (!existingModel || !newModel) {
    return true;
  }

  // Check for changes in important fields
  const fieldsToCheck = ['name', 'description', 'max_tokens'];
  
  for (const field of fieldsToCheck) {
    if (existingModel[field] !== newModel[field]) {
      return true;
    }
  }

  // Check pricing changes if both have pricing
  if (existingModel.pricing && newModel.pricing) {
    if (
      existingModel.pricing.price_1m_input_tokens !== newModel.pricing.price_1m_input_tokens ||
      existingModel.pricing.price_1m_output_tokens !== newModel.pricing.price_1m_output_tokens
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Sanitizes model data to ensure it's safe for database insertion
 * @param {Object} model - Model object to sanitize
 * @returns {Object} Sanitized model object
 */
function sanitizeModelData(model) {
  const sanitized = { ...model };

  // Ensure string fields are properly trimmed and not too long
  const stringFields = ['model_slug', 'api_model_id', 'name', 'description'];
  
  for (const field of stringFields) {
    if (sanitized[field] && typeof sanitized[field] === 'string') {
      sanitized[field] = sanitized[field].trim();
      
      // Limit field lengths to prevent database errors
      const maxLengths = {
        model_slug: 100,
        api_model_id: 100,
        name: 255,
        description: 1000
      };
      
      if (maxLengths[field] && sanitized[field].length > maxLengths[field]) {
        sanitized[field] = sanitized[field].substring(0, maxLengths[field]);
      }
    }
  }

  // Ensure numeric fields are valid numbers
  const numericFields = ['max_tokens', 'id_provider'];
  
  for (const field of numericFields) {
    if (sanitized[field] !== undefined) {
      const num = Number(sanitized[field]);
      if (isNaN(num) || num <= 0) {
        throw new Error(`Invalid numeric value for field '${field}': ${sanitized[field]}`);
      }
      sanitized[field] = num;
    }
  }

  // Ensure boolean fields are proper booleans
  if (sanitized.is_active !== undefined) {
    sanitized.is_active = Boolean(sanitized.is_active);
  }

  return sanitized;
}

module.exports = {
  validateStandardModel,
  validatePricingInfo,
  validateModelMetadata,
  normalizeModelSlug,
  normalizeApiModelId,
  createStandardModelName,
  createStandardModelDescription,
  determineMaxTokens,
  extractPricingInfo,
  areModelsEquivalent,
  hasSignificantChanges,
  sanitizeModelData
};