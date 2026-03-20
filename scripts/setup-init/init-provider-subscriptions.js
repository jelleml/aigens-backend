#!/usr/bin/env node

/**
 * PROVIDER, SUBSCRIPTION & PRICING TIER INITIALIZATION SCRIPT
 * 
 * This script initializes the core database setup for providers, subscriptions, and pricing tiers.
 * This is a prerequisite before running the models setup.
 * 
 * IMPORTANT: This should be run BEFORE the models setup process.
 * 
 * Features:
 * - Proper transaction management
 * - Better CSV parsing with quote handling
 * - Input validation
 * - Configurable paths via environment variables
 * - Aggregator pricing tier initialization
 * 
 * Usage:
 *   node scripts/init-provider-subscriptions.js
 * 
 * Prerequisites:
 *   - Database must be running and accessible
 *   - Database tables must be created (run migrations first if needed)
 *   - subscriptions.csv file should be in uploads/ directory (optional)
 */

const db = require('../../database');
const fs = require('fs');
const path = require('path');

// Validation constants
const VALID_PROVIDER_TYPES = ['direct', 'indirect', 'both', 'aggregator'];

/**
 * Validate provider data
 */
const validateProviderData = (provider) => {
  if (!provider.name || typeof provider.name !== 'string') {
    throw new Error(`Invalid provider name: ${provider.name}`);
  }
  
  if (!VALID_PROVIDER_TYPES.includes(provider.provider_type)) {
    throw new Error(`Invalid provider type: ${provider.provider_type}. Must be one of: ${VALID_PROVIDER_TYPES.join(', ')}`);
  }
};

/**
 * Parse CSV with better handling of edge cases
 */
const parseCSVLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
};

/**
 * Initialize all providers in the database with transaction
 */
const initializeProviders = async (transaction) => {
  const { Provider } = db.models;
  if (!Provider) {
    throw new Error('Provider model not loaded');
  }

  const providers = [
    // Direct providers (we integrate directly)
    { name: 'anthropic', description: 'Anthropic AI - Creators of Claude', provider_type: 'direct' },
    { name: 'openai', description: 'OpenAI - Creators of GPT and DALL-E', provider_type: 'both' },
    { name: 'deepseek', description: 'DeepSeek AI - Conversational and coding AI models', provider_type: 'direct' },
    { name: 'ideogram', description: 'Ideogram - AI image generation', provider_type: 'direct' },
    { name: 'google', description: 'Google - Creators of Gemini', provider_type: 'both' },
    { name: 'google-veo', description: 'Google Veo - AI video generation', provider_type: 'direct' },
    { name: 'runway', description: 'Runway ML - AI video generation', provider_type: 'direct' },
    { name: 'perplexity', description: 'Perplexity AI - Conversational search engine', provider_type: 'direct' },

    // Indirect providers (only available through aggregators)
    { name: 'meta', description: 'Meta AI - Creators of Llama', provider_type: 'indirect' },
    { name: 'mistral', description: 'Mistral AI - Advanced open source models', provider_type: 'indirect' },
    { name: 'cohere', description: 'Cohere - Enterprise NLP models', provider_type: 'indirect' },
    { name: 'ai21', description: 'AI21 Labs - Creators of Jurassic', provider_type: 'indirect' },
    { name: 'stability', description: 'Stability AI - Creators of Stable Diffusion', provider_type: 'indirect' },
    { name: 'huggingface', description: 'Hugging Face - Open source ML platform', provider_type: 'indirect' },
    { name: 'black-forest-labs', description: 'Black Forest Labs - Creators of FLUX', provider_type: 'indirect' },
    { name: 'qwen', description: 'Qwen - Alibaba Cloud AI', provider_type: 'indirect' },
    { name: 'nvidia', description: 'NVIDIA - AI Computing Platform', provider_type: 'indirect' },
    { name: 'cartesia', description: 'Cartesia - AI Voice Technology', provider_type: 'indirect' },
    { name: 'eddie', description: 'Eddie AI - Model Provider', provider_type: 'indirect' },
    { name: 'arcee-ai', description: 'Arcee AI - Model Provider', provider_type: 'indirect' },
    { name: 'lgai', description: 'LG AI Research', provider_type: 'indirect' },
    { name: 'nousresearch', description: 'Nous Research - Open Source AI', provider_type: 'indirect' },
    { name: 'scb10x', description: 'SCB 10X - AI Research', provider_type: 'indirect' },
    { name: 'marin-community', description: 'Marin Community - AI Models', provider_type: 'indirect' },
    { name: 'eddiehou', description: 'Eddie Hou - AI Research', provider_type: 'indirect' },
    { name: 'tencent', description: 'Tencent - Chinese Technology Giant', provider_type: 'indirect' },
    { name: 'pygmalionai', description: 'PygmalionAI - Community AI Project', provider_type: 'indirect' },
    { name: 'x-ai', description: 'xAI - Elon Musk\'s AI Company (Grok)', provider_type: 'indirect' },
    { name: 'amazon', description: 'Amazon - AWS AI Services (Nova)', provider_type: 'indirect' },
    { name: 'microsoft', description: 'Microsoft - AI Research (Phi, WizardLM)', provider_type: 'indirect' },
    { name: 'minimax', description: 'MiniMax - Chinese AI Company', provider_type: 'indirect' },
    { name: 'baidu', description: 'Baidu - Chinese Tech Giant (Ernie)', provider_type: 'indirect' },
    { name: 'moonshot', description: 'Moonshot AI (Kimi-K2) ', provider_type: 'indirect' },
    { name: 'community', description: 'Community and Independent Developers', provider_type: 'indirect' },

    // Aggregator providers
    { name: 'together', description: 'Together AI - Open source model platform', provider_type: 'aggregator' },
    { name: 'openrouter', description: 'OpenRouter - Unified AI model gateway', provider_type: 'aggregator' }
  ];

  // Validate all provider data first
  providers.forEach(validateProviderData);

  const createdProviders = [];
  for (const providerData of providers) {
    const [provider, created] = await Provider.findOrCreate({
      where: { name: providerData.name },
      defaults: providerData,
      transaction
    });

    // Update existing providers with correct provider_type if needed
    if (!created && provider.provider_type !== providerData.provider_type) {
      await provider.update({
        provider_type: providerData.provider_type,
        description: providerData.description
      }, { transaction });
      console.log(`Provider updated: ${provider.name} -> ${providerData.provider_type}`);
    }

    createdProviders.push(provider);
    if (created) {
      console.log(`Provider created: ${provider.name} (${providerData.provider_type})`);
    } else {
      console.log(`Provider exists: ${provider.name} (${provider.provider_type})`);
    }
  }

  return createdProviders;
};

