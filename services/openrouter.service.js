/**
 * Service for OpenRouter AI integration
 * @module services/openrouter
 */

const axios = require('axios');
const config = require('../config/config');
const db = require('../database');
const modelService = require('./model.service');
const fileContentExtractor = require('./file-content-extractor.service');
const { Op } = require('sequelize');

// Importazione dei modelli
const { User, Chat, Message, Attachment, Wallet, Transaction, MessageCost, Model, AggregatedModel, Provider } = db.sequelize.models;

// OpenRouter API endpoint
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Cache dei modelli disponibili
let AVAILABLE_MODELS = [];
let lastModelsFetch = null;
const CACHE_DURATION = 3600000; // 1 ora in millisecondi

let OPENROUTER_PROVIDER_ID = null;

/**
 * Safely stringify an object, avoiding circular references
 * @param {Object} obj - Object to stringify
 * @returns {string} Safe JSON string
 */
function safeStringify(obj) {
    try {
        // Handle null and undefined
        if (obj === null || obj === undefined) {
            return String(obj);
        }

        // Handle primitive types
        if (typeof obj !== 'object') {
            return String(obj);
        }

        // Handle arrays
        if (Array.isArray(obj)) {
            return JSON.stringify(obj.map(item => {
                if (typeof item === 'object' && item !== null) {
                    return '[Complex object]';
                }
                return item;
            }));
        }

        // Create a safe copy with only primitive values
        const safeObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                if (typeof value !== 'object' && typeof value !== 'function') {
                    safeObj[key] = value;
                } else if (value === null) {
                    safeObj[key] = null;
                } else if (Array.isArray(value)) {
                    safeObj[key] = '[Array]';
                } else {
                    safeObj[key] = '[Complex object]';
                }
            }
        }
        return JSON.stringify(safeObj);
    } catch (error) {
        return '[Object cannot be stringified]';
    }
}

// Funzione per recuperare l'id_provider di OpenRouter
async function getOpenRouterProviderId() {
    console.log(`🔍 DEBUG: getOpenRouterProviderId called, cached ID: ${OPENROUTER_PROVIDER_ID}`);
    if (OPENROUTER_PROVIDER_ID) return OPENROUTER_PROVIDER_ID;
    const Provider = db.models.Provider;
    console.log(`🔍 DEBUG: Searching for openrouter provider in database`);
    const provider = await Provider.findOne({ where: { name: 'openrouter' } });
    if (!provider) {
        console.log(`❌ DEBUG: Provider OpenRouter NOT found in database`);
        throw new Error('Provider OpenRouter non trovato');
    }
    console.log(`✅ DEBUG: Provider OpenRouter found with ID: ${provider.id}`);
    OPENROUTER_PROVIDER_ID = provider.id;
    return OPENROUTER_PROVIDER_ID;
}

/**
 * Recupera i modelli disponibili dall'API di OpenRouter
 * @returns {Promise<Array>} Array di modelli disponibili
 */
const fetchAvailableModels = async () => {
    try {
        // Recupera tutti i modelli OpenRouter dal database
        const dbModels = await Model.findAll({
            where: {
                id_provider: await getOpenRouterProviderId(),
                is_active: true
            }
        });

        if (!dbModels || dbModels.length === 0) {
            console.warn("Nessun modello OpenRouter trovato nel database");
            return [];
        }

        // Mappa i modelli dal database al formato richiesto
        const availableModels = dbModels.map(model => ({
            id: model.api_model_id || model.model_slug,
            name: model.name,
            description: model.description,
            maxTokens: model.max_tokens || 4000,
            inputPricePerMillion: model.input_price_per_million,
            outputPricePerMillion: model.output_price_per_million,
            capabilities: model.capabilities || []
        }));

        return availableModels;
    } catch (error) {
        console.error("Errore nel recupero dei modelli OpenRouter:", error);
        return [];
    }
};

/**
 * Calcola il costo stimato della richiesta in base al modello e ai token
 * @param {string} modelId - ID del modello OpenRouter selezionato
 * @param {number} inputTokens - Numero di token di input
 * @param {number} outputTokens - Numero di token di output (0 per stima preventiva)
 * @param {boolean} includeEstimatedOutput - Se includere una stima dei token di output
 * @returns {Promise<Object>} Oggetto con i dettagli del costo
 */
