const Anthropic = require("@anthropic-ai/sdk");
const db = require("../database");
const config = require("../config/config");
const modelService = require("./model.service");
const fileContentExtractor = require('./file-content-extractor.service');
const { preparePromptWithContext } = require('../utils/chat-context');
const { Op } = require("sequelize");

// Importazione dei modelli
const { User, Chat, Message, Attachment, Wallet, Transaction, MessageCost, Model, AggregatorPricingTier, ModelStatsAA, ModelModelStatsAA } = db.sequelize.models;

// Configurazione del client Anthropic
const client = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

// Cache dei modelli disponibili
let AVAILABLE_MODELS = [];
let lastModelsFetch = null;
const CACHE_DURATION = 3600000; // 1 ora in millisecondi


let ANTHROPIC_PROVIDER_ID = null;

// Funzione per recuperare l'id_provider di Anthropic
async function getAnthropicProviderId() {
  if (ANTHROPIC_PROVIDER_ID) return ANTHROPIC_PROVIDER_ID;
  const Provider = db.models.Provider;
  const provider = await Provider.findOne({ where: { name: 'anthropic' } });
  if (!provider) throw new Error('Provider Anthropic non trovato');
  ANTHROPIC_PROVIDER_ID = provider.id;
  return ANTHROPIC_PROVIDER_ID;
}

/**
 * Recupera i modelli disponibili dall'API di Anthropic
 * @returns {Promise<Array>} Array di modelli disponibili
 */
const fetchAvailableModels = async () => {
  try {
    // Recupera tutti i modelli Anthropic dal database
    const dbModels = await Model.findAll({
      where: {
        id_provider: await getAnthropicProviderId(),
        is_active: true
      }
    });

    if (!dbModels || dbModels.length === 0) {
      console.warn("Nessun modello Anthropic trovato nel database");
      return [];
    }

    // Mappa i modelli dal database al formato richiesto
    const availableModels = dbModels.map(model => ({
      id: model.model_slug,
      name: model.name,
      description: model.description,
      maxTokens: model.max_tokens || 200000,
      inputPricePerMillion: model.input_price_per_million,
      outputPricePerMillion: model.output_price_per_million,
      capabilities: model.capabilities || [],
    }));

    return availableModels;
  } catch (error) {
    console.error("Errore nel recupero dei modelli disponibili:", error);
    return [];
  }
};

/**
 * Stima il numero di token di output basato sul prompt e sul modello
 * @param {string} prompt - Il prompt dell'utente
 * @param {string} model - Il modello Claude selezionato
 * @returns {Promise<number>} Numero stimato di token di output
 */
const estimateOutputTokens = async (prompt, model) => {
  // Stima approssimativa del numero di token di input
  const inputTokens = Math.ceil(prompt.length / 4);

  // Ottieni il rapporto di output dal database
  const outputRatio = await modelService.getEstimatedOutputRatio(model);

  // Calcola il numero stimato di token di output
  // Aggiungendo un limite massimo ragionevole
  const estimatedOutputTokens = Math.min(
    Math.ceil(inputTokens * outputRatio),
    4000 // Il massimo ragionevole di default per una risposta
  );

  return estimatedOutputTokens;
};

/**
 * Calcola il costo stimato della richiesta in base al modello e ai token
 * @param {string} modelId - ID del modello Claude selezionato
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
  // Recupera il modello usando api_model_id
  const dbModel = await Model.findOne({ where: { api_model_id: modelId } });
  if (!dbModel) throw new Error(`Modello ${modelId} non trovato`);

  // Recupera la relazione con ModelStatsAA
  const modelStatsRel = await ModelModelStatsAA.findOne({
    where: { id_model: dbModel.id },
    order: [['type', 'ASC']], // preferisci exact_match se presente
  });
  if (!modelStatsRel) throw new Error(`Nessuna relazione ModelStatsAA trovata per il modello ${modelId}`);

  // Recupera la riga ModelStatsAA
  const statsAA = await ModelStatsAA.findByPk(modelStatsRel.id_model_aa);
  if (!statsAA) throw new Error(`ModelStatsAA non trovata per il modello ${modelId}`);

  // Recupera il pricing tier aggregator
  const pricingTier = await AggregatorPricingTier.findOne({
    where: {
      id_aggregator_provider: dbModel.id_provider,
      tier_name: 'pay_as_you_go',
      is_active: true
    }
  });
  if (!pricingTier) throw new Error(`AggregatorPricingTier pay_as_you_go non trovato per provider ${dbModel.id_provider}`);

  // Stima output tokens se richiesto
  let finalOutputTokens = outputTokens;
  let estimatedOutputRatio = null;
  if (includeEstimatedOutput && outputTokens === 0) {
    estimatedOutputRatio = 1.5;
    finalOutputTokens = Math.ceil(inputTokens * estimatedOutputRatio);
  }

  // Calcolo base_cost
  const priceInput = Number(statsAA.price_1m_input_tokens) || 0;
  const priceOutput = Number(statsAA.price_1m_output_tokens) || 0;
  const baseCost = ((inputTokens * priceInput) + (finalOutputTokens * priceOutput)) / 1_000_000;

  // Calcolo markup
  const fixedMarkup = Number(pricingTier.markup_fixed) || 0;
  const percentageMarkup = baseCost * ((Number(pricingTier.markup_percentage) || 0) / 100);
  const totalMarkup = fixedMarkup + percentageMarkup;
  const totalCost = baseCost + totalMarkup;

  return {
    inputTokens,
    outputTokens: finalOutputTokens,
    totalTokens: inputTokens + finalOutputTokens,
    baseCost,
    fixedMarkup,
    percentageMarkup,
    totalMarkup,
    totalCost,
    model: dbModel.model_slug,
    modelId: dbModel.id,
    estimatedOutput: includeEstimatedOutput && outputTokens === 0,
    estimatedOutputRatio: estimatedOutputRatio
  };
};

/**
 * Verifica se l'utente ha fondi sufficienti per la richiesta
 * @param {number} userId - ID dell'utente
 * @param {number} estimatedCost - Costo stimato della richiesta
 * @returns {Promise<boolean>} True se l'utente ha fondi sufficienti
 */
