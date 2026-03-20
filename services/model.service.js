// Importazione delle dipendenze
const db = require('../database');
const { Op } = require('sequelize');

/**
 * Inizializza i modelli AI nel database
 * @param {Array} modelsData - Array di dati dei modelli da inizializzare
 * @returns {Promise<Array>} Array di modelli inizializzati
 */
const initializeModels = async (modelsData) => {
  const Model = db.models.Model;
  const initializedModels = [];
  for (const modelData of modelsData) {
    try {
      const model = await Model.create(modelData);
      initializedModels.push(model);
    } catch (err) {
      // Skip duplicate key errors (model already exists)
      if (err.name === 'SequelizeUniqueConstraintError' || (err.parent && err.parent.code === 'ER_DUP_ENTRY')) {
        continue;
      } else {
        throw err;
      }
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return initializedModels;
};

/**
 * Ottiene un modello dal database in base al suo slug
 * @param {string} modelSlug - Slug del modello (es. claude-3-opus-anthropic)
 * @returns {Promise<Object|null>} Modello trovato o null
 */
const getModelByModelSlug = async (modelSlug) => {
  const Model = db.models.Model;
  return await Model.findOne({ where: { model_slug: modelSlug } });
};

/**
 * @deprecated Use getModelByModelSlug instead
 */
const getModelByModelId = async (modelId) => {
  return await getModelByModelSlug(modelId);
};

/**
 * Ottiene tutti i modelli attivi dal database
 * @param {string} provider - Provider opzionale per filtrare i modelli
 * @returns {Promise<Array>} Array di modelli attivi
 */
const getActiveModels = async (provider = null) => {
  const Model = db.models.Model;
  const whereClause = { is_active: true };

  if (provider) {
    whereClause.provider = provider;
  }

  return await Model.findAll({
    where: whereClause,
    include: [
      {
        model: db.models.Provider,
        as: 'provider',
        attributes: ['name']
      }
    ]
  });
};

/**
 * Ottiene tutti i modelli attivi con capabilities e pricing per il frontend
 * @returns {Promise<Array>} Array di modelli con tutte le informazioni necessarie
 */
const getModelsForFrontend = async () => {
  const Model = db.models.Model;
  const Provider = db.models.Provider;
  const ModelsCapability = db.models.ModelsCapability;
  const ModelStatsAA = db.models.ModelStatsAA;

  return await Model.findAll({
    where: { is_active: true },
    include: [
      {
        model: Provider,
        as: 'provider',
        attributes: ['name']
      },
      {
        model: ModelsCapability,
        as: 'modelsCapabilities',
        attributes: ['id', 'name', 'type', 'description'],
        through: { attributes: [] }
      },
      {
        model: ModelStatsAA,
        as: 'modelStatsAA',
        attributes: ['price_1m_input_tokens', 'price_1m_output_tokens'],
        through: { attributes: [] }
      }
    ],
    order: [
      ['provider', 'name'],
      ['name']
    ]
  });
};

/**
 * Calcola e aggiorna il rapporto di output per un modello specifico
 * @param {number} modelId - ID interno del modello
 * @returns {Promise<Object>} Modello aggiornato
 */
const updateModelOutputRatio = async (modelId) => {
  const Model = db.models.Model;
  const MessageCost = db.models.MessageCost;
  // Ottieni il modello dal database
  const model = await Model.findByPk(modelId);

  if (!model) {
    throw new Error(`Modello con ID ${modelId} non trovato`);
  }

  // Ottieni tutti i messaggi con rapporto di output reale per questo modello
  const messageCosts = await MessageCost.findAll({
    where: {
      model_id: modelId,
      real_output_ratio: { [Op.not]: null }
    },
    attributes: ['real_output_ratio']
  });

  if (messageCosts.length === 0) {
    return model; // Nessun dato disponibile per aggiornare il rapporto
  }

  // Calcola la media dei rapporti di output reali
  const totalRatio = messageCosts.reduce((sum, cost) => sum + cost.real_output_ratio, 0);
  const averageRatio = totalRatio / messageCosts.length;

  // Aggiorna il modello con il nuovo rapporto di output
  model.output_ratio = averageRatio;
  await model.save();

  return model;
};

/**
 * Calcola e aggiorna il rapporto di output per un modello specifico in base al suo slug
 * @param {string} modelSlug - Slug del modello (es. claude-3-opus-anthropic)
 * @returns {Promise<Object>} Modello aggiornato
 */
const updateModelOutputRatioByModelSlug = async (modelSlug) => {
  const model = await getModelByModelSlug(modelSlug);

  if (!model) {
    throw new Error(`Modello con slug ${modelSlug} non trovato`);
  }

  return await updateModelOutputRatio(model.id);
};

/**
 * @deprecated Use updateModelOutputRatioByModelSlug instead
 */
const updateModelOutputRatioByModelId = async (modelId) => {
  return await updateModelOutputRatioByModelSlug(modelId);
};

/**
 * Calcola e salva i rapporti di output per un messaggio
 * @param {Object} messageCost - Oggetto MessageCost
 * @param {number} inputTokens - Numero di token di input
 * @param {number} outputTokens - Numero di token di output
 * @returns {Promise<Object>} MessageCost aggiornato
 */
const calculateAndSaveOutputRatios = async (messageCost, inputTokens, outputTokens) => {
  const MessageCost = db.models.MessageCost;
  // Calcola il rapporto di output reale
  if (inputTokens > 0) {
    messageCost.real_output_ratio = outputTokens / inputTokens;
  }

  // Salva il MessageCost aggiornato
  await messageCost.save();

  // Se abbiamo un model_id, aggiorniamo il rapporto di output del modello
  if (messageCost.model_id) {
    await updateModelOutputRatio(messageCost.model_id);
  }

  return messageCost;
};

/**
 * Ottiene il rapporto di output stimato per un modello
 * @param {string} modelSlug - Slug del modello (es. claude-3-opus-anthropic)
 * @returns {Promise<number>} Rapporto di output stimato
 */
const getEstimatedOutputRatio = async (modelSlug) => {
  const model = await getModelByModelSlug(modelSlug);

  if (!model) {
    // Valore predefinito se il modello non è trovato
    return 1.5;
  }

  return model.output_ratio;
};

/**
 * Recupera i dati di pricing per un modello
 * - Se provider diretto: ritorna la subscription associata
 * - Se aggregatore: ritorna il pricing tier associato
 */
const getModelPricing = async (modelSlug) => {
  const Model = db.models.Model;
  const Provider = db.models.Provider;
  const ModelsSubscription = db.models.ModelsSubscription;
  const ProviderSubscription = db.models.ProviderSubscription;
  const AggregatedModel = db.models.AggregatedModel;
  const AggregatorPricingTier = db.models.AggregatorPricingTier;

  // Try to find by api_model_id first, then by model_slug
  let model = await Model.findOne({ where: { api_model_id: modelSlug } });
  if (!model) {
    model = await Model.findOne({ where: { model_slug: modelSlug } });
  }
  if (!model) throw new Error('Modello non trovato');

  const provider = await Provider.findByPk(model.id_provider);
  if (!provider) throw new Error('Provider non trovato');

  if (provider.provider_type === 'aggregator') {
    // Aggregatore: cerca in aggregated_models e aggregator_pricing_tiers
    const aggModel = await AggregatedModel.findOne({ where: { source_model_id: model.model_slug } });
    if (!aggModel) throw new Error('Aggregated model non trovato');
    const tier = await AggregatorPricingTier.findByPk(aggModel.id_pricing_tier);
    if (!tier) throw new Error('Pricing tier non trovato');
    return { type: 'aggregator', tier, model, provider };
  } else {
    // Provider diretto: cerca la subscription (opzionale)
    const modelSub = await ModelsSubscription.findOne({ where: { id_model: model.id } });
    let subscription = null;
    if (modelSub) {
      subscription = await ProviderSubscription.findByPk(modelSub.id_subscription);
    }

    if (!subscription) {
      console.warn(`⚠️  No subscription found for model ${model.model_slug}, but this is not mandatory`);
    }

    // Verifica che ci sia almeno un record di prezzo (models_price_score o models_stats_aa)
    const ModelPriceScore = db.models.ModelPriceScore;
    const ModelStatsAA = db.models.ModelStatsAA;
    const ModelModelStatsAA = db.models.ModelModelStatsAA;

    // Cerca in models_price_score
    const priceScore = await ModelPriceScore.findOne({ where: { id_model: model.id } });

    // Cerca in models_stats_aa via relazione
    const statsRelation = await ModelModelStatsAA.findOne({ where: { id_model: model.id } });
    let statsAA = null;
    if (statsRelation) {
      statsAA = await ModelStatsAA.findByPk(statsRelation.id_model_aa);
    }

    // Se non c'è né price_score né stats_aa, è un errore
    if (!priceScore && !statsAA) {
      throw new Error(`Missing pricing data for model ${model.model_slug}. No record found in models_price_score or models_stats_aa tables. Please contact support to add pricing for this model.`);
    }

    return { type: 'direct', subscription, model, provider, priceScore, statsAA };
  }
};

/**
 * Ottiene tutti i modelli unificati senza duplicati concettuali
 * Normalizza i model_slug rimuovendo il suffisso del provider
 * e raggruppa i modelli per evitare duplicati
 * @returns {Promise<Array>} Array di modelli unificati con informazioni complete
 */
const getUnifiedModels = async () => {
  const Model = db.models.Model;
  const Provider = db.models.Provider;
  const ModelsCapability = db.models.ModelsCapability;
  const ModelStatsAA = db.models.ModelStatsAA;
  const AggregatedModel = db.models.AggregatedModel;
  const ModelPriceScore = db.models.ModelPriceScore;

  // Ottieni tutti i modelli attivi con le loro relazioni
  const allModels = await Model.findAll({
    where: { is_active: true },
    include: [
      {
        model: Provider,
        as: 'provider',
        attributes: ['id', 'name', 'provider_type']
      },
      {
        model: ModelsCapability,
        as: 'modelsCapabilities',
        attributes: ['id', 'name', 'type', 'description'],
        through: { attributes: [] }
      },
      {
        model: ModelStatsAA,
        as: 'modelStatsAA',
        attributes: ['id', 'price_1m_input_tokens', 'price_1m_output_tokens'],
        through: { attributes: [] }
      },
      {
        model: ModelPriceScore,
        as: 'modelPriceScore',
        attributes: ['id', 'price_image', 'price_video'],
        required: false
      },
      {
        model: AggregatedModel,
        as: 'aggregatedModelInfo',
        attributes: ['id', 'source_model_id', 'id_source_provider'],
        include: [
          {
            model: Provider,
            as: 'sourceProvider',
            attributes: ['id', 'name', 'provider_type']
          }
        ]
      }
    ],
    order: [
      ['provider', 'name'],
      ['name']
    ]
  });

  // Funzione per normalizzare il model_slug rimuovendo il suffisso del provider
  const normalizeModelSlug = (modelSlug, providerName) => {
    // Rimuove il suffisso del provider dal model_slug
    // es. "deepseek-lite-deepseek" -> "deepseek-lite"
    // es. "qwen-qwen-3-235ba22b-fp8-tput-together" -> "qwen-qwen-3-235ba22b-fp8-tput"

    const providerSuffix = `-${providerName.toLowerCase()}`;
    if (modelSlug.endsWith(providerSuffix)) {
      return modelSlug.slice(0, -providerSuffix.length);
    }
    return modelSlug;
  };

  // Funzione per inferire il provider sorgente dal model_slug per modelli aggregati
  const inferSourceProviderFromSlug = (modelSlug, allProviders) => {
    // Mappa di prefissi comuni a provider noti
    const providerPrefixes = {
      'meta-llama': 'meta',
      'anthropic': 'anthropic',
      'openai': 'openai',
      'google': 'google',
      'mistralai': 'mistral',
      'mistral': 'mistral',
      'cohere': 'cohere',
      'ai21': 'ai21',
      'stability': 'stability',
      'black-forest-labs': 'stability', // FLUX models are from Stability/Black Forest Labs
      'cartesia': 'cartesia', // Audio models
      'qwen': 'meta', // Qwen is often grouped with meta models
      'deepseek': 'deepseek'
    };

    // Cerca il prefisso più lungo che corrisponde
    let longestMatch = '';
    let matchedProvider = null;

    for (const [prefix, providerName] of Object.entries(providerPrefixes)) {
      if (modelSlug.toLowerCase().startsWith(prefix.toLowerCase()) && prefix.length > longestMatch.length) {
        longestMatch = prefix;
        const provider = allProviders.find(p => p.name.toLowerCase() === providerName.toLowerCase());
        if (provider) {
          matchedProvider = provider;
        }
      }
    }

    return matchedProvider;
  };

  // Ottieni tutti i provider per la funzione di inferenza
  const allProviders = await Provider.findAll({ attributes: ['id', 'name', 'provider_type'] });

  // Mappa per tenere traccia dei modelli già processati
  const modelMap = new Map();

  // Elabora ogni modello
  allModels.forEach(model => {
    const provider = model.provider;
    let normalizedSlug, actualProvider, aggregatorProvider = null;

    // Se è un aggregatore, usa le informazioni del provider sorgente
    if (provider.provider_type === 'aggregator') {
      normalizedSlug = normalizeModelSlug(model.model_slug, provider.name);
      aggregatorProvider = provider;

      // Prova a ottenere il provider sorgente dalle relazioni
      if (model.aggregatedModelInfo.length > 0) {
        const aggregatedInfo = model.aggregatedModelInfo[0];
        actualProvider = aggregatedInfo.sourceProvider;

        // Se il provider sorgente non è valido o è lo stesso aggregatore, prova a inferirlo dal slug
        if (!actualProvider || actualProvider.provider_type === 'aggregator') {
          actualProvider = inferSourceProviderFromSlug(model.model_slug, allProviders) || provider;
        }
      } else {
        // Nessuna info aggregata, inferisci dal slug
        actualProvider = inferSourceProviderFromSlug(model.model_slug, allProviders) || provider;
      }
    } else {
      actualProvider = provider;
      normalizedSlug = normalizeModelSlug(model.model_slug, provider.name);
    }

    // Controlla se abbiamo già processato questo modello normalizzato
    if (modelMap.has(normalizedSlug)) {
      const existingModel = modelMap.get(normalizedSlug);

      // Regole di priorità per la selezione del modello:
      // 1. Se il provider attuale è 'direct' o 'both', preferiscilo sempre
      // 2. Se entrambi sono aggregatori, preferisci OpenRouter > Together AI
      // 3. Altrimenti mantieni il primo trovato

      const shouldReplace =
        // Caso 1: Il nuovo modello è diretto/both e quello esistente è aggregato
        ((actualProvider.provider_type === 'direct' || actualProvider.provider_type === 'both') &&
          existingModel.provider.provider_type === 'aggregator') ||

        // Caso 2: Entrambi sono aggregatori, ma il nuovo è OpenRouter e quello esistente è Together
        (provider.provider_type === 'aggregator' &&
          existingModel.provider.provider_type === 'aggregator' &&
          provider.name.toLowerCase() === 'openrouter' &&
          existingModel.provider.name.toLowerCase() === 'together');

      if (shouldReplace) {
        modelMap.set(normalizedSlug, {
          ...model.toJSON(),
          normalizedSlug,
          actualProvider,
          aggregatorProvider
        });
      }
    } else {
      // Nuovo modello, aggiungilo alla mappa
      modelMap.set(normalizedSlug, {
        ...model.toJSON(),
        normalizedSlug,
        actualProvider,
        aggregatorProvider
      });
    }
  });

  // Converti la mappa in array e formatta i risultati, filtrando i modelli senza provider valido
  const unifiedModels = Array.from(modelMap.values())
    .filter(model => {
      // Escludi modelli dove il provider è ancora un aggregatore (openrouter/together)
      // e non abbiamo un provider sorgente valido
      const isAggregatorProvider = model.actualProvider.name.toLowerCase() === 'openrouter' ||
        model.actualProvider.name.toLowerCase() === 'together';

      if (isAggregatorProvider) {
        // Verifica se abbiamo un provider sorgente valido dalle relazioni
        if (model.aggregatedModelInfo && model.aggregatedModelInfo.length > 0) {
          const sourceProvider = model.aggregatedModelInfo[0].sourceProvider;
          return sourceProvider && sourceProvider.provider_type !== 'aggregator';
        }
        // Se non abbiamo info aggregate o il provider sorgente non è valido, escludi il modello
        return false;
      }

      return true; // Mantieni tutti gli altri modelli
    })
    .map(model => {
      const statsAA = model.modelStatsAA && model.modelStatsAA.length > 0 ? model.modelStatsAA[0] : null;
      const priceScore = model.modelPriceScore && model.modelPriceScore.length > 0 ? model.modelPriceScore[0] : null;
      const isAggregated = model.aggregatorProvider !== null;

      // Determina il provider da mostrare
      let displayProvider = model.actualProvider.name;

      // Se il modello è aggregato e abbiamo info sul provider sorgente, usalo
      if (model.aggregatorProvider && model.aggregatedModelInfo && model.aggregatedModelInfo.length > 0) {
        const sourceProvider = model.aggregatedModelInfo[0].sourceProvider;
        if (sourceProvider && sourceProvider.provider_type !== 'aggregator') {
          displayProvider = sourceProvider.name;
        }
      }

      const result = {
        id: model.id,
        name: model.name,
        display_name: model.display_name,
        model_name: model.normalizedSlug,
        slug: model.model_slug,
        description: model.description,
        provider: displayProvider,
        capabilities: model.modelsCapabilities || [],
        pricing: {
          cost_input: statsAA ? statsAA.price_1m_input_tokens : null,
          cost_output: statsAA ? statsAA.price_1m_output_tokens : null
        },
        max_tokens: model.max_tokens,
        is_active: model.is_active,
        is_aggregated: isAggregated,
        price_image: priceScore ? priceScore.price_image : null,
        price_video: priceScore ? priceScore.price_video : null
      };

      // Add aggregator provider info if this model comes from an aggregator
      if (isAggregated && model.aggregatorProvider) {
        result.aggregator_provider = model.aggregatorProvider.name;
      }

      return result;
    });

  return unifiedModels;
};

/**
 * Retrieves comprehensive model and provider information for service resolution
 * @param {string} modelSlug - The model identifier to look up (e.g., 'claude-3-opus-anthropic')
 * @returns {Promise<Object>} Structured object with model, provider, and aggregation information
 * @throws {Error} If model is not found or database error occurs
 */
const getModelServiceInfo = async (modelSlug) => {
  // Input validation
  if (!modelSlug) {
    throw new Error('Model slug is required');
  }

  if (typeof modelSlug !== 'string') {
    throw new Error(`Invalid model slug format: expected string, got ${typeof modelSlug}`);
  }

  // Trim whitespace and validate format
  const trimmedSlug = modelSlug.trim();
  if (trimmedSlug.length === 0) {
    throw new Error('Model slug cannot be empty');
  }

  // Log the request
  console.log(`Model Service: Retrieving service info for model: ${trimmedSlug}`);

  try {
    const Model = db.models.Model;
    const Provider = db.models.Provider;
    const AggregatedModel = db.models.AggregatedModel;

    // Query model with provider and aggregation information
    const modelInfo = await Model.findOne({
      where: { api_model_id: trimmedSlug },
      include: [
        {
          model: Provider,
          as: 'provider',
          attributes: ['id', 'name', 'provider_type'],
          required: true
        },
        {
          model: AggregatedModel,
          as: 'aggregatedModelInfo',
          attributes: ['id', 'id_aggregator_provider', 'id_source_provider', 'source_model_id'],
          required: false,
          include: [
            {
              model: Provider,
              as: 'aggregatorProvider',
              attributes: ['id', 'name', 'provider_type']
            },
            {
              model: Provider,
              as: 'sourceProvider',
              attributes: ['id', 'name', 'provider_type']
            }
          ]
        }
      ]
    });

    if (!modelInfo) {
      console.warn(`Model Service: Model not found in database: ${trimmedSlug}`);
      throw new Error(`Model not found: ${trimmedSlug}`);
    }

    if (!modelInfo.provider) {
      console.warn(`Model Service: Provider not found for model: ${trimmedSlug}`);
      throw new Error(`Provider not found for model: ${trimmedSlug}`);
    }

    // Structure the response according to the design specification
    const result = {
      model: {
        id: modelInfo.id,
        model_slug: modelInfo.model_slug,
        api_model_id: modelInfo.api_model_id,
        id_provider: modelInfo.id_provider
      },
      provider: {
        id: modelInfo.provider.id,
        name: modelInfo.provider.name,
        provider_type: modelInfo.provider.provider_type
      },
      aggregatedInfo: null
    };

    // Add aggregation information if available
    if (modelInfo.aggregatedModelInfo && modelInfo.aggregatedModelInfo.length > 0) {
      const aggInfo = modelInfo.aggregatedModelInfo[0];
      result.aggregatedInfo = {
        id_aggregator_provider: aggInfo.id_aggregator_provider,
        id_source_provider: aggInfo.id_source_provider,
        source_model_id: aggInfo.source_model_id,
        aggregatorProvider: aggInfo.aggregatorProvider ? {
          id: aggInfo.aggregatorProvider.id,
          name: aggInfo.aggregatorProvider.name,
          provider_type: aggInfo.aggregatorProvider.provider_type
        } : null,
        sourceProvider: aggInfo.sourceProvider ? {
          id: aggInfo.sourceProvider.id,
          name: aggInfo.sourceProvider.name,
          provider_type: aggInfo.sourceProvider.provider_type
        } : null
      };
    }

    console.log(`Model Service: Successfully retrieved service info for model: ${trimmedSlug}, provider: ${result.provider.name}, type: ${result.provider.provider_type}`);
    return result;

  } catch (error) {
    // Handle database connection errors
    if (error.name === 'SequelizeConnectionError' || error.name === 'SequelizeConnectionRefusedError') {
      console.error(`Model Service: Database connection error while retrieving model service info: ${error.message}`);
      throw new Error(`Database connection error: Unable to retrieve model information. Please try again later.`);
    }

    // Handle other database errors
    if (error.name === 'SequelizeError' || error.name === 'SequelizeDatabaseError') {
      console.error(`Model Service: Database error while retrieving model service info: ${error.message}`);
      throw new Error(`Database error while retrieving model service info: ${error.message}`);
    }

    // Log and re-throw application errors
    if (!error.message.startsWith('Model not found') && !error.message.startsWith('Provider not found')) {
      console.error(`Model Service: Error retrieving service info for model ${trimmedSlug}:`, error);
    }

    throw error;
  }
};

/**
 * Service mapping configuration for provider-to-service relationships
 * Maps provider names (lowercase) to their corresponding service module names
 */
const SERVICE_MAPPING = {
  'anthropic': 'anthropicService',
  'openai': 'openaiService',
  'deepseek': 'deepseekService',
  'ideogram': 'ideogramService',
  'together': 'togetherService',
  'openrouter': 'openrouterService',
  'google-veo': 'googleVeoService'
};

/**
 * Validates if a provider has a corresponding service mapping
 * @param {string} providerName - The name of the provider to check
 * @returns {boolean} True if the provider has a service mapping, false otherwise
 */
const hasServiceMapping = (providerName) => {
  if (!providerName) return false;
  return !!SERVICE_MAPPING[providerName.toLowerCase()];
};

/**
 * Aggregator priority order for indirect providers
 * Higher index = higher priority
 */
const AGGREGATOR_PRIORITY = ['openrouter', 'together'];

/**
 * Resolves the appropriate streaming service based on model and provider information
 * @param {string} modelSlug - The model identifier to resolve service for
 * @returns {Promise<Object>} Service resolution result with service name and configuration
 * @throws {Error} If model is not found, provider is unsupported, or no service is available
 */
const resolveStreamingService = async (modelSlug) => {
  // Input validation - already handled by getModelServiceInfo, but adding extra validation here
  if (!modelSlug) {
    console.error('Model Service: Missing model slug in resolveStreamingService');
    throw new Error('Model slug is required for service resolution');
  }

  console.log(`Model Service: Resolving streaming service for model: ${modelSlug}`);

  try {
    // Get comprehensive model and provider information
    const modelServiceInfo = await getModelServiceInfo(modelSlug);

    const { provider, aggregatedInfo } = modelServiceInfo;

    // Handle direct providers (provider_type: 'direct' or 'both')
    if (provider.provider_type === 'direct' || provider.provider_type === 'both') {
      // Use the hasServiceMapping function for validation
      if (!hasServiceMapping(provider.name)) {
        console.error(`Model Service: No streaming service mapping found for direct provider: ${provider.name}`);
        throw new Error(`No streaming service available for provider: ${provider.name}`);
      }

      const serviceName = SERVICE_MAPPING[provider.name.toLowerCase()];

      console.log(`Model Service: Resolved direct provider service: ${serviceName} for model: ${modelSlug}`);
      return {
        service: serviceName,
        provider: provider.name,
        providerType: provider.provider_type,
        modelSlug: modelSlug
      };
    }

    // Handle aggregator providers (provider_type: 'aggregator')
    if (provider.provider_type === 'aggregator') {
      const serviceName = SERVICE_MAPPING[provider.name.toLowerCase()];

      if (!serviceName) {
        console.error(`Model Service: No streaming service mapping found for aggregator provider: ${provider.name}`);
        throw new Error(`No streaming service available for aggregator provider: ${provider.name}`);
      }

      console.log(`Model Service: Resolved aggregator provider service: ${serviceName} for model: ${modelSlug}`);
      return {
        service: serviceName,
        provider: provider.name,
        providerType: provider.provider_type,
        modelSlug: modelSlug
      };
    }

    // Handle indirect providers (provider_type: 'indirect')
    if (provider.provider_type === 'indirect') {
      if (!aggregatedInfo) {
        console.error(`Model Service: No aggregation information found for indirect provider model: ${modelSlug}`);
        throw new Error(`No aggregation information found for indirect provider model: ${modelSlug}`);
      }

      // Collect available aggregator providers
      const availableAggregators = [];

      if (aggregatedInfo.aggregatorProvider) {
        availableAggregators.push({
          name: aggregatedInfo.aggregatorProvider.name.toLowerCase(),
          provider: aggregatedInfo.aggregatorProvider
        });
      }

      if (availableAggregators.length === 0) {
        console.error(`Model Service: No aggregator providers found for indirect model: ${modelSlug}`);
        throw new Error(`No aggregator providers found for indirect model: ${modelSlug}`);
      }

      // Select aggregator based on priority
      let selectedAggregator = null;

      // Find the highest priority aggregator that's available
      for (let i = AGGREGATOR_PRIORITY.length - 1; i >= 0; i--) {
        const priorityAggregator = AGGREGATOR_PRIORITY[i];
        const foundAggregator = availableAggregators.find(agg =>
          agg.name === priorityAggregator
        );

        if (foundAggregator) {
          selectedAggregator = foundAggregator;
          console.log(`Model Service: Selected aggregator ${selectedAggregator.name} based on priority for model: ${modelSlug}`);
          break;
        }
      }

      // If no priority aggregator found, use the first available
      if (!selectedAggregator) {
        selectedAggregator = availableAggregators[0];
        console.log(`Model Service: No priority aggregator found, using first available: ${selectedAggregator.name} for model: ${modelSlug}`);
      }

      const serviceName = SERVICE_MAPPING[selectedAggregator.name];

      if (!serviceName) {
        console.error(`Model Service: No streaming service mapping found for aggregator: ${selectedAggregator.name}`);
        throw new Error(`No streaming service available for aggregator: ${selectedAggregator.name}`);
      }

      console.log(`Model Service: Resolved indirect provider service: ${serviceName} via aggregator: ${selectedAggregator.name} for model: ${modelSlug}`);
      return {
        service: serviceName,
        provider: selectedAggregator.provider.name,
        providerType: 'indirect',
        aggregatorProvider: selectedAggregator.provider.name,
        sourceProvider: aggregatedInfo.sourceProvider ? aggregatedInfo.sourceProvider.name : null,
        modelSlug: modelSlug
      };
    }

    // Unsupported provider type
    console.error(`Model Service: Unsupported provider type: ${provider.provider_type} for model: ${modelSlug}`);
    throw new Error(`Unsupported provider type: ${provider.provider_type} for model: ${modelSlug}`);

  } catch (error) {
    // Handle database connection errors
    if (error.name === 'SequelizeConnectionError' || error.name === 'SequelizeConnectionRefusedError') {
      console.error(`Model Service: Database connection error while resolving service: ${error.message}`);
      throw new Error(`Database connection error: Unable to resolve streaming service. Please try again later.`);
    }

    // Handle other database errors
    if (error.name === 'SequelizeError' || error.name === 'SequelizeDatabaseError') {
      console.error(`Model Service: Database error while resolving service: ${error.message}`);
      throw new Error(`Database error while resolving service: ${error.message}`);
    }

    // If the error is already from getModelServiceInfo, don't wrap it again
    if (error.message.startsWith('Model slug is required') ||
      error.message.startsWith('Invalid model slug format') ||
      error.message.startsWith('Model slug cannot be empty') ||
      error.message.startsWith('Model not found') ||
      error.message.startsWith('Provider not found') ||
      error.message.startsWith('Database connection error') ||
      error.message.startsWith('Database error while retrieving')) {
      throw error;
    }

    // Log and re-throw other errors
    console.error(`Model Service: Error resolving streaming service for model ${modelSlug}:`, error);
    throw error;
  }
};

module.exports = {
  initializeModels,
  getModelByModelId, // deprecated
  getModelByModelSlug,
  getActiveModels,
  getModelsForFrontend,
  getUnifiedModels,
  updateModelOutputRatio,
  updateModelOutputRatioByModelId, // deprecated
  updateModelOutputRatioByModelSlug,
  calculateAndSaveOutputRatios,
  getEstimatedOutputRatio,
  getModelPricing,
  getModelServiceInfo,
  resolveStreamingService,
  hasServiceMapping, // Added for validation purposes
  SERVICE_MAPPING, // Exported for testing
  AGGREGATOR_PRIORITY // Exported for testing
}; 