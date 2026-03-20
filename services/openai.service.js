const OpenAI = require("openai");
const db = require("../database");
const config = require("../config/config");
const axios = require("axios");
const modelService = require('./model.service');
const fileContentExtractor = require('./file-content-extractor.service');
const messageRecovery = require('./message-recovery.service');

// Importazione dei modelli
const { User, Chat, Message, Attachment, Wallet, Transaction, MessageCost, Model } = db.sequelize.models;

// Configurazione del client OpenAI
const client = new OpenAI({
  apiKey: config.openai.apiKey,
});

// Cache dei modelli disponibili
let AVAILABLE_MODELS = [];
let lastModelsFetch = null;
const CACHE_DURATION = 3600000; // 1 ora in millisecondi

let OPENAI_PROVIDER_ID = null;

// Funzione per recuperare l'id_provider di Anthropic
async function getOpenAiProviderId() {
  if (OPENAI_PROVIDER_ID) return OPENAI_PROVIDER_ID;
  const Provider = db.models.Provider;
  const provider = await Provider.findOne({ where: { name: 'openai' } });
  if (!provider) throw new Error('Provider OpenAI non trovato');
  OPENAI_PROVIDER_ID = provider.id;
  return OPENAI_PROVIDER_ID;
}


/**
 * Recupera i modelli disponibili dall'API di OpenAI
 * @returns {Promise<Array>} Array di modelli disponibili
 */
