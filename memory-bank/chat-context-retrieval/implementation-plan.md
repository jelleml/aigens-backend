# Implementazione Sistema Recupero Contesto Chat

## Panoramica

Questo documento descrive l'implementazione del sistema di recupero del contesto delle chat per migliorare la qualità delle conversazioni con i modelli AI text-to-text.

## Configurazione

### Variabili d'Ambiente

Le seguenti variabili d'ambiente possono essere configurate per personalizzare il comportamento:

- `CHAT_CONTEXT_MAX_MESSAGES`: Numero di messaggi da recuperare (default: 5)
- `CHAT_CONTEXT_MAX_TOKENS`: Numero massimo di token (default: 2000)
- `CHAT_CONTEXT_PREFIX`: Prefisso per il contesto (default: "chat context and history with the user (only last X messages or token are retrieved, if the user ask you you can say that): ")
- `CHAT_CONTEXT_USER_FORMAT`: Formato per messaggi utente (default: "USER")
- `CHAT_CONTEXT_ASSISTANT_FORMAT`: Formato per messaggi assistant (default: "ASSISTANT")
- `CHAT_CONTEXT_ENABLED`: Abilita/disabilita il contesto (default: true)
- `CHAT_CONTEXT_ENABLED_PROVIDERS`: Provider abilitati (default: "anthropic,openai,deepseek,together,openrouter")
- `CHAT_CONTEXT_MESSAGE_SEPARATOR`: Separatore tra messaggi (default: "\n")
- `CHAT_CONTEXT_DEBUG`: Abilita logging debug (default: false)

## Architettura

### 1. Configurazione (config/config.js)

La configurazione è centralizzata in `config/config.js`:

```javascript
config.chatContextConfig = {
  maxMessages: parseInt(process.env.CHAT_CONTEXT_MAX_MESSAGES) || 5,
  maxTokens: parseInt(process.env.CHAT_CONTEXT_MAX_TOKENS) || 2000,
  contextPrefix: process.env.CHAT_CONTEXT_PREFIX || "chat context and history with the user (only last X messages or token are retrieved, if the user ask you you can say that): ",
  messageFormat: {
    user: process.env.CHAT_CONTEXT_USER_FORMAT || "USER",
    assistant: process.env.CHAT_CONTEXT_ASSISTANT_FORMAT || "ASSISTANT"
  },
  enabled: process.env.CHAT_CONTEXT_ENABLED !== 'false',
  enabledProviders: (process.env.CHAT_CONTEXT_ENABLED_PROVIDERS || 'anthropic,openai,deepseek,together,openrouter').split(','),
  messageSeparator: process.env.CHAT_CONTEXT_MESSAGE_SEPARATOR || '\n',
  debug: process.env.CHAT_CONTEXT_DEBUG === 'true'
};
```

### 2. Utility (utils/chat-context.js)

Le funzioni utility per il recupero del contesto:

- `retrieveChatContext(chatId, maxMessages)`: Recupera i messaggi dalla chat
- `preparePromptWithContext(originalPrompt, chatId, providerName, maxMessages)`: Prepara il prompt completo
- `isContextEnabledForProvider(providerName)`: Verifica se il contesto è abilitato

### 3. Integrazione Servizi AI

Ogni servizio AI text-to-text è stato modificato per includere il contesto:

- `services/anthropic.service.js`
- `services/openai.service.js`
- `services/deepseek.service.js`
- `services/together.service.js`
- `services/openrouter.service.js`

### 4. Punto di Integrazione Principale (api/v1/messages.js)

Il punto chiave è nella STEP 4 dove viene chiamato `aiService.sendRequest()`. Il sistema:

1. Verifica se il provider è abilitato per il contesto
2. Recupera gli ultimi N messaggi dalla chat
3. Formatta il contesto con il prefisso informativo
4. Combina il contesto con il prompt originale
5. Invia il prompt completo al servizio AI

## Vantaggi

1. **Configurabile**: Tutti i parametri sono configurabili
2. **Selettivo**: Solo per modelli text-to-text, non per image/video
3. **Efficiente**: Recupera solo gli ultimi N messaggi
4. **Sicuro**: Include prefisso informativo per l'utente
5. **Formattato**: Usa formato USER/ASSISTANT richiesto
6. **Retrocompatibile**: Non rompe funzionamento esistente

## Esempio di Output

Il contesto generato avrà questo formato:

```
chat context and history with the user (only last X messages or token are retrieved, if the user ask you you can say that): 
USER: Ciao, come stai?
ASSISTANT: Ciao! Sto bene, grazie per aver chiesto. Come posso aiutarti oggi?
USER: Mi puoi spiegare la programmazione?

USER: Mi puoi spiegare la programmazione?
```

## Test e Validazione

- Test con chat esistenti per verificare recupero contesto
- Test con diversi numeri di messaggi
- Test con modelli diversi per verificare selettività
- Test di performance per assicurarsi che non impatti le prestazioni

## Note di Implementazione

- Il sistema è abilitato solo per i provider text-to-text
- I modelli image/video (ideogram, google-veo) non utilizzano il contesto
- In caso di errore nel recupero del contesto, viene utilizzato il prompt originale
- Il logging debug può essere abilitato per troubleshooting
