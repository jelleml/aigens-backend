/**
 * Test funzionale per il sistema di contesto delle chat
 * Questo test invia richieste reali ai modelli AI e verifica il funzionamento
 */

const express = require('express');
const request = require('supertest');
const db = require('../../database');
const { User, Chat, Message, Model, Provider } = db.sequelize.models;

// Configurazione per il test
const TEST_CONFIG = {
  // Abilita debug per vedere i log del contesto
  CHAT_CONTEXT_DEBUG: 'true',
  CHAT_CONTEXT_MAX_MESSAGES: '3',
  CHAT_CONTEXT_ENABLED: 'true',
  CHAT_CONTEXT_ENABLED_PROVIDERS: 'anthropic,openai,deepseek,together,openrouter'
};

// Funzione per creare dati di test
async function createTestData() {
  console.log('🧪 Creando dati di test...');
  
  try {
    // Crea un utente di test
    const testUser = await User.create({
      email: 'test-chat-context@example.com',
      name: 'Test User',
      is_active: true
    });
    
    // Crea una chat di test
    const testChat = await Chat.create({
      user_id: testUser.id,
      title: 'Test Chat Context',
      is_active: true
    });
    
    // Crea messaggi di test per il contesto
    const testMessages = [
      {
        chat_id: testChat.id,
        role: 'user',
        content: 'Ciao, come stai?',
        agent_type: 'chat'
      },
      {
        chat_id: testChat.id,
        role: 'assistant',
        content: 'Ciao! Sto bene, grazie per aver chiesto. Come posso aiutarti oggi?',
        agent_type: 'chat'
      },
      {
        chat_id: testChat.id,
        role: 'user',
        content: 'Mi puoi spiegare la programmazione?',
        agent_type: 'chat'
      },
      {
        chat_id: testChat.id,
        role: 'assistant',
        content: 'Certo! La programmazione è l\'arte di scrivere istruzioni per i computer. Vuoi sapere qualcosa di specifico?',
        agent_type: 'chat'
      }
    ];
    
    for (const msg of testMessages) {
      await Message.create(msg);
    }
    
    console.log('✅ Dati di test creati:', {
      userId: testUser.id,
      chatId: testChat.id,
      messagesCount: testMessages.length
    });
    
    return { testUser, testChat };
    
  } catch (error) {
    console.error('❌ Errore nella creazione dei dati di test:', error);
    throw error;
  }
}

// Funzione per pulire i dati di test
async function cleanupTestData(testUser, testChat) {
  console.log('🧹 Pulendo dati di test...');
  
  try {
    // Elimina i messaggi
    await Message.destroy({ where: { chat_id: testChat.id } });
    
    // Elimina la chat
    await Chat.destroy({ where: { id: testChat.id } });
    
    // Elimina l'utente
    await User.destroy({ where: { id: testUser.id } });
    
    console.log('✅ Dati di test puliti');
    
  } catch (error) {
    console.error('❌ Errore nella pulizia dei dati di test:', error);
  }
}

// Funzione per testare il contesto delle chat
async function testChatContext() {
  console.log('🚀 Iniziando test funzionale del contesto delle chat...');
  
  let testUser, testChat;
  
  try {
    // 1. Crea dati di test
    const testData = await createTestData();
    testUser = testData.testUser;
    testChat = testData.testChat;
    
    // 2. Abilita debug per il contesto
    process.env.CHAT_CONTEXT_DEBUG = 'true';
    process.env.CHAT_CONTEXT_MAX_MESSAGES = '3';
    process.env.CHAT_CONTEXT_ENABLED = 'true';
    
    // 3. Testa la utility di contesto
    console.log('\n📋 Test 1: Verifica utility di contesto');
    const { preparePromptWithContext, retrieveChatContext } = require('../../utils/chat-context');
    
    // Test recupero contesto
    const context = await retrieveChatContext(testChat.id, 3);
    console.log('📝 Contesto recuperato:', context.substring(0, 200) + '...');
    
    // Test preparazione prompt
    const originalPrompt = 'Continua la spiegazione sulla programmazione';
    const fullPrompt = await preparePromptWithContext(originalPrompt, testChat.id, 'anthropic');
    console.log('📝 Prompt completo:', fullPrompt.substring(0, 300) + '...');
    
    // 4. Test con richiesta API reale
    console.log('\n🌐 Test 2: Richiesta API reale');
    
    // Avvia il server per il test
    const app = require('../../server');
    const server = app.listen(0); // Porta casuale
    
    // Aspetta che il server sia pronto
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Crea un token JWT per l'utente di test
    const jwt = require('jsonwebtoken');
    const config = require('../../config/config');
    const token = jwt.sign({ id: testUser.id, email: testUser.email }, config.jwt.secret);
    
    // Trova un modello Anthropic disponibile
    const anthropicProvider = await Provider.findOne({ where: { name: 'anthropic' } });
    const anthropicModel = await Model.findOne({ 
      where: { 
        id_provider: anthropicProvider.id,
        is_active: true 
      }
    });
    
    if (!anthropicModel) {
      console.log('⚠️ Nessun modello Anthropic trovato, saltando test API');
    } else {
      console.log('🎯 Modello trovato:', anthropicModel.model_slug);
      
      // Invia richiesta API
      const response = await request(app)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({
          chat_id: testChat.id,
          content: 'Continua la spiegazione sulla programmazione',
          id_model: anthropicModel.id,
          agent_type: 'chat'
        })
        .expect(200);
      
      console.log('✅ Richiesta API completata');
      console.log('📊 Risposta ricevuta');
    }
    
    // Chiudi il server
    server.close();
    
    console.log('\n🎉 Test funzionale completato con successo!');
    
  } catch (error) {
    console.error('❌ Errore durante il test:', error);
    throw error;
  } finally {
    // Pulisci i dati di test
    if (testUser && testChat) {
      await cleanupTestData(testUser, testChat);
    }
  }
}

// Esegui il test se chiamato direttamente
if (require.main === module) {
  testChatContext()
    .then(() => {
      console.log('✅ Tutti i test completati con successo!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test falliti:', error);
      process.exit(1);
    });
}

module.exports = { testChatContext, createTestData, cleanupTestData };
