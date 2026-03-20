# Bug Identificato: Contesto Chat Non Funziona

## Problema Osservato

Dall'immagine della chat, vediamo che:
1. **Primo messaggio**: "ciao sono Fabio, piacere. Tu come ti chiami?"
2. **Secondo messaggio**: "come mi chiamo?"
3. **Risposta Claude**: "Non conosco il tuo nome"

**Il contesto delle chat non viene mantenuto!**

## Analisi del Codice

### Problema 1: Sezione Streaming Non Prepara finalContent

Nella sezione streaming (linea ~1201), il calcolo costi usa ancora `content`:

```javascript
// Use Python addon for text models
const costEstimation = await pythonAddonService.getExpectedCost(
  content, // ❌ Usa ancora content invece di finalContent
  model_id,
  // ...
);
```

### Problema 2: finalContent Non Viene Preparato nella Sezione Streaming

Il `finalContent` viene preparato solo nella sezione non-streaming, ma non nella sezione streaming.

### Problema 3: Sezione Streaming Non Usa finalContent

Nella sezione streaming, il codice usa `finalContent` ma non viene mai preparato:

```javascript
await aiService.sendRequest(
  finalContent, // ❌ finalContent non è definito nella sezione streaming
  model_id,
  // ...
);
```

## Soluzione Necessaria

1. **Preparare finalContent nella sezione streaming** prima del calcolo costi
2. **Usare finalContent nel calcolo costi** della sezione streaming
3. **Usare finalContent nell'invio AI** della sezione streaming

## Impatto

- **Costi sottostimati**: Il Python Addon riceve solo `content` invece di `finalContent`
- **Contesto perso**: I modelli AI non ricevono il contesto delle chat
- **Esperienza utente**: Come visto nell'immagine, Claude non ricorda il nome dell'utente
