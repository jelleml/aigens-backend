# Piano di Test per Sistema Contesto Chat

## Test Funzionali

### 1. Test di Recupero Contesto
**Obiettivo**: Verificare che il contesto delle chat venga recuperato correttamente

**Passi**:
1. Creare una chat con almeno 5 messaggi
2. Inviare un nuovo messaggio
3. Verificare che il contesto sia incluso nel prompt inviato all'AI
4. Verificare che la risposta sia coerente con il contesto

**Criteri di Successo**:
- Il contesto viene recuperato correttamente
- Il formato USER/ASSISTANT è corretto
- Il prefisso informativo è presente
- La risposta dell'AI è coerente con la conversazione precedente

### 2. Test di Configurazione
**Obiettivo**: Verificare che le configurazioni funzionino correttamente

**Passi**:
1. Testare con diversi valori di `CHAT_CONTEXT_MAX_MESSAGES`
2. Testare con diversi provider abilitati/disabilitati
3. Testare con diversi formati di messaggi
4. Testare con debug abilitato

**Criteri di Successo**:
- Le configurazioni vengono applicate correttamente
- I provider abilitati utilizzano il contesto
- I provider disabilitati non utilizzano il contesto
- Il logging debug funziona quando abilitato

### 3. Test di Gestione Errori
**Obiettivo**: Verificare che il sistema gestisca gli errori correttamente

**Passi**:
1. Testare con chat inesistente
2. Testare con database non disponibile
3. Testare con configurazioni invalide
4. Testare con provider non supportati

**Criteri di Successo**:
- In caso di errore, viene utilizzato il prompt originale
- Il sistema continua a funzionare
- Gli errori vengono loggati appropriatamente

## Test di Performance

### 1. Test di Latenza
**Obiettivo**: Verificare che il recupero del contesto non impatti significativamente le prestazioni

**Passi**:
1. Misurare il tempo di risposta senza contesto
2. Misurare il tempo di risposta con contesto
3. Confrontare i risultati

**Criteri di Successo**:
- L'aumento di latenza è < 100ms
- Il sistema rimane responsivo

### 2. Test di Scalabilità
**Obiettivo**: Verificare che il sistema funzioni con chat con molti messaggi

**Passi**:
1. Creare una chat con 100+ messaggi
2. Testare il recupero del contesto
3. Verificare le prestazioni

**Criteri di Successo**:
- Il recupero del contesto è efficiente
- Non ci sono timeout
- La memoria non viene esaurita

## Test di Integrazione

### 1. Test con Tutti i Provider
**Obiettivo**: Verificare che tutti i provider text-to-text utilizzino il contesto

**Passi**:
1. Testare con Anthropic (Claude)
2. Testare con OpenAI (GPT)
3. Testare con DeepSeek
4. Testare con Together AI
5. Testare con OpenRouter

**Criteri di Successo**:
- Tutti i provider abilitati utilizzano il contesto
- Le risposte sono coerenti con il contesto
- Non ci sono errori di integrazione

### 2. Test con Provider Non-Text
**Obiettivo**: Verificare che i provider image/video non utilizzino il contesto

**Passi**:
1. Testare con Ideogram (immagini)
2. Testare con Google Veo (video)

**Criteri di Successo**:
- I provider image/video non utilizzano il contesto
- Le funzionalità image/video continuano a funzionare
- Non ci sono errori

## Test di Configurazione

### 1. Test delle Variabili d'Ambiente
**Obiettivo**: Verificare che tutte le variabili d'ambiente funzionino

**Passi**:
1. Testare `CHAT_CONTEXT_MAX_MESSAGES`
2. Testare `CHAT_CONTEXT_ENABLED`
3. Testare `CHAT_CONTEXT_ENABLED_PROVIDERS`
4. Testare `CHAT_CONTEXT_DEBUG`

**Criteri di Successo**:
- Tutte le variabili vengono caricate correttamente
- I valori di default vengono applicati quando necessario
- Le configurazioni vengono applicate correttamente

## Script di Test

### Test Rapido
```bash
# Abilita debug per vedere i log
export CHAT_CONTEXT_DEBUG=true

# Testa con 3 messaggi invece di 5
export CHAT_CONTEXT_MAX_MESSAGES=3

# Riavvia il server
npm start
```

### Test Completo
```bash
# Configurazione per test completo
export CHAT_CONTEXT_DEBUG=true
export CHAT_CONTEXT_MAX_MESSAGES=10
export CHAT_CONTEXT_ENABLED_PROVIDERS=anthropic,openai
export CHAT_CONTEXT_USER_FORMAT=UTENTE
export CHAT_CONTEXT_ASSISTANT_FORMAT=AI

# Riavvia il server
npm start
```

## Metriche di Successo

1. **Funzionalità**: 100% dei test funzionali passano
2. **Performance**: Latenza aggiuntiva < 100ms
3. **Stabilità**: 0 errori critici
4. **Compatibilità**: Tutti i provider funzionano correttamente
5. **Configurabilità**: Tutte le opzioni di configurazione funzionano

## Rollback Plan

In caso di problemi:

1. Disabilitare il contesto: `export CHAT_CONTEXT_ENABLED=false`
2. Riavviare il server
3. Verificare che il sistema funzioni senza contesto
4. Investigare e risolvere i problemi
5. Riabilitare gradualmente
