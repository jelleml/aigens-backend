# Fix: Sezione Streaming Non Prepara finalContent

## Problema Identificato

Nella sezione streaming, il `finalContent` non viene preparato, causando:
1. **Calcolo costi errato**: Usa `content` invece di `finalContent`
2. **Contesto perso**: I modelli AI non ricevono il contesto delle chat
3. **Esperienza utente**: Come visto nell'immagine, Claude non ricorda il nome dell'utente

## Analisi del Codice

### Sezione Streaming (linea ~1201)
```javascript
// Use Python addon for text models
const costEstimation = await pythonAddonService.getExpectedCost(
  content, // ❌ Usa content invece di finalContent
  model_id,
  // ...
);
```

### Sezione Streaming AI (linea ~1525)
```javascript
await aiService.sendRequest(
  finalContent, // ❌ finalContent non è definito nella sezione streaming
  model_id,
  // ...
);
```

## Soluzione

Aggiungere la preparazione del `finalContent` nella sezione streaming prima del calcolo costi:

```javascript
// 3. Controllo credito PRIMA di streammare (service-specific)
try {
  const numberOfAttachments = req.files ? req.files.length : 0;
  let totalCostTokens = 0;

  // Prepara il contenuto con contesto PRIMA del calcolo costi (FIX BUG)
  let finalContent = content;
  if (modelInstance.provider?.name && 
      !['ideogram', 'google-veo'].includes(modelInstance.provider.name)) {
    try {
      finalContent = await prepareContentWithContext(
        content, 
        chat_id, 
        modelInstance.provider.name,
        modelInstance
      );
      console.log(`Messages API: Added chat context for streaming cost calculation - provider ${modelInstance.provider.name}`);
    } catch (contextError) {
      console.error('Messages API: Error preparing chat context for streaming cost calculation:', contextError);
      // In caso di errore, usa il contenuto originale
      finalContent = content;
    }
  }

  // Check if it's an Ideogram model (image generation)
  if (modelInstance.provider?.name === 'ideogram') {
    // ... ideogram logic ...
  } else if (modelInstance.provider?.name === 'google-veo') {
    // ... google-veo logic ...
  } else {
    // Use Python addon for text models - usa finalContent invece di content (FIX BUG)
    const costEstimation = await pythonAddonService.getExpectedCost(
      finalContent, // ✅ Usa finalContent (con contesto) invece di content
      model_id,
      'categories',
      'Qwen/Qwen2.5-7B-Instruct-Turbo',
      numberOfAttachments,
      false
    );
    totalCostTokens = pythonAddonService.extractTotalCostTokens(costEstimation);
  }
```

## Benefici

1. **Costi accurati**: Il Python Addon riceve il prompt completo
2. **Contesto mantenuto**: I modelli AI ricevono il contesto delle chat
3. **Esperienza utente**: Claude ricorderà il nome dell'utente
4. **Consistenza**: Entrambe le sezioni (streaming e non-streaming) usano lo stesso approccio
