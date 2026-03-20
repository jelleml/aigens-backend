const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require("../database");
const config = require("../config/config");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const CostCalculator = require('./cost-calculator.service');
const GoogleCloudStorage = require('./google-cloud-storage.service');
// Sistema di logging centralizzato
const { getLogger } = require('./logging');
const logger = getLogger('google-veo', 'service');

// Initialize cost calculator and Google Cloud Storage
const costCalculator = new CostCalculator();
const gcsService = new GoogleCloudStorage();

// Importazione dei modelli
const { User, Chat, Message, Attachment, Wallet, Transaction, MessageCost, Provider, ModelPriceScore } = db.sequelize.models;

// Configurazione dell'API Google Veo
const GOOGLE_VEO_API_KEY = process.env.GOOGLE_VEO_API_KEY || process.env.GOOGLE_GEMINI_KEY;

// Funzione per verificare la validità dell'API key
const validateApiKey = () => {
    if (!GOOGLE_VEO_API_KEY) {
        throw new Error('API key Google Veo non configurata nel file .env');
    }

    if (GOOGLE_VEO_API_KEY.length < 10) {
        throw new Error('API key Google Veo non valida (troppo corta)');
    }

    // Verifica formato base dell'API key (inizia con AIza...)
    if (!GOOGLE_VEO_API_KEY.startsWith('AIza')) {
        logger.warn('API key Google Veo potrebbe non essere nel formato corretto');
    }

    return true;
};

// Cache dei modelli disponibili
let AVAILABLE_MODELS = [];
let lastModelsFetch = null;
const CACHE_DURATION = 3600000; // 1 ora in millisecondi

let GOOGLE_VEO_PROVIDER_ID = null;

// Gestione rate limit
const RATE_LIMIT = {
    maxRequestsPerMinute: 10,
    maxRequestsPerHour: 100,
    requests: []
};

// Funzione per verificare e gestire i rate limit
const checkRateLimit = () => {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    // Rimuovi richieste vecchie
    RATE_LIMIT.requests = RATE_LIMIT.requests.filter(timestamp => timestamp > oneHourAgo);

    // Conta richieste nell'ultimo minuto
    const requestsLastMinute = RATE_LIMIT.requests.filter(timestamp => timestamp > oneMinuteAgo).length;

    // Conta richieste nell'ultima ora
    const requestsLastHour = RATE_LIMIT.requests.length;

    if (requestsLastMinute >= RATE_LIMIT.maxRequestsPerMinute) {
        throw new Error('Rate limit superato: troppe richieste al minuto. Riprova tra 60 secondi.');
    }

    if (requestsLastHour >= RATE_LIMIT.maxRequestsPerHour) {
        throw new Error('Rate limit superato: troppe richieste all\'ora. Riprova tra 1 ora.');
    }

    // Aggiungi questa richiesta
    RATE_LIMIT.requests.push(now);

    return true;
};

// Funzione per recuperare l'id_provider di Google Veo
async function getGoogleVeoProviderId() {
    if (GOOGLE_VEO_PROVIDER_ID) return GOOGLE_VEO_PROVIDER_ID;
    const Provider = db.models.Provider;
    const provider = await Provider.findOne({ where: { name: 'google-veo' } });
    if (!provider) throw new Error('Provider Google Veo non trovato');
    GOOGLE_VEO_PROVIDER_ID = provider.id;
    return GOOGLE_VEO_PROVIDER_ID;
}

/**
 * Recupera i modelli disponibili dall'API di Google Veo
 * @returns {Promise<Array>} Array di modelli disponibili
 */
