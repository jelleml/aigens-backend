#!/usr/bin/env node

/**
 * ⚠️  LEGACY SCRIPT - DEPRECATED ⚠️
 * 
 * UNIFIED MODEL INITIALIZATION SCRIPT (HARDCODED MODELS)
 * 
 * ⚠️  WARNING: This script uses HARDCODED model lists that become outdated quickly
 * 
 * 🔄 RECOMMENDED ALTERNATIVE:
 *   Use the modern Model Management System instead:
 *   npm run model-mgmt sync
 *   
 * This fetches live models directly from provider APIs and keeps them current.
 * 
 * LEGACY FUNCTIONALITY:
 * Initializes ALL models from ALL providers using hardcoded lists
 * 
 * IMPORTANT: This is STEP 1 of a 5-step process. For complete setup, use:
 *   node scripts/setup-init/setup-models-complete.js (ALSO LEGACY)
 * 
 * Or run individual steps in order:
 *   1. node scripts/setup-init/init-all-models-unified.js        (this script - LEGACY)
 *   2. node scripts/setup-init/populate-capabilities.js
 *   3. node scripts/setup-init/populate-models-capabilities.js
 *   4. node scripts/setup-init/populate-model-subscriptions.js
 * 
 * API MODEL ID MAPPING STRATEGY:
 * - api_model_id: The model_slug without the provider suffix (e.g., "gpt-4o-openai" -> "gpt-4o")
 * - model_slug: Internal database identifier (model_id + provider name)
 * - Uses regex /-[^-]+$/ to remove the last dash and everything after it
 * - This provides a consistent naming strategy across all providers
 */

const axios = require('axios');
const db = require('../../database');
const modelService = require('../../services/model.service');
const config = require('../../config/config');

/**
 * Get formatted OpenAI models
 */
const getOpenaiModels = (providerId, providerName) => {
  const models = [
    {
      model_id: 'gpt-4o',
      model_slug: `gpt-4o-${providerName}`,
      id_provider: providerId,
      name: 'GPT-4o',
      display_name: 'GPT-4o',
      description: 'Il modello più avanzato di OpenAI, con capacità multimodali e prestazioni superiori.',
      max_tokens: 128000,
      is_active: true
    },
    {
      model_id: 'gpt-4-turbo',
      model_slug: `gpt-4-turbo-${providerName}`,
      id_provider: providerId,
      name: 'GPT-4 Turbo',
      display_name: 'GPT-4 Turbo',
      description: 'Versione ottimizzata di GPT-4 con un buon equilibrio tra prestazioni e costo.',
      max_tokens: 128000,
      is_active: true
    },
    {
      model_id: 'gpt-4-vision-preview',
      model_slug: `gpt-4-vision-preview-${providerName}`,
      id_provider: providerId,
      name: 'GPT-4 Vision',
      display_name: 'GPT-4 Vision',
      description: 'Modello GPT-4 con capacità di analisi delle immagini.',
      max_tokens: 128000,
      is_active: true
    },
    {
      model_id: 'gpt-3.5-turbo',
      model_slug: `gpt-3-5-turbo-${providerName}`,
      id_provider: providerId,
      name: 'GPT-3.5 Turbo',
      display_name: 'GPT-3.5 Turbo',
      description: 'Modello economico con buone prestazioni per compiti generali.',
      max_tokens: 16000,
      is_active: true
    }
  ];

  // Set api_model_id to model_slug without provider suffix
  return models.map(model => ({
    ...model,
    api_model_id: model.model_slug.replace(/-[^-]+$/, '')
  }));
};

/**
 * Get formatted Anthropic models
 */
