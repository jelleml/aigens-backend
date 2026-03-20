# Fix: finalContent Scope Error

## 🐛 Problema Identificato

```
ReferenceError: finalContent is not defined
    at /Users/fabio/Workspace/repositories/aigens-backend/api/v1/messages.js:1553:17
```

## 🔍 Analisi del Problema

### Causa del Problema
La variabile `finalContent` viene definita all'interno del blocco `try` (linea ~1201) ma viene usata fuori dal blocco `try` (linea ~1553), causando un errore di scope.

### Codice Problematico
```javascript
// 3. Controllo credito PRIMA di streammare (service-specific)
try {
  const numberOfAttachments = req.files ? req.files.length : 0;
  let totalCostTokens = 0;

  // Prepara il contenuto con contesto PRIMA del calcolo costi (FIX BUG)
  let finalContent = content; // ❌ Definito dentro try
  // ...
} catch (err) {
  // ...
}

// Più avanti nel codice...
await aiService.sendRequest(
  finalContent, // ❌ Usato fuori dal try - non definito!
  model_id,
  // ...
);
```

## 🔧 Soluzione

### Spostare finalContent fuori dal blocco try
```javascript
// 2. Se SSE, gestisci lo streaming
if (useStreaming) {
  // ... setup streaming ...

  // Prepara il contenuto con contesto PRIMA del controllo credito (FIX BUG)
  let finalContent = content; // ✅ Definito fuori dal try
  if (modelInstance.provider?.name && 
      !['ideogram', 'google-veo'].includes(modelInstance.provider.name)) {
    try {
      finalContent = await prepareContentWithContext(
        content, 
        chat_id, 
        modelInstance.provider.name,
        modelInstance
      );
      console.log(`Messages API: Added chat context for streaming - provider ${modelInstance.provider.name}`);
    } catch (contextError) {
      console.error('Messages API: Error preparing chat context for streaming:', contextError);
      // In caso di errore, usa il contenuto originale
      finalContent = content;
    }
  }

  // 3. Controllo credito PRIMA di streammare (service-specific)
  try {
    // ... calcolo costi usando finalContent ...
  } catch (err) {
    // ...
  }

  // Più avanti nel codice...
  await aiService.sendRequest(
    finalContent, // ✅ Ora è accessibile!
    model_id,
    // ...
  );
}
```

## ✅ Benefici della Fix

1. **Scope corretto**: `finalContent` è accessibile in tutta la sezione streaming
2. **Contesto mantenuto**: Il contesto viene preparato prima del calcolo costi
3. **Costi accurati**: Il calcolo costi usa il contenuto con contesto
4. **Invio corretto**: L'AI riceve il contenuto con contesto

## 🚀 Risultato

- ✅ **finalContent accessibile** in tutta la sezione streaming
- ✅ **Contesto recuperato** e aggiunto al prompt
- ✅ **Costi calcolati** correttamente con contesto
- ✅ **Modelli AI** ricevono il contesto completo