/**
 * Initialize provider subscriptions from CSV or fallback data
 */
const initializeSubscriptions = async (transaction) => {
  const { Provider, ProviderSubscription } = db.models;
  if (!Provider || !ProviderSubscription) {
    throw new Error('Provider or ProviderSubscription model not loaded');
  }

  // Get CSV path from environment or use default
  const csvPath = process.env.SUBSCRIPTIONS_CSV_PATH || path.join(__dirname, '../../uploads/subscriptions.csv');

  let subscriptionData = [];
  try {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.trim().split('\n');

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length >= 4 && values[0].trim()) {
        const cost = parseFloat(values[2].trim());
        if (isNaN(cost) || cost < 0) {
          console.warn(`Invalid cost for ${values[0]}: ${values[2]}`);
          continue;
        }
        
        subscriptionData.push({
          providerName: values[0].trim().toLowerCase(),
          name: values[1].trim(),
          cost: cost,
          source: values[3].trim()
        });
      }
    }
    console.log(`Loaded ${subscriptionData.length} subscriptions from CSV`);
  } catch (error) {
    console.warn('Error reading subscriptions CSV, using fallback data:', error.message);
    // Fallback data
    subscriptionData = [
      { providerName: 'anthropic', name: 'Pro', cost: 20.00, source: 'fallback' },
      { providerName: 'openai', name: 'Plus', cost: 20.00, source: 'fallback' },
      { providerName: 'ideogram', name: 'Basic', cost: 8.00, source: 'fallback' }
    ];
  }

  const createdSubscriptions = [];
  for (const subData of subscriptionData) {
    const provider = await Provider.findOne({ 
      where: { name: subData.providerName },
      transaction 
    });
    
    if (!provider) {
      console.log(`Provider not found: ${subData.providerName}`);
      continue;
    }

    const [subscription, created] = await ProviderSubscription.findOrCreate({
      where: {
        id_provider: provider.id,
        name: subData.name
      },
      defaults: {
        id_provider: provider.id,
        name: subData.name,
        cost: subData.cost,
        source: subData.source
      },
      transaction
    });

    createdSubscriptions.push(subscription);
    if (created) {
      console.log(`Subscription created: ${provider.name} - ${subscription.name}`);
    } else {
      console.log(`Subscription exists: ${provider.name} - ${subscription.name}`);
    }
  }

  return createdSubscriptions;
};