const calculateCost = async (
    modelId,
    inputTokens,
    outputTokens = 0,
    includeEstimatedOutput = false
) => {
    const { type, subscription, tier, model, provider, priceScore, statsAA } = await modelService.getModelPricing(modelId);
    let finalOutputTokens = outputTokens;
    let estimatedOutputRatio = null;

    if (includeEstimatedOutput && outputTokens === 0) {
        estimatedOutputRatio = 1.5;
        finalOutputTokens = Math.ceil(inputTokens * estimatedOutputRatio);
    }

    let baseCost = 0;
    let fixedMarkup = 0;
    let percentageMarkup = 0;
    let totalMarkup = 0;
    let totalCost = 0;

    if (type === 'aggregator') {
        // OpenRouter is an aggregator, use tier-based pricing
        baseCost = 0.01 * (inputTokens + finalOutputTokens);
        fixedMarkup = Number(tier.markup_fixed) || 0;
        percentageMarkup = baseCost * ((Number(tier.markup_percentage) || 0) / 100);
        totalMarkup = fixedMarkup + percentageMarkup;
        totalCost = baseCost + totalMarkup;
    } else if (type === 'direct') {
        // Calculate base cost using pricing data
        let inputPricePerMillion = 0;
        let outputPricePerMillion = 0;

        if (statsAA) {
            inputPricePerMillion = Number(statsAA.price_1m_input_tokens) || 0;
            outputPricePerMillion = Number(statsAA.price_1m_output_tokens) || 0;
        } else if (priceScore) {
            inputPricePerMillion = Number(priceScore.price_1m_input_tokens) || 0;
            outputPricePerMillion = Number(priceScore.price_1m_output_tokens) || 0;
        } else {
            throw new Error(`No pricing data available for model ${modelId}`);
        }

        baseCost = (inputTokens / 1000000) * inputPricePerMillion + (finalOutputTokens / 1000000) * outputPricePerMillion;
        fixedMarkup = 0;
        percentageMarkup = 0;
        totalMarkup = 0;
        totalCost = baseCost;
    }

    return {
        inputTokens,
        outputTokens: finalOutputTokens,
        totalTokens: inputTokens + finalOutputTokens,
        baseCost,
        fixedMarkup,
        percentageMarkup,
        totalMarkup,
        totalCost,
        model: model.model_slug,
        modelId: model.id,
        estimatedOutput: includeEstimatedOutput && outputTokens === 0,
        estimatedOutputRatio: estimatedOutputRatio
    };
};

/**
 * Verifica se un modello è disponibile
 * @param {string|number} modelId - ID del modello da verificare (può essere api_model_id o id numerico)
 * @returns {Promise<boolean>} True se il modello è disponibile
 */
const isModelAvailable = async (modelId) => {
    try {
        console.log(`🔍 DEBUG: isModelAvailable called with modelId: ${modelId} (type: ${typeof modelId})`);
        const openRouterProviderId = await getOpenRouterProviderId();
        console.log(`🔍 DEBUG: OpenRouter provider ID: ${openRouterProviderId}`);
        
        // Priorità 1: Verifica se il modello esiste nel database usando api_model_id
        // Questo è il metodo preferito e più diretto
        if (typeof modelId === 'string') {
            console.log(`🔍 DEBUG: Searching for model by api_model_id: ${modelId}`);
            const dbModelByApiId = await Model.findOne({
                where: {
                    api_model_id: modelId,
                    id_provider: openRouterProviderId,
                    is_active: true
                }
            });

            if (dbModelByApiId) {
                console.log(`✅ DEBUG: Model found by api_model_id: ${modelId}`, {
                    id: dbModelByApiId.id,
                    name: dbModelByApiId.name,
                    api_model_id: dbModelByApiId.api_model_id,
                    model_slug: dbModelByApiId.model_slug
                });
                return true;
            } else {
                console.log(`❌ DEBUG: Model NOT found by api_model_id: ${modelId}`);
            }
        }

        // Priorità 2: Se modelId è numerico, cerca per ID nel database
        if (!isNaN(modelId)) {
            console.log(`🔍 DEBUG: Searching for model by ID: ${modelId}`);
            const dbModelById = await Model.findOne({
                where: {
                    id: modelId,
                    id_provider: openRouterProviderId,
                    is_active: true
                }
            });

            if (dbModelById) {
                console.log(`✅ DEBUG: Model found by ID: ${modelId}`, {
                    id: dbModelById.id,
                    name: dbModelById.name,
                    api_model_id: dbModelById.api_model_id,
                    model_slug: dbModelById.model_slug
                });
                return true;
            } else {
                console.log(`❌ DEBUG: Model NOT found by ID: ${modelId}`);
            }
        }

        // Priorità 3: Fallback - cerca per model_slug
        console.log(`🔍 DEBUG: Searching for model by model_slug: ${modelId}`);
        const dbModelBySlug = await Model.findOne({
            where: {
                model_slug: modelId,
                id_provider: openRouterProviderId,
                is_active: true
            }
        });

        if (dbModelBySlug) {
            console.log(`✅ DEBUG: Model found by model_slug: ${modelId}`, {
                id: dbModelBySlug.id,
                name: dbModelBySlug.name,
                api_model_id: dbModelBySlug.api_model_id,
                model_slug: dbModelBySlug.model_slug
            });
            return true;
        } else {
            console.log(`❌ DEBUG: Model NOT found by model_slug: ${modelId}`);
        }

        console.log(`❌ DEBUG: Model not found in any search method: ${modelId}`);
        return false;
    } catch (error) {
        console.error('Errore durante la verifica della disponibilità del modello OpenRouter:', error);
        return false;
    }
};

