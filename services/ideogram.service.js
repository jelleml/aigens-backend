// Fix per OpenSSL ERR_OSSL_UNSUPPORTED in Node.js 20+ - DEVE essere prima di qualsiasi import
if (process.version.startsWith('v20') || process.version.startsWith('v21')) {
    if (!process.env.NODE_OPTIONS || !process.env.NODE_OPTIONS.includes('--openssl-legacy-provider')) {
        process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '') + ' --openssl-legacy-provider';
        console.log('🔧 Applied OpenSSL legacy provider fix for Node.js 20+ compatibility in Ideogram service');
    }
}

const axios = require("axios");
const db = require("../database");
const config = require("../config/config");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const CostCalculator = require('./cost-calculator.service');

// Importazione condizionale di Google Cloud Storage con fallback
let GoogleCloudStorage;
let gcsService;
try {
    GoogleCloudStorage = require('./google-cloud-storage.service');
    gcsService = new GoogleCloudStorage();
    console.log('✅ Google Cloud Storage initialized successfully');
} catch (error) {
    console.warn('⚠️ Google Cloud Storage initialization failed, will use local fallback:', error.message);
    gcsService = null;
}
// Sistema di logging centralizzato
const { getLogger } = require('./logging');
const logger = getLogger('ideogram', 'service');

// Initialize cost calculator
const costCalculator = new CostCalculator();

// Importazione dei modelli
const { User, Chat, Message, Attachment, Wallet, Transaction, MessageCost, Model, Provider, ModelPriceScore } = db.sequelize.models;

// Configurazione dell'API Ideogram
const IDEOGRAM_API_URL = "https://api.ideogram.ai/generate";

// Cache dei modelli disponibili
let AVAILABLE_MODELS = [];
let lastModelsFetch = null;
const CACHE_DURATION = 3600000; // 1 ora in millisecondi


IDEOGRAM_PROVIDER_ID = null;

// Funzione per recuperare l'id_provider di Anthropic
async function getIdeogramProviderId() {
    if (IDEOGRAM_PROVIDER_ID) return IDEOGRAM_PROVIDER_ID;
    const Provider = db.models.Provider;
    const provider = await Provider.findOne({ where: { name: 'ideogram' } });
    if (!provider) throw new Error('Provider Idogram non trovato');
    IDEOGRAM_PROVIDER_ID = provider.id;
    return IDEOGRAM_PROVIDER_ID;
}


/**
 * Recupera i modelli disponibili dall'API di Ideogram
 * @returns {Promise<Array>} Array di modelli disponibili
 */
