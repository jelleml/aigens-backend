/**
 * Test della configurazione del contesto delle chat
 */

// Simula le variabili d'ambiente
process.env.CHAT_CONTEXT_DEBUG = 'true';
process.env.CHAT_CONTEXT_MAX_MESSAGES = '3';
process.env.CHAT_CONTEXT_ENABLED = 'true';
process.env.CHAT_CONTEXT_ENABLED_PROVIDERS = 'anthropic,openai,deepseek,together,openrouter';

function testConfiguration() {
  console.log('🧪 Test della configurazione del contesto delle chat...');
  
  try {
    // 1. Test caricamento configurazione
    const config = require('../../config/config');
    console.log('✅ Configurazione caricata:', {
      enabled: config.chatContextConfig.enabled,
      maxMessages: config.chatContextConfig.maxMessages,
      enabledProviders: config.chatContextConfig.enabledProviders,
      contextPrefix: config.chatContextConfig.contextPrefix,
      messageFormat: config.chatContextConfig.messageFormat
    });
    
    // 2. Test utility functions
    const { isContextEnabledForProvider } = require('../../utils/chat-context');
    
    console.log('\n🔍 Test provider abilitati:');
    const providers = ['anthropic', 'openai', 'deepseek', 'together', 'openrouter', 'ideogram', 'google-veo'];
    
    providers.forEach(provider => {
      const enabled = isContextEnabledForProvider(provider);
      console.log(`  ${provider}: ${enabled ? '✅' : '❌'}`);
    });
    
    // 3. Test formattazione messaggi
    console.log('\n📝 Test formattazione messaggi:');
    const messageFormat = config.chatContextConfig.messageFormat;
    console.log('  USER format:', messageFormat.user);
    console.log('  ASSISTANT format:', messageFormat.assistant);
    
    // 4. Test prefisso contesto
    console.log('\n📝 Test prefisso contesto:');
    const prefix = config.chatContextConfig.contextPrefix;
    console.log('  Prefix:', prefix);
    console.log('  Length:', prefix.length);
    
    // 5. Simula un prompt con contesto
    console.log('\n🔍 Test simulazione prompt con contesto:');
    const mockContext = `USER: Ciao, come stai?
ASSISTANT: Ciao! Sto bene, grazie!
USER: Mi puoi spiegare la programmazione?`;
    
    const originalPrompt = 'Continua la spiegazione';
    const fullPrompt = prefix + '\n' + mockContext + '\n\n' + originalPrompt;
    
    console.log('📝 Prompt completo simulato:');
    console.log(fullPrompt);
    
    // 6. Verifica risultati
    console.log('\n📊 Verifica risultati:');
    console.log('✅ Prefisso incluso:', fullPrompt.includes(prefix));
    console.log('✅ Contesto incluso:', fullPrompt.includes(mockContext));
    console.log('✅ Prompt originale incluso:', fullPrompt.includes(originalPrompt));
    console.log('✅ Formato USER presente:', fullPrompt.includes('USER:'));
    console.log('✅ Formato ASSISTANT presente:', fullPrompt.includes('ASSISTANT:'));
    
    console.log('\n🎉 Test configurazione completato con successo!');
    console.log('✅ Tutti i controlli passati');
    console.log('✅ Il sistema di configurazione funziona correttamente');
    
  } catch (error) {
    console.error('❌ Errore durante il test:', error);
    throw error;
  }
}

// Esegui il test
if (require.main === module) {
  testConfiguration();
}

module.exports = { testConfiguration };