const checkUserFunds = async (userId, estimatedCost) => {
  const wallet = await Wallet.findOne({ where: { user_id: userId } });

  if (!wallet) {
    throw new Error("Portafoglio utente non trovato");
  }

  return wallet.balance >= estimatedCost;
};

/**
 * Processa gli allegati e li prepara per l'invio ad Anthropic
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
    if (typeof attachment === "number") {
      attachmentData = await Attachment.findByPk(attachment);
      if (!attachmentData) {
        throw new Error(`Allegato con ID ${attachment} non trovato`);
      }
    }

    // Se è un'immagine, la processiamo come immagine per Anthropic
    if (attachmentData.mime_type.startsWith("image/")) {
      processedAttachments.push({
        type: "image",
        source: {
          type: "base64",
          media_type: attachmentData.mime_type,
          data: await readFileAsBase64(attachmentData.file_path),
        },
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
          maxLength: 50000, // Limite ragionevole per Anthropic
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
    const fs = require("fs").promises;
    const buffer = await fs.readFile(filePath);
    return buffer.toString("base64");
  }
};

/**
 * Salva un messaggio nel database
 * @param {Object} messageData - Dati del messaggio
 * @returns {Promise<Object>} Messaggio salvato
 */
const saveMessage = async (messageData) => {
  return await Message.create(messageData);
};

/**
 * Salva gli allegati associati a un messaggio
 * @param {Array} attachments - Array di oggetti allegato
 * @param {number} messageId - ID del messaggio
 * @param {number} chatId - ID della chat
 * @param {number} userId - ID dell'utente
 * @returns {Promise<Array>} Array di allegati salvati
 */
const saveAttachments = async (attachments = [], messageId, chatId, userId) => {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  const savedAttachments = [];

  for (const attachment of attachments) {
    // Se l'allegato è già un record nel database, aggiorniamo solo l'associazione al messaggio
    if (typeof attachment === "number") {
      const existingAttachment = await Attachment.findByPk(attachment);
      if (existingAttachment) {
        existingAttachment.message_id = messageId;
        await existingAttachment.save();
        savedAttachments.push(existingAttachment);
      }
    } else {
      // Altrimenti creiamo un nuovo record
      const newAttachment = await Attachment.create({
        user_id: userId,
        chat_id: chatId,
        message_id: messageId,
        file_name: attachment.file_name,
        original_name: attachment.original_name,
        file_path: attachment.file_path,
        file_size: attachment.file_size,
        mime_type: attachment.mime_type,
        file_type: attachment.mime_type.startsWith("image/")
          ? "image"
          : "other",
      });
      savedAttachments.push(newAttachment);
    }
  }

  return savedAttachments;
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
  const messageCost = await MessageCost.create({
    message_id: messageId,
    chat_id: chatId,
    user_id: userId,
    model_id: costDetails.modelId,
    input_tokens: costDetails.inputTokens,
    output_tokens: costDetails.outputTokens,
    total_tokens: costDetails.totalTokens,
    estimated_output_ratio: costDetails.estimatedOutputRatio,
    real_output_ratio: costDetails.inputTokens > 0 ? costDetails.outputTokens / costDetails.inputTokens : null,
    base_cost: costDetails.baseCost,
    fixed_markup: costDetails.fixedMarkup,
    percentage_markup: costDetails.percentageMarkup,
    total_markup: costDetails.totalMarkup,
    total_cost: costDetails.totalCost,
    credit_cost: costDetails.creditCost || costDetails.totalCost,
    model_used: costDetails.model
  });

  // Se abbiamo un rapporto di output reale, aggiorniamo il modello
  if (messageCost.real_output_ratio && costDetails.modelId) {
    await modelService.calculateAndSaveOutputRatios(
      messageCost,
      costDetails.inputTokens,
      costDetails.outputTokens
    );
  }

  return messageCost;
};