const getAnthropicModels = (providerId, providerName) => {
  const ANTHROPIC_MODELS = {
    "claude-3-opus": {
      name: "Claude 3 Opus",
      display_name: "Claude 3 Opus",
      description: "Il modello più potente e preciso di Anthropic, ideale per compiti complessi"
    },
    "claude-3-sonnet": {
      name: "Claude 3 Sonnet",
      display_name: "Claude 3 Sonnet",
      description: "Equilibrio ottimale tra intelligenza e velocità per la maggior parte dei casi d'uso"
    },
    "claude-3-haiku": {
      name: "Claude 3 Haiku",
      display_name: "Claude 3 Haiku",
      description: "Il modello più veloce ed economico, ideale per applicazioni ad alto volume"
    },
    "claude-3-5-sonnet-20241022": {
      name: "Claude 3.5 Sonnet",
      display_name: "Claude 3.5 Sonnet",
      description: "Versione migliorata di Claude 3 Sonnet con capacità avanzate"
    },
    "claude-3-7-sonnet": {
      name: "Claude 3.7 Sonnet",
      display_name: "Claude 3.7 Sonnet",
      description: "Ultima versione di Claude con capacità di ragionamento avanzate"
    },
    "claude-3-7-sonnet-20250219": {
      name: "Claude 3.7 Sonnet",
      display_name: "Claude 3.7 Sonnet",
      description: "Ultima versione di Claude con capacità di ragionamento avanzate"
    }
  };

  return Object.keys(ANTHROPIC_MODELS).map(modelId => {
    const modelInfo = ANTHROPIC_MODELS[modelId];
    const model_slug = `${modelId}-${providerName}`;
    return {
      model_id: modelId, // This is the actual API model ID
      model_slug: model_slug,
      api_model_id: model_slug.replace(/-[^-]+$/, ''),
      id_provider: providerId,
      name: modelInfo.name,
      display_name: modelInfo.display_name,
      description: modelInfo.description,
      max_tokens: 200000,
      is_active: true
    };
  });
};

/**
 * Get formatted DeepSeek models
 */
const getDeepseekModels = (providerId, providerName) => {
  const DEEPSEEK_MODELS = {
    'deepseek-chat': {
      name: 'Deepseek Chat',
      display_name: 'Deepseek Chat',
      description: 'Modello conversazionale generale di Deepseek'
    },
    'deepseek-coder': {
      name: 'Deepseek Coder',
      display_name: 'Deepseek Coder',
      description: 'Specializzato nella generazione e comprensione di codice'
    },
    'deepseek-lite': {
      name: 'Deepseek Lite',
      display_name: 'Deepseek Lite',
      description: 'Versione leggera ed economica per applicazioni ad alto volume'
    },
    'deepseek-vision': {
      name: 'Deepseek Vision',
      display_name: 'Deepseek Vision',
      description: 'Modello con capacità di comprensione delle immagini'
    }
  };

  return Object.keys(DEEPSEEK_MODELS).map(modelId => {
    const modelInfo = DEEPSEEK_MODELS[modelId];
    const model_slug = `${modelId}-${providerName}`;
    return {
      model_slug: model_slug,
      api_model_id: model_slug.replace(/-[^-]+$/, ''),
      id_provider: providerId,
      name: modelInfo.name,
      display_name: modelInfo.display_name,
      description: modelInfo.description,
      max_tokens: modelId.includes('lite') ? 16000 : 32000,
      is_active: true
    };
  });
};

/**
 * Get formatted Ideogram models
 */
const getIdeogramModels = (providerId, providerName) => {
  const IDEOGRAM_MODELS = {
    'ideogram-v1': {
      name: 'Ideogram V1',
      display_name: 'Ideogram V1',
      description: 'Modello base Ideogram V1'
    },
    'ideogram-alpha': {
      name: 'Ideogram Alpha',
      display_name: 'Ideogram Alpha',
      description: 'Modello Ideogram Alpha (alias V1)'
    },
    'ideogram-v2': {
      name: 'Ideogram V2',
      display_name: 'Ideogram V2',
      description: 'Modello Ideogram V2'
    },
    'ideogram-xl': {
      name: 'Ideogram XL',
      display_name: 'Ideogram XL',
      description: 'Modello Ideogram XL (alias V2)'
    },
    'ideogram-v3': {
      name: 'Ideogram V3',
      display_name: 'Ideogram V3',
      description: 'Modello Ideogram V3 (alta qualità)'
    }
  };

  return Object.keys(IDEOGRAM_MODELS).map(modelId => {
    const modelInfo = IDEOGRAM_MODELS[modelId];
    const model_slug = `${modelId}-${providerName}`;
    return {
      model_slug: model_slug,
      api_model_id: model_slug.replace(/-[^-]+$/, ''),
      id_provider: providerId,
      name: modelInfo.name,
      display_name: modelInfo.display_name,
      description: modelInfo.description,
      max_tokens: 0,
      is_active: true
    };
  });
};