const fetchAvailableModels = async () => {
    try {
        // Recupera tutti i modelli Google Veo dal database
        const dbModels = await db.models.Model.findAll({
            where: {
                id_provider: await getGoogleVeoProviderId(),
                is_active: true
            }
        });

        if (!dbModels || dbModels.length === 0) {
            logger.warn("Nessun modello Google Veo trovato nel database");
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
 * @param {string|number} modelId - ID del modello Google Veo
 * @param {number} count - Numero di video da generare
 * @param {string} operation - Tipo di operazione (Generate, Edit)
 * @returns {Promise<Object>} Oggetto con i dettagli del costo
 */
const calculateCost = async (modelId, count = 1, operation = 'Generate') => {
    try {
        // Get model from database using ID
        const model = await db.models.Model.findOne({
            where: { id: modelId },
            include: [{
                model: db.models.Provider,
                as: 'provider',
                attributes: ['name']
            }]
        });

        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        // Per ora, placeholder per il pricing
        const estimatedCost = 0.01; // Placeholder

        return {
            estimatedCost,
            totalCost: estimatedCost, // Add totalCost for API compatibility
            modelId,
            modelName: model.name,
            operation,
            count,
            currency: 'EUR'
        };
    } catch (error) {
        logger.error('Errore nel calcolo del costo:', error);
        throw error;
    }
};

/**
 * Verifica i fondi dell'utente
 * @param {number} userId - ID dell'utente
 * @param {number} estimatedCost - Costo stimato
 * @returns {Promise<boolean>} True se l'utente ha fondi sufficienti
 */
const checkUserFunds = async (userId, estimatedCost) => {
    try {
        const wallet = await Wallet.findOne({ where: { id_user: userId } });
        if (!wallet) {
            throw new Error('Wallet non trovato per l\'utente');
        }

        const hasFunds = wallet.balance >= estimatedCost;
        if (!hasFunds) {
            logger.warn(`Fondi insufficienti per l'utente ${userId}. Saldo: ${wallet.balance}, Richiesto: ${estimatedCost}`);
        }

        return hasFunds;
    } catch (error) {
        logger.error('Errore nella verifica dei fondi:', error);
        throw error;
    }
};

/**
 * Salva il messaggio nel database
 * @param {Object} messageData - Dati del messaggio
 * @returns {Promise<Object>} Messaggio salvato
 */
const saveMessage = async (messageData) => {
    try {
        const message = await Message.create(messageData);
        logger.info(`Messaggio salvato con ID: ${message.id}`);
        return message;
    } catch (error) {
        logger.error('Errore nel salvataggio del messaggio:', error);
        throw error;
    }
};

/**
 * Salva l'attachment video nel database
 * @param {Object} attachmentData - Dati dell'attachment
 * @returns {Promise<Object>} Attachment salvato
 */
const saveAttachment = async (attachmentData) => {
    try {
        const attachment = await Attachment.create(attachmentData);
        logger.info(`Attachment salvato con ID: ${attachment.id}`);
        return attachment;
    } catch (error) {
        logger.error('Errore nel salvataggio dell\'attachment:', error);
        throw error;
    }
};

/**
 * Salva i costi del messaggio nel database
 * @param {Object} costDetails - Dettagli del costo
 * @param {number} messageId - ID del messaggio
 * @param {number} chatId - ID della chat
 * @param {number} userId - ID dell'utente
 * @returns {Promise<Object>} Costo salvato
 */
const saveMessageCost = async (costDetails, messageId, chatId, userId) => {
    try {
        const messageCost = await MessageCost.create({
            message_id: messageId,
            chat_id: chatId,
            user_id: userId,
            model_id: costDetails.modelId,
            input_tokens: costDetails.inputTokens || 0,
            output_tokens: costDetails.outputTokens || 0,
            base_cost: costDetails.baseCost || 0,
            fixed_markup: costDetails.fixedMarkup || 0,
            percentage_markup: costDetails.percentageMarkup || 0,
            total_markup: costDetails.totalMarkup || 0,
            total_cost: costDetails.totalCost || 0,
            credit_cost: costDetails.creditCost || costDetails.totalCost || 0,
            model_used: costDetails.model || 'google-veo'
        });

        logger.info(`Costo del messaggio salvato con ID: ${messageCost.id}`);
        return messageCost;
    } catch (error) {
        logger.error('Errore nel salvataggio del costo del messaggio:', error);
        throw error;
    }
};

/**
 * Aggiorna il wallet dell'utente
 * @param {number} userId - ID dell'utente
 * @param {number} amount - Importo da sottrarre (negativo)
 * @returns {Promise<Object>} Wallet aggiornato
 */
const updateWalletBalance = async (userId, amount) => {
    try {
        const wallet = await Wallet.findOne({ where: { id_user: userId } });
        if (!wallet) {
            throw new Error('Wallet non trovato per l\'utente');
        }

        const newBalance = wallet.balance + amount;
        await wallet.update({ balance: newBalance });

        // Registra la transazione
        await Transaction.create({
            id_wallet: wallet.id,
            amount: amount,
            type: 'video_generation',
            description: 'Costo generazione video Google Veo',
            status: 'completed'
        });

        logger.info(`Wallet aggiornato per l'utente ${userId}. Nuovo saldo: ${newBalance}`);
        return wallet;
    } catch (error) {
        logger.error('Errore nell\'aggiornamento del wallet:', error);
        throw error;
    }
};

/**
 * Scarica e salva il video
 * @param {string} videoUrl - URL del video
 * @param {string} fileName - Nome del file
 * @param {number} userId - ID dell'utente
 * @param {number} chatId - ID della chat
 * @returns {Promise<string>} Path del file salvato
 */
const downloadAndSaveVideo = async (videoBuffer, fileName, userId, chatId) => {
    try {
        const tempDir = path.join(os.tmpdir(), 'google-veo');

        // Verifica spazio disponibile
        try {
            await fs.mkdir(tempDir, { recursive: true });
        } catch (mkdirError) {
            logger.error('Errore nella creazione della directory temporanea:', mkdirError);
            throw new Error('Errore di storage: impossibile creare directory temporanea');
        }

        const filePath = path.join(tempDir, fileName);

        // Salva il video buffer nel file temporaneo
        try {
            await fs.writeFile(filePath, videoBuffer);
        } catch (writeError) {
            logger.error('Errore nella scrittura del file temporaneo:', writeError);
            throw new Error('Errore di storage: impossibile scrivere file temporaneo');
        }

        // Upload su Google Cloud Storage
        const gcsPath = `videos/${userId}/${chatId}/${fileName}`;
        try {
            await gcsService.uploadFile(filePath, gcsPath);
        } catch (uploadError) {
            logger.error('Errore nell\'upload su Google Cloud Storage:', uploadError);
            throw new Error(`Errore di storage: impossibile caricare file su cloud storage - ${uploadError.message}`);
        }

        // Rimuovi il file temporaneo
        try {
            await fs.unlink(filePath);
        } catch (unlinkError) {
            logger.warn('Errore nella rimozione del file temporaneo:', unlinkError);
            // Non blocchiamo l'operazione per questo errore
        }

        return `gs://${gcsService.bucketName}/${gcsPath}`;
    } catch (error) {
        logger.error('Errore nel download e salvataggio del video:', error);

        // Classificazione errori di storage
        if (error.message.includes('ENOSPC')) {
            throw new Error('Errore di storage: spazio insufficiente sul disco');
        } else if (error.message.includes('EACCES')) {
            throw new Error('Errore di storage: permessi insufficienti');
        } else if (error.message.includes('cloud storage')) {
            throw new Error(`Errore di storage: ${error.message}`);
        } else {
            throw new Error(`Errore di storage: ${error.message}`);
        }
    }
};

/**
 * Elabora la richiesta principale di Google Veo
 * @param {Object} requestData - Dati della richiesta
 * @returns {Promise<Object>} Risultato dell'elaborazione
 */
const processGoogleVeoRequest = async (requestData) => {
    try {
        const {
            prompt,
            modelId,
            userId,
            chatId,
            onStream = null
        } = requestData;

        logger.info(`Elaborazione richiesta Google Veo per utente ${userId}, chat ${chatId}`);

        // Verifica il modello
        const model = await db.models.Model.findByPk(modelId);
        if (!model) {
            throw new Error(`Modello ${modelId} non trovato`);
        }

        // Calcola il costo stimato
        const costDetails = await calculateCost(modelId, 1, 'Generate');

        // Verifica i fondi dell'utente
        const hasFunds = await checkUserFunds(userId, costDetails.estimatedCost);
        if (!hasFunds) {
            throw new Error('Fondi insufficienti per la generazione del video');
        }

        // Salva il messaggio utente
        const userMessage = await saveMessage({
            chat_id: chatId,
            user_id: userId,
            content: prompt,
            role: 'user',
            model_id: modelId,
            is_complete: true
        });

        // Invia evento di inizio generazione
        if (onStream) {
            onStream({
                type: 'video-generation-started',
                data: {
                    messageId: userMessage.id,
                    modelId: modelId,
                    prompt: prompt
                }
            });
        }

        // Genera il video usando Google Veo
        const videoResult = await sendRequest(prompt, model, userId, chatId, 'video', [], onStream);

        // Salva il messaggio assistente
        const assistantMessage = await saveMessage({
            chat_id: chatId,
            user_id: userId,
            content: `Video generato: ${videoResult.videoUrl}`,
            role: 'assistant',
            model_id: modelId,
            is_complete: true
        });

        // Salva l'attachment video
        const attachment = await saveAttachment({
            message_id: assistantMessage.id,
            file_type: 'video',
            file_name: videoResult.fileName,
            file_path: videoResult.filePath,
            mime_type: 'video/mp4',
            file_size: videoResult.fileSize || 0
        });

        // Salva i costi
        await saveMessageCost(costDetails, assistantMessage.id, chatId, userId);

        // Aggiorna il wallet
        await updateWalletBalance(userId, -costDetails.estimatedCost);

        // Invia evento di completamento
        if (onStream) {
            onStream({
                type: 'video-generation-completed',
                data: {
                    messageId: assistantMessage.id,
                    videoUrl: videoResult.videoUrl,
                    attachmentId: attachment.id
                }
            });
        }

        return {
            success: true,
            messageId: assistantMessage.id,
            videoUrl: videoResult.videoUrl,
            attachmentId: attachment.id,
            cost: costDetails.estimatedCost
        };

    } catch (error) {
        logger.error('Errore nell\'elaborazione della richiesta Google Veo:', error);

        // Invia evento di errore
        if (onStream) {
            onStream({
                type: 'video-generation-error',
                data: {
                    error: error.message
                }
            });
        }

        throw error;
    }
};

/**
 * Invia la richiesta a Google Veo
 * @param {string} prompt - Prompt per la generazione del video
 * @param {Object} model - Modello da utilizzare
 * @param {number} userId - ID dell'utente
 * @param {number} chatId - ID della chat
 * @param {Function} onStream - Callback per gli eventi di stream
 * @returns {Promise<Object>} Risultato della generazione
 */
const sendRequest = async (prompt, model, userId, chatId, agentType = 'video', attachmentIds = [], onStream = null) => {
    try {
        logger.info(`[GOOGLE VEO DEBUG] sendRequest called with parameters:`, {
            prompt: prompt?.substring(0, 50) + '...',
            model, 
            userId, 
            chatId, 
            agentType,
            attachmentIds: attachmentIds?.length || 0,
            hasOnStream: typeof onStream === 'function'
        });
        
        logger.info(`Invio richiesta a Google Veo per prompt: ${prompt.substring(0, 100)}...`);

        // Verifica API key
        logger.info(`[GOOGLE VEO DEBUG] Validating API key...`);
        validateApiKey();
        logger.info(`[GOOGLE VEO DEBUG] API key validated successfully`);

        // Verifica rate limit
        logger.info(`[GOOGLE VEO DEBUG] Checking rate limit...`);
        checkRateLimit();
        logger.info(`[GOOGLE VEO DEBUG] Rate limit check passed`);

        // Inizializza Google Generative AI
        const genAI = new GoogleGenerativeAI(GOOGLE_VEO_API_KEY);

        // Inizia la generazione del video
        if (onStream) {
            onStream({
                type: 'video-generation-started',
                data: { progress: 0 }
            });
        }

        // Prepara la richiesta per Google AI Studio - formato corretto per predictLongRunning
        const veoRequest = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };

        logger.info(`[GOOGLE VEO DEBUG] About to call Google Veo API...`);
        logger.info('Google Veo request payload:', JSON.stringify(veoRequest, null, 2));

        // Chiama l'API di Google AI Studio per generazione video (long-running operation)  
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning?key=${GOOGLE_VEO_API_KEY}`;
        logger.info(`[GOOGLE VEO DEBUG] Making HTTP request to Google AI Studio Veo API...`);
        logger.info(`[GOOGLE VEO DEBUG] Complete API URL: ${apiUrl.replace(GOOGLE_VEO_API_KEY, '[API_KEY_HIDDEN]')}`);
        const veoResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(veoRequest)
        });

        if (!veoResponse.ok) {
            const errorData = await veoResponse.json();
            throw new Error(`Errore nell'API di Google Veo: ${errorData.error?.message || veoResponse.statusText}`);
        }

        const veoData = await veoResponse.json();
        logger.info(`[GOOGLE VEO DEBUG] Google API Response:`, JSON.stringify(veoData, null, 2));
        
        const operationName = veoData.name;
        
        if (onStream) {
            onStream({
                type: 'video-generation-started',
                data: { progress: 20, message: 'Video generation started, polling for completion...' }
            });
        }

        // Polling per il completamento dell'operazione
        let operationComplete = false;
        let videoUrl = null;
        let attempts = 0;
        const maxAttempts = 60; // 5 minuti con polling ogni 5 secondi

        while (!operationComplete && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Attendi 5 secondi
            attempts++;
            
            const operationUrl = `https://generativelanguage.googleapis.com/v1/${operationName}?key=${GOOGLE_VEO_API_KEY}`;
            logger.info(`[GOOGLE VEO DEBUG] Polling operation (attempt ${attempts}/${maxAttempts}): ${operationUrl.replace(GOOGLE_VEO_API_KEY, '[API_KEY_HIDDEN]')}`);
            
            const operationResponse = await fetch(operationUrl);

            if (!operationResponse.ok) {
                throw new Error(`Errore nel polling dell'operazione: ${operationResponse.statusText}`);
            }

            const operationData = await operationResponse.json();
            logger.info(`[GOOGLE VEO DEBUG] Operation status:`, {
                done: operationData.done,
                hasError: !!operationData.error,
                hasResponse: !!operationData.response
            });

            if (operationData.done) {
                operationComplete = true;

                if (operationData.error) {
                    logger.error(`[GOOGLE VEO DEBUG] Operation failed:`, operationData.error);
                    throw new Error(`Errore nella generazione del video: ${operationData.error.message}`);
                }

                // Try to extract video URL from completed operation response
                if (operationData.response && operationData.response.candidates && operationData.response.candidates[0]) {
                    const candidate = operationData.response.candidates[0];
                    if (candidate.content && candidate.content.parts) {
                        for (const part of candidate.content.parts) {
                            if (part.video && part.video.uri) {
                                videoUrl = part.video.uri;
                                break;
                            } else if (part.videoUri) {
                                videoUrl = part.videoUri;
                                break;
                            }
                        }
                    }
                }

                logger.info(`[GOOGLE VEO DEBUG] Extracted video URL: ${videoUrl}`);

                if (!videoUrl) {
                    logger.error(`[GOOGLE VEO DEBUG] No video URL found in completed operation response`);
                    logger.info(`[GOOGLE VEO DEBUG] Full operation response:`, JSON.stringify(operationData.response, null, 2));
                    throw new Error('Errore nella generazione del video: URL del video non trovato');
                }
            } else {
                const progress = Math.min(20 + (attempts * 1.2), 90);
                if (onStream) {
                    onStream({
                        type: 'video-generation-progress',
                        data: {
                            progress: progress,
                            message: `Generazione in corso... (${attempts}/${maxAttempts})`
                        }
                    });
                }
            }
        }

        if (!operationComplete) {
            throw new Error('Timeout nella generazione del video: operazione non completata entro 5 minuti');
        }

        // Proceed to video download
        if (onStream) {
            onStream({
                type: 'video-generation-progress',
                data: { progress: 85, message: 'Video generato, scaricamento in corso...' }
            });
        }

        // Download del video dall'URL fornito da Google Veo
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
            throw new Error(`Errore nel download del video: ${videoResponse.statusText}`);
        }

        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

        // Genera un nome file univoco
        const timestamp = Date.now();
        const fileName = `video_${userId}_${chatId}_${timestamp}.mp4`;

        // Salva il video usando la funzione helper
        const filePath = await downloadAndSaveVideo(videoBuffer, fileName, userId, chatId);

        // Genera URL firmato per l'accesso
        const signedUrl = await gcsService.getSignedUrl(gcsPath, {
            action: 'read',
            expires: Date.now() + (15 * 60 * 1000) // 15 minuti
        });

        // Invia evento di completamento
        if (onStream) {
            onStream({
                type: 'video-generation-completed',
                data: { progress: 100 }
            });
        }

        return {
            videoUrl: signedUrl,
            fileName: fileName,
            filePath: filePath,
            fileSize: videoBuffer.length
        };

    } catch (error) {
        logger.error('Errore nell\'invio della richiesta a Google Veo:', error);

        // Classificazione degli errori di rete
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            throw new Error('Errore di connessione di rete. Verifica la connessione internet.');
        } else if (error.code === 'ETIMEDOUT') {
            throw new Error('Timeout della connessione. Riprova più tardi.');
        } else if (error.message.includes('API key')) {
            throw new Error('Errore di configurazione API key. Contatta l\'amministratore.');
        } else {
            throw new Error(`Errore di rete: ${error.message}`);
        }
    }
};