const fetchAvailableModels = async () => {
  try {
    // Recupera tutti i modelli OpenAI dal database
    const dbModels = await Model.findAll({
      where: {
        id_provider: await getOpenAiProviderId(),
        is_active: true
      }
    });

    if (!dbModels || dbModels.length === 0) {
      console.warn("Nessun modello OpenAI trovato nel database");
      return [];
    }

    // Mappa i modelli dal database al formato richiesto
    const availableModels = dbModels.map(model => ({
      id: model.model_slug,
      name: model.name,
      description: model.description,
      maxTokens: model.max_tokens || 16000,
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
 * @param {string} model - Il modello OpenAI selezionato
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
 * @param {string} modelId - ID del modello OpenAI selezionato
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
  if (type === 'direct') {
    // Calculate base cost using pricing data from models_stats_aa or models_price_score
    let inputPricePerMillion = 0;
    let outputPricePerMillion = 0;

    if (statsAA) {
      inputPricePerMillion = Number(statsAA.price_1m_input_tokens) || 0;
      outputPricePerMillion = Number(statsAA.price_1m_output_tokens) || 0;
    } else if (priceScore) {
      inputPricePerMillion = Number(priceScore.price_1m_input_tokens) || 0;
      outputPricePerMillion = Number(priceScore.price_1m_output_tokens) || 0;
    } else if (subscription) {
      // Fallback to subscription cost if available
      baseCost = Number(subscription.cost) || 0;
      fixedMarkup = 0;
      percentageMarkup = 0;
      totalMarkup = 0;
      totalCost = baseCost;
    } else {
      throw new Error(`No pricing data available for model ${modelId}`);
    }

    // Calculate cost based on token usage
    if (inputPricePerMillion > 0 || outputPricePerMillion > 0) {
      baseCost = (inputTokens / 1000000) * inputPricePerMillion + (finalOutputTokens / 1000000) * outputPricePerMillion;
      fixedMarkup = 0;
      percentageMarkup = 0;
      totalMarkup = 0;
      totalCost = baseCost;
    }
  } else if (type === 'aggregator') {
    baseCost = 0.01 * (inputTokens + finalOutputTokens);
    fixedMarkup = Number(tier.markup_fixed) || 0;
    percentageMarkup = baseCost * ((Number(tier.markup_percentage) || 0) / 100);
    totalMarkup = fixedMarkup + percentageMarkup;
    totalCost = baseCost + totalMarkup;
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
 * Verifica se l'utente ha fondi sufficienti per la richiesta
 * @param {number} userId - ID dell'utente
 * @param {number} estimatedCost - Costo stimato della richiesta
 * @returns {Promise<boolean>} True se l'utente ha fondi sufficienti
 */
const checkUserFunds = async (userId, estimatedCost) => {
  const wallet = await Wallet.findOne({ where: { user_id: userId } });

  if (!wallet) {
    throw new Error('Portafoglio utente non trovato');
  }

  // Add more detailed logging for diagnostics
  console.log(`[${new Date().toISOString()}] Checking funds for user ${userId}: balance=${wallet.balance}, required=${estimatedCost}`);

  // Ensure balance is treated as a number
  const balance = parseFloat(wallet.balance || 0);

  if (balance < estimatedCost) {
    console.log(`[${new Date().toISOString()}] Insufficient funds detected: ${balance} < ${estimatedCost}`);
    throw new Error(`Fondi insufficienti. Costo stimato: ${estimatedCost.toFixed(6)} USD. Saldo corrente: ${balance.toFixed(6)} USD. Ricarica il tuo portafoglio per continuare.`);
  }

  return true;
};

/**
 * Processa gli allegati e li prepara per l'invio a OpenAI
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

    // Se è un'immagine, la processiamo come immagine per OpenAI
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
          maxLength: 50000, // Limite ragionevole per OpenAI
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
    if (typeof attachment === 'number') {
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
        file_type: attachment.mime_type.startsWith('image/') ? 'image' : 'other'
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
    description: 'Utilizzo servizio OpenAI'
  });

  return wallet;
};

/**
 * Servizio principale per gestire le richieste streaming a OpenAI
 * @param {Object} requestData - Dati della richiesta
 * @returns {Promise<Object>} Risposta elaborata
 */
const processOpenAIStreamingRequest = async (requestData) => {
  const { model, prompt, attachments = [], chatId, userId, agent_type, agent_model, onStream } = requestData;

  if (!model || !prompt || !chatId || !userId || !onStream) {
    throw new Error('Parametri mancanti: model, prompt, chatId, userId e onStream sono obbligatori');
  }

  // Verifica che il modello esista
  const isAvailable = await isModelAvailable(model);
  if (!isAvailable) {
    throw new Error(`Modello non supportato: ${model}. Utilizzare uno dei modelli disponibili.`);
  }

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
    // Prepara la richiesta per OpenAI con streaming
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

    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    // Effettua la chiamata streaming a OpenAI
    const response = await client.chat.completions.create({
      model: model,
      messages: messages,
      max_tokens: 4000,
      stream: true,
      stream_options: {
        include_usage: true
      }
    });

    // Process streaming response
    for await (const chunk of response) {
      const delta = chunk.choices?.[0]?.delta?.content || '';

      if (delta) {
        fullText += delta;
        // Call the streaming callback with the chunk
        onStream(delta);
      }

      // OpenAI sends usage info in the last chunk when stream_options.include_usage is true
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens || 0;
        outputTokens = chunk.usage.completion_tokens || 0;
        onStream(null, {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens
        });
      }
    }

    // Fallback token estimation if no usage data received
    if (!inputTokens || !outputTokens) {
      inputTokens = Math.ceil(prompt.length / 4);
      outputTokens = Math.ceil(fullText.length / 4);
    }

    return {
      fullText,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      }
    };

  } catch (error) {
    // Preserve the original OpenAI error for better debugging
    console.error('OpenAI Streaming Error:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type,
      error: error.error
    });

    // Check for specific OpenAI error types and provide better messages
    if (error.status === 404) {
      throw new Error(`Modello OpenAI non trovato o non hai accesso: ${error.message}`);
    } else if (error.status === 401) {
      throw new Error(`Chiave API OpenAI non valida: ${error.message}`);
    } else if (error.status === 429) {
      throw new Error(`Limite di richieste OpenAI raggiunto: ${error.message}`);
    } else if (error.status === 402 || error.message.includes('billing') || error.message.includes('quota')) {
      throw new Error(`Problema di fatturazione OpenAI: ${error.message}`);
    } else if (error.message.includes('insufficient_quota')) {
      throw new Error(`Quota OpenAI insufficiente: ${error.message}`);
    } else {
      // For other errors, preserve the original message
      throw new Error(`Errore OpenAI: ${error.message}`);
    }
  }
};

/**
 * Servizio principale per gestire le richieste a OpenAI
 * @param {Object} requestData - Dati della richiesta
 * @returns {Promise<Object>} Risposta elaborata
 */
const processOpenAIRequest = async (requestData) => {
  const { model, prompt, attachments = [], chatId, userId, agent_type, agent_model } = requestData;

  if (!model || !prompt || !chatId || !userId) {
    throw new Error('Parametri mancanti: model, prompt, chatId e userId sono obbligatori');
  }

  // Verifica che il modello esista
  const isAvailable = await isModelAvailable(model);
  if (!isAvailable) {
    throw new Error(`Modello non supportato: ${model}. Utilizzare uno dei modelli disponibili.`);
  }

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

  // Stima il costo della richiesta (solo input tokens per ora)
  // Nota: in una implementazione reale, dovresti utilizzare un tokenizer per contare i token
  const estimatedInputTokens = Math.ceil(prompt.length / 4); // Stima approssimativa
  const costEstimate = await calculateCost(model, estimatedInputTokens, 0, true);

  // Verifica se l'utente ha fondi sufficienti
  const hasSufficientFunds = await checkUserFunds(userId, costEstimate.totalCost);

  if (!hasSufficientFunds) {
    throw new Error(`Fondi insufficienti. Costo stimato: ${costEstimate.totalCost.toFixed(6)} USD. Ricarica il tuo portafoglio per continuare.`);
  }

  // Salva il messaggio dell'utente
  const userMessage = await saveMessage({
    chat_id: chatId,
    role: 'user',
    content: prompt,
    tokens_used: estimatedInputTokens,
    agent_type: agent_type || 'chat',
    agent_model: agent_model
  });

  // Processa e salva gli allegati
  const { processedAttachments, enrichedPrompt } = await processAttachments(attachments);
  await saveAttachments(attachments, userMessage.id, chatId, userId);

  // Crea un messaggio dell'assistente temporaneo (incompleto)
  const assistantMessage = await saveMessage({
    chat_id: chatId,
    role: 'assistant',
    content: '[Elaborazione in corso...]',
    tokens_used: 0,
    agent_type: agent_type || 'chat',
    agent_model: agent_model,
    is_complete: false
  });

  try {
    // Prepara il prompt finale
    let finalPrompt = prompt;
    if (enrichedPrompt) {
      finalPrompt = enrichedPrompt.replace('{userPrompt}', prompt);
    }

    // Prepara la richiesta per OpenAI
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

    // Effettua la chiamata a OpenAI
    const response = await client.chat.completions.create({
      model: model,
      messages: messages,
      max_tokens: 4000
    });

    // Estrai la risposta
    const assistantResponse = response.choices[0].message.content;
    const outputTokens = response.usage.completion_tokens;
    const inputTokens = response.usage.prompt_tokens;

    // Calcola il costo effettivo
    const actualCost = await calculateCost(model, inputTokens, outputTokens);

    // Aggiorna il messaggio dell'assistente come completo
    await messageRecovery.markMessageAsComplete(assistantMessage.id, assistantResponse);

    // Aggiorna i token utilizzati
    await assistantMessage.update({ tokens_used: outputTokens });

    console.log(`[${new Date().toISOString()}] Saved assistant message ID: ${assistantMessage.id}`);

    // Salva i dettagli del costo
    const cost = await saveMessageCost(actualCost, assistantMessage.id, chatId, userId);
    console.log(`[${new Date().toISOString()}] Saved cost details for message ID: ${assistantMessage.id}`);

    // Aggiorna il saldo del portafoglio (sottrai il costo totale)
    const wallet = await updateWalletBalance(userId, -actualCost.totalCost);
    console.log(`[${new Date().toISOString()}] Updated wallet balance for user ID: ${userId}, new balance: ${wallet.balance}`);

    // Aggiorna il timestamp dell'ultima attività della chat
    chat.last_message_at = new Date();
    await chat.save();
    console.log(`[${new Date().toISOString()}] Updated chat last activity timestamp: ${chat.last_message_at}`);

    // Make sure everything is fully processed before returning
    await new Promise(resolve => setTimeout(resolve, 100));

    const result = {
      success: true,
      message: assistantResponse,
      messageId: assistantMessage.id,
      userMessageId: userMessage.id,
      cost: actualCost,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      },
      created_at: assistantMessage.created_at
    };

    console.log(`[${new Date().toISOString()}] OpenAI request processing completed for message ID: ${assistantMessage.id}`);
    return result;
  } catch (error) {
    // In caso di errore, marca il messaggio come incompleto
    await messageRecovery.markMessageAsIncomplete(assistantMessage.id, error.message);

    // Preserve the original OpenAI error for better debugging
    console.error('OpenAI Non-Streaming Error:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type,
      error: error.error
    });

    // Check for specific OpenAI error types and provide better messages
    if (error.status === 404) {
      throw new Error(`Modello OpenAI non trovato o non hai accesso: ${error.message}`);
    } else if (error.status === 401) {
      throw new Error(`Chiave API OpenAI non valida: ${error.message}`);
    } else if (error.status === 429) {
      throw new Error(`Limite di richieste OpenAI raggiunto: ${error.message}`);
    } else if (error.status === 402 || error.message.includes('billing') || error.message.includes('quota')) {
      throw new Error(`Problema di fatturazione OpenAI: ${error.message}`);
    } else if (error.message.includes('insufficient_quota')) {
      throw new Error(`Quota OpenAI insufficiente: ${error.message}`);
    } else {
      // For other errors, preserve the original message
      throw new Error(`Errore OpenAI: ${error.message}`);
    }
  }
};

