# Configurazione Sistema Contesto Chat

## Variabili d'Ambiente

### CHAT_CONTEXT_MAX_MESSAGES
- **Default**: 5
- **Descrizione**: Numero di messaggi da recuperare per il contesto
- **Esempio**: `CHAT_CONTEXT_MAX_MESSAGES=10`

### CHAT_CONTEXT_MAX_TOKENS
- **Default**: 2000
- **Descrizione**: Numero massimo di token per il contesto (alternativa ai messaggi)
- **Esempio**: `CHAT_CONTEXT_MAX_TOKENS=3000`

### CHAT_CONTEXT_PREFIX
- **Default**: "chat context and history with the user (only last X messages or token are retrieved, if the user ask you you can say that): "
- **Descrizione**: Prefisso informativo per il contesto delle chat
- **Esempio**: `CHAT_CONTEXT_PREFIX="Storico conversazione: "`

### CHAT_CONTEXT_USER_FORMAT
- **Default**: "USER"
- **Descrizione**: Formato per i messaggi dell'utente nel contesto
- **Esempio**: `CHAT_CONTEXT_USER_FORMAT="UTENTE"`

### CHAT_CONTEXT_ASSISTANT_FORMAT
- **Default**: "ASSISTANT"
- **Descrizione**: Formato per i messaggi dell'assistente nel contesto
- **Esempio**: `CHAT_CONTEXT_ASSISTANT_FORMAT="AI"`

### CHAT_CONTEXT_ENABLED
- **Default**: true
- **Descrizione**: Abilita/disabilita il recupero del contesto
- **Valori**: true/false
- **Esempio**: `CHAT_CONTEXT_ENABLED=false`

### CHAT_CONTEXT_ENABLED_PROVIDERS
- **Default**: "anthropic,openai,deepseek,together,openrouter"
- **Descrizione**: Lista dei provider per cui abilitare il contesto
- **Esempio**: `CHAT_CONTEXT_ENABLED_PROVIDERS="anthropic,openai"`

### CHAT_CONTEXT_MESSAGE_SEPARATOR
- **Default**: "\n"
- **Descrizione**: Separatore tra i messaggi nel contesto
- **Esempio**: `CHAT_CONTEXT_MESSAGE_SEPARATOR="\n\n"`

### CHAT_CONTEXT_DEBUG
- **Default**: false
- **Descrizione**: Abilita logging debug per troubleshooting
- **Valori**: true/false
- **Esempio**: `CHAT_CONTEXT_DEBUG=true`

## Esempio di Configurazione Completa

```bash
# Configurazione avanzata per contesto chat
CHAT_CONTEXT_MAX_MESSAGES=10
CHAT_CONTEXT_MAX_TOKENS=3000
CHAT_CONTEXT_PREFIX="Storico conversazione (ultimi X messaggi): "
CHAT_CONTEXT_USER_FORMAT="UTENTE"
CHAT_CONTEXT_ASSISTANT_FORMAT="AI"
CHAT_CONTEXT_ENABLED=true
CHAT_CONTEXT_ENABLED_PROVIDERS=anthropic,openai,deepseek
CHAT_CONTEXT_MESSAGE_SEPARATOR="\n\n"
CHAT_CONTEXT_DEBUG=true
```

## Configurazione in config/config.js

La configurazione è automaticamente caricata nel file `config/config.js`:

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

## Provider Supportati

I seguenti provider sono supportati per il contesto delle chat:

- **anthropic**: Modelli Claude (Claude-3, Claude-3.5, etc.)
- **openai**: Modelli GPT (GPT-4, GPT-3.5, etc.)
- **deepseek**: Modelli DeepSeek
- **together**: Modelli Together AI
- **openrouter**: Modelli OpenRouter

### Provider Non Supportati

I seguenti provider NON utilizzano il contesto delle chat:

- **ideogram**: Modelli di generazione immagini
- **google-veo**: Modelli di generazione video

## Note di Configurazione

1. **Retrocompatibilità**: Se non configurato, il sistema usa i valori di default
2. **Performance**: Un numero maggiore di messaggi può impattare le prestazioni
3. **Token Limit**: Il limite di token è una misura di sicurezza
4. **Debug Mode**: Abilitare solo per troubleshooting, può generare molti log
5. **Provider Selectivity**: Solo i provider text-to-text utilizzano il contesto
