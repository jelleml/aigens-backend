/**
 * AI SDK Provider Configuration
 * Maps internal provider names to AI SDK provider instances
 */

const { openai } = require('@ai-sdk/openai');
const { anthropic } = require('@ai-sdk/anthropic');
const config = require('./config');

/**
 * Provider mapping configuration
 * Maps our internal provider names to AI SDK provider instances
 */
const PROVIDER_MAPPING = {
  // Direct providers
  openai: {
    sdk: openai, // Use the function directly - it will read from OPENAI_API_KEY env var
    type: 'direct',
    supportedCapabilities: ['text', 'vision', 'tools', 'embedding', 'image'],
    defaultModel: 'gpt-4o-mini'
  },

  anthropic: {
    sdk: anthropic, // Use the function directly - it will read from ANTHROPIC_API_KEY env var
    type: 'direct',
    supportedCapabilities: ['text', 'vision', 'tools'],
    defaultModel: 'claude-3-5-sonnet-20241022'
  },

  // OpenRouter uses OpenAI SDK with custom base URL
  openrouter: {
    sdk: openai, // Use the function directly
    config: {
      apiKey: config.openrouter.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      compatibility: 'strict'
    },
    type: 'aggregator',
    supportedCapabilities: ['text', 'vision', 'tools'],
    defaultModel: 'anthropic/claude-3.5-sonnet'
  },

  // DeepSeek uses OpenAI-compatible API
  deepseek: {
    sdk: openai, // Use the function directly
    config: {
      apiKey: config.deepseek.apiKey,
      baseURL: 'https://api.deepseek.com',
      compatibility: 'strict'
    },
    type: 'direct',
    supportedCapabilities: ['text', 'tools'],
    defaultModel: 'deepseek-chat'
  },

  // Together AI uses OpenAI-compatible API  
  together: {
    sdk: openai, // Use the function directly
    config: {
      apiKey: config.together.apiKey,
      baseURL: 'https://api.together.xyz/v1',
      compatibility: 'strict'
    },
    type: 'aggregator',
    supportedCapabilities: ['text', 'vision', 'tools'],
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'
  }
};

/**
 * Model mapping for internal model slugs to AI SDK model identifiers
 */
const MODEL_MAPPING = {
  // OpenAI models
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4o-mini-openai': 'gpt-4o-mini', // Internal slug to API model ID
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-4': 'gpt-4',
  'gpt-3.5-turbo': 'gpt-3.5-turbo',
  'gpt-4-vision-preview': 'gpt-4-vision-preview',

  // OpenAI Embedding models
  'text-embedding-3-small': 'text-embedding-3-small',
  'text-embedding-3-large': 'text-embedding-3-large',
  'text-embedding-ada-002': 'text-embedding-ada-002',

  // OpenAI Image models
  'dall-e-3': 'dall-e-3',
  'dall-e-2': 'dall-e-2',

  // Anthropic models
  'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620': 'claude-3-5-sonnet-20240620',
  'claude-3-5-haiku-20241022': 'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229': 'claude-3-opus-20240229',
  'claude-3-sonnet-20240229': 'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307': 'claude-3-haiku-20240307',

  // OpenRouter models (use their API identifiers)
  'anthropic/claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o': 'openai/gpt-4o',
  'meta-llama/llama-3.1-8b-instruct': 'meta-llama/llama-3.1-8b-instruct',
  'google/gemini-pro-1.5': 'google/gemini-pro-1.5',

  // DeepSeek models
  'deepseek-chat': 'deepseek-chat',
  'deepseek-coder': 'deepseek-coder',

  // Together AI models
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'
};

/**
 * Get AI SDK provider instance for a given provider name
 * @param {string} providerName - Internal provider name
 * @returns {Object} AI SDK provider instance
 */
function getProvider(providerName) {
  const provider = PROVIDER_MAPPING[providerName.toLowerCase()];
  if (!provider) {
    throw new Error(`Provider ${providerName} not configured in AI SDK`);
  }
  return provider;
}

/**
 * Get AI SDK model identifier for internal model slug
 * @param {string} modelSlug - Internal model slug
 * @returns {string} AI SDK model identifier
 */
function getModelIdentifier(modelSlug) {
  const modelId = MODEL_MAPPING[modelSlug];
  if (!modelId) {
    // Fallback: use model slug as-is if no mapping found
    console.warn(`No AI SDK mapping found for model ${modelSlug}, using as-is`);
    return modelSlug;
  }
  return modelId;
}

/**
 * Get provider name from model slug
 * @param {string} modelSlug - Internal model slug  
 * @returns {string} Provider name
 */
function getProviderFromModel(modelSlug) {
  // OpenAI models
  if (modelSlug.startsWith('gpt-') ||
    modelSlug.startsWith('text-embedding-') ||
    modelSlug.startsWith('dall-e-')) {
    return 'openai';
  }

  // Anthropic models
  if (modelSlug.startsWith('claude-')) {
    return 'anthropic';
  }

  // DeepSeek models
  if (modelSlug.startsWith('deepseek-')) {
    return 'deepseek';
  }

  // OpenRouter models (contain provider prefix)
  if (modelSlug.includes('/')) {
    return 'openrouter';
  }

  // Together AI models (meta-llama prefix)
  if (modelSlug.startsWith('meta-llama/')) {
    return 'together';
  }

  throw new Error(`Cannot determine provider for model ${modelSlug}`);
}

/**
 * Check if provider supports a specific capability
 * @param {string} providerName - Provider name
 * @param {string} capability - Capability to check ('text', 'vision', 'tools')
 * @returns {boolean} Whether provider supports capability
 */
function supportsCapability(providerName, capability) {
  const provider = PROVIDER_MAPPING[providerName.toLowerCase()];
  return provider?.supportedCapabilities.includes(capability) || false;
}

module.exports = {
  PROVIDER_MAPPING,
  MODEL_MAPPING,
  getProvider,
  getModelIdentifier,
  getProviderFromModel,
  supportsCapability
};
