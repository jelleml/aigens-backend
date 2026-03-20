# Integrazione Contesto Chat nei Servizi AI

## Panoramica

Questo documento descrive come il sistema di contesto delle chat è stato integrato nei vari servizi AI text-to-text.

## Servizi Modificati

### 1. Anthropic Service (services/anthropic.service.js)

#### Modifiche Apportate:

1. **Import della Utility**:
```javascript
const { preparePromptWithContext } = require('../utils/chat-context');
```

2. **Modifica della funzione sendRequest**:
```javascript
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
    
    // ... resto del codice esistente
  } catch (error) {
    console.error('[DEBUG] Anthropic sendRequest error:', error);
    return { fullText, inputTokens, outputTokens, error: error.message };
  }
};
```

### 2. OpenAI Service (services/openai.service.js)

#### Modifiche Apportate:

1. **Import della Utility**:
```javascript
const { preparePromptWithContext } = require('../utils/chat-context');
```

2. **Modifica della funzione sendRequest**:
```javascript
const sendRequest = async (prompt, model, userId, chatId, agentType = 'chat', attachments = [], onStream = null) => {
  try {
    // Prepara il prompt con il contesto delle chat
    const fullPrompt = await preparePromptWithContext(prompt, chatId, 'openai');
    
    // ... resto del codice esistente usando fullPrompt invece di prompt
  } catch (error) {
    // ... gestione errori
  }
};
```

### 3. DeepSeek Service (services/deepseek.service.js)

#### Modifiche Apportate:

1. **Import della Utility**:
```javascript
const { preparePromptWithContext } = require('../utils/chat-context');
```

2. **Modifica della funzione sendRequest**:
```javascript
const sendRequest = async (prompt, model, userId, chatId, agentType = 'chat', attachments = [], onStream = null) => {
  try {
    // Prepara il prompt con il contesto delle chat
    const fullPrompt = await preparePromptWithContext(prompt, chatId, 'deepseek');
    
    // ... resto del codice esistente usando fullPrompt invece di prompt
  } catch (error) {
    // ... gestione errori
  }
};
```

### 4. Together AI Service (services/together.service.js)

#### Modifiche Apportate:

1. **Import della Utility**:
```javascript
const { preparePromptWithContext } = require('../utils/chat-context');
```

2. **Modifica della funzione sendRequest**:
```javascript
const sendRequest = async (prompt, model, userId, chatId, agentType = 'chat', attachments = [], onStream = null) => {
  try {
    // Prepara il prompt con il contesto delle chat
    const fullPrompt = await preparePromptWithContext(prompt, chatId, 'together');
    
    // ... resto del codice esistente usando fullPrompt invece di prompt
  } catch (error) {
    // ... gestione errori
  }
};
```

### 5. OpenRouter Service (services/openrouter.service.js)

#### Modifiche Apportate:

1. **Import della Utility**:
```javascript
const { preparePromptWithContext } = require('../utils/chat-context');
```

2. **Modifica della funzione sendRequest**:
```javascript
const sendRequest = async (prompt, model, userId, chatId, agentType = 'chat', attachments = [], onStream = null) => {
  try {
    // Prepara il prompt con il contesto delle chat
    const fullPrompt = await preparePromptWithContext(prompt, chatId, 'openrouter');
    
    // ... resto del codice esistente usando fullPrompt invece di prompt
  } catch (error) {
    // ... gestione errori
  }
};
```

## Punto di Integrazione Principale (api/v1/messages.js)

### Modifiche Apportate:

1. **Import della Utility**:
```javascript
const { preparePromptWithContext } = require("../../utils/chat-context");
```

2. **Modifica nella STEP 4**:
```javascript
// Standard handling for other services
let finalContent = content;
if (modelInstance.provider?.name && 
    !['ideogram', 'google-veo'].includes(modelInstance.provider.name)) {
  try {
    finalContent = await preparePromptWithContext(
      content, 
      chat_id, 
      modelInstance.provider.name
    );
    console.log(`Messages API: Added chat context for provider ${modelInstance.provider.name}`);
  } catch (contextError) {
    console.error('Messages API: Error preparing chat context:', contextError);
    // In caso di errore, usa il contenuto originale
    finalContent = content;
  }
}

await aiService.sendRequest(
  finalContent, // Usa il contenuto con contesto invece di content
  model_id,
  userId,
  chat_id,
  agent_type,
  savedAttachmentIds,
  // ... resto dei parametri
);
```

## Servizi NON Modificati

I seguenti servizi NON sono stati modificati perché non sono text-to-text:

- **services/ideogram.service.js**: Modelli di generazione immagini
- **services/google-veo.service.js**: Modelli di generazione video

## Pattern di Integrazione

### 1. Import della Utility
```javascript
const { preparePromptWithContext } = require('../utils/chat-context');
```

### 2. Modifica della Funzione sendRequest
```javascript
const sendRequest = async (prompt, model, userId, chatId, agentType, attachments, onStream) => {
  try {
    // Prepara il prompt con il contesto
    const fullPrompt = await preparePromptWithContext(prompt, chatId, 'provider-name');
    
    // Usa fullPrompt invece di prompt nel resto del codice
    // ...
  } catch (error) {
    // Gestione errori
  }
};
```

### 3. Gestione Errori
- In caso di errore nel recupero del contesto, viene utilizzato il prompt originale
- Il sistema continua a funzionare anche se il contesto non è disponibile

## Vantaggi dell'Integrazione

1. **Trasparenza**: Il contesto è aggiunto automaticamente senza modifiche al frontend
2. **Robustezza**: Gestione errori per garantire funzionamento anche senza contesto
3. **Performance**: Recupero efficiente solo dei messaggi necessari
4. **Configurabilità**: Ogni provider può essere abilitato/disabilitato indipendentemente
5. **Debugging**: Logging opzionale per troubleshooting

## Test di Integrazione

### Test per Ogni Provider:
1. Verificare che il contesto sia recuperato correttamente
2. Verificare che il prompt completo sia inviato al servizio AI
3. Verificare che la risposta sia coerente con il contesto
4. Verificare la gestione degli errori

### Test di Performance:
1. Misurare il tempo di recupero del contesto
2. Verificare l'impatto sulla latenza complessiva
3. Testare con diversi numeri di messaggi

### Test di Configurazione:
1. Verificare che i provider abilitati utilizzino il contesto
2. Verificare che i provider disabilitati non utilizzino il contesto
3. Testare le diverse configurazioni di formato messaggi
