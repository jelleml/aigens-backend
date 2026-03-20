# Design: Integrazione Modelli Video

## Approccio

L'integrazione dei modelli video nel sistema di setup unificato richiede modifiche al file `scripts/update-models-info/update-all-models.js`. Il design mantiene la struttura esistente aggiungendo i nuovi provider.

## Modifiche Necessarie

### 1. Aggiornamento Configurazione Provider

Aggiungere i nuovi provider alla configurazione `CONFIG.providers`:

```javascript
providers: {
  // ... provider esistenti ...
  veo3: {
    name: 'Google Veo3',
    script: 'update-veo3-models.js',
    flag: '--veo3'
  },
  runway: {
    name: 'Runway',
    script: 'update-runway-models.js',
    flag: '--runway'
  },
  nova: {
    name: 'Amazon Nova',
    script: 'update-nova-models.js',
    flag: '--nova'
  }
}
```

### 2. Aggiornamento Documentazione Help

Modificare la funzione `displayHelp()` per includere i nuovi flag:

```javascript
OPTIONS:
  --help, -h         Show this help message
  --anthropic        Update only Anthropic models
  --openai           Update only OpenAI models  
  --ideogram         Update only Ideogram models
  --openrouter       Update only OpenRouter models
  --together         Update only Together AI models
  --veo3             Update only Google Veo3 models
  --runway           Update only Runway models
  --nova             Update only Amazon Nova models
```

### 3. Aggiornamento Esempi di Utilizzo

Aggiungere esempi per i modelli video:

```javascript
EXAMPLES:
  node scripts/update-models-info/update-all-models.js                    # Update all providers
  node scripts/update-models-info/update-all-models.js --anthropic        # Update only Anthropic
  node scripts/update-models-info/update-all-models.js --openai --ideogram # Update OpenAI and Ideogram
  node scripts/update-models-info/update-all-models.js --veo3 --runway    # Update video models
```

## Struttura dei File

I file degli script video sono già presenti e funzionanti:

- `scripts/update-models-info/update-veo3-models.js` ✅
- `scripts/update-models-info/update-runway-models.js` ✅  
- `scripts/update-models-info/update-nova-models.js` ✅

## Compatibilità

- **Retrocompatibilità**: Tutti i flag esistenti continuano a funzionare
- **Comportamento Default**: Esecuzione di tutti i provider inclusi i video
- **Gestione Errori**: Mantiene la stessa logica di gestione errori esistente

## Test Plan

1. **Test Individuale**: Verificare che ogni flag funzioni individualmente
2. **Test Combinato**: Verificare l'esecuzione di più provider video
3. **Test Completo**: Verificare l'esecuzione di tutti i provider
4. **Test Help**: Verificare che la documentazione sia corretta