/**
 * Aggiorna il saldo del portafoglio dell'utente
 * @param {number} userId - ID dell'utente
 * @param {number} amount - Importo da sottrarre (negativo)
 * @returns {Promise<Object>} Portafoglio aggiornato
 */
const updateWalletBalance = async (userId, amount) => {
  const wallet = await Wallet.findOne({ where: { user_id: userId } });

  if (!wallet) {
    throw new Error("Portafoglio utente non trovato");
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
    type: "usage",
    payment_method: "system",
    status: "completed",
    description: "Utilizzo servizio Anthropic AI",
  });

  return wallet;
};

/**
 * Servizio principale per gestire le richieste ad Anthropic
 * @param {Object} requestData - Dati della richiesta
 * @returns {Promise<Object>} Risposta elaborata
 */
const processAnthropicRequest = async (requestData) => {
  const {
    model,
    prompt,
    attachments = [],
    chatId,
    userId,
    agent_type,
    agent_model,
  } = requestData;

  if (!model || !prompt || !chatId || !userId) {
    throw new Error(
      "Parametri mancanti: model, prompt, chatId e userId sono obbligatori"
    );
  }

  // Verifica che il modello esista
  const isAvailable = await isModelAvailable(model);
  if (!isAvailable) {
    throw new Error(
      `Modello non supportato: ${model}. Utilizzare uno dei modelli disponibili.`
    );
  }

  // Correggi il nome del modello se necessario
  let correctedModel = model;
  if (model === "claude-3.7-sonnet") {
    correctedModel = "claude-3-7-sonnet-20250219";
  }

  // Verifica che l'utente e la chat esistano
  const [user, chat] = await Promise.all([
    User.findByPk(userId),
    Chat.findByPk(chatId),
  ]);

  if (!user) {
    throw new Error(`Utente con ID ${userId} non trovato`);
  }

  if (!chat) {
    throw new Error(`Chat con ID ${chatId} non trovata`);
  }

  // Stima il costo della richiesta (solo input tokens per ora)
  // Nota: in una implementazione reale, dovresti utilizzare un tokenizer per contare i token
  const estimatedInputTokens = Math.ceil(prompt.length / 4); // Stima approssimativa
  const costEstimate = await calculateCost(model, estimatedInputTokens, 0, true);

  // Verifica se l'utente ha fondi sufficienti
  const hasSufficientFunds = await checkUserFunds(
    userId,
    costEstimate.totalCost
  );

  if (!hasSufficientFunds) {
    throw new Error(
      `Fondi insufficienti. Costo stimato: ${costEstimate.totalCost.toFixed(
        6
      )} USD. Ricarica il tuo portafoglio per continuare.`
    );
  }

  // Salva il messaggio dell'utente
  let userMessage;
  try {
    userMessage = await saveMessage({
      chat_id: chatId,
      role: "user",
      content: prompt,
      tokens_used: estimatedInputTokens,
      agent_type: agent_type || "chat",
      agent_model: agent_model,
    });

    // Processa e salva gli allegati
    const { processedAttachments, enrichedPrompt } = await processAttachments(attachments);
    await saveAttachments(attachments, userMessage.id, chatId, userId);

    // Prepara il prompt finale
    let finalPrompt = prompt;
    if (enrichedPrompt) {
      finalPrompt = enrichedPrompt.replace('{userPrompt}', prompt);
    }

    // Prepara la richiesta per Anthropic
    const messages = [
      {
        role: "user",
        content:
          processedAttachments.length > 0
            ? [{ type: "text", text: finalPrompt }, ...processedAttachments]
            : finalPrompt,
      },
    ];

    // Effettua la chiamata ad Anthropic
    const response = await client.messages.create({
      model: correctedModel,
      messages: messages,
      max_tokens: 4000,
    });

    // Estrai la risposta
    const assistantResponse = response.content[0].text;
    const outputTokens = response.usage.output_tokens;
    const inputTokens = response.usage.input_tokens;

    // Calcola il costo effettivo
    const actualCost = await calculateCost(model, inputTokens, outputTokens);

    // Salva la risposta dell'assistente
    const assistantMessage = await saveMessage({
      chat_id: chatId,
      role: "assistant",
      content: assistantResponse,
      tokens_used: outputTokens,
      agent_type: agent_type || "chat",
      agent_model: agent_model,
    });

    // Salva i dettagli del costo
    await saveMessageCost(actualCost, assistantMessage.id, chatId, userId);

    // Aggiorna il saldo del portafoglio (sottrai il costo totale)
    await updateWalletBalance(userId, -actualCost.totalCost);

    // Aggiorna il timestamp dell'ultima attività della chat
    chat.last_message_at = new Date();
    await chat.save();

    return {
      success: true,
      message: assistantResponse,
      messageId: assistantMessage.id,
      userMessageId: userMessage.id,
      cost: actualCost,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
      created_at: assistantMessage.created_at,
    };
  } catch (error) {
    // In caso di errore, elimina il messaggio dell'utente e i relativi costi se esistono
    if (userMessage) {
      // Elimina eventuali costi associati al messaggio
      await MessageCost.destroy({ where: { message_id: userMessage.id } });

      // Elimina eventuali allegati associati al messaggio
      await Attachment.destroy({ where: { message_id: userMessage.id } });

      // Elimina il messaggio
      await userMessage.destroy();
    }

    throw new Error(
      `Errore durante la richiesta ad Anthropic: ${error.message}`
    );
  }
};