const fetchAvailableModels = async () => {
    try {
        // Recupera tutti i modelli Ideogram dal database
        const dbModels = await Model.findAll({
            where: {
                id_provider: await getIdeogramProviderId(),
                is_active: true
            }
        });

        if (!dbModels || dbModels.length === 0) {
            logger.warn("Nessun modello Ideogram trovato nel database");
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
 * Calcola il costo della generazione di immagini usando il sistema unificato
 * @param {string|number} modelId - ID del modello Ideogram
 * @param {number} count - Numero di immagini da generare
 * @param {string} operation - Tipo di operazione (Generate, Remix, Edit, Reframe, Replace BG, Describe)
 * @returns {Promise<Object>} Oggetto con i dettagli del costo
 */
const calculateCost = async (modelId, count = 1, operation = 'Generate') => {
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

        // Get pricing data - for images we need price_image field
        const ModelPriceScore = db.models.ModelPriceScore;
        const priceScore = await ModelPriceScore.findOne({
            where: { id_model: model.id }
        });

        let baseCost = 0;
        let pricePerImage = 0;
        let operationPricing = null;

        if (priceScore && priceScore.price_image) {
            try {
                // Parse JSON pricing data from price_image field
                operationPricing = JSON.parse(priceScore.price_image);
                logger.info(`Parsed operation pricing for model ${modelId}:`, operationPricing);

                // Select appropriate operation pricing based on request type
                const operationPrice = operationPricing[operation];
                if (operationPrice !== undefined && operationPrice !== null) {
                    pricePerImage = Number(operationPrice) || 0;
                    baseCost = pricePerImage * count;
                    logger.info(`Using operation-specific pricing for ${operation}: $${pricePerImage} per image`);
                } else {
                    // If specific operation not found, try to use Generate as default
                    const defaultPrice = operationPricing['Generate'] || operationPricing['generate'];
                    if (defaultPrice !== undefined && defaultPrice !== null) {
                        pricePerImage = Number(defaultPrice) || 0;
                        baseCost = pricePerImage * count;
                        logger.warn(`Operation ${operation} not found in pricing, using Generate pricing: $${pricePerImage} per image`);
                    } else {
                        throw new Error(`No pricing found for operation ${operation} and no Generate fallback available`);
                    }
                }
            } catch (parseError) {
                logger.error(`Error parsing price_image JSON for model ${modelId}:`, parseError);
                // Fall through to fallback pricing
                operationPricing = null;
            }
        }

        // Fallback pricing if no price_image data available or parsing failed
        if (!operationPricing || baseCost === 0) {
            logger.warn(`No valid price_image data for model ${modelId}, using fallback pricing`);
            pricePerImage = 0.05; // Default $0.05 per image
            baseCost = pricePerImage * count;
        }

        // For direct providers, use simple markup
        if (model.provider.name === 'ideogram') {
            // Direct provider - minimal markup for ideogram
            const totalCost = baseCost * 1.1; // 10% markup for direct ideogram
            return {
                baseCost,
                fixedMarkup: 0,
                percentageMarkup: baseCost * 0.1,
                totalMarkup: baseCost * 0.1,
                totalCost,
                model: model.model_slug,
                modelId: model.id,
                count,
                pricePerImage,
                operation,
                operationPricing
            };
        } else {
            // For aggregator providers, use the unified cost calculator
            try {
                const costResult = await costCalculator.calculateCost({
                    provider: model.provider.name,
                    modelId: model.id,
                    apiModelId: model.api_model_id,
                    inputTokens: 0, // Images don't use tokens
                    outputTokens: 0
                });

                // Override the base cost with image-specific pricing
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
                    count,
                    pricePerImage,
                    operation,
                    operationPricing
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
                    count,
                    pricePerImage,
                    operation,
                    operationPricing
                };
            }
        }
    } catch (error) {
        console.error('Error calculating image cost:', error);
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
    // If we don't have a modelId, get a fallback model ID for ideogram
    let modelId = costDetails.modelId;

    if (!modelId) {
        try {
            // Try to find an ideogram model in the database to use as fallback
            const Model = db.models.Model;
            const fallbackModel = await Model.findOne({
                where: {
                    id_provider: await getIdeogramProviderId(),
                    is_active: true
                }
            });

            if (fallbackModel) {
                modelId = fallbackModel.id;
                logger.info(`[${new Date().toISOString()}] Using fallback model ID: ${modelId} for cost tracking`);
            } else {
                // No ideogram models found, set to 0 as last resort
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
        input_tokens: 0, // Non ci sono token per le immagini
        output_tokens: 0, // Non ci sono token per le immagini
        total_tokens: 0, // Non ci sono token per le immagini
        base_cost: costDetails.baseCost,
        fixed_markup: costDetails.fixedMarkup,
        percentage_markup: costDetails.percentageMarkup,
        total_markup: costDetails.totalMarkup,
        total_cost: costDetails.totalCost,
        credit_cost: costDetails.creditCost || costDetails.totalCost,
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
        description: 'Utilizzo servizio Ideogram AI'
    });

    return wallet;
};

/**
 * Scarica un'immagine da un URL e la salva temporaneamente
 * @param {string} imageUrl - URL dell'immagine da scaricare
 * @param {string} fileName - Nome del file da salvare
 * @param {number} userId - ID dell'utente per organizzazione delle cartelle
 * @param {number} chatId - ID della chat per organizzazione delle cartelle
 * @returns {Promise<Object>} Oggetto con informazioni del file salvato temporaneamente
 */
const downloadImageToTemp = async (imageUrl, fileName, userId, chatId) => {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            logger.info(`[${new Date().toISOString()}] Downloading image (attempt ${attempts}/${maxAttempts}): ${imageUrl}`);

            // Add cache busting parameter if not already a query parameter
            const url = new URL(imageUrl);
            if (!url.searchParams.has('_nocache')) {
                url.searchParams.append('_nocache', Date.now());
            }

            const response = await axios({
                method: 'get',
                url: url.toString(),
                responseType: 'arraybuffer',
                timeout: 30000, // 30 seconds timeout
                maxContentLength: 20 * 1024 * 1024, // 20MB limit
                headers: {
                    'Accept': 'image/jpeg, image/png, image/*',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });

            if (!response.data || response.data.length === 0) {
                throw new Error("Empty response received");
            }

            logger.info(`[${new Date().toISOString()}] Image downloaded successfully, size: ${response.data.length} bytes, content-type: ${response.headers['content-type']}`);

            // Determine actual file format from content-type and URL
            const contentType = response.headers['content-type'] || 'image/jpeg';
            let fileExtension = '.jpg';

            if (contentType.includes('png') || imageUrl.includes('.png')) {
                fileExtension = '.png';
            } else if (contentType.includes('webp') || imageUrl.includes('.webp')) {
                fileExtension = '.webp';
            } else if (contentType.includes('gif') || imageUrl.includes('.gif')) {
                fileExtension = '.gif';
            }

            logger.info(`[${new Date().toISOString()}] Detected image format: ${contentType}, extension: ${fileExtension}`);

            // Create buffer and validate
            const imageBuffer = Buffer.from(response.data);
            logger.info(`[${new Date().toISOString()}] Created buffer with size: ${imageBuffer.length} bytes`);

            if (imageBuffer.length === 0) {
                throw new Error("Empty image buffer created");
            }

            // Save image to temporary location
            logger.info(`[${new Date().toISOString()}] Saving image to temporary location...`);

            try {
                // Create local uploads directory
                const uploadDir = path.join(process.cwd(), 'uploads', 'images');
                await fs.mkdir(uploadDir, { recursive: true });

                // Generate unique filename for temporary storage
                const uniqueFileName = `temp-${Date.now()}-${fileName}${fileExtension}`;
                const tempFilePath = path.join(uploadDir, uniqueFileName);

                // Save image locally
                await fs.writeFile(tempFilePath, imageBuffer);

                // Verify file was saved
                const stats = await fs.stat(tempFilePath);

                logger.info(`[${new Date().toISOString()}] Image saved temporarily: ${tempFilePath} (${stats.size} bytes)`);

                return {
                    tempPath: tempFilePath, // Temporary path for later processing
                    fileName: uniqueFileName,
                    originalName: `${fileName}${fileExtension}`,
                    size: stats.size,
                    contentType: contentType,
                    originalUrl: imageUrl,
                    storageType: 'temp',
                    userId: userId,
                    chatId: chatId
                };

            } catch (localError) {
                logger.error(`[${new Date().toISOString()}] Failed to save image temporarily: ${localError.message}`);
                throw new Error(`Failed to save image temporarily: ${localError.message}`);
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error during image download/upload (attempt ${attempts}/${maxAttempts}):`, error);

            // Log more detailed error information
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response headers:', error.response.headers);
            } else if (error.request) {
                console.error('No response received');
            }

            // If we've tried the maximum number of times, throw the error
            if (attempts >= maxAttempts) {
                throw new Error(`Impossibile scaricare e salvare l'immagine dopo ${maxAttempts} tentativi: ${error.message}`);
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
    }
};

/**
 * Helper function to convert style to the format expected by the API
 * @param {string} style - The style to convert
 * @returns {string} The converted style
 */
const convertStyle = (style) => {
    // Standard styles
    const styleMap = {
        "natural": "REALISTIC",
        "realistic": "REALISTIC",
        "anime": "ANIME",
        "painting": "PAINTING",
        "sketch": "SKETCH",
        "render": "RENDER",
        "cinematic": "CINEMATIC"
    };

    return (styleMap[style.toLowerCase()] || "REALISTIC");
};

/**
 * Helper function to convert aspect ratio to the format expected by the API
 * @param {string} ratio - The aspect ratio to convert
 * @returns {string} The converted aspect ratio
 */
const convertAspectRatio = (ratio) => {
    // Standard aspect ratios
    const aspectRatioMap = {
        "1:1": "ASPECT_1_1",
        "4:3": "ASPECT_4_3",
        "3:4": "ASPECT_3_4",
        "16:9": "ASPECT_16_9",
        "9:16": "ASPECT_9_16",
        "3:2": "ASPECT_3_2",
        "2:3": "ASPECT_2_3",
        "16:10": "ASPECT_16_10",
        "10:16": "ASPECT_10_16"
    };

    return aspectRatioMap[ratio] || "ASPECT_1_1";
};

/**
 * Helper function to convert model to the format expected by the API
 * @param {string} modelId - The model ID to convert
 * @returns {string} The converted model
 */
const convertModel = (modelId) => {
    // Standard models
    const modelMap = {
        "ideogram-xl": "V_2",
        "ideogram-alpha": "V_1",
        "ideogram-v1": "V_1",
        // Add newer models to better support features like style_type
        "ideogram-v2": "V_2",
        "ideogram-v3": "V_3"
    };

    return modelMap[modelId] || "V_2"; // Default to V_2 instead of V_1 to support style
};

/**
 * Scarica multiple immagini da URL e le salva temporaneamente
 * @param {Array} imageUrls - Array di URL delle immagini da scaricare
 * @param {number} userId - ID dell'utente
 * @param {number} chatId - ID della chat
 * @returns {Promise<Array>} Array di oggetti con informazioni dei file temporanei
 */
const downloadImagesToTemp = async (imageUrls, userId, chatId) => {
    const tempImages = [];

    for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i];
        const fileName = `ideogram-${i + 1}`;

        try {
            logger.info(`[${new Date().toISOString()}] Downloading image ${i + 1}/${imageUrls.length}: ${imageUrl}`);
            const tempImage = await downloadImageToTemp(imageUrl, fileName, userId, chatId);
            tempImages.push(tempImage);
        } catch (error) {
            logger.error(`[${new Date().toISOString()}] Failed to download image ${i + 1}: ${error.message}`);
            throw new Error(`Failed to download image ${i + 1}: ${error.message}`);
        }
    }

    return tempImages;
};

/**
 * Carica immagini temporanee su Google Cloud Storage
 * @param {Array} tempImages - Array di oggetti con informazioni dei file temporanei
 * @param {number} userId - ID dell'utente
 * @param {number} chatId - ID della chat
 * @returns {Promise<Array>} Array di oggetti con informazioni dei file finali
 */
const uploadImagesToGCS = async (tempImages, userId, chatId) => {
    const finalImages = [];

    // Se GCS non è disponibile, usa direttamente gli URL di Ideogram
    if (!gcsService) {
        logger.warn(`[${new Date().toISOString()}] GCS service not available, using Ideogram URLs directly`);

        for (const tempImage of tempImages) {
            // Cleanup file temporaneo
            try {
                await fs.unlink(tempImage.tempPath);
                logger.info(`[${new Date().toISOString()}] Cleaned up temp file: ${tempImage.tempPath}`);
            } catch (cleanupError) {
                logger.warn(`[${new Date().toISOString()}] Failed to cleanup temp file ${tempImage.tempPath}: ${cleanupError.message}`);
            }

            // Usa direttamente l'URL di Ideogram
            finalImages.push({
                filePath: tempImage.originalUrl, // URL originale di Ideogram
                fileName: tempImage.fileName,
                originalName: tempImage.originalName,
                size: tempImage.size,
                contentType: tempImage.contentType,
                downloadUrl: tempImage.originalUrl, // URL diretto di Ideogram
                publicUrl: tempImage.originalUrl, // URL pubblico di Ideogram
                bucket: null,
                gcsPath: null,
                storageType: 'ideogram-direct',
                fallbackReason: 'GCS service not available'
            });
        }

        return finalImages;
    }

    for (const tempImage of tempImages) {
        try {
            logger.info(`[${new Date().toISOString()}] Uploading ${tempImage.fileName} to GCS...`);

            // Upload su GCS usando lo stesso approccio di messages.js
            const gcsResult = await gcsService.uploadFileFromPath(
                tempImage.tempPath,
                tempImage.originalName,
                {
                    folder: `chat_${chatId}`,
                    contentType: tempImage.contentType,
                    metadata: {
                        source: 'ideogram-ai',
                        userId: userId.toString(),
                        chatId: chatId.toString(),
                        originalUrl: tempImage.originalUrl,
                        generatedAt: new Date().toISOString()
                    }
                }
            );

            logger.info(`[${new Date().toISOString()}] Successfully uploaded ${tempImage.fileName} to GCS`);

            // Cleanup file temporaneo
            try {
                await fs.unlink(tempImage.tempPath);
                logger.info(`[${new Date().toISOString()}] Cleaned up temp file: ${tempImage.tempPath}`);
            } catch (cleanupError) {
                logger.warn(`[${new Date().toISOString()}] Failed to cleanup temp file ${tempImage.tempPath}: ${cleanupError.message}`);
            }

            finalImages.push({
                filePath: gcsResult.gsUrl, // GCS path for database storage
                fileName: gcsResult.fileName,
                originalName: gcsResult.originalName,
                size: gcsResult.size,
                contentType: gcsResult.contentType,
                downloadUrl: gcsResult.downloadUrl, // Signed URL for frontend access
                publicUrl: gcsResult.publicUrl, // Public URL if made public
                bucket: gcsResult.bucket,
                gcsPath: gcsResult.filePath, // Path within bucket
                storageType: 'gcs'
            });

        } catch (gcsError) {
            logger.warn(`[${new Date().toISOString()}] GCS upload failed for ${tempImage.fileName}: ${gcsError.message}`);

            // Check if it's an OpenSSL error
            if (gcsError.message.includes('ERR_OSSL_UNSUPPORTED') || gcsError.message.includes('DECODER routines::unsupported')) {
                logger.error(`[${new Date().toISOString()}] OpenSSL compatibility issue detected. This is a known issue with Node.js 20+ and Google Auth libraries.`);
                logger.info(`[${new Date().toISOString()}] Using Ideogram URL directly as fallback`);
            } else {
                logger.info(`[${new Date().toISOString()}] Using Ideogram URL directly as fallback due to GCS error`);
            }

            // Cleanup file temporaneo
            try {
                await fs.unlink(tempImage.tempPath);
                logger.info(`[${new Date().toISOString()}] Cleaned up temp file: ${tempImage.tempPath}`);
            } catch (cleanupError) {
                logger.warn(`[${new Date().toISOString()}] Failed to cleanup temp file ${tempImage.tempPath}: ${cleanupError.message}`);
            }

            // Se GCS fallisce, usa direttamente l'URL di Ideogram
            finalImages.push({
                filePath: tempImage.originalUrl, // URL originale di Ideogram
                fileName: tempImage.fileName,
                originalName: tempImage.originalName,
                size: tempImage.size,
                contentType: tempImage.contentType,
                downloadUrl: tempImage.originalUrl, // URL diretto di Ideogram
                publicUrl: tempImage.originalUrl, // URL pubblico di Ideogram
                bucket: null,
                gcsPath: null,
                storageType: 'ideogram-direct',
                fallbackReason: gcsError.message
            });
        }
    }

    return finalImages;
};

/**
 * Pulisce i file temporanei in caso di errore
 * @param {Array} tempImages - Array di oggetti con informazioni dei file temporanei
 */
const cleanupTempFiles = async (tempImages) => {
    for (const tempImage of tempImages) {
        try {
            await fs.unlink(tempImage.tempPath);
            logger.info(`[${new Date().toISOString()}] Cleaned up temp file: ${tempImage.tempPath}`);
        } catch (error) {
            logger.warn(`[${new Date().toISOString()}] Failed to cleanup temp file ${tempImage.tempPath}: ${error.message}`);
        }
    }
};

/**
 * Servizio principale per gestire le richieste a Ideogram
 * @param {Object} requestData - Dati della richiesta
 * @returns {Promise<Object>} Risposta elaborata
 */
const processIdeogramRequest = async (requestData) => {
    const {
        model,
        prompt,
        chatId,
        userId,
        agent_type = 'image',
        count = 1,
        style = "natural", // Stile di default: natural
        aspect_ratio = "1:1" // Formato di default: quadrato
    } = requestData;

    if (!model || !prompt || !chatId || !userId) {
        throw new Error('Parametri mancanti: model, prompt, chatId e userId sono obbligatori');
    }

    // Verifica che il modello esista
    const isAvailable = await isModelAvailable(model);
    if (!isAvailable) {
        throw new Error(`Modello non supportato: ${model}. Utilizzare uno dei modelli disponibili.`);
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

    // Resolve model identifier (could be model_slug or api_model_id) to model ID for cost calculation
    const Model = db.models.Model;
    const providerId = await getIdeogramProviderId();

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

    // Calcola il costo stimato - currently only supports Generate operation
    // Future enhancement: determine operation type based on endpoint/request type
    const operation = 'Generate'; // Default to Generate for current /generate endpoint
    const costEstimate = await calculateCost(resolvedModel.id, count, operation);

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
            tokens_used: 0, // Non ci sono token per le immagini
            agent_type: agent_type,
            agent_model: model
        });

        // Prepara la richiesta per Ideogram
        const requestPayload = {
            image_request: {
                prompt: prompt,
                aspect_ratio: convertAspectRatio(aspect_ratio),
                count: count,
                model: convertModel(model),
                magic_prompt_option: "AUTO" // Aggiungi l'opzione magic prompt per migliorare i risultati
            }
        };

        // Add style_type only for models that support it (V_2 and V_3)
        const apiModel = convertModel(model);
        if (apiModel === "V_2" || apiModel === "V_3" || apiModel === "V_2_TURBO") {
            requestPayload.image_request.style_type = convertStyle(style);
        }

        // Effettua la chiamata a Ideogram
        const response = await axios.post(IDEOGRAM_API_URL, requestPayload, {
            headers: {
                'Api-Key': config.ideogram.apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        logger.info('Ideogram API response:', JSON.stringify(response.data, null, 2));

        // Estrai le URL delle immagini dalla risposta in base al nuovo formato
        let imageUrls = [];
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
            imageUrls = response.data.data.map(img => img.url);
        }

        if (imageUrls.length === 0) {
            throw new Error('Nessuna immagine generata nella risposta di Ideogram');
        }

        // Scarica temporaneamente le immagini e poi le carica su GCS
        let tempImages = [];
        let finalImages = [];

        try {
            // Download temporaneo delle immagini
            tempImages = await downloadImagesToTemp(imageUrls, userId, chatId);

            // Upload su GCS con fallback locale
            try {
                finalImages = await uploadImagesToGCS(tempImages, userId, chatId);
            } catch (uploadError) {
                logger.warn(`[${new Date().toISOString()}] GCS upload failed, using local fallback: ${uploadError.message}`);
                // Se GCS fallisce, usa i file locali come fallback
                finalImages = tempImages.map(tempImg => ({
                    downloadUrl: `/api/v1/uploads/images/${tempImg.fileName}`,
                    publicUrl: null,
                    fileName: tempImg.fileName,
                    fileSize: tempImg.size,
                    contentType: tempImg.contentType,
                    storageType: 'local',
                    fallbackReason: uploadError.message
                }));
            }

            // Non creiamo più attachment separati, le immagini saranno nel content del messaggio
            logger.info(`[${new Date().toISOString()}] Images processed successfully: ${finalImages.length} images`);
        } catch (error) {
            // Cleanup file temporanei in caso di errore
            if (tempImages.length > 0) {
                await cleanupTempFiles(tempImages);
            }
            throw error;
        }

        // Crea il content del messaggio con le immagini in formato Markdown
        const imageMarkdownContent = finalImages.map(img => `![Immagine generata da Ideogram](${img.downloadUrl})`).join('\n\n');
        const assistantResponse = `Ecco ${count > 1 ? 'le immagini generate' : 'l\'immagine generata'} in base al prompt: "${prompt}"\n\n${imageMarkdownContent}`;

        const assistantMessage = await saveMessage({
            chat_id: chatId,
            role: 'assistant',
            content: assistantResponse,
            tokens_used: 0, // Non ci sono token per le immagini
            agent_type: agent_type,
            agent_model: model,
            media_type: 'image', // Indica che il messaggio contiene immagini
            media_url: imageMarkdownContent // Markdown delle immagini nel content
        });

        // Non creiamo più attachment separati, le immagini sono nel content
        logger.info(`[${new Date().toISOString()}] Images saved in message content for message ID: ${assistantMessage.id}`);

        logger.info(`[${new Date().toISOString()}] Images saved in message content for message ID: ${assistantMessage.id}`);

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
            images: finalImages.map(img => ({
                downloadUrl: img.downloadUrl,
                publicUrl: img.publicUrl,
                fileName: img.fileName,
                fileSize: img.size,
                contentType: img.contentType,
                storageType: img.storageType
            })),
            cost: costEstimate,
            created_at: assistantMessage.created_at
        };

        logger.info(`[${new Date().toISOString()}] Ideogram request processing completed for message ID: ${assistantMessage.id}`);
        return result;
    } catch (error) {
        // In caso di errore, elimina il messaggio dell'utente e i relativi costi se esistono
        if (userMessage) {
            const MessageCost = db.models.MessageCost;

            // Elimina eventuali costi associati al messaggio
            await MessageCost.destroy({ where: { message_id: userMessage.id } });

            // Elimina il messaggio
            await userMessage.destroy();
        }

        throw new Error(`Errore durante la richiesta a Ideogram: ${error.message}`);
    }
};

/**
 * Nuovo metodo per gestire richieste Ideogram con event stream
 * @param {string} prompt - Il prompt dell'utente
 * @param {string} model - Il modello Ideogram selezionato
 * @param {number} userId - ID dell'utente
 * @param {number} chatId - ID della chat
 * @param {string} agentType - Tipo di agente (image per Ideogram)
 * @param {Array} attachmentIds - Array di ID degli allegati (non usato per Ideogram)
 * @param {Function} onStream - Callback per gestire lo streaming
 * @param {Function} sendEvent - Funzione per inviare eventi SSE
 * @returns {Promise<Object>} Risposta elaborata in formato standard per il frontend
 */
const sendRequestWithStreaming = async (prompt, model, userId, chatId, agentType = 'image', attachmentIds = [], onStream = null, sendEvent = null) => {
    const count = 1;
    const style = "natural";
    const aspect_ratio = "1:1";
    let tempImages = [];

    try {
        // Fase 1: Inizializzazione
        if (sendEvent) {
            sendEvent('process_started', { message: 'Inizializzazione generazione immagine...' });
        }

        // Fase 2: Verifica modello e calcolo costi
        if (sendEvent) {
            sendEvent('delta', { text: 'Verifica modello e calcolo costi...' });
        }

        const isAvailable = await isModelAvailable(model);
        if (!isAvailable) {
            throw new Error(`Modello non supportato: ${model}. Utilizzare uno dei modelli disponibili.`);
        }

        // Resolve model identifier
        const Model = db.models.Model;
        const providerId = await getIdeogramProviderId();

        let resolvedModel = await Model.findOne({
            where: {
                model_slug: model,
                id_provider: providerId,
                is_active: true
            }
        });

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
            throw new Error(`Model ${model} not found in database`);
        }

        // Calcola il costo stimato
        const operation = 'Generate';
        const costEstimate = await calculateCost(resolvedModel.id, count, operation);

        // Verifica fondi utente
        await checkUserFunds(userId, costEstimate.totalCost);

        // Fase 3: Generazione immagine
        if (sendEvent) {
            sendEvent('delta', { text: 'Generazione immagine in corso...' });
        }

        // Prepara la richiesta per Ideogram
        const requestPayload = {
            image_request: {
                prompt: prompt,
                aspect_ratio: convertAspectRatio(aspect_ratio),
                count: count,
                model: convertModel(model),
                magic_prompt_option: "AUTO"
            }
        };

        // Add style_type only for models that support it
        const apiModel = convertModel(model);
        if (apiModel === "V_2" || apiModel === "V_3" || apiModel === "V_2_TURBO") {
            requestPayload.image_request.style_type = convertStyle(style);
        }

        // Effettua la chiamata a Ideogram
        const response = await axios.post(IDEOGRAM_API_URL, requestPayload, {
            headers: {
                'Api-Key': config.ideogram.apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        logger.info('Ideogram API response:', JSON.stringify(response.data, null, 2));

        // Estrai le URL delle immagini dalla risposta
        let imageUrls = [];
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
            imageUrls = response.data.data.map(img => img.url);
        }

        if (imageUrls.length === 0) {
            throw new Error('Nessuna immagine generata nella risposta di Ideogram');
        }

        // Fase 4: Download temporaneo
        if (sendEvent) {
            sendEvent('delta', { text: 'Download immagini...' });
        }

        tempImages = await downloadImagesToTemp(imageUrls, userId, chatId);

        // Fase 5: Upload su GCS
        if (sendEvent) {
            sendEvent('delta', { text: 'Caricamento su cloud storage...' });
        }

        let finalImages = [];
        try {
            finalImages = await uploadImagesToGCS(tempImages, userId, chatId);
        } catch (uploadError) {
            logger.warn(`[${new Date().toISOString()}] GCS upload failed, using local fallback: ${uploadError.message}`);
            // Se GCS fallisce, usa i file locali come fallback
            finalImages = tempImages.map(tempImg => ({
                downloadUrl: `/api/v1/uploads/images/${tempImg.fileName}`,
                publicUrl: null,
                fileName: tempImg.fileName,
                fileSize: tempImg.size,
                contentType: tempImg.contentType,
                storageType: 'local',
                fallbackReason: uploadError.message
            }));
        }

        // Fase 6: Salvataggio messaggi e allegati
        if (sendEvent) {
            sendEvent('delta', { text: 'Salvataggio messaggi e allegati...' });
        }

        // Salva il messaggio dell'utente
        const userMessage = await saveMessage({
            chat_id: chatId,
            role: 'user',
            content: prompt,
            tokens_used: 0,
            agent_type: agentType,
            agent_model: model
        });

        // Crea il content del messaggio con le immagini in formato Markdown
        const imageMarkdownContent = finalImages.map(img => `![Immagine generata da Ideogram](${img.downloadUrl})`).join('\n\n');
        const assistantResponse = `Ecco ${count > 1 ? 'le immagini generate' : 'l\'immagine generata'} in base al prompt: "${prompt}"\n\n${imageMarkdownContent}`;

        const assistantMessage = await saveMessage({
            chat_id: chatId,
            role: 'assistant',
            content: assistantResponse,
            tokens_used: 0,
            agent_type: agentType,
            agent_model: model,
            media_type: 'image', // Indica che il messaggio contiene immagini
            media_url: imageMarkdownContent // Markdown delle immagini nel content
        });

        // Non creiamo più attachment separati, le immagini sono nel content
        logger.info(`[${new Date().toISOString()}] Images saved in message content for message ID: ${assistantMessage.id}`);

        // Salva i dettagli del costo
        const cost = await saveMessageCost(costEstimate, assistantMessage.id, chatId, userId);

        // Aggiorna il saldo del portafoglio
        const wallet = await updateWalletBalance(userId, -costEstimate.totalCost);

        // Aggiorna il timestamp dell'ultima attività della chat
        const Chat = db.models.Chat;
        const chat = await Chat.findByPk(chatId);
        if (chat) {
            chat.last_message_at = new Date();
            await chat.save();
        }

        // Fase 7: Completamento
        if (sendEvent) {
            sendEvent('completed', {
                text: assistantResponse,
                images: finalImages.map(img => ({
                    downloadUrl: img.downloadUrl,
                    publicUrl: img.publicUrl,
                    fileName: img.fileName,
                    fileSize: img.size,
                    contentType: img.contentType,
                    storageType: img.storageType
                }))
            });
        }

        // Call the streaming callback if provided
        if (onStream) {
            onStream(assistantResponse, {
                input_tokens: 0,
                output_tokens: 0,
                total_tokens: 0
            });
        }

        return {
            success: true,
            messageId: assistantMessage.id,
            userMessageId: userMessage.id,
            message: assistantResponse,
            images: finalImages,
            cost: costEstimate,
            created_at: assistantMessage.created_at
        };

    } catch (error) {
        // Cleanup file temporanei in caso di errore
        if (tempImages.length > 0) {
            await cleanupTempFiles(tempImages);
        }

        logger.error('Ideogram sendRequestWithStreaming failed:', error);

        if (sendEvent) {
            sendEvent('error', {
                error: 'Errore durante la generazione dell\'immagine',
                details: error.message
            });
        }

        return {
            success: false,
            error: error.message,
            images: [],
            cost: null
        };
    }
};

/**
 * Adattatore per il metodo sendRequest che accetta i parametri nel formato usato in messages.js
 * @param {string} prompt - Il prompt dell'utente
 * @param {string} model - Il modello Ideogram selezionato
 * @param {number} userId - ID dell'utente
 * @param {number} chatId - ID della chat
 * @param {string} agentType - Tipo di agente (image per Ideogram)
 * @param {Array} attachmentIds - Array di ID degli allegati (non usato per Ideogram)
 * @param {Function} onStream - Callback per gestire lo streaming
 * @param {Function} sendEvent - Funzione per inviare eventi SSE (opzionale)
 * @returns {Promise<Object>} Risposta elaborata in formato standard per il frontend
 */
const sendRequest = async (prompt, model, userId, chatId, agentType = 'image', attachmentIds = [], onStream = null, sendEvent = null) => {
    // Se sendEvent è fornito, usa il nuovo metodo streaming
    if (sendEvent) {
        return await sendRequestWithStreaming(prompt, model, userId, chatId, agentType, attachmentIds, onStream, sendEvent);
    }

    // Altrimenti, usa il metodo esistente per compatibilità
    const count = 1;
    const style = "natural";
    const aspect_ratio = "1:1";
    try {
        // Chiama processIdeogramRequest con i parametri corretti
        const response = await processIdeogramRequest({
            model,
            prompt,
            chatId,
            userId,
            agent_type: agentType,
            count,
            style,
            aspect_ratio
        });

        // For streaming compatibility with messages API, send the response content as text
        const responseText = response.message || `Generated ${response.images.length} image(s)`;

        // Call the streaming callback if provided
        if (onStream) {
            // Send the text response
            onStream(responseText, {
                input_tokens: 0, // Images don't use tokens
                output_tokens: 0,
                total_tokens: 0
            });
        }

        // Return images and cost for backward compatibility
        return {
            images: response.images,
            cost: response.cost,
            message: responseText,
            messageId: response.messageId,
            userMessageId: response.userMessageId,
            success: true
        };
    } catch (error) {
        logger.error('Ideogram sendRequest failed:', error);
        return {
            images: [],
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
        const providerId = await getIdeogramProviderId();

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

        // If not found, try to find by api_model_id (for cases like 'ideogram-v3' -> 'ideogram-v3-ideogram')
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

        // Check for legacy model names
        const validIdeogramModels = ['ideogram-alpha', 'ideogram-v1', 'ideogram-v2', 'ideogram-v3'];
        if (validIdeogramModels.includes(modelId)) {
            // For legacy names, try to find any model with similar API model ID
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

/**
 * Method stub for /remix endpoint (image-to-image generation)
 * @param {Object} requestData - Request data including image reference and prompt
 * @returns {Promise<Object>} Response with generated images
 */
const processRemixRequest = async (requestData) => {
    // TODO: Implement remix functionality
    // This method should handle image-to-image generation with reference images
    throw new Error('Remix endpoint not yet implemented');
};

/**
 * Method stub for /edit endpoint (image editing with masks)
 * @param {Object} requestData - Request data including image, mask, and edit instructions
 * @returns {Promise<Object>} Response with edited images
 */
const processEditRequest = async (requestData) => {
    // TODO: Implement edit functionality
    // This method should handle image editing with masks
    throw new Error('Edit endpoint not yet implemented');
};

/**
 * Method stub for /reframe endpoint (aspect ratio changes)
 * @param {Object} requestData - Request data including image and new aspect ratio
 * @returns {Promise<Object>} Response with reframed images
 */
const processReframeRequest = async (requestData) => {
    // TODO: Implement reframe functionality
    // This method should handle aspect ratio changes
    throw new Error('Reframe endpoint not yet implemented');
};

/**
 * Method stub for /replace-background endpoint (background replacement)
 * @param {Object} requestData - Request data including image and background description
 * @returns {Promise<Object>} Response with background-replaced images
 */
const processReplaceBackgroundRequest = async (requestData) => {
    // TODO: Implement replace background functionality
    // This method should handle background replacement
    throw new Error('Replace background endpoint not yet implemented');
};

/**
 * Method stub for /describe endpoint (image description)
 * @param {Object} requestData - Request data including image to describe
 * @returns {Promise<Object>} Response with image description
 */
const processDescribeRequest = async (requestData) => {
    // TODO: Implement describe functionality
    // This method should handle image description generation
    throw new Error('Describe endpoint not yet implemented');
};

module.exports = {
    processIdeogramRequest,
    calculateCost,
    getAvailableModels,
    isModelAvailable,
    sendRequest,
    sendRequestWithStreaming,
    convertStyle,
    convertAspectRatio,
    convertModel,
    downloadImageToTemp, // Export for testing
    downloadImagesToTemp, // Export for testing
    uploadImagesToGCS, // Export for testing
    cleanupTempFiles, // Export for testing
    // New API endpoint method stubs
    processRemixRequest,
    processEditRequest,
    processReframeRequest,
    processReplaceBackgroundRequest,
    processDescribeRequest
};