/**
 * Processa gli allegati e li prepara per l'invio a OpenRouter
 * @param {Array} attachments - Array di oggetti allegato
 * @returns {Promise<Object>} Oggetto con allegati processati e prompt arricchito
 */
const processAttachments = async (attachments = []) => {
    if (!attachments || attachments.length === 0) {
        return { processedAttachments: [], enrichedPrompt: null };
    }

    const processedAttachments = [];
    const nonImageAttachments = [];

    for (const attachment of attachments) {
        // Recupera l'allegato dal database se è un ID
        let attachmentData = attachment;
        if (typeof attachment === 'number') {
            attachmentData = await Attachment.findByPk(attachment);
            if (!attachmentData) {
                throw new Error(`Allegato con ID ${attachment} non trovato`);
            }
        }

        // Se è un'immagine, la processiamo come immagine per OpenRouter
        if (attachmentData.mime_type.startsWith('image/')) {
            processedAttachments.push({
                type: "image_url",
                image_url: {
                    url: `data:${attachmentData.mime_type};base64,${await readFileAsBase64(attachmentData.file_path)}`
                }
            });
        } else {
            // Per tutti gli altri tipi di file, li aggiungiamo alla lista per l'estrazione del contenuto
            nonImageAttachments.push(attachmentData);
        }
    }

    // Se abbiamo file non-immagine, estraiamo il contenuto
    let enrichedPrompt = null;
    if (nonImageAttachments.length > 0) {
        try {
            enrichedPrompt = await fileContentExtractor.enrichPromptWithFileContent(
                "", // Prompt vuoto, verrà sostituito dal prompt dell'utente
                nonImageAttachments,
                {
                    maxLength: 50000, // Limite ragionevole per OpenRouter
                    format: 'text',
                    fileHeader: '=== CONTENUTO FILE ==='
                }
            );
        } catch (error) {
            console.warn(`Errore nell'estrazione del contenuto: ${error.message}`);
            enrichedPrompt = `[ERRORE: Impossibile estrarre contenuto da alcuni file - ${error.message}]`;
        }
    }

    return { processedAttachments, enrichedPrompt };
};

/**
 * Legge un file e lo converte in base64
 * @param {string} filePath - Percorso del file
 * @returns {Promise<string>} Contenuto del file in base64
 */
const readFileAsBase64 = async (filePath) => {
    // Verifica se il file è su Google Cloud Storage
    if (filePath.startsWith('gs://') || filePath.startsWith('https://storage.googleapis.com/')) {
        // File su Google Cloud Storage
        const GoogleCloudStorage = require('./google-cloud-storage.service');
        const gcsService = new GoogleCloudStorage();

        // Estrai bucket e path dal GCS URL
        let bucket, path;
        if (filePath.startsWith('gs://')) {
            const parts = filePath.substring(5).split('/');
            bucket = parts[0];
            path = parts.slice(1).join('/');
        } else {
            const parts = filePath.substring(30).split('/');
            bucket = parts[0];
            path = parts.slice(1).join('/');
        }

        const buffer = await gcsService.downloadFile(bucket, path);
        return buffer.toString('base64');
    } else {
        // File locale
        const fs = require('fs').promises;
        const buffer = await fs.readFile(filePath);
        return buffer.toString('base64');
    }
};

/**
 * [DEPRECATED] This function is no longer used as we now use api_model_id directly
 * Kept for historical reference and potential fallback
 * 
 * Costruisce dinamicamente l'ID del modello per OpenRouter
 * @param {string} modelSlug - Slug del modello (es: gemma-2b-it)
 * @param {string} providerName - Nome del provider (es: google)
 * @param {string} tier - Tier del modello (es: free, paid)
 * @returns {string} ID del modello formattato per OpenRouter
 */
const buildOpenRouterModelId = (modelSlug, providerName, tier = null) => {
    console.warn('DEPRECATED: buildOpenRouterModelId is deprecated and will be removed in a future version');
    
    // Rimuovi eventuali suffissi di provider dallo slug se presenti
    let cleanSlug = modelSlug;

    // Rimuovi il prefisso del provider se presente nello slug
    const providerPrefix = `${providerName}-`;
    if (cleanSlug.startsWith(providerPrefix)) {
        cleanSlug = cleanSlug.substring(providerPrefix.length);
    }

    // Costruisci l'ID nel formato provider/model:free
    let modelId = `${providerName}/${cleanSlug}`;

    // Aggiungi il tier se specificato
    if (tier) {
        modelId += `:${tier}`;
    }

    return modelId;
};

/**
 * Risolve l'ID del modello per OpenRouter
 * @param {string|number} modelId - ID del modello (può essere numerico o stringa)
 * @returns {Promise<string>} ID del modello formattato per OpenRouter
 */