/**
 * Adattatore per il metodo sendRequest che accetta i parametri nel formato usato in messages.js
 * @param {string} prompt - Il messaggio dell'utente
 * @param {string} model - Il modello OpenAI selezionato
 * @param {number} userId - ID dell'utente
 * @param {number} chatId - ID della chat
 * @param {string} agentType - Tipo di agente (chat, image, video)
 * @param {Array} attachments - Array di allegati
 * @param {function} onStream - Callback per gestire i chunk di streaming
 * @returns {Promise<Object>} Risposta elaborata
 */
const sendRequest = async (prompt, model, userId, chatId, agentType = 'chat', attachments = [], onStream = null) => {
  // Se non c'è callback di streaming, usa la modalità non-streaming
  if (!onStream) {
    const response = await processOpenAIRequest({
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
      messageId: response.messageId,
      userMessageId: response.userMessageId,
      message: response.message,
      fullText: response.message,
      cost: response.cost,
      created_at: response.created_at,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      usage: response.usage
    };
  }

  // Modalità streaming
  return await processOpenAIStreamingRequest({
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
    // Verifica se il modello esiste nel database
    const dbModel = await Model.findOne({
      where: {
        api_model_id: modelId,
        id_provider: await getOpenAiProviderId(),
        is_active: true
      }
    });

    return !!dbModel;
  } catch (error) {
    console.error('Errore durante la verifica della disponibilità del modello:', error);
    return false;
  }
};

module.exports = {
  processOpenAIRequest,
  processOpenAIStreamingRequest,
  calculateCost,
  estimateOutputTokens,
  getAvailableModels,
  isModelAvailable,
  sendRequest
}; 