/**
 * Adattatore per il metodo sendRequest che accetta i parametri nel formato usato in messages.js
 * @param {string} prompt - Il messaggio dell'utente
 * @param {string} model - Il modello Claude selezionato
 * @param {number} userId - ID dell'utente
 * @param {number} chatId - ID della chat
 * @param {string} agentType - Tipo di agente (chat, image, video)
 * @param {Array} attachments - Array di allegati
 * @param {function} onStream - Callback per gestire i chunk di streaming
 * @returns {Promise<Object>} Risposta elaborata
 */
const sendRequest = async (
  prompt,
  model,
  userId,
  chatId,
  agentType = "chat",
  attachments = [],
  onStream = null
) => {
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    // Prepara il prompt con il contesto delle chat
    const fullPrompt = await preparePromptWithContext(prompt, chatId, 'anthropic');
    
    const messages = [
      {
        role: 'user',
        content: fullPrompt
      }
    ];
    
    const response = await client.messages.create({
      model: model,
      messages: messages,
      max_tokens: 4000,
      stream: !!onStream
    });
    
    if (onStream) {
      let chunkCount = 0;
      for await (const chunk of response) {
        chunkCount++;
        const delta = chunk.delta?.text || '';
        if (delta) {
          fullText += delta;
          onStream(delta, chunk.usage);
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.input_tokens || inputTokens;
          outputTokens = chunk.usage.output_tokens || outputTokens;
        }
      }
    } else {
      // Non-streaming mode - response is a single object, not an async iterable
      fullText = response.content?.[0]?.text || '';
      if (response.usage) {
        inputTokens = response.usage.input_tokens || 0;
        outputTokens = response.usage.output_tokens || 0;
      }
    }
    
    if (!inputTokens || !outputTokens) {
      inputTokens = Math.ceil(fullPrompt.length / 4);
      outputTokens = Math.ceil(fullText.length / 4);
    }
    
    const cost = await calculateCost(model, inputTokens, outputTokens);
    return { fullText, inputTokens, outputTokens, cost };
  } catch (error) {
    console.error('[DEBUG] Anthropic sendRequest error:', error);
    return { fullText, inputTokens, outputTokens, error: error.message };
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
    // Correggi il nome del modello se necessario
    let correctedModelId = modelId;

    // Mappa claude-3-7-sonnet a claude-3-7-sonnet-20250219
    if (modelId === "claude-3.7-sonnet") {
      correctedModelId = "claude-3-7-sonnet-20250219";
    }

    // Verifica se il modello esiste nel database usando api_model_id
    const dbModel = await Model.findOne({
      where: {
        api_model_id: correctedModelId,
        is_active: true
      }
    });

    if (dbModel) {
      return true;
    }

    // Verifica se il modello è una variante di un modello disponibile
    // Ad esempio, claude-3-opus-20240229 è una variante di claude-3-opus
    const baseModelId = correctedModelId.split("-20")[0];
    if (baseModelId !== correctedModelId) {
      const baseModel = await Model.findOne({
        where: {
          api_model_id: baseModelId,
          id_provider,
          is_active: true
        }
      });

      return !!baseModel;
    }

    return false;
  } catch (error) {
    console.error(
      "Errore durante la verifica della disponibilità del modello:",
      error
    );
    return false;
  }
};

module.exports = {
  processAnthropicRequest,
  calculateCost,
  estimateOutputTokens,
  getAvailableModels,
  isModelAvailable,
  sendRequest
};