const resolveOpenRouterModelId = async (modelId) => {
    console.log(`🔍 DEBUG: resolveOpenRouterModelId called with modelId: ${modelId} (type: ${typeof modelId})`);
    const openRouterProviderId = await getOpenRouterProviderId();
    
    try {
        let dbModel = null;
        
        // Se è un ID numerico, cerca nel database per ID
        if (!isNaN(modelId)) {
            console.log(`🔍 DEBUG: Resolving numeric modelId: ${modelId}`);
            dbModel = await Model.findOne({
                where: {
                    id: modelId,
                    id_provider: openRouterProviderId,
                    is_active: true
                }
            });
        } 
        // Se è una stringa, cerca per api_model_id o model_slug
        else {
            console.log(`🔍 DEBUG: Resolving string modelId: ${modelId}`);
            dbModel = await Model.findOne({
                where: {
                    [Op.or]: [
                        { api_model_id: modelId },
                        { model_slug: modelId }
                    ],
                    id_provider: openRouterProviderId,
                    is_active: true
                }
            });
        }

        // Se abbiamo trovato un modello nel database
        if (dbModel) {
            console.log(`✅ DEBUG: Model found in database:`, {
                id: dbModel.id,
                name: dbModel.name,
                api_model_id: dbModel.api_model_id,
                model_slug: dbModel.model_slug
            });
            
            // Priorità 1: Usa api_model_id se disponibile
            if (dbModel.api_model_id) {
                console.log(`✅ DEBUG: Using api_model_id directly: ${dbModel.api_model_id}`);
                return dbModel.api_model_id;
            }
            
            // Priorità 2: Fallback alla logica precedente se api_model_id non è disponibile
            console.log(`⚠️ DEBUG: api_model_id not available for model ${dbModel.model_slug}, using fallback logic`);
            
            // Cerca nella tabella aggregated_models per ottenere il provider originale
            const aggregatedModel = await AggregatedModel.findOne({
                where: {
                    id_model: dbModel.id,
                    id_aggregator_provider: openRouterProviderId
                },
                include: [{
                    model: Provider,
                    as: 'sourceProvider',
                    attributes: ['name']
                }]
            });

            if (aggregatedModel && aggregatedModel.sourceProvider) {
                // Usa il source_model_id e il provider originale
                return buildOpenRouterModelId(
                    aggregatedModel.source_model_id,
                    aggregatedModel.sourceProvider.name,
                    dbModel.tier
                );
            } else {
                // Fallback: usa il model_slug e cerca il provider
                const provider = await dbModel.getProvider();
                return buildOpenRouterModelId(dbModel.model_slug, provider.name, dbModel.tier);
            }
        }

        // Se non trovato, ritorna l'ID originale (potrebbe essere già nel formato corretto)
        console.log(`❌ DEBUG: Model not found in database, using original ID: ${modelId}`);
        return modelId;
    } catch (error) {
        console.error(`❌ DEBUG: Error resolving OpenRouter model ID: ${error.message}`);
        // In caso di errore, ritorna l'ID originale
        return modelId;
    }
};

/**
 * Servizio principale per gestire le richieste streaming a OpenRouter
 * @param {Object} requestData - Dati della richiesta
 * @returns {Promise<Object>} Risposta elaborata
 */
