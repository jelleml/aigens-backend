const AWS = require('aws-sdk');
const db = require("../database");
const config = require("../config/config");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const CostCalculator = require('./cost-calculator.service');
const GoogleCloudStorage = require('./google-cloud-storage.service');
// Sistema di logging centralizzato
const { getLogger } = require('./logging');
const logger = getLogger('amazon-nova', 'service');

// Initialize cost calculator and Google Cloud Storage
const costCalculator = new CostCalculator();
const gcsService = new GoogleCloudStorage();

// Importazione dei modelli
const { User, Chat, Message, Attachment, Wallet, Transaction, MessageCost, Model, Provider, ModelPriceScore } = db.sequelize.models;

// Configurazione AWS Bedrock
const AWS_REGION = process.env.AWS_REGION || config?.aws?.region || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || config?.aws?.accessKeyId;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || config?.aws?.secretAccessKey;

// Initialize AWS Bedrock client
AWS.config.update({
    region: AWS_REGION,
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
});

const bedrockRuntime = new AWS.BedrockRuntime();
const s3 = new AWS.S3();

// Cache dei modelli disponibili
let AVAILABLE_MODELS = [];
let lastModelsFetch = null;
const CACHE_DURATION = 3600000; // 1 ora in millisecondi

let AMAZON_NOVA_PROVIDER_ID = null;

// Funzione per recuperare l'id_provider di Amazon Nova
async function getAmazonNovaProviderId() {
    if (AMAZON_NOVA_PROVIDER_ID) return AMAZON_NOVA_PROVIDER_ID;
    const Provider = db.models.Provider;
    const provider = await Provider.findOne({ where: { name: 'amazon-nova' } });
    if (!provider) throw new Error('Provider Amazon Nova non trovato');
    AMAZON_NOVA_PROVIDER_ID = provider.id;
    return AMAZON_NOVA_PROVIDER_ID;
}

/**
 * Recupera i modelli disponibili dall'API di Amazon Nova
 * @returns {Promise<Array>} Array di modelli disponibili
 */