/**
 * Recupera i modelli disponibili
 * @returns {Promise<Array>} Array di modelli disponibili
 */
const getAvailableModels = async () => {
    try {
        const now = Date.now();

        // Verifica se la cache è ancora valida
        if (AVAILABLE_MODELS.length > 0 && lastModelsFetch && (now - lastModelsFetch) < CACHE_DURATION) {
            return AVAILABLE_MODELS;
        }

        // Aggiorna la cache
        AVAILABLE_MODELS = await fetchAvailableModels();
        lastModelsFetch = now;

        return AVAILABLE_MODELS;
    } catch (error) {
        logger.error('Errore nel recupero dei modelli disponibili:', error);
        return [];
    }
};

/**
 * Verifica se un modello è disponibile
 * @param {string} modelId - ID del modello
 * @returns {Promise<boolean>} True se il modello è disponibile
 */
const isModelAvailable = async (modelId) => {
    try {
        const models = await getAvailableModels();
        return models.some(model => model.id === modelId);
    } catch (error) {
        logger.error('Errore nella verifica della disponibilità del modello:', error);
        return false;
    }
};

module.exports = {
    processGoogleVeoRequest,
    getAvailableModels,
    isModelAvailable,
    calculateCost,
    checkUserFunds,
    saveMessage,
    saveAttachment,
    saveMessageCost,
    updateWalletBalance,
    downloadAndSaveVideo,
    sendRequest
}; 