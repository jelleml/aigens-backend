const axios = require("axios");
const db = require("../database");
const config = require("../config/config");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const CostCalculator = require('./cost-calculator.service');
const GoogleCloudStorage = require('./google-cloud-storage.service');
// Sistema di logging centralizzato
const { getLogger } = require('./logging');
const logger = getLogger('runway', 'service');

// Initialize cost calculator and Google Cloud Storage
const costCalculator = new CostCalculator();
const gcsService = new GoogleCloudStorage();

// Importazione dei modelli
const { User, Chat, Message, Attachment, Wallet, Transaction, MessageCost, Model, Provider, ModelPriceScore } = db.sequelize.models;

// Configurazione dell'API Runway
const RUNWAY_API_URL = "https://api.runwayml.com/v1";
const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY || config?.runway?.apiKey;

// Cache dei modelli disponibili
let AVAILABLE_MODELS = [];
let lastModelsFetch = null;
const CACHE_DURATION = 3600000; // 1 ora in millisecondi

let RUNWAY_PROVIDER_ID = null;

// Funzione per recuperare l'id_provider di Runway
async function getRunwayProviderId() {
    if (RUNWAY_PROVIDER_ID) return RUNWAY_PROVIDER_ID;
    const Provider = db.models.Provider;
    const provider = await Provider.findOne({ where: { name: 'runway' } });
    if (!provider) throw new Error('Provider Runway non trovato');
    RUNWAY_PROVIDER_ID = provider.id;
    return RUNWAY_PROVIDER_ID;
}

/**
 * Recupera i modelli disponibili dall'API di Runway
 * @returns {Promise<Array>} Array di modelli disponibili
 */
const fetchAvailableModels = async () => {
    try {
        // Recupera tutti i modelli Runway dal database
        const dbModels = await Model.findAll({
            where: {
                id_provider: await getRunwayProviderId(),
                is_active: true
            }
        });

        if (!dbModels || dbModels.length === 0) {
            logger.warn("Nessun modello Runway trovato nel database");
            return [];
        }

        // Mappa i modelli dal database al formato richiesto
        const availableModels = dbModels.map(model => ({
            id: model.model_slug,
            name: model.name,
            description: model.description,
            maxTokens: model.max_tokens || 0,
            capabilities: model.capabilities || [],
        }));

        return availableModels;
    } catch (error) {
        console.error("Errore nel recupero dei modelli disponibili:", error);
        return [];
    }
};

/**
 * Calcola il costo della generazione di video usando il sistema unificato
 * @param {string|number} modelId - ID del modello Runway
 * @param {number} durationSeconds - Durata del video in secondi
 * @param {string} operation - Tipo di operazione (Generate)
 * @returns {Promise<Object>} Oggetto con i dettagli del costo
 */