/**
 * Initialize or update aggregator pricing tiers
 * This function will update existing pricing tiers with new values
 * and create new ones if they don't exist
 */
const initializeAggregatorPricingTiers = async (transaction) => {
  const { Provider, AggregatorPricingTier } = db.models;
  if (!Provider || !AggregatorPricingTier) {
    throw new Error('Provider or AggregatorPricingTier model not loaded');
  }

  const aggregators = await Provider.findAll({
    where: { provider_type: 'aggregator' },
    transaction
  });

  const pricingTiers = [
    {
      tier_name: 'pay_as_you_go',
      markup_percentage: 15.0,
      markup_fixed: 0.001,
      description: 'Standard pay-as-you-go pricing with 15% markup'
    },
    {
      tier_name: 'premium',
      markup_percentage: 10.0,
      markup_fixed: 0.0005,
      description: 'Premium tier with reduced markup for high-volume users'
    }
  ];

  const updatedTiers = [];
  for (const aggregator of aggregators) {
    for (const tierData of pricingTiers) {
      // Cerca il tier esistente
      const existingTier = await AggregatorPricingTier.findOne({
        where: {
          id_aggregator_provider: aggregator.id,
          tier_name: tierData.tier_name
        },
        transaction
      });

      if (existingTier) {
        // Aggiorna il tier esistente con i nuovi valori
        await existingTier.update({
          markup_percentage: tierData.markup_percentage,
          markup_fixed: tierData.markup_fixed,
          description: tierData.description,
          is_active: true,
          effective_from: new Date(),
          updated_at: new Date()
        }, { transaction });
        
        console.log(`Pricing tier updated: ${aggregator.name} - ${existingTier.tier_name} (markup: ${tierData.markup_percentage}%, fixed: $${tierData.markup_fixed})`);
        updatedTiers.push(existingTier);
      } else {
        // Crea un nuovo tier se non esiste
        const newTier = await AggregatorPricingTier.create({
          id_aggregator_provider: aggregator.id,
          ...tierData,
          is_active: true,
          effective_from: new Date()
        }, { transaction });
        
        console.log(`Pricing tier created: ${aggregator.name} - ${newTier.tier_name}`);
        updatedTiers.push(newTier);
      }
    }
  }

  return updatedTiers;
};

/**
 * Complete initialization with proper transaction management
 */
const initializeFromScratch = async () => {
  const transaction = await db.sequelize.transaction();
  
  try {
    console.log('🚀 INITIALIZING DATABASE FROM SCRATCH');
    console.log('====================================\n');
    
    // Initialize database connection
    if (!db.initialized) {
      await db.initialize();
    }

    // 1. Initialize providers
    console.log('📋 STEP 1: Initializing providers...');
    await initializeProviders(transaction);
    console.log('✅ Providers initialized\n');

    // 2. Initialize subscriptions
    console.log('💳 STEP 2: Initializing subscriptions...');
    await initializeSubscriptions(transaction);
    console.log('✅ Subscriptions initialized\n');

    // 3. Initialize or update aggregator pricing tiers
    console.log('💰 STEP 3: Initializing/updating aggregator pricing tiers...');
    await initializeAggregatorPricingTiers(transaction);
    console.log('✅ Pricing tiers initialized/updated\n');

    await transaction.commit();
    console.log('🎉 BASE INITIALIZATION COMPLETED!');
    console.log('====================================');
    
    await db.close();
    process.exit(0);

  } catch (error) {
    await transaction.rollback();
    console.error('❌ ERROR DURING INITIALIZATION:', error);
    console.log('\n💡 SUGGESTIONS:');
    console.log('1. Verify that the database is running');
    console.log('2. Check connection configurations');
    console.log('3. Ensure tables have been created (migrations)');
    
    await db.close();
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  initializeFromScratch();
}

module.exports = {
  initializeProviders,
  initializeSubscriptions,
  initializeAggregatorPricingTiers,
  initializeFromScratch
};