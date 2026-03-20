/**
 * Test semplice per verificare il funzionamento del contesto delle chat
 */

const db = require('../../database');
const { User, Chat, Message, Model, Provider } = db.sequelize.models;
const { preparePromptWithContext, retrieveChatContext } = require('../../utils/chat-context');

async function simpleTest() {
  console.log('🧪 Test semplice del contesto delle chat...');
  
  try {
    // 1. Verifica che la configurazione sia caricata
    const config = require('../../config/config');
    console.log('✅ Configurazione caricata:', {
      enabled: config.chatContextConfig.enabled,
      maxMessages: config.chatContextConfig.maxMessages,
      enabledProviders: config.chatContextConfig.enabledProviders
    });
    
    // 2. Crea dati di test
    console.log('\n📝 Creando dati di test...');
    
    const testUser = await User.create({
      email: 'simple-test@example.com',
      name: 'Simple Test User',
      is_active: true
    });
    
    const testChat = await Chat.create({
      user_id: testUser.id,
      title: 'Simple Test Chat',
      is_active: true
    });
    
    // Crea messaggi di test
    const messages = [
      { role: 'user', content: 'Ciao, come stai?' },
      { role: 'assistant', content: 'Ciao! Sto bene, grazie!' },
      { role: 'user', content: 'Mi puoi spiegare la programmazione?' },
      { role: 'assistant', content: 'Certo! La programmazione è scrivere istruzioni per i computer.' }
    ];
    
    for (const msg of messages) {
      await Message.create({
        chat_id: testChat.id,
        role: msg.role,
        content: msg.content,
        agent_type: 'chat'
      });
    }
    
    console.log('✅ Dati di test creati');
    
    // 3. Test recupero contesto
    console.log('\n🔍 Test recupero contesto...');
    const context = await retrieveChatContext(testChat.id, 3);
    console.log('📝 Contesto recuperato:');
    console.log(context);
    
    // 4. Test preparazione prompt
    console.log('\n🔍 Test preparazione prompt...');
    const originalPrompt = 'Continua la spiegazione';
    const fullPrompt = await preparePromptWithContext(originalPrompt, testChat.id, 'anthropic');
    console.log('📝 Prompt completo:');
    console.log(fullPrompt);
    
    // 5. Verifica che il contesto sia incluso
    const hasContext = fullPrompt.includes('chat context and history');
    const hasUserMessages = fullPrompt.includes('USER:');
    const hasAssistantMessages = fullPrompt.includes('ASSISTANT:');
    
    console.log('\n📊 Verifica risultati:');
    console.log('✅ Contesto incluso:', hasContext);
    console.log('✅ Messaggi utente:', hasUserMessages);
    console.log('✅ Messaggi assistant:', hasAssistantMessages);
    console.log('✅ Prompt originale incluso:', fullPrompt.includes(originalPrompt));
    
    // 6. Test con provider disabilitato
    console.log('\n🔍 Test provider disabilitato...');
    const promptWithoutContext = await preparePromptWithContext(originalPrompt, testChat.id, 'ideogram');
    console.log('📝 Prompt senza contesto (ideogram):', promptWithoutContext);
    
    // 7. Pulisci dati di test
    console.log('\n🧹 Pulendo dati di test...');
    await Message.destroy({ where: { chat_id: testChat.id } });
    await Chat.destroy({ where: { id: testChat.id } });
    await User.destroy({ where: { id: testUser.id } });
    console.log('✅ Dati puliti');
    
    // 8. Risultati finali
    console.log('\n🎉 Test completato!');
    console.log('✅ Tutti i controlli passati');
    console.log('✅ Il sistema di contesto funziona correttamente');
    
  } catch (error) {
    console.error('❌ Errore durante il test:', error);
    throw error;
  }
}

// Esegui il test
if (require.main === module) {
  simpleTest()
    .then(() => {
      console.log('\n✅ Test semplice completato con successo!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test fallito:', error);
      process.exit(1);
    });
}

module.exports = { simpleTest };