const calculateCost = async (modelId, durationSeconds = 5, operation = 'Generate') => {
    try {
        // Get model from database using ID
        const Model = db.models.Model;
        const Provider = db.models.Provider;
        const model = await Model.findOne({
            where: { id: modelId },
            include: [{
                model: Provider,
                as: 'provider',
                attributes: ['name']
            }]
        });

        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        // Get pricing data - for videos we need price_video field
        const ModelPriceScore = db.models.ModelPriceScore;
        const priceScore = await ModelPriceScore.findOne({
            where: { id_model: model.id }
        });

        let baseCost = 0;
        let pricePerSecond = 0;
        let videoPricing = null;

        if (priceScore && priceScore.price_video) {
            try {
                // Parse JSON pricing data from price_video field
                videoPricing = JSON.parse(priceScore.price_video);
                logger.info(`Parsed video pricing for model ${modelId}:`, videoPricing);

                // Select appropriate operation pricing based on request type
                const operationPrice = videoPricing[operation];
                if (operationPrice !== undefined && operationPrice !== null) {
                    pricePerSecond = Number(operationPrice) || 0;
                    baseCost = pricePerSecond * durationSeconds;
                    logger.info(`Using operation-specific pricing for ${operation}: $${pricePerSecond} per second`);
                } else {
                    // If specific operation not found, try to use Generate as default
                    const defaultPrice = videoPricing['Generate'] || videoPricing['generate'];
                    if (defaultPrice !== undefined && defaultPrice !== null) {
                        pricePerSecond = Number(defaultPrice) || 0;
                        baseCost = pricePerSecond * durationSeconds;
                        logger.warn(`Operation ${operation} not found in pricing, using Generate pricing: $${pricePerSecond} per second`);
                    } else {
                        throw new Error(`No pricing found for operation ${operation} and no Generate fallback available`);
                    }
                }
            } catch (parseError) {
                logger.error(`Error parsing price_video JSON for model ${modelId}:`, parseError);
                videoPricing = null;
            }
        }

        // Fallback pricing if no price_video data available or parsing failed
        if (!videoPricing || baseCost === 0) {
            logger.warn(`No valid price_video data for model ${modelId}, using fallback pricing`);
            pricePerSecond = 1.00; // Default $1.00 per second for Runway
            baseCost = pricePerSecond * durationSeconds;
        }

        // For direct providers, use simple markup
        if (model.provider.name === 'runway') {
            // Direct provider - minimal markup for Runway
            const totalCost = baseCost * 1.1; // 10% markup for direct Runway
            return {
                baseCost,
                fixedMarkup: 0,
                percentageMarkup: baseCost * 0.1,
                totalMarkup: baseCost * 0.1,
                totalCost,
                model: model.model_slug,
                modelId: model.id,
                durationSeconds,
                pricePerSecond,
                operation,
                videoPricing
            };
        } else {
            // For aggregator providers, use the unified cost calculator
            try {
                const costResult = await costCalculator.calculateCost({
                    provider: model.provider.name,
                    modelId: model.id,
                    apiModelId: model.api_model_id,
                    inputTokens: 0, // Videos don't use tokens
                    outputTokens: 0
                });

                // Override the base cost with video-specific pricing
                const markup = costResult.total_cost_for_user - costResult.total_cost_aigens;
                const totalCost = baseCost + (markup > 0 ? markup : 0);

                return {
                    baseCost,
                    fixedMarkup: costResult.fixed_markup_value || 0,
                    percentageMarkup: costResult.markup_value || 0,
                    totalMarkup: markup || 0,
                    totalCost,
                    model: model.model_slug,
                    modelId: model.id,
                    durationSeconds,
                    pricePerSecond,
                    operation,
                    videoPricing
                };
            } catch (costError) {
                logger.warn(`Cost calculator failed for ${model.model_slug}, using simple markup:`, costError.message);
                // Fallback to simple markup
                const totalCost = baseCost * 1.15; // 15% markup as fallback
                return {
                    baseCost,
                    fixedMarkup: 0,
                    percentageMarkup: baseCost * 0.15,
                    totalMarkup: baseCost * 0.15,
                    totalCost,
                    model: model.model_slug,
                    modelId: model.id,
                    durationSeconds,
                    pricePerSecond,
                    operation,
                    videoPricing
                };
            }
        }
    } catch (error) {
        console.error('Error calculating video cost:', error);
        throw error;
    }
};

/**
 * Verifica se l'utente ha fondi sufficienti per la richiesta
 * @param {number} userId - ID dell'utente
 * @param {number} estimatedCost - Costo stimato della richiesta
 * @returns {Promise<boolean>} True se l'utente ha fondi sufficienti
 */
const checkUserFunds = async (userId, estimatedCost) => {
    const Wallet = db.models.Wallet;
    const wallet = await Wallet.findOne({ where: { user_id: userId } });

    if (!wallet) {
        throw new Error('Portafoglio utente non trovato');
    }

    // Add more detailed logging for diagnostics
    logger.info(`[${new Date().toISOString()}] Checking funds for user ${userId}: balance=${wallet.balance}, required=${estimatedCost}`);

    // Ensure balance is treated as a number
    const balance = parseFloat(wallet.balance || 0);

    if (balance < estimatedCost) {
        logger.info(`[${new Date().toISOString()}] Insufficient funds detected: ${balance} < ${estimatedCost}`);
        throw new Error(`Fondi insufficienti. Costo stimato: ${estimatedCost.toFixed(6)} USD. Saldo corrente: ${balance.toFixed(6)} USD. Ricarica il tuo portafoglio per continuare.`);
    }

    return true;
};

