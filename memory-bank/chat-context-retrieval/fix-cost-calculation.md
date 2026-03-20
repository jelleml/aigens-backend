# Fix: Calcolo Costi Include Contesto Chat

## Problema

Il calcolo dei costi viene fatto **PRIMA** dell'aggiunta del contesto, causando sottostima dei costi reali.

## Soluzione

Spostare il calcolo dei costi **DOPO** l'aggiunta del contesto.

## Modifiche Necessarie

### 1. Creare funzione helper per preparare contenuto

```javascript
// Aggiungere all'inizio del file api/v1/messages.js
async function prepareContentWithContext(content, chatId, providerName, modelInstance) {
  let finalContent = content;
  
  // Aggiungi contesto solo per modelli text-to-text
  if (providerName && !['ideogram', 'google-veo'].includes(providerName)) {
    try {
      finalContent = await preparePromptWithContext(content, chatId, providerName);
      console.log(`Messages API: Added chat context for provider ${providerName}`);
    } catch (contextError) {
      console.error('Messages API: Error preparing chat context:', contextError);
      // In caso di errore, usa il contenuto originale
      finalContent = content;
    }
  }
  
  return finalContent;
}
```

### 2. Modificare calcolo costi (prima sezione)

```javascript
// PRIMA (buggato):
const costEstimation = await pythonAddonService.getExpectedCost(
  content, // ❌ Solo contenuto originale
  model_id,
  'categories',
  'Qwen/Qwen2.5-7B-Instruct-Turbo',
  numberOfAttachments,
  false
);

// DOPO (corretto):
const finalContent = await prepareContentWithContext(
  content, 
  chat_id, 
  modelInstance.provider?.name, 
  modelInstance
);

const costEstimation = await pythonAddonService.getExpectedCost(
  finalContent, // ✅ Contenuto con contesto
  model_id,
  'categories',
  'Qwen/Qwen2.5-7B-Instruct-Turbo',
  numberOfAttachments,
  false
);
```

### 3. Modificare calcolo costi (seconda sezione - streaming)

```javascript
// PRIMA (buggato):
const costEstimation = await pythonAddonService.getExpectedCost(
  content, // ❌ Solo contenuto originale
  model_id,
  'categories',
  'Qwen/Qwen2.5-7B-Instruct-Turbo',
  numberOfAttachments,
  false
);

// DOPO (corretto):
const finalContent = await prepareContentWithContext(
  content, 
  chat_id, 
  modelInstance.provider?.name, 
  modelInstance
);

const costEstimation = await pythonAddonService.getExpectedCost(
  finalContent, // ✅ Contenuto con contesto
  model_id,
  'categories',
  'Qwen/Qwen2.5-7B-Instruct-Turbo',
  numberOfAttachments,
  false
);
```

### 4. Modificare invio AI

```javascript
// PRIMA:
await aiService.sendRequest(
  finalContent, // Già corretto
  model_id,
  // ...
);

// DOPO: Nessuna modifica necessaria, già corretto
```

## Vantaggi della Fix

1. **Costi accurati**: I costi riflettono il contenuto reale inviato
2. **User experience**: Gli utenti vedono costi realistici
3. **Business**: Controllo accurato sui costi
4. **Consistenza**: Stesso contenuto per costi e invio AI

## Test Necessari

1. **Test costi**: Verificare che i costi aumentino con il contesto
2. **Test balance**: Verificare che il controllo balance funzioni
3. **Test errori**: Verificare gestione errori contesto
4. **Test performance**: Verificare che non impatti performance

## Implementazione

La fix deve essere implementata in entrambi i punti di calcolo costi:
- Linea ~1100 (prima sezione)
- Linea ~1200 (seconda sezione - streaming)