const processOpenRouterStreamingRequest = async (requestData) => {
    const { model, prompt, attachments = [], chatId, userId, agent_type, agent_model, onStream } = requestData;

    console.log('🚀 DEBUG: processOpenRouterStreamingRequest called');
    console.log('=== OPENROUTER STREAMING REQUEST DEBUG ===');
    console.log('Model:', model);
    console.log('Prompt:', prompt);
    console.log('Prompt type:', typeof prompt);
    console.log('Prompt length:', prompt ? prompt.length : 'null/undefined');
    console.log('ChatId:', chatId);
    console.log('UserId:', userId);
    console.log('Attachments:', attachments);
    console.log('=== END STREAMING REQUEST DEBUG ===');

    if (!model || !prompt || !chatId || !userId || !onStream) {
        throw new Error('Parametri mancanti: model, prompt, chatId, userId e onStream sono obbligatori');
    }

    if (!prompt || prompt.trim() === '') {
        throw new Error('Il prompt non può essere vuoto');
    }

    // Verifica che il modello esista
    const isAvailable = await isModelAvailable(model);
    if (!isAvailable) {
        throw new Error(`Modello non supportato: ${model}. Utilizzare uno dei modelli disponibili.`);
    }

    // Risolvi l'ID del modello dinamicamente
    const apiModelId = await resolveOpenRouterModelId(model);
    console.log(`OpenRouter: Resolved model ID ${model} to API model ID ${apiModelId}`);

    // Verifica che l'utente e la chat esistano
    const [user, chat] = await Promise.all([
        User.findByPk(userId),
        Chat.findByPk(chatId)
    ]);

    if (!user) {
        throw new Error(`Utente con ID ${userId} non trovato`);
    }

    if (!chat) {
        throw new Error(`Chat con ID ${chatId} non trovata`);
    }

    // Processa gli allegati
    const { processedAttachments, enrichedPrompt } = await processAttachments(attachments);

    // Prepara il prompt finale
    let finalPrompt = prompt;
    if (enrichedPrompt) {
        finalPrompt = enrichedPrompt.replace('{userPrompt}', prompt);
    }

    // Sposta le dichiarazioni delle variabili fuori dal blocco try
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
        // Prepara la richiesta per OpenRouter con streaming
        const messages = [
            {
                role: 'user',
                content: processedAttachments.length > 0
                    ? [
                        { type: 'text', text: finalPrompt },
                        ...processedAttachments
                    ]
                    : finalPrompt
            }
        ];

        // Log the request for debugging
        const requestData = {
            model: apiModelId, // Usa l'ID del modello risolto
            messages: messages,
            max_tokens: 4000,
            stream: true
        };

        console.log('OpenRouter Streaming Request:', {
            url: OPENROUTER_API_URL,
            model: apiModelId,
            resolvedFrom: model !== apiModelId ? model : undefined,
            messagesCount: messages.length,
            messages: messages, // Log the actual messages
            requestData: requestData, // Log the full request data
            hasApiKey: !!config.openrouter.apiKey,
            apiKeyLength: config.openrouter.apiKey ? config.openrouter.apiKey.length : 0
        });

        // Effettua la chiamata streaming a OpenRouter
        const response = await axios.post(OPENROUTER_API_URL, requestData, {
            headers: {
                'Authorization': `Bearer ${config.openrouter.apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            responseType: 'stream',
            validateStatus: function (status) {
                return status < 500; // Resolve only if the status code is less than 500
            }
        });

        // Check if we got an error response
        if (response.status >= 400) {
            console.log('=== OPENROUTER ERROR RESPONSE DEBUG ===');
            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers);

            // Try to read the error response body
            let errorBody = '';
            response.data.on('data', (chunk) => {
                errorBody += chunk.toString();
            });

            response.data.on('end', () => {
                console.log('Error response body:', errorBody);
                console.log('=== END ERROR RESPONSE DEBUG ===');
            });

            throw new Error(`OpenRouter returned status ${response.status}: ${errorBody}`);
        }

        return new Promise((resolve, reject) => {
            let buffer = '';

            response.data.on('data', (chunk) => {
                buffer += chunk.toString();

                // Process complete lines
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.trim() === 'data: [DONE]') continue;

                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.choices && data.choices[0] && data.choices[0].delta) {
                                const delta = data.choices[0].delta;

                                if (delta.content) {
                                    fullText += delta.content;
                                    // Call the streaming callback with the chunk
                                    onStream(delta.content);
                                }
                            }

                            // Update usage info if present
                            if (data.usage) {
                                inputTokens = data.usage.prompt_tokens || 0;
                                outputTokens = data.usage.completion_tokens || 0;
                                onStream(null, {
                                    input_tokens: inputTokens,
                                    output_tokens: outputTokens,
                                    total_tokens: inputTokens + outputTokens
                                });
                            }
                        } catch (e) {
                            console.error('Errore parsing JSON chunk OpenRouter:', e);
                        }
                    }
                }
            });

            response.data.on('end', () => {
                resolve({
                    fullText,
                    inputTokens: inputTokens || Math.ceil(prompt.length / 4),
                    outputTokens: outputTokens || Math.ceil(fullText.length / 4),
                    usage: {
                        input_tokens: inputTokens || Math.ceil(prompt.length / 4),
                        output_tokens: outputTokens || Math.ceil(fullText.length / 4),
                        total_tokens: (inputTokens || Math.ceil(prompt.length / 4)) + (outputTokens || Math.ceil(fullText.length / 4))
                    }
                });
            });

            response.data.on('error', (error) => {
                reject(new Error(`Errore durante lo streaming da OpenRouter: ${error.message}`));
            });
        });

    } catch (error) {
        // Debug logging to understand the error structure
        console.log('=== OPENROUTER ERROR DEBUG ===');
        console.log('Error type:', typeof error);
        console.log('Error message:', error.message);
        console.log('Error response exists:', !!error.response);

        if (error.response) {
            console.log('Response status:', error.response.status);
            console.log('Response statusText:', error.response.statusText);
            console.log('Response headers:', error.response.headers);
            console.log('Response data type:', typeof error.response.data);

            // Try to get response text if it's a stream
            if (error.response.data && typeof error.response.data === 'object' && error.response.data.on) {
                console.log('Response data is a stream, trying to read it...');
                let streamData = '';
                error.response.data.on('data', (chunk) => {
                    streamData += chunk.toString();
                });
                error.response.data.on('end', () => {
                    console.log('Stream error data:', streamData);
                });
            } else if (error.response.data && typeof error.response.data === 'string') {
                console.log('Response data as string:', error.response.data);
            } else if (error.response.data && typeof error.response.data === 'object') {
                console.log('Response data keys:', Object.keys(error.response.data));
                console.log('Response data:', error.response.data);
            }
        }

        console.log('Error config:', error.config ? {
            url: error.config.url,
            method: error.config.method,
            headers: error.config.headers,
            data: error.config.data
        } : 'No config');
        console.log('=== END DEBUG ===');

        // Extract only relevant information from the error response
        const errorInfo = {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            url: error.config?.url,
            method: error.config?.method
        };

        // Try to get the actual error data from different possible locations
        let errorData = null;

        // First, try to get data from error.response.data (if it's not a Node.js response object)
        if (error.response?.data && typeof error.response.data === 'object') {
            // Check if this is actually a Node.js response object (has properties like _events, socket, etc.)
            if (!error.response.data._events && !error.response.data.socket && !error.response.data.httpVersion) {
                errorData = error.response.data;
            }
        }

        // If we didn't get valid data, try to parse the response text
        if (!errorData && error.response?.data && typeof error.response.data === 'string') {
            try {
                errorData = JSON.parse(error.response.data);
            } catch (e) {
                errorData = error.response.data;
            }
        }

        // If still no data, try to get it from the response text
        if (!errorData && error.response?.statusText) {
            errorData = { message: error.response.statusText };
        }

        if (errorData) {
            errorInfo.data = errorData;
        }

        console.error('OpenRouter Streaming Error:', errorInfo);

        // Check for specific OpenRouter error types and provide better messages
        if (error.response?.status === 400) {
            let errorMessage = `Richiesta OpenRouter non valida (400)`;

            if (errorData) {
                if (typeof errorData === 'string') {
                    errorMessage += `: ${errorData}`;
                } else if (typeof errorData === 'object' && errorData !== null) {
                    if (errorData.error) {
                        if (typeof errorData.error === 'string') {
                            errorMessage += `: ${errorData.error}`;
                        } else if (typeof errorData.error === 'object' && errorData.error.message) {
                            errorMessage += `: ${errorData.error.message}`;
                        } else {
                            errorMessage += `: ${JSON.stringify(errorData.error)}`;
                        }
                    } else if (errorData.message) {
                        errorMessage += `: ${errorData.message}`;
                    } else {
                        errorMessage += `: ${JSON.stringify(errorData)}`;
                    }
                } else {
                    errorMessage += `: ${String(errorData)}`;
                }
            } else {
                errorMessage += `: ${error.message}`;
            }

            throw new Error(errorMessage);
        } else if (error.response?.status === 404) {
            throw new Error(`Modello OpenRouter non trovato: ${error.message}`);
        } else if (error.response?.status === 401) {
            throw new Error(`Chiave API OpenRouter non valida: ${error.message}`);
        } else if (error.response?.status === 429) {
            throw new Error(`Limite di richieste OpenRouter raggiunto: ${error.message}`);
        } else if (error.response?.status === 402 || error.message.includes('billing') || error.message.includes('quota')) {
            throw new Error(`Problema di fatturazione OpenRouter: ${error.message}`);
        } else {
            throw new Error(`Errore OpenRouter: ${error.message}`);
        }
    }
};

/**
 * Servizio principale per gestire le richieste non-streaming a OpenRouter
 * @param {Object} requestData - Dati della richiesta
 * @returns {Promise<Object>} Risposta elaborata
 */
const processOpenRouterRequest = async (requestData) => {
    const { model, prompt, attachments = [], chatId, userId, agent_type, agent_model } = requestData;

    console.log('🚀 DEBUG: processOpenRouterRequest called');
    console.log('=== OPENROUTER REQUEST DEBUG ===');
    console.log('Model:', model);
    console.log('Prompt:', prompt);
    console.log('Prompt type:', typeof prompt);
    console.log('Prompt length:', prompt ? prompt.length : 'null/undefined');
    console.log('ChatId:', chatId);
    console.log('UserId:', userId);
    console.log('Attachments:', attachments);
    console.log('=== END REQUEST DEBUG ===');

    if (!model || !prompt || !chatId || !userId) {
        throw new Error('Parametri mancanti: model, prompt, chatId e userId sono obbligatori');
    }

    if (!prompt || prompt.trim() === '') {
        throw new Error('Il prompt non può essere vuoto');
    }

    // Verifica che il modello esista
    const isAvailable = await isModelAvailable(model);
    if (!isAvailable) {
        throw new Error(`Modello non supportato: ${model}. Utilizzare uno dei modelli disponibili.`);
    }

    // Risolvi l'ID del modello dinamicamente
    const apiModelId = await resolveOpenRouterModelId(model);
    console.log(`OpenRouter: Resolved model ID ${model} to API model ID ${apiModelId}`);

    // Verifica che l'utente e la chat esistano
    const [user, chat] = await Promise.all([
        User.findByPk(userId),
        Chat.findByPk(chatId)
    ]);

    if (!user) {
        throw new Error(`Utente con ID ${userId} non trovato`);
    }

    if (!chat) {
        throw new Error(`Chat con ID ${chatId} non trovata`);
    }

    // Processa gli allegati
    const { processedAttachments, enrichedPrompt } = await processAttachments(attachments);

    // Prepara il prompt finale
    let finalPrompt = prompt;
    if (enrichedPrompt) {
        finalPrompt = enrichedPrompt.replace('{userPrompt}', prompt);
    }

    try {
        // Prepara la richiesta per OpenRouter
        const messages = [
            {
                role: 'user',
                content: processedAttachments.length > 0
                    ? [
                        { type: 'text', text: finalPrompt },
                        ...processedAttachments
                    ]
                    : finalPrompt
            }
        ];

        // Log the request for debugging
        const requestData = {
            model: apiModelId, // Usa l'ID del modello risolto
            messages: messages,
            max_tokens: 4000
        };

        console.log('OpenRouter Non-Streaming Request:', {
            url: OPENROUTER_API_URL,
            model: apiModelId,
            resolvedFrom: model !== apiModelId ? model : undefined,
            messagesCount: messages.length,
            messages: messages, // Log the actual messages
            requestData: requestData // Log the full request data
        });

        // Effettua la chiamata a OpenRouter
        const response = await axios.post(OPENROUTER_API_URL, requestData, {
            headers: {
                'Authorization': `Bearer ${config.openrouter.apiKey}`,
                'Content-Type': 'application/json'
            },
            validateStatus: function (status) {
                return status < 500; // Resolve only if the status code is less than 500
            }
        });

        // Check if we got an error response
        if (response.status >= 400) {
            console.log('=== OPENROUTER NON-STREAMING ERROR RESPONSE DEBUG ===');
            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers);
            console.log('Response data:', response.data);
            console.log('=== END NON-STREAMING ERROR RESPONSE DEBUG ===');
            throw new Error(`OpenRouter returned status ${response.status}: ${JSON.stringify(response.data)}`);
        }

        // Estrai la risposta
        const assistantResponse = response.data.choices[0].message.content;
        const outputTokens = response.data.usage?.completion_tokens || 0;
        const inputTokens = response.data.usage?.prompt_tokens || 0;

        return {
            success: true,
            message: assistantResponse,
            usage: {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: inputTokens + outputTokens
            }
        };

    } catch (error) {
        // Debug logging to understand the error structure
        console.log('=== OPENROUTER ERROR DEBUG ===');
        console.log('Error type:', typeof error);
        console.log('Error message:', error.message);
        console.log('Error response exists:', !!error.response);

        if (error.response) {
            console.log('Response status:', error.response.status);
            console.log('Response statusText:', error.response.statusText);
            console.log('Response headers:', error.response.headers);
            console.log('Response data type:', typeof error.response.data);

            // Try to get response text if it's a stream
            if (error.response.data && typeof error.response.data === 'object' && error.response.data.on) {
                console.log('Response data is a stream, trying to read it...');
                let streamData = '';
                error.response.data.on('data', (chunk) => {
                    streamData += chunk.toString();
                });
                error.response.data.on('end', () => {
                    console.log('Stream error data:', streamData);
                });
            } else if (error.response.data && typeof error.response.data === 'string') {
                console.log('Response data as string:', error.response.data);
            } else if (error.response.data && typeof error.response.data === 'object') {
                console.log('Response data keys:', Object.keys(error.response.data));
                console.log('Response data:', error.response.data);
            }
        }

        console.log('Error config:', error.config ? {
            url: error.config.url,
            method: error.config.method,
            headers: error.config.headers,
            data: error.config.data
        } : 'No config');
        console.log('=== END DEBUG ===');

        // Extract only relevant information from the error response
        const errorInfo = {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            url: error.config?.url,
            method: error.config?.method
        };

        // Try to get the actual error data from different possible locations
        let errorData = null;

        // First, try to get data from error.response.data (if it's not a Node.js response object)
        if (error.response?.data && typeof error.response.data === 'object') {
            // Check if this is actually a Node.js response object (has properties like _events, socket, etc.)
            if (!error.response.data._events && !error.response.data.socket && !error.response.data.httpVersion) {
                errorData = error.response.data;
                console.log('Found valid error data in response.data:', errorData);
            }
        }

        // If we didn't get valid data, try to parse the response text
        if (!errorData && error.response?.data && typeof error.response.data === 'string') {
            try {
                errorData = JSON.parse(error.response.data);
                console.log('Parsed error data from string:', errorData);
            } catch (e) {
                errorData = error.response.data;
                console.log('Using error data as string:', errorData);
            }
        }

        // If still no data, try to get it from the response text
        if (!errorData && error.response?.statusText) {
            errorData = { message: error.response.statusText };
            console.log('Using statusText as error data:', errorData);
        }

        if (errorData) {
            errorInfo.data = errorData;
        }

        console.error('OpenRouter Non-Streaming Error:', errorInfo);

        // Check for specific OpenRouter error types and provide better messages
        if (error.response?.status === 400) {
            let errorMessage = `Richiesta OpenRouter non valida (400)`;

            if (errorData) {
                if (typeof errorData === 'string') {
                    errorMessage += `: ${errorData}`;
                } else if (typeof errorData === 'object' && errorData !== null) {
                    if (errorData.error) {
                        if (typeof errorData.error === 'string') {
                            errorMessage += `: ${errorData.error}`;
                        } else if (typeof errorData.error === 'object' && errorData.error.message) {
                            errorMessage += `: ${errorData.error.message}`;
                        } else {
                            errorMessage += `: ${JSON.stringify(errorData.error)}`;
                        }
                    } else if (errorData.message) {
                        errorMessage += `: ${errorData.message}`;
                    } else {
                        errorMessage += `: ${JSON.stringify(errorData)}`;
                    }
                } else {
                    errorMessage += `: ${String(errorData)}`;
                }
            } else {
                errorMessage += `: ${error.message}`;
            }

            throw new Error(errorMessage);
        } else if (error.response?.status === 404) {
            throw new Error(`Modello OpenRouter non trovato: ${error.message}`);
        } else if (error.response?.status === 401) {
            throw new Error(`Chiave API OpenRouter non valida: ${error.message}`);
        } else if (error.response?.status === 429) {
            throw new Error(`Limite di richieste OpenRouter raggiunto: ${error.message}`);
        } else if (error.response?.status === 402 || error.message.includes('billing') || error.message.includes('quota')) {
            throw new Error(`Problema di fatturazione OpenRouter: ${error.message}`);
        } else {
            throw new Error(`Errore OpenRouter: ${error.message}`);
        }
    }
};

/**
 * Send a request to OpenRouter AI
 * @param {string} prompt - User prompt
 * @param {string} model - Model ID
 * @param {string} userId - User ID
 * @param {string} chatId - Chat ID
 * @param {string} agentType - Agent type
 * @param {Array} attachments - Attachments
 * @param {Function} onStream - Stream callback for handling streaming responses
 * @returns {Promise<Object>} API response
 */
const sendRequest = async (prompt, model, userId, chatId, agentType = 'chat', attachments = [], onStream = null) => {
    console.log('🚀 DEBUG: sendRequest called with params:', {
        prompt: prompt ? `"${prompt.substring(0, 50)}..."` : 'null/undefined',
        model,
        userId,
        chatId,
        agentType,
        hasAttachments: attachments && attachments.length > 0,
        hasOnStream: !!onStream
    });
    
    // Se non c'è callback di streaming, usa la modalità non-streaming
    if (!onStream) {
        console.log('🚀 DEBUG: Using non-streaming mode');
        const response = await processOpenRouterRequest({
            model,
            prompt,
            attachments,
            chatId,
            userId,
            agent_type: agentType,
            agent_model: model
        });

        return {
            content: response.message,
            message: response.message,
            fullText: response.message,
            inputTokens: response.usage?.input_tokens || 0,
            outputTokens: response.usage?.output_tokens || 0,
            usage: response.usage
        };
    }

    // Modalità streaming
    console.log('🚀 DEBUG: Using streaming mode');
    return await processOpenRouterStreamingRequest({
        model,
        prompt,
        attachments,
        chatId,
        userId,
        agent_type: agentType,
        agent_model: model,
        onStream
    });
};

/**
 * Recupera i modelli disponibili
 * @returns {Promise<Array>} Array di modelli disponibili
 */
const getAvailableModels = async () => {
    try {
        // Se abbiamo già recuperato i modelli e la cache è ancora valida, restituisci la cache
        if (AVAILABLE_MODELS.length > 0 && lastModelsFetch && (Date.now() - lastModelsFetch < CACHE_DURATION)) {
            return AVAILABLE_MODELS;
        }

        // Altrimenti, recupera i modelli dal database
        const models = await fetchAvailableModels();

        // Aggiorna la cache
        AVAILABLE_MODELS = models;
        lastModelsFetch = Date.now();

        return models;
    } catch (error) {
        console.error('Errore nel recupero dei modelli OpenRouter disponibili:', error);
        return [];
    }
};

/**
 * Verifica gli ID dei modelli OpenRouter disponibili
 * @returns {Promise<Array>} Array di modelli con i loro ID
 */
const verifyModelIds = async () => {
    try {
        const models = await Model.findAll({
            where: {
                id_provider: await getOpenRouterProviderId(),
                is_active: true
            },
            attributes: ['id', 'name', 'api_model_id', 'model_slug']
        });

        console.log('=== OPENROUTER MODELS VERIFICATION ===');
        models.forEach(model => {
            console.log(`ID: ${model.id}, Name: ${model.name}, API Model ID: ${model.api_model_id}, Slug: ${model.model_slug}`);
        });
        console.log('=== END VERIFICATION ===');

        return models;
    } catch (error) {
        console.error('Errore nella verifica degli ID dei modelli:', error);
        return [];
    }
};

// Export service functions
module.exports = {
    sendRequest,
    processOpenRouterRequest,
    processOpenRouterStreamingRequest,
    calculateCost,
    getAvailableModels,
    isModelAvailable,
    verifyModelIds,
    resolveOpenRouterModelId // Export the function for testing
};