const fetchAvailableModels = async () => {
    try {
        // Recupera tutti i modelli Amazon Nova dal database
        const dbModels = await Model.findAll({
            where: {
                id_provider: await getAmazonNovaProviderId(),
                is_active: true
            }
        });

        if (!dbModels || dbModels.length === 0) {
            logger.warn("Nessun modello Amazon Nova trovato nel database");
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
 * @param {string|number} modelId - ID del modello Amazon Nova
 * @param {number} durationSeconds - Durata del video in secondi
 * @param {string} operation - Tipo di operazione (Generate)
 * @returns {Promise<Object>} Oggetto con i dettagli del costo
 */
const calculateCost = async (modelId, durationSeconds = 6, operation = 'Generate') => {
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
            pricePerSecond = 0.08; // Default $0.08 per second for Amazon Nova
            baseCost = pricePerSecond * durationSeconds;
        }

        // For direct providers, use simple markup
        if (model.provider.name === 'amazon-nova') {
            // Direct provider - minimal markup for Amazon Nova
            const totalCost = baseCost * 1.1; // 10% markup for direct Amazon Nova
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
    // If we don't have a modelId, get a fallback model ID for Amazon Nova
    let modelId = costDetails.modelId;

    if (!modelId) {
        try {
            // Try to find an Amazon Nova model in the database to use as fallback
            const Model = db.models.Model;
            const fallbackModel = await Model.findOne({
                where: {
                    id_provider: await getAmazonNovaProviderId(),
                    is_active: true
                }
            });

            if (fallbackModel) {
                modelId = fallbackModel.id;
                logger.info(`[${new Date().toISOString()}] Using fallback model ID: ${modelId} for cost tracking`);
            } else {
                // No Amazon Nova models found, set to 0 as last resort
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
        description: 'Utilizzo servizio Amazon Nova AI'
    });

    return wallet;
};

/**
 * Scarica un video da S3 e lo salva su Google Cloud Storage
 * @param {string} s3BucketName - Nome del bucket S3
 * @param {string} s3Key - Chiave del file in S3
 * @param {string} fileName - Nome del file da salvare
 * @param {number} userId - ID dell'utente per organizzazione delle cartelle
 * @param {number} chatId - ID della chat per organizzazione delle cartelle
 * @returns {Promise<Object>} Oggetto con informazioni del file salvato su GCS
 */
const downloadAndSaveVideoFromS3 = async (s3BucketName, s3Key, fileName, userId, chatId) => {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            logger.info(`[${new Date().toISOString()}] Downloading video from S3 (attempt ${attempts}/${maxAttempts}): s3://${s3BucketName}/${s3Key}`);

            // Download from S3
            const s3Object = await s3.getObject({
                Bucket: s3BucketName,
                Key: s3Key
            }).promise();

            if (!s3Object.Body || s3Object.Body.length === 0) {
                throw new Error("Empty response received from S3");
            }

            logger.info(`[${new Date().toISOString()}] Video downloaded from S3 successfully, size: ${s3Object.Body.length} bytes, content-type: ${s3Object.ContentType}`);

            // Determine file format from content-type and key
            const contentType = s3Object.ContentType || 'video/mp4';
            let fileExtension = '.mp4';
            
            if (contentType.includes('webm') || s3Key.includes('.webm')) {
                fileExtension = '.webm';
            } else if (contentType.includes('mov') || s3Key.includes('.mov')) {
                fileExtension = '.mov';
            } else if (contentType.includes('avi') || s3Key.includes('.avi')) {
                fileExtension = '.avi';
            }

            logger.info(`[${new Date().toISOString()}] Detected video format: ${contentType}, extension: ${fileExtension}`);

            // Create buffer
            const videoBuffer = Buffer.from(s3Object.Body);
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
                                source: 'amazon-nova-ai',
                                userId: userId.toString(),
                                chatId: chatId.toString(),
                                s3Bucket: s3BucketName,
                                s3Key: s3Key,
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
            if (error.code) {
                console.error('AWS Error Code:', error.code);
            }

            // If we've tried the maximum number of times, throw the error
            if (attempts >= maxAttempts) {
                throw new Error(`Impossibile scaricare e salvare il video da S3 dopo ${maxAttempts} tentativi: ${error.message}`);
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
        }
    }
};

/**
 * Polling per controllare lo stato di un'operazione Amazon Nova
 * @param {string} jobArn - ARN dell'operazione
 * @param {Function} onProgress - Callback per aggiornamenti di progresso
 * @returns {Promise<Object>} Risultato dell'operazione
 */
const pollBedrockJob = async (jobArn, onProgress = null) => {
    const maxAttempts = 120; // 17 minuti con polling ogni 8.5 secondi
    let attempts = 0;

    while (attempts < maxAttempts) {
        attempts++;
        
        try {
            // Get job status
            const result = await bedrockRuntime.getModelInvocationJob({
                jobIdentifier: jobArn
            }).promise();

            // Invia aggiornamento di progresso
            if (onProgress) {
                const progress = Math.min(10 + (attempts * 0.75), 95);
                onProgress({
                    type: 'video-generation-progress',
                    data: {
                        progress,
                        status: result.status,
                        message: `Generazione in corso... (${attempts}/${maxAttempts})`
                    }
                });
            }

            if (result.status === 'Completed') {
                // Job completed successfully
                if (result.outputDataConfig && result.outputDataConfig.s3OutputDataConfig) {
                    return {
                        s3Bucket: result.outputDataConfig.s3OutputDataConfig.s3BucketName,
                        s3KeyPrefix: result.outputDataConfig.s3OutputDataConfig.s3KeyPrefix
                    };
                }
                throw new Error('Output data configuration not found in completed job');
            }

            if (result.status === 'Failed') {
                const failureMessage = result.failureMessage || 'Job failed without specific error message';
                throw new Error(`Amazon Nova job failed: ${failureMessage}`);
            }

            if (result.status === 'Stopping' || result.status === 'Stopped') {
                throw new Error('Amazon Nova job was stopped');
            }

            // Job is still running, wait before next poll
            await new Promise(resolve => setTimeout(resolve, 8500)); // 8.5 seconds

        } catch (error) {
            if (attempts >= maxAttempts) {
                throw error;
            }
            
            // If it's a temporary error, wait and retry
            if (error.code === 'ThrottlingException' || error.code === 'ServiceUnavailable') {
                await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds for throttling
            } else {
                await new Promise(resolve => setTimeout(resolve, 8500));
            }
        }
    }

    throw new Error('Timeout: operazione non completata entro 17 minuti');
};

/**
 * Servizio principale per gestire le richieste a Amazon Nova
 * @param {Object} requestData - Dati della richiesta
 * @returns {Promise<Object>} Risposta elaborata
 */
const processAmazonNovaRequest = async (requestData) => {
    const {
        model,
        prompt,
        chatId,
        userId,
        agent_type = 'video',
        duration = 6, // Durata di default: 6 secondi
        dimension = "1280x720", // Risoluzione di default
        fps = 24, // Frame rate di default
        seed = null
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

    // Resolve model identifier to model ID for cost calculation
    const Model = db.models.Model;
    const providerId = await getAmazonNovaProviderId();
    
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

        // Prepara la richiesta per Amazon Nova
        const modelInput = {
            taskType: "TEXT_VIDEO",
            textToVideoParams: {
                text: prompt
            },
            videoGenerationConfig: {
                durationSeconds: duration,
                fps: fps,
                dimension: dimension
            }
        };

        // Aggiungi seed se fornito
        if (seed !== null) {
            modelInput.videoGenerationConfig.seed = seed;
        }

        // Configura dove salvare l'output su S3
        const outputS3Bucket = process.env.AWS_S3_BUCKET || config?.aws?.s3Bucket;
        const outputS3KeyPrefix = `nova-reel-outputs/${userId}/${chatId}/${Date.now()}`;

        if (!outputS3Bucket) {
            throw new Error('AWS S3 bucket non configurato per Amazon Nova');
        }

        const jobParams = {
            modelId: resolvedModel.api_model_id || model,
            jobName: `nova-video-${userId}-${chatId}-${Date.now()}`,
            modelInput: modelInput,
            outputDataConfig: {
                s3OutputDataConfig: {
                    s3BucketName: outputS3Bucket,
                    s3KeyPrefix: outputS3KeyPrefix
                }
            }
        };

        // Avvia il job Amazon Nova tramite Bedrock
        const jobResponse = await bedrockRuntime.startModelInvocationJob(jobParams).promise();
        
        logger.info('Amazon Nova job started:', JSON.stringify(jobResponse, null, 2));

        const jobArn = jobResponse.jobArn;
        if (!jobArn) {
            throw new Error('Job ARN non trovato nella risposta di Amazon Nova');
        }

        // Inizia il polling per il completamento
        const jobResult = await pollBedrockJob(jobArn);
        
        // Cerca il file video nella cartella S3
        const listParams = {
            Bucket: jobResult.s3Bucket,
            Prefix: jobResult.s3KeyPrefix
        };

        const s3Objects = await s3.listObjectsV2(listParams).promise();
        const videoObject = s3Objects.Contents?.find(obj => 
            obj.Key.endsWith('.mp4') || 
            obj.Key.endsWith('.mov') || 
            obj.Key.endsWith('.webm')
        );

        if (!videoObject) {
            throw new Error('File video non trovato nell\'output S3');
        }

        // Scarica e salva il video
        const videoResult = await downloadAndSaveVideoFromS3(
            jobResult.s3Bucket, 
            videoObject.Key, 
            `amazon-nova-${Date.now()}`, 
            userId, 
            chatId
        );

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
        const assistantResponse = `Video generato usando Amazon Nova Reel: "${prompt}"`;

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

        logger.info(`[${new Date().toISOString()}] Amazon Nova request processing completed for message ID: ${assistantMessage.id}`);
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

        throw new Error(`Errore durante la richiesta a Amazon Nova: ${error.message}`);
    }
};

/**
 * Adattatore per il metodo sendRequest che accetta i parametri nel formato usato in messages.js
 * @param {string} prompt - Il prompt dell'utente
 * @param {string} model - Il modello Amazon Nova selezionato
 * @param {number} userId - ID dell'utente
 * @param {number} chatId - ID della chat
 * @param {string} agentType - Tipo di agente (video per Amazon Nova)
 * @param {Array} attachmentIds - Array di ID degli allegati (non usato per Amazon Nova)
 * @param {Function} onStream - Callback per gestire lo streaming
 * @returns {Promise<Object>} Risposta elaborata in formato standard per il frontend
 */
const sendRequest = async (prompt, model, userId, chatId, agentType = 'video', attachmentIds = [], onStream = null) => {
    // Parse options from request or use defaults for video generation
    const duration = 6;
    const dimension = "1280x720";
    const fps = 24;
    const seed = null;
    
    try {
        // Chiama processAmazonNovaRequest con i parametri corretti
        const response = await processAmazonNovaRequest({
            model,
            prompt,
            chatId,
            userId,
            agent_type: agentType,
            duration,
            dimension,
            fps,
            seed
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
        logger.error('Amazon Nova sendRequest failed:', error);
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
        const providerId = await getAmazonNovaProviderId();
        
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
        
        // Check for Amazon Nova model names
        const validNovaModels = ['amazon.nova-reel-v1:0', 'amazon.nova-reel-v1:1'];
        if (validNovaModels.includes(modelId)) {
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
    processAmazonNovaRequest,
    calculateCost,
    getAvailableModels,
    isModelAvailable,
    sendRequest,
    downloadAndSaveVideoFromS3, // Export for testing
    pollBedrockJob // Export for testing
};