/**
 * Salva un messaggio nel database
 * @param {Object} messageData - Dati del messaggio
 * @returns {Promise<Object>} Messaggio salvato
 */
const saveMessage = async (messageData) => {
    const Message = db.models.Message;
    return await Message.create(messageData);
};

/**
 * Salva un allegato nel database
 * @param {Object} attachmentData - Dati dell'allegato
 * @returns {Promise<Object>} Allegato salvato
 */
const saveAttachment = async (attachmentData) => {
    const Attachment = db.models.Attachment;
    return await Attachment.create(attachmentData);
};

/**
 * Salva i dettagli del costo del messaggio
 * @param {Object} costDetails - Dettagli del costo
 * @param {number} messageId - ID del messaggio
 * @param {number} chatId - ID della chat
 * @param {number} userId - ID dell'utente
 * @returns {Promise<Object>} Dettagli del costo salvati
 */
const saveMessageCost = async (costDetails, messageId, chatId, userId) => {
    // If we don't have a modelId, get a fallback model ID for Runway
    let modelId = costDetails.modelId;

    if (!modelId) {
        try {
            // Try to find a Runway model in the database to use as fallback
            const Model = db.models.Model;
            const fallbackModel = await Model.findOne({
                where: {
                    id_provider: await getRunwayProviderId(),
                    is_active: true
                }
            });

            if (fallbackModel) {
                modelId = fallbackModel.id;
                logger.info(`[${new Date().toISOString()}] Using fallback model ID: ${modelId} for cost tracking`);
            } else {
                // No Runway models found, set to 0 as last resort
                modelId = 0;
                logger.info(`[${new Date().toISOString()}] No fallback model found, using modelId: 0 for cost tracking`);
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error finding fallback model:`, error);
            modelId = 0; // Default to 0 if there's an error
        }
    }

    const MessageCost = db.models.MessageCost;
    return await MessageCost.create({
        message_id: messageId,
        chat_id: chatId,
        user_id: userId,
        model_slug: modelId,
        input_tokens: 0, // Non ci sono token per i video
        output_tokens: 0, // Non ci sono token per i video
        total_tokens: 0, // Non ci sono token per i video
        base_cost: costDetails.baseCost,
        fixed_markup: costDetails.fixedMarkup,
        percentage_markup: costDetails.percentageMarkup,
        total_markup: costDetails.totalMarkup,
        total_cost: costDetails.totalCost,
        model_used: costDetails.model
    });
};

/**
 * Aggiorna il saldo del portafoglio dell'utente
 * @param {number} userId - ID dell'utente
 * @param {number} amount - Importo da sottrarre (negativo)
 * @returns {Promise<Object>} Portafoglio aggiornato
 */
const updateWalletBalance = async (userId, amount) => {
    const Wallet = db.models.Wallet;
    const Transaction = db.models.Transaction;
    const wallet = await Wallet.findOne({ where: { user_id: userId } });

    if (!wallet) {
        throw new Error('Portafoglio utente non trovato');
    }

    // Aggiorna il saldo
    wallet.balance = parseFloat(wallet.balance) + amount;
    await wallet.save();

    // Registra la transazione
    await Transaction.create({
        user_id: userId,
        wallet_id: wallet.id,
        amount: amount,
        currency: wallet.currency,
        type: 'usage',
        payment_method: 'system',
        status: 'completed',
        description: 'Utilizzo servizio Runway AI'
    });

    return wallet;
};

/**
 * Scarica un video da un URL e lo salva su Google Cloud Storage
 * @param {string} videoUrl - URL del video da scaricare
 * @param {string} fileName - Nome del file da salvare
 * @param {number} userId - ID dell'utente per organizzazione delle cartelle
 * @param {number} chatId - ID della chat per organizzazione delle cartelle
 * @returns {Promise<Object>} Oggetto con informazioni del file salvato su GCS
 */
const downloadAndSaveVideo = async (videoUrl, fileName, userId, chatId) => {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            logger.info(`[${new Date().toISOString()}] Downloading video (attempt ${attempts}/${maxAttempts}): ${videoUrl}`);

            // Add cache busting parameter if not already a query parameter
            const url = new URL(videoUrl);
            if (!url.searchParams.has('_nocache')) {
                url.searchParams.append('_nocache', Date.now());
            }

            const response = await axios({
                method: 'get',
                url: url.toString(),
                responseType: 'arraybuffer',
                timeout: 60000, // 60 seconds timeout for video downloads
                maxContentLength: 100 * 1024 * 1024, // 100MB limit
                headers: {
                    'Authorization': `Bearer ${RUNWAY_API_KEY}`,
                    'Accept': 'video/mp4, video/*',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });

            if (!response.data || response.data.length === 0) {
                throw new Error("Empty response received");
            }

            logger.info(`[${new Date().toISOString()}] Video downloaded successfully, size: ${response.data.length} bytes, content-type: ${response.headers['content-type']}`);

            // Determine actual file format from content-type and URL
            const contentType = response.headers['content-type'] || 'video/mp4';
            let fileExtension = '.mp4';
            
            if (contentType.includes('webm') || videoUrl.includes('.webm')) {
                fileExtension = '.webm';
            } else if (contentType.includes('mov') || videoUrl.includes('.mov')) {
                fileExtension = '.mov';
            } else if (contentType.includes('avi') || videoUrl.includes('.avi')) {
                fileExtension = '.avi';
            }

            logger.info(`[${new Date().toISOString()}] Detected video format: ${contentType}, extension: ${fileExtension}`);

            // Create buffer and validate
            const videoBuffer = Buffer.from(response.data);
            logger.info(`[${new Date().toISOString()}] Created buffer with size: ${videoBuffer.length} bytes`);

            if (videoBuffer.length === 0) {
                throw new Error("Empty video buffer created");
            }

            // Try GCS upload first, fallback to local storage if it fails
            logger.info(`[${new Date().toISOString()}] Starting video upload (GCS with local fallback)...`);
            
            try {
                // First, try Google Cloud Storage upload
                logger.info(`[${new Date().toISOString()}] Attempting GCS upload...`);
                
                const uploadResult = await Promise.race([
                    gcsService.uploadFile(
                        videoBuffer,
                        `${fileName}${fileExtension}`,
                        {
                            folder: `chat_${chatId}`, // Organize by chat
                            contentType: contentType,
                            makePublic: false, // Keep private, access via signed URLs
                            metadata: {
                                source: 'runway-ai',
                                userId: userId.toString(),
                                chatId: chatId.toString(),
                                originalUrl: videoUrl,
                                generatedAt: new Date().toISOString()
                            }
                        }
                    ),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('GCS upload timeout after 60 seconds')), 60000)
                    )
                ]);
                
                logger.info(`[${new Date().toISOString()}] Video uploaded to GCS successfully: ${uploadResult.gsUrl}`);
                
                return {
                    filePath: uploadResult.gsUrl, // GCS path for database storage
                    fileName: uploadResult.fileName,
                    originalName: uploadResult.originalName,
                    size: uploadResult.size,
                    contentType: uploadResult.contentType,
                    downloadUrl: uploadResult.downloadUrl, // Signed URL for frontend access
                    publicUrl: uploadResult.publicUrl, // Public URL if made public
                    bucket: uploadResult.bucket,
                    gcsPath: uploadResult.filePath, // Path within bucket
                    storageType: 'gcs'
                };
                
            } catch (gcsError) {
                // GCS upload failed, fallback to local storage
                logger.warn(`[${new Date().toISOString()}] GCS upload failed: ${gcsError.message}`);
                logger.info(`[${new Date().toISOString()}] Falling back to local storage...`);
                
                try {
                    // Create local uploads directory
                    const uploadDir = path.join(process.cwd(), 'uploads', 'videos');
                    await fs.mkdir(uploadDir, { recursive: true });
                    
                    // Generate unique filename for local storage
                    const uniqueFileName = `${Date.now()}-${fileName}${fileExtension}`;
                    const localFilePath = path.join(uploadDir, uniqueFileName);
                    
                    // Save video locally
                    await fs.writeFile(localFilePath, videoBuffer);
                    
                    // Verify file was saved
                    const stats = await fs.stat(localFilePath);
                    
                    logger.info(`[${new Date().toISOString()}] Video saved locally: ${localFilePath} (${stats.size} bytes)`);
                    
                    return {
                        filePath: localFilePath, // Local path for database storage
                        fileName: uniqueFileName,
                        originalName: `${fileName}${fileExtension}`,
                        size: stats.size,
                        contentType: contentType,
                        downloadUrl: `/api/v1/uploads/videos/${uniqueFileName}`, // Local URL for frontend access
                        publicUrl: null, // No public URL for local files
                        bucket: null, // Not applicable for local storage
                        gcsPath: null, // Not applicable for local storage
                        storageType: 'local',
                        fallbackReason: gcsError.message
                    };
                    
                } catch (localError) {
                    // Both GCS and local storage failed
                    logger.error(`[${new Date().toISOString()}] Local storage fallback also failed: ${localError.message}`);
                    throw new Error(`Both GCS and local storage failed. GCS: ${gcsError.message}, Local: ${localError.message}`);
                }
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error during video download/upload (attempt ${attempts}/${maxAttempts}):`, error);

            // Log more detailed error information
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response headers:', error.response.headers);
            } else if (error.request) {
                console.error('No response received');
            }

            // If we've tried the maximum number of times, throw the error
            if (attempts >= maxAttempts) {
                throw new Error(`Impossibile scaricare e salvare il video dopo ${maxAttempts} tentativi: ${error.message}`);
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
        }
    }
};

