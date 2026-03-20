/**
 * Utility per il recupero del contesto delle chat
 * @module utils/chat-context
 */

const db = require('../database');
const { Message } = db.sequelize.models;
const config = require('../config/config');

/**
 * Recupera il contesto delle chat per un determinato chat_id
 * @param {number} chatId - ID della chat
 * @param {number} maxMessages - Numero massimo di messaggi da recuperare
 * @returns {Promise<string>} Contesto formattato delle chat
 */
async function retrieveChatContext(chatId, maxMessages = null) {
  try {
    // Usa la configurazione se maxMessages non è specificato
    const messageLimit = maxMessages || config.chatContextConfig.maxMessages;
    
    if (config.chatContextConfig.debug) {
      console.log(`Chat Context: Retrieving context for chat ${chatId}, max messages: ${messageLimit}`);
    }

    // Recupera i messaggi dalla chat, ordinati per data di creazione (più recenti prima)
    const messages = await Message.findAll({
      where: { chat_id: chatId },
      order: [['created_at', 'DESC']],
      limit: messageLimit,
      attributes: ['role', 'content', 'created_at']
    });

    if (messages.length === 0) {
      if (config.chatContextConfig.debug) {
        console.log(`Chat Context: No messages found for chat ${chatId}`);
      }
      return '';
    }

    // Inverti l'ordine per avere cronologico (più vecchi prima)
    const chronologicalMessages = messages.reverse();

    // Formatta i messaggi per il contesto
    const contextMessages = chronologicalMessages.map(msg => {
      const role = msg.role === 'user' 
        ? config.chatContextConfig.messageFormat.user 
        : config.chatContextConfig.messageFormat.assistant;
      
      return `${role}: ${msg.content}`;
    });

    const contextString = contextMessages.join(config.chatContextConfig.messageSeparator);

    if (config.chatContextConfig.debug) {
      console.log(`Chat Context: Retrieved ${contextMessages.length} messages for chat ${chatId}`);
      console.log(`Chat Context: Context length: ${contextString.length} characters`);
    }

    return contextString;

  } catch (error) {
    console.error('Chat Context: Error retrieving chat context:', error);
    return '';
  }
}

/**
 * Prepara il prompt completo con il contesto delle chat
 * @param {string} originalPrompt - Prompt originale dell'utente
 * @param {number} chatId - ID della chat
 * @param {string} providerName - Nome del provider AI
 * @param {number} maxMessages - Numero massimo di messaggi da recuperare
 * @returns {Promise<string>} Prompt completo con contesto
 */
async function preparePromptWithContext(originalPrompt, chatId, providerName, maxMessages = null) {
  try {
    // Verifica se il contesto è abilitato per questo provider
    if (!config.chatContextConfig.enabled || 
        !config.chatContextConfig.enabledProviders.includes(providerName)) {
      if (config.chatContextConfig.debug) {
        console.log(`Chat Context: Context disabled for provider ${providerName}`);
      }
      return originalPrompt;
    }

    // Recupera il contesto delle chat
    const chatContext = await retrieveChatContext(chatId, maxMessages);
    
    if (!chatContext) {
      if (config.chatContextConfig.debug) {
        console.log(`Chat Context: No context available for chat ${chatId}`);
      }
      return originalPrompt;
    }

    // Costruisci il prompt completo
    const fullPrompt = config.chatContextConfig.contextPrefix + 
                      config.chatContextConfig.messageSeparator + 
                      chatContext + 
                      config.chatContextConfig.messageSeparator + 
                      config.chatContextConfig.messageSeparator + 
                      originalPrompt;

    if (config.chatContextConfig.debug) {
      console.log(`Chat Context: Prepared prompt with context for chat ${chatId}`);
      console.log(`Chat Context: Original prompt length: ${originalPrompt.length}`);
      console.log(`Chat Context: Full prompt length: ${fullPrompt.length}`);
    }

    return fullPrompt;

  } catch (error) {
    console.error('Chat Context: Error preparing prompt with context:', error);
    // In caso di errore, ritorna il prompt originale
    return originalPrompt;
  }
}

/**
 * Verifica se il contesto è abilitato per un determinato provider
 * @param {string} providerName - Nome del provider
 * @returns {boolean} True se abilitato, false altrimenti
 */
function isContextEnabledForProvider(providerName) {
  return config.chatContextConfig.enabled && 
         config.chatContextConfig.enabledProviders.includes(providerName);
}

module.exports = {
  retrieveChatContext,
  preparePromptWithContext,
  isContextEnabledForProvider
};
