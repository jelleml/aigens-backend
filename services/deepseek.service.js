const axios = require("axios");
const { sequelize } = require('../database');
const config = require('../config/config');
const modelService = require('./model.service');
const fileContentExtractor = require('./file-content-extractor.service');
const messageRecovery = require('./message-recovery.service');
const { OpenAI } = require("openai");
const db = require("../database");

// Importazione dei modelli
const { User, Chat, Message, Attachment, Wallet, Transaction, MessageCost, Model } = db.sequelize.models;

// Configurazione dell'API Deepseek
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODELS_API_URL = "https://api.deepseek.com/v1/models";

// Cache dei modelli disponibili
let AVAILABLE_MODELS = [];
let lastModelsFetch = null;
const CACHE_DURATION = 3600000; // 1 ora in millisecondi

let DEEPSEEK_PROVIDER_ID = null;
// Funzione per recuperare l'id_provider di DeepSeek
async function getDeepSeekProviderId() {
  if (DEEPSEEK_PROVIDER_ID) return DEEPSEEK_PROVIDER_ID;
  const Provider = db.models.Provider;
  const provider = await Provider.findOne({ where: { name: 'deepseek' } });
  if (!provider) throw new Error('Provider Deepseek non trovato');
  DEEPSEEK_PROVIDER_ID = provider.id;
  return DEEPSEEK_PROVIDER_ID;
}



/**
 * Recupera i modelli disponibili dall'API di Deepseek
 * @returns {Promise<Array>} Array di modelli disponibili
 */
const fetchAvailableModels = async () => {
  try {
    // Chiamata all'API di Deepseek per ottenere i modelli disponibili
    const response = await axios.get(DEEPSEEK_MODELS_API_URL, {
      headers: {
        'Authorization': `Bearer ${config.deepseek.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    // Recupera tutti i modelli Deepseek dal database
    const dbModels = await Model.findAll({
      where: {
        id_provider: await getDeepSeekProviderId(),
        is_active: true
      }
    });

    if (!dbModels || dbModels.length === 0) {
      console.warn("Nessun modello Deepseek trovato nel database");
      return [];
    }

    // Mappa i modelli dal database al formato richiesto
    const availableModels = [];

    if (response.data && response.data.data) {
      for (const apiModel of response.data.data) {
        const modelId = apiModel.id;

        // Verifica se abbiamo il modello nel database
        const dbModel = dbModels.find(m => m.api_model_id === modelId);

        if (dbModel) {
          availableModels.push({
            id: modelId,
            name: dbModel.name,
            description: dbModel.description,
            maxTokens: apiModel.context_length || dbModel.max_tokens || 16000,
            inputPricePerMillion: dbModel.input_price_per_million,
            outputPricePerMillion: dbModel.output_price_per_million,
            capabilities: dbModel.capabilities || []
          });
        }
      }
    }

    return availableModels;
  } catch (error) {
    console.error('Errore nel recupero dei modelli disponibili da Deepseek:', error);

    // In caso di errore, restituiamo i modelli dal database
    try {
      const dbModels = await Model.findAll({
        where: {
          id_provider: await getDeepSeekProviderId(),
          is_active: true
        }
      });

      return dbModels.map(model => ({
        id: model.model_slug,
        name: model.name,
        description: model.description,
        maxTokens: model.max_tokens || 16000,
        inputPricePerMillion: model.input_price_per_million,
        outputPricePerMillion: model.output_price_per_million,
        capabilities: model.capabilities || []
      }));
    } catch (dbError) {
      console.error('Errore nel recupero dei modelli dal database:', dbError);
      return [];
    }
  }
};

/**
 * Stima il numero di token di output basato sul prompt e sul modello
 * @param {string} prompt - Il prompt dell'utente
 * @param {string} model - Il modello Deepseek selezionato
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
 * @param {string} modelId - ID del modello Deepseek selezionato
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

  return wallet.balance >= estimatedCost;
};

/**
 * Processa gli allegati e li prepara per l'invio a Deepseek
 * @param {Array} attachments - Array di oggetti allegato
 * @returns {Promise<Array>} Array di oggetti allegato formattati per Deepseek
 * 
 * Utilizza il servizio di estrazione del contenuto per gestire diversi tipi di file.
 * Per i file non supportati come immagini, il contenuto viene estratto e aggiunto al prompt.
 */
const processAttachments = async (attachments = []) => {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  const processedAttachments = [];
  const textAttachments = [];

  for (const attachment of attachments) {
    // Recupera l'allegato dal database se è un ID
    let attachmentData = attachment;
    if (typeof attachment === 'number') {
      attachmentData = await Attachment.findByPk(attachment);
      if (!attachmentData) {
        throw new Error(`Allegato con ID ${attachment} non trovato`);
      }
    }

    // Se è un'immagine, la processiamo come immagine
    if (attachmentData.mime_type.startsWith('image/')) {
      processedAttachments.push({
        type: 'image_url',
        image_url: {
          url: `data:${attachmentData.mime_type};base64,${await readFileAsBase64(attachmentData.file_path)}`
        }
      });
    } else {
      // Per tutti gli altri tipi di file, estraiamo il contenuto
      // e lo aggiungeremo al prompt come testo
      try {
        const extractedContent = await fileContentExtractor.extractContent(attachmentData, {
          maxLength: 10000, // Limite ragionevole per Deepseek
          format: 'text'
        });

        textAttachments.push({
          fileName: attachmentData.original_name,
          content: extractedContent.content
        });
      } catch (error) {
        console.warn(`Errore nell'estrazione del contenuto da ${attachmentData.original_name}: ${error.message}`);
        // Aggiungi un messaggio di errore nel testo
        textAttachments.push({
          fileName: attachmentData.original_name,
          content: `[ERRORE: Impossibile estrarre contenuto da ${attachmentData.original_name} - ${error.message}]`
        });
      }
    }
  }

  // Se abbiamo allegati di testo, li aggiungiamo come messaggio separato
  if (textAttachments.length > 0) {
    const textContent = textAttachments
      .map(att => `=== ${att.fileName} ===\n${att.content}`)
      .join('\n\n');

    processedAttachments.push({
      type: 'text',
      text: textContent
    });
  }

  return processedAttachments;
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
    description: 'Utilizzo servizio Deepseek AI'
  });

  return wallet;
};

/**
 * Servizio principale per gestire le richieste streaming a Deepseek
 * @param {Object} requestData - Dati della richiesta
 * @returns {Promise<Object>} Risposta elaborata
 */
const processDeepseekStreamingRequest = async (requestData) => {
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
  const processedAttachments = await processAttachments(attachments);

  try {
    // Prepara la richiesta per Deepseek con streaming
    const messages = [
      {
        role: 'user',
        content: processedAttachments.length > 0
          ? [
            { type: 'text', text: prompt },
            ...processedAttachments
          ]
          : prompt
      }
    ];

    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    // Effettua la chiamata streaming a Deepseek
    const response = await axios.post(DEEPSEEK_API_URL, {
      model: model,
      messages: messages,
      max_tokens: 4000,
      stream: true
    }, {
      headers: {
        'Authorization': `Bearer ${config.deepseek.apiKey}`,
        'Content-Type': 'application/json'
      },
      responseType: 'stream'
    });

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
              console.error('Errore parsing JSON chunk:', e);
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
        reject(new Error(`Errore durante lo streaming da Deepseek: ${error.message}`));
      });
    });

  } catch (error) {
    throw new Error(`Errore durante la richiesta streaming a Deepseek: ${error.message}`);
  }
};

/**
 * Servizio principale per gestire le richieste a Deepseek
 * @param {Object} requestData - Dati della richiesta
 * @returns {Promise<Object>} Risposta elaborata
 */
const processDeepseekRequest = async (requestData) => {
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
  const processedAttachments = await processAttachments(attachments);
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
    // Prepara la richiesta per Deepseek
    const messages = [
      {
        role: 'user',
        content: processedAttachments.length > 0
          ? [
            { type: 'text', text: prompt },
            ...processedAttachments
          ]
          : prompt
      }
    ];

    // Effettua la chiamata a Deepseek
    const response = await axios.post(DEEPSEEK_API_URL, {
      model: model,
      messages: messages,
      max_tokens: 4000
    }, {
      headers: {
        'Authorization': `Bearer ${config.deepseek.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    // Estrai la risposta
    const assistantResponse = response.data.choices[0].message.content;
    const outputTokens = response.data.usage.completion_tokens;
    const inputTokens = response.data.usage.prompt_tokens;

    // Calcola il costo effettivo
    const actualCost = await calculateCost(model, inputTokens, outputTokens);

    // Aggiorna il messaggio dell'assistente come completo
    await messageRecovery.markMessageAsComplete(assistantMessage.id, assistantResponse);

    // Aggiorna i token utilizzati
    await assistantMessage.update({ tokens_used: outputTokens });

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
        total_tokens: inputTokens + outputTokens
      },
      created_at: assistantMessage.created_at
    };

  } catch (error) {
    // In caso di errore, marca il messaggio come incompleto
    await messageRecovery.markMessageAsIncomplete(assistantMessage.id, error.message);

    // Salva comunque il costo stimato
    await saveMessageCost(costEstimate, userMessage.id, chatId, userId);

    throw new Error(`Errore durante la richiesta a Deepseek: ${error.message}`);
  }
};

/**
 * Adattatore per il metodo sendRequest che accetta i parametri nel formato usato in messages.js
 * @param {string} prompt - Il messaggio dell'utente
 * @param {string} model - Il modello Deepseek selezionato
 * @param {number} userId - ID dell'utente
 * @param {number} chatId - ID della chat
 * @param {string} agentType - Tipo di agente (chat, image, video)
 * @param {Array} attachments - Array di allegati
 * @param {Function} onStream - Callback per gestire lo streaming (opzionale)
 * @returns {Promise<Object>} Risposta elaborata
 */
const sendRequest = async (prompt, model, userId, chatId, agentType = 'chat', attachments = [], onStream = null) => {
  // Se non c'è callback di streaming, usa la modalità non-streaming
  if (!onStream) {
    const response = await processDeepseekRequest({
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
  return await processDeepseekStreamingRequest({
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
        id_provider: await getDeepSeekProviderId(),
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
  processDeepseekRequest,
  processDeepseekStreamingRequest,
  calculateCost,
  estimateOutputTokens,
  getAvailableModels,
  isModelAvailable,
  sendRequest
};