/**
 * Polling per controllare lo stato di un task Runway
 * @param {string} taskId - ID del task
 * @param {Function} onProgress - Callback per aggiornamenti di progresso
 * @returns {Promise<Object>} Risultato del task
 */
const pollRunwayTask = async (taskId, onProgress = null) => {
    const maxAttempts = 120; // 10 minuti con polling ogni 5 secondi
    let attempts = 0;

    while (attempts < maxAttempts) {
        attempts++;
        
        try {
            const response = await axios.get(`${RUNWAY_API_URL}/tasks/${taskId}`, {
                headers: {
                    'Authorization': `Bearer ${RUNWAY_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const taskData = response.data;

            // Invia aggiornamento di progresso
            if (onProgress) {
                const progress = Math.min(20 + (attempts * 1), 90);
                onProgress({
                    type: 'video-generation-progress',
                    data: {
                        progress,
                        status: taskData.status,
                        message: `Generazione in corso... (${attempts}/${maxAttempts})`
                    }
                });
            }

            if (taskData.status === 'SUCCEEDED') {
                // Task completed successfully
                if (taskData.output && taskData.output.length > 0) {
                    return { videoUrl: taskData.output[0] };
                }
                throw new Error('Output video non trovato nel task completato');
            }

            if (taskData.status === 'FAILED') {
                const failureReason = taskData.failure_reason || 'Task failed without specific error message';
                throw new Error(`Runway task failed: ${failureReason}`);
            }

            if (taskData.status === 'CANCELLED') {
                throw new Error('Runway task was cancelled');
            }

            // Task is still running, wait before next poll
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds

        } catch (error) {
            if (attempts >= maxAttempts) {
                throw error;
            }
            
            // If it's a temporary error, wait and retry
            if (error.response && (error.response.status === 429 || error.response.status >= 500)) {
                await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds for rate limiting or server errors
            } else {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    throw new Error('Timeout: operazione non completata entro 10 minuti');
};

/**
 * Helper function per convertire il modello nel formato API
 * @param {string} model - Nome del modello
 * @returns {string} Nome del modello convertito per l'API
 */
const convertModelForAPI = (model) => {
    const modelMap = {
        'gen-3-alpha-runway': 'gen3a_turbo',
        'gen-3-alpha-turbo-runway': 'gen3a_turbo',
        'gen-4-runway': 'gen4',
        'gen-4-turbo-runway': 'gen4_turbo'
    };

    return modelMap[model] || 'gen3a_turbo'; // Default to gen3a_turbo
};

/**
 * Servizio principale per gestire le richieste a Runway
 * @param {Object} requestData - Dati della richiesta
 * @returns {Promise<Object>} Risposta elaborata
 */
const processRunwayRequest = async (requestData) => {
    const {
        model,
        prompt,
        chatId,
        userId,
        agent_type = 'video',
        duration = 5, // Durata di default: 5 secondi
        ratio = "16:9", // Rapporto di default: 16:9
        seed = null,
        watermark = false,
        imagePrompt = null // Optional image for image-to-video
    } = requestData;

    if (!model || !prompt || !chatId || !userId) {
        throw new Error('Parametri mancanti: model, prompt, chatId e userId sono obbligatori');
    }

    // Verifica che il modello esista
    const isAvailable = await isModelAvailable(model);
    if (!isAvailable) {
        throw new Error(`Modello non supportato: ${model}. Utilizzare uno dei modelli disponibili.`);
    }

    // Verifica API key
    if (!RUNWAY_API_KEY) {
        throw new Error('Runway API key non configurata');
    }

    // Verifica che l'utente e la chat esistano
    const User = db.models.User;
    const Chat = db.models.Chat;
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

    // Resolve model identifier to model ID for cost calculation
    const Model = db.models.Model;
    const providerId = await getRunwayProviderId();
    
    // Try to find by model_slug first
    let resolvedModel = await Model.findOne({
        where: {
            model_slug: model,
            id_provider: providerId,
            is_active: true
        }
    });
    
    // If not found by model_slug, try by api_model_id
    if (!resolvedModel) {
        resolvedModel = await Model.findOne({
            where: {
                api_model_id: model,
                id_provider: providerId,
                is_active: true
            }
        });
    }
    
    if (!resolvedModel) {
        throw new Error(`Model ${model} not found in database (searched by model_slug and api_model_id)`);
    }
    
    logger.info(`Model resolved: ${model} → ${resolvedModel.model_slug} (ID: ${resolvedModel.id})`);
    
    // Calcola il costo stimato
    const operation = 'Generate';
    const costEstimate = await calculateCost(resolvedModel.id, duration, operation);

    // Verifica se l'utente ha fondi sufficienti
    const hasSufficientFunds = await checkUserFunds(userId, costEstimate.totalCost);

    if (!hasSufficientFunds) {
        throw new Error(`Fondi insufficienti. Costo stimato: ${costEstimate.totalCost.toFixed(6)} USD. Ricarica il tuo portafoglio per continuare.`);
    }

    // Salva il messaggio dell'utente
    let userMessage;
    try {
        userMessage = await saveMessage({
            chat_id: chatId,
            role: 'user',
            content: prompt,
            tokens_used: 0, // Non ci sono token per i video
            agent_type: agent_type,
            agent_model: model
        });

        // Determina se usare text-to-video o image-to-video
        const endpoint = imagePrompt ? '/image_to_video' : '/text_to_video';
        
        // Prepara la richiesta per Runway
        const requestPayload = {
            model: convertModelForAPI(model),
            promptText: prompt,
            ratio: ratio,
            duration: duration,
            watermark: watermark
        };

        // Aggiungi seed se fornito
        if (seed !== null) {
            requestPayload.seed = seed;
        }

        // Aggiungi immagine se fornita (per image-to-video)
        if (imagePrompt) {
            requestPayload.promptImage = imagePrompt;
        }

        // Effettua la chiamata a Runway
        const response = await axios.post(`${RUNWAY_API_URL}${endpoint}`, requestPayload, {
            headers: {
                'Authorization': `Bearer ${RUNWAY_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        logger.info('Runway API response:', JSON.stringify(response.data, null, 2));

        // Estrai l'ID del task dalla risposta
        const taskId = response.data.id;
        if (!taskId) {
            throw new Error('Task ID non trovato nella risposta di Runway');
        }

        // Inizia il polling per il completamento
        const taskResult = await pollRunwayTask(taskId);
        const videoUrl = taskResult.videoUrl;

        // Scarica e salva il video su Google Cloud Storage
        const videoResult = await downloadAndSaveVideo(videoUrl, `runway-${Date.now()}`, userId, chatId);

        // Crea un allegato per il video
        const attachment = await saveAttachment({
            user_id: userId,
            chat_id: chatId,
            message_id: null, // Verrà associato al messaggio dell'assistente
            file_name: videoResult.fileName,
            original_name: videoResult.originalName,
            file_path: videoResult.filePath, // GCS URL (gs://...)
            file_size: videoResult.size,
            mime_type: videoResult.contentType,
            file_type: 'video'
        });

        // Add metadata to attachment for frontend usage
        attachment.downloadUrl = videoResult.downloadUrl;
        attachment.publicUrl = videoResult.publicUrl;
        attachment.bucket = videoResult.bucket;
        attachment.gcsPath = videoResult.gcsPath;

        // Crea un messaggio di risposta
        const assistantResponse = `Video generato usando Runway ${convertModelForAPI(model)}: "${prompt}"`;

        const assistantMessage = await saveMessage({
            chat_id: chatId,
            role: 'assistant',
            content: assistantResponse,
            tokens_used: 0, // Non ci sono token per i video
            agent_type: agent_type,
            agent_model: model
        });

        // Associa l'allegato al messaggio dell'assistente
        attachment.message_id = assistantMessage.id;
        await attachment.save();

        logger.info(`[${new Date().toISOString()}] Video attachment associated with assistant message ID: ${assistantMessage.id}`);

        // Salva i dettagli del costo
        const cost = await saveMessageCost(costEstimate, assistantMessage.id, chatId, userId);
        logger.info(`[${new Date().toISOString()}] Saved cost details for message ID: ${assistantMessage.id}`);

        // Aggiorna il saldo del portafoglio (sottrai il costo totale)
        const wallet = await updateWalletBalance(userId, -costEstimate.totalCost);
        logger.info(`[${new Date().toISOString()}] Updated wallet balance for user ID: ${userId}, new balance: ${wallet.balance}`);

        // Aggiorna il timestamp dell'ultima attività della chat
        chat.last_message_at = new Date();
        await chat.save();
        logger.info(`[${new Date().toISOString()}] Updated chat last activity timestamp: ${chat.last_message_at}`);

        // Make sure everything is fully processed before returning
        await new Promise(resolve => setTimeout(resolve, 100));

        const result = {
            success: true,
            messageId: assistantMessage.id,
            userMessageId: userMessage.id,
            message: assistantResponse,
            attachments: [{
                id: attachment.id,
                file_type: attachment.file_type,
                file_name: attachment.file_name,
                file_path: attachment.file_path, // GCS URL for database
                downloadUrl: attachment.downloadUrl, // Signed URL for frontend access
                publicUrl: attachment.publicUrl, // Public URL if available
                mime_type: attachment.mime_type,
                file_size: attachment.file_size,
                bucket: attachment.bucket,
                gcsPath: attachment.gcsPath
            }],
            cost: costEstimate,
            created_at: assistantMessage.created_at
        };

        logger.info(`[${new Date().toISOString()}] Runway request processing completed for message ID: ${assistantMessage.id}`);
        return result;
    } catch (error) {
        // In caso di errore, elimina il messaggio dell'utente e i relativi costi se esistono
        if (userMessage) {
            const MessageCost = db.models.MessageCost;
            const Attachment = db.models.Attachment;
            
            // Elimina eventuali costi associati al messaggio
            await MessageCost.destroy({ where: { message_id: userMessage.id } });

            // Elimina eventuali allegati associati al messaggio
            await Attachment.destroy({ where: { message_id: userMessage.id } });

            // Elimina il messaggio
            await userMessage.destroy();
        }

        throw new Error(`Errore durante la richiesta a Runway: ${error.message}`);
    }
};

/**
 * Adattatore per il metodo sendRequest che accetta i parametri nel formato usato in messages.js
 * @param {string} prompt - Il prompt dell'utente
 * @param {string} model - Il modello Runway selezionato
 * @param {number} userId - ID dell'utente
 * @param {number} chatId - ID della chat
 * @param {string} agentType - Tipo di agente (video per Runway)
 * @param {Array} attachmentIds - Array di ID degli allegati (può essere usato per image-to-video)
 * @param {Function} onStream - Callback per gestire lo streaming
 * @returns {Promise<Object>} Risposta elaborata in formato standard per il frontend
 */
const sendRequest = async (prompt, model, userId, chatId, agentType = 'video', attachmentIds = [], onStream = null) => {
    // Parse options from request or use defaults for video generation
    const duration = 5;
    const ratio = "16:9";
    const seed = null;
    const watermark = false;
    const imagePrompt = null; // TODO: Process attachmentIds for image-to-video
    
    try {
        // Chiama processRunwayRequest con i parametri corretti
        const response = await processRunwayRequest({
            model,
            prompt,
            chatId,
            userId,
            agent_type: agentType,
            duration,
            ratio,
            seed,
            watermark,
            imagePrompt
        });
        
        // For streaming compatibility with messages API, send the response content as text
        const responseText = response.message || 'Video generato con successo';
        
        // Call the streaming callback if provided
        if (onStream) {
            // Send the text response
            onStream(responseText, {
                input_tokens: 0, // Videos don't use tokens
                output_tokens: 0,
                total_tokens: 0
            });
        }
        
        // Return videos and cost for backward compatibility
        return { 
            videos: response.attachments, 
            cost: response.cost,
            message: responseText,
            messageId: response.messageId,
            userMessageId: response.userMessageId,
            success: true
        };
    } catch (error) {
        logger.error('Runway sendRequest failed:', error);
        return { 
            videos: [], 
            cost: null, 
            error: error.message,
            success: false
        };
    }
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
        console.error('Errore nel recupero dei modelli disponibili:', error);
        return [];
    }
};

/**
 * Verifica se un modello è disponibile
 * @param {string} modelId - ID del modello da verificare
 * @returns {Promise<boolean>} True se il modello è disponibile
 */
const isModelAvailable = async (modelId) => {
    try {
        const Model = db.models.Model;
        const providerId = await getRunwayProviderId();
        
        // Check if the modelId exactly matches a model_slug in database
        let dbModel = await Model.findOne({
            where: {
                model_slug: modelId,
                id_provider: providerId,
                is_active: true
            }
        });
        
        if (dbModel) {
            return true;
        }
        
        // If not found, try to find by api_model_id
        dbModel = await Model.findOne({
            where: {
                api_model_id: modelId,
                id_provider: providerId,
                is_active: true
            }
        });
        
        if (dbModel) {
            return true;
        }
        
        // Check for Runway model names
        const validRunwayModels = ['gen-3-alpha', 'gen-3-alpha-turbo', 'gen-4', 'gen-4-turbo'];
        if (validRunwayModels.includes(modelId)) {
            // For these names, try to find any model with similar API model ID
            dbModel = await Model.findOne({
                where: {
                    api_model_id: modelId,
                    id_provider: providerId,
                    is_active: true
                }
            });
            return !!dbModel;
        }

        return false;
    } catch (error) {
        console.error('Errore durante la verifica della disponibilità del modello:', error);
        return false;
    }
};

module.exports = {
    processRunwayRequest,
    calculateCost,
    getAvailableModels,
    isModelAvailable,
    sendRequest,
    convertModelForAPI,
    downloadAndSaveVideo, // Export for testing
    pollRunwayTask // Export for testing
};