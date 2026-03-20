/**
 * Test per debug del prefisso duplicato
 */

// Simula le variabili d'ambiente
process.env.CHAT_CONTEXT_DEBUG = 'true';
process.env.CHAT_CONTEXT_MAX_MESSAGES = '3';
process.env.CHAT_CONTEXT_ENABLED = 'true';

function prefixDebugTest() {
  console.log('🔍 Debug del prefisso duplicato...');
  
  try {
    // 1. Test configurazione
    const config = require('../../config/config');
    console.log('✅ Configurazione caricata');
    
    console.log('\n📝 Configurazione prefisso:');
    console.log(`- contextPrefix: "${config.chatContextConfig.contextPrefix}"`);
    console.log(`- contextPrefix length: ${config.chatContextConfig.contextPrefix.length}`);
    
    // 2. Test costruzione prompt
    const originalContent = 'come mi chiamo io?';
    const mockContext = `USER: ciao sono Fabio, piacere. Tu come ti chiami?
ASSISTANT: Ciao Fabio! Sono Claude, un assistente di intelligenza artificiale creato da Anthropic. Sono qui per aiutarti e conversare.`;

    console.log('\n📝 Contesto simulato:');
    console.log(`- mockContext: "${mockContext}"`);
    console.log(`- mockContext length: ${mockContext.length}`);
    
    // 3. Costruisci il prompt come nel codice reale
    const fullPrompt = config.chatContextConfig.contextPrefix + 
                      config.chatContextConfig.messageSeparator +
                      mockContext +
                      config.chatContextConfig.messageSeparator +
                      config.chatContextConfig.messageSeparator +
                      originalContent;
    
    console.log('\n📝 Prompt costruito:');
    console.log(`- fullPrompt length: ${fullPrompt.length}`);
    
    // 4. Analizza il prompt per trovare duplicazioni
    const prefixRegex = new RegExp(config.chatContextConfig.contextPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = fullPrompt.match(prefixRegex);
    
    console.log('\n🔍 Analisi duplicazioni:');
    console.log(`- Numero di occorrenze del prefisso: ${matches ? matches.length : 0}`);
    console.log(`- Prefisso duplicato: ${matches && matches.length > 1 ? 'SÌ' : 'NO'}`);
    
    if (matches && matches.length > 1) {
      console.log('\n📝 Posizioni del prefisso:');
      let lastIndex = 0;
      matches.forEach((match, index) => {
        const position = fullPrompt.indexOf(match, lastIndex);
        console.log(`- Occorrenza ${index + 1}: posizione ${position}`);
        lastIndex = position + 1;
      });
    }
    
    // 5. Mostra il prompt completo
    console.log('\n📝 Prompt completo:');
    console.log('--- INIZIO PROMPT ---');
    console.log(fullPrompt);
    console.log('--- FINE PROMPT ---');
    
    // 6. Verifica se il mockContext include già il prefisso
    const contextHasPrefix = mockContext.includes(config.chatContextConfig.contextPrefix);
    console.log('\n🔍 Verifica mockContext:');
    console.log(`- mockContext include già il prefisso: ${contextHasPrefix}`);
    
    if (contextHasPrefix) {
      console.log('❌ PROBLEMA: mockContext include già il prefisso!');
      console.log('💡 Questo causa la duplicazione nel prompt finale');
    } else {
      console.log('✅ mockContext non include il prefisso');
    }
    
  } catch (error) {
    console.error('❌ Errore nel debug del prefisso:', error);
  }
}

prefixDebugTest();