/**
 * Fetch and format Together.ai models from API
 */
const getTogetherModels = async (providerId, providerName) => {
  try {
    const response = await axios.get('https://api.together.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${config.together.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const models = response.data;
    if (!models || !Array.isArray(models) || models.length === 0) {
      console.log('No Together.ai models found from API');
      return [];
    }

    const modelData = [];
    for (const model of models) {
      // Include chat, audio, and image models
      if (model.type === 'chat' || model.type === 'audio' || model.type === 'image') {
        // Clean model ID to create slug (remove special characters and slashes)
        const cleanModelId = model.id.replace(/[\/\s\.]/g, '-').replace(/--+/g, '-').toLowerCase();
        
        const model_slug = `${cleanModelId}-${providerName}`;
        modelData.push({
          model_slug: model_slug,
          api_model_id: model_slug.replace(/-[^-]+$/, ''),
          id_provider: providerId,
          name: model.display_name || model.id,
          display_name: model.display_name || model.id,
          description: `Together AI ${model.type} model: ${model.display_name || model.id}`,
          max_tokens: model.context_length || (model.type === 'image' ? 0 : 8192),
          is_active: true
        });
      }
    }

    return modelData;
  } catch (error) {
    console.error('Error fetching Together.ai models:', error.message);
    return [];
  }
};

/**
 * Fetch and format OpenRouter models from API
 */
const getOpenRouterModels = async (providerId, providerName) => {
  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${config.openrouter.apiKey}` }
    });

    const models = response.data.data;
    const modelData = [];

    for (const m of models) {
      const inputPricePerToken = parseFloat(m.pricing?.prompt || '0');
      const outputPricePerToken = parseFloat(m.pricing?.completion || '0');
      
      // Skip models with negative prices
      if (inputPricePerToken < 0 || outputPricePerToken < 0) {
        continue;
      }

      // Clean model ID to create slug (remove special characters and slashes)
      const cleanModelId = m.id.replace(/[\/\s\.]/g, '-').replace(/--+/g, '-').toLowerCase();

      const model_slug = `${cleanModelId}-${providerName}`;
      modelData.push({
        model_slug: model_slug,
        api_model_id: model_slug.replace(/-[^-]+$/, ''),
        id_provider: providerId,
        name: m.name,
        display_name: m.name,
        description: m.description,
        max_tokens: m.context_length || 16000,
        is_active: true
      });
    }

    return modelData;
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error.message);
    return [];
  }
};

/**
 * Determine source provider from model slug
 * For aggregator models, the format is: {source-provider-model-name}-{aggregator}
 * Examples:
 * - google-gemini-2-0-flash-exp:free-openrouter -> google
 * - black-forest-labs-flux-1-schnell-free-together -> black-forest-labs
 * - qwen-qwen2-5-coder-32b-instruct-together -> qwen
 */
const getSourceProviderFromModelSlug = (modelSlug) => {
  // Remove aggregator suffix first (together, openrouter)
  const aggregators = ['together', 'openrouter'];
  let cleanSlug = modelSlug;
  
  for (const aggregator of aggregators) {
    if (modelSlug.endsWith(`-${aggregator}`)) {
      cleanSlug = modelSlug.slice(0, -aggregator.length - 1); // Remove -{aggregator}
      break;
    }
  }
  
  // If no aggregator suffix found, this might be a direct provider model
  if (cleanSlug === modelSlug) {
    const parts = modelSlug.split('-');
    const lastPart = parts[parts.length - 1];
    const knownDirectProviders = ['anthropic', 'openai', 'deepseek', 'ideogram', 'google', 'perplexity'];
    if (knownDirectProviders.includes(lastPart)) {
      return lastPart;
    }
  }
  
  // Now extract the source provider from the beginning of the clean slug
  const modelSlugLower = cleanSlug.toLowerCase();
  
  // Define provider patterns in order of specificity (more specific patterns first)
  const providerPatterns = [
    { pattern: /^black-forest-labs-/, provider: 'black-forest-labs' },
    { pattern: /^togethercomputer-/, provider: 'together' },
    { pattern: /^deepseek-ai-/, provider: 'deepseek-ai' },
    { pattern: /^perplexity-ai-/, provider: 'perplexity-ai' },
    { pattern: /^arcee-ai-/, provider: 'arcee-ai' },
    { pattern: /^arcee_ai-/, provider: 'arcee_ai' },
    { pattern: /^marin-community-/, provider: 'marin-community' },
    { pattern: /^nousresearch-/, provider: 'nousresearch' },
    { pattern: /^scb10x-/, provider: 'scb10x' },
    { pattern: /^meta-llama-/, provider: 'meta' },
    { pattern: /^mistralai-/, provider: 'mistral' },
    { pattern: /^microsoft-/, provider: 'microsoft' },
    { pattern: /^x-ai-/, provider: 'x-ai' },
    { pattern: /^amazon-/, provider: 'amazon' },
    { pattern: /^minimax-/, provider: 'minimax' },
    { pattern: /^baidu-/, provider: 'baidu' },
    { pattern: /^openrouter-/, provider: 'openrouter' }, // Special case: openrouter as source provider
    { pattern: /^google-/, provider: 'google' },
    { pattern: /^nvidia-/, provider: 'nvidia' },
    { pattern: /^cartesia-/, provider: 'cartesia' },
    { pattern: /^eddiehou-/, provider: 'eddiehou' },
    { pattern: /^eddie-/, provider: 'eddie' },
    { pattern: /^lgai-/, provider: 'lgai' },
    { pattern: /^qwen-/, provider: 'qwen' },
    { pattern: /^anthropic-/, provider: 'anthropic' },
    { pattern: /^openai-/, provider: 'openai' },
    { pattern: /^deepseek-/, provider: 'deepseek' },
    { pattern: /^ideogram-/, provider: 'ideogram' },
    { pattern: /^stability-/, provider: 'stability' },
    { pattern: /^huggingface-/, provider: 'huggingface' },
    { pattern: /^cohere-/, provider: 'cohere' },
    { pattern: /^ai21-/, provider: 'ai21' },
    { pattern: /^meta-/, provider: 'meta' },
    { pattern: /^mistral-/, provider: 'mistral' },
    { pattern: /^tencent-/, provider: 'tencent' },
    { pattern: /^pygmalionai-/, provider: 'pygmalionai' },
    { pattern: /^gemma-/, provider: 'google' },
    { pattern: /^gemini-/, provider: 'google' },
    { pattern: /^llama-/, provider: 'meta' },
    { pattern: /^claude-/, provider: 'anthropic' },
    { pattern: /^gpt-/, provider: 'openai' },
    { pattern: /^flux-/, provider: 'black-forest-labs' },
    { pattern: /^stable-/, provider: 'stability' },
    { pattern: /^mixtral-/, provider: 'mistral' },
    { pattern: /^command-/, provider: 'cohere' },
    { pattern: /^jurassic-/, provider: 'ai21' },
    { pattern: /^grok-/, provider: 'x-ai' },
    { pattern: /^nova-/, provider: 'amazon' },
    { pattern: /^phi-/, provider: 'microsoft' },
    { pattern: /^wizardlm-/, provider: 'microsoft' },
    { pattern: /^ernie-/, provider: 'baidu' },
    { pattern: /^sonar-/, provider: 'perplexity' }
  ];
  
  // Check each pattern
  for (const { pattern, provider } of providerPatterns) {
    if (pattern.test(modelSlugLower)) {
      return provider;
    }
  }
  
  // Fallback: check for keywords in the slug
  if (modelSlugLower.includes('claude') || modelSlugLower.includes('anthropic')) {
    return 'anthropic';
  }
  if (modelSlugLower.includes('gpt') || modelSlugLower.includes('openai')) {
    return 'openai';
  }
  if (modelSlugLower.includes('llama') || modelSlugLower.includes('meta')) {
    return 'meta';
  }
  if (modelSlugLower.includes('mistral') || modelSlugLower.includes('mixtral')) {
    return 'mistral';
  }
  if (modelSlugLower.includes('command') || modelSlugLower.includes('cohere')) {
    return 'cohere';
  }
  if (modelSlugLower.includes('gemini') || modelSlugLower.includes('gemma')) {
    return 'google';
  }
  if (modelSlugLower.includes('deepseek')) {
    return 'deepseek';
  }
  if (modelSlugLower.includes('jurassic') || modelSlugLower.includes('ai21')) {
    return 'ai21';
  }
  if (modelSlugLower.includes('flux')) {
    return 'black-forest-labs';
  }
  if (modelSlugLower.includes('stable') || modelSlugLower.includes('stability')) {
    return 'stability';
  }
  if (modelSlugLower.includes('huggingface')) {
    return 'huggingface';
  }
  if (modelSlugLower.includes('qwen')) {
    return 'qwen';
  }
  if (modelSlugLower.includes('tencent')) {
    return 'tencent';
  }
  if (modelSlugLower.includes('pygmalion')) {
    return 'pygmalionai';
  }
  if (modelSlugLower.includes('grok') || modelSlugLower.includes('x-ai')) {
    return 'x-ai';
  }
  if (modelSlugLower.includes('nova') || modelSlugLower.includes('amazon')) {
    return 'amazon';
  }
  if (modelSlugLower.includes('phi') || modelSlugLower.includes('wizardlm') || modelSlugLower.includes('microsoft')) {
    return 'microsoft';
  }
  if (modelSlugLower.includes('minimax')) {
    return 'minimax';
  }
  if (modelSlugLower.includes('ernie') || modelSlugLower.includes('baidu')) {
    return 'baidu';
  }
  if (modelSlugLower.includes('perplexity') || modelSlugLower.includes('sonar')) {
    return 'perplexity';
  }
  
  // Default to community provider for individual developers/unknown sources
  console.log(`📝 Using community provider for model slug: ${modelSlug}`);
  return 'community';
};

/**
 * Create aggregated model relationships
 */
const createAggregatedModelRelationships = async (providerMap, models) => {
  const { Provider, Model, AggregatedModel, AggregatorPricingTier } = models;
  
  let totalRelationsCreated = 0;
  
  // Process aggregator providers
  const aggregators = ['together', 'openrouter'];
  
  for (const aggregatorName of aggregators) {
    const aggregatorProvider = providerMap[aggregatorName];
    if (!aggregatorProvider) {
      console.log(`⚠️  Aggregator '${aggregatorName}' not found, skipping relationships...`);
      continue;
    }

    console.log(`\n--- Processing aggregator: ${aggregatorName} ---`);

    // Get default pricing tier for this aggregator
    let defaultPricingTier = await AggregatorPricingTier.findOne({
      where: { 
        id_aggregator_provider: aggregatorProvider.id,
        tier_name: 'standard'
      }
    });

    // If no standard tier, use the first available tier
    if (!defaultPricingTier) {
      defaultPricingTier = await AggregatorPricingTier.findOne({
        where: { id_aggregator_provider: aggregatorProvider.id }
      });
    }

    if (!defaultPricingTier) {
      console.log(`⚠️  No pricing tier found for ${aggregatorName}, skipping...`);
      continue;
    }

    console.log(`  Using pricing tier: ${defaultPricingTier.tier_name} (ID: ${defaultPricingTier.id})`);

    // Get all models from this aggregator
    const aggregatorModels = await Model.findAll({
      where: { id_provider: aggregatorProvider.id }
    });

    console.log(`  Found ${aggregatorModels.length} models for ${aggregatorName}`);

    for (const aggregatedModel of aggregatorModels) {
      // Try to determine the source provider from model slug
      const sourceProviderName = getSourceProviderFromModelSlug(aggregatedModel.model_slug);
      if (!sourceProviderName) {
        console.log(`  ⚠️  Could not determine source provider for: ${aggregatedModel.model_slug}`);
        continue;
      }

      const sourceProvider = providerMap[sourceProviderName];
      if (!sourceProvider) {
        console.log(`  ⚠️  Source provider '${sourceProviderName}' not found in database for: ${aggregatedModel.model_slug}`);
        continue;
      }

      // Check if relationship already exists
      const existingRelation = await AggregatedModel.findOne({
        where: {
          id_aggregator_provider: aggregatorProvider.id,
          source_model_id: aggregatedModel.model_slug
        }
      });

      if (existingRelation) {
        // Update existing relation if source provider is different
        if (existingRelation.id_source_provider !== sourceProvider.id) {
          await existingRelation.update({
            id_source_provider: sourceProvider.id
          });
          console.log(`  🔄 Updated source provider for ${aggregatedModel.model_slug}: ${sourceProviderName}`);
        }
        continue;
      }

      // Create the aggregated model relationship
      try {
        await AggregatedModel.create({
          id_aggregator_provider: aggregatorProvider.id,
          id_source_provider: sourceProvider.id,
          id_model: aggregatedModel.id,
          source_model_id: aggregatedModel.model_slug,
          id_pricing_tier: defaultPricingTier.id,
          is_available: true
        });

        totalRelationsCreated++;
        console.log(`  ✅ Created relationship: ${aggregatedModel.model_slug} -> ${sourceProviderName} (via ${aggregatorName})`);
      } catch (error) {
        console.log(`  ❌ Error creating relationship for ${aggregatedModel.model_slug}: ${error.message}`);
      }
    }

    console.log(`  Created ${aggregatorModels.filter(m => getSourceProviderFromModelSlug(m.model_slug)).length} relationships for ${aggregatorName}`);
  }

  console.log(`\n✅ Total aggregated model relationships created: ${totalRelationsCreated}`);
};

/**
 * Main initialization function
 */
const initializeAllModels = async () => {
  try {
    console.log('=== UNIFIED MODEL INITIALIZATION ===');
    
    // Initialize database
    await db.initialize();
    const { Provider, AggregatorPricingTier } = db.models;

    // Get all provider IDs
    const providers = await Provider.findAll();
    const providerMap = {};
    providers.forEach(p => {
      providerMap[p.name] = p;
    });

    console.log(`Found ${providers.length} providers in database`);

    let totalModelsCreated = 0;
    const results = {};

    // Initialize models for each provider type
    const modelInitializers = [
      { name: 'openai', fn: () => getOpenaiModels(providerMap.openai?.id, 'openai') },
      { name: 'anthropic', fn: () => getAnthropicModels(providerMap.anthropic?.id, 'anthropic') },
      { name: 'deepseek', fn: () => getDeepseekModels(providerMap.deepseek?.id, 'deepseek') },
      { name: 'ideogram', fn: () => getIdeogramModels(providerMap.ideogram?.id, 'ideogram') },
      { name: 'together', fn: () => getTogetherModels(providerMap.together?.id, 'together') },
      { name: 'openrouter', fn: () => getOpenRouterModels(providerMap.openrouter?.id, 'openrouter') }
    ];

    for (const initializer of modelInitializers) {
      const provider = providerMap[initializer.name];
      if (!provider) {
        console.log(`⚠️  Provider '${initializer.name}' not found, skipping...`);
        continue;
      }

      console.log(`\n--- Initializing ${initializer.name} models ---`);
      
      try {
        const models = await initializer.fn();
        if (models && models.length > 0) {
          const createdModels = await modelService.initializeModels(models);
          results[initializer.name] = createdModels.length;
          totalModelsCreated += createdModels.length;
          console.log(`✅ ${initializer.name}: ${createdModels.length} models initialized`);
        } else {
          console.log(`⚠️  No models found for ${initializer.name}`);
          results[initializer.name] = 0;
        }
      } catch (error) {
        console.error(`❌ Error initializing ${initializer.name} models:`, error.message);
        results[initializer.name] = 0;
      }
    }

    // Create aggregated model relationships for aggregators
    console.log('\n--- Creating aggregated model relationships ---');
    await createAggregatedModelRelationships(providerMap, db.models);

    console.log('\n=== INITIALIZATION COMPLETE ===');
    console.log(`Total models initialized: ${totalModelsCreated}`);
    console.log('\nBreakdown by provider:');
    Object.keys(results).forEach(provider => {
      console.log(`  ${provider}: ${results[provider]} models`);
    });

    // Only close database and exit if running as standalone script
    if (require.main === module) {
      await db.close();
      process.exit(0);
    }

  } catch (error) {
    console.error('Error during unified model initialization:', error);
    if (require.main === module) {
      process.exit(1);
    } else {
      throw error; // Re-throw for parent script to handle
    }
  }
};

// Run if called directly
if (require.main === module) {
  initializeAllModels();
}

module.exports = { initializeAllModels };