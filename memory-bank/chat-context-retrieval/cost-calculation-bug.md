# Bug: Calcolo Costi Non Include Contesto Chat

## Problema Identificato

Il calcolo dei costi viene fatto **PRIMA** dell'aggiunta del contesto delle chat, causando una sottostima dei costi reali.

## Flusso Attuale (BUGGATO)

1. **Calcolo costi** (linea ~1100): Usa solo `content` originale
2. **Aggiunta contesto** (linea ~1519): Crea `finalContent` con contesto
3. **Invio AI** (linea ~1530): Usa `finalContent`

## Risultato

- **Costi stimati**: Basati solo sul messaggio originale
- **Costi reali**: Basati su messaggio + contesto (molto più alti)
- **Differenza**: Gli utenti potrebbero non avere abbastanza crediti

## Esempio

**Messaggio originale**: "Continua la spiegazione" (20 token)
**Contesto aggiunto**: "chat context and history... USER: Ciao... ASSISTANT: Ciao!..." (500 token)
**Totale inviato**: 520 token
**Costi stimati**: Basati su 20 token ❌
**Costi reali**: Basati su 520 token ✅

## Soluzione

Spostare il calcolo dei costi **DOPO** l'aggiunta del contesto:

```javascript
// 1. Aggiungi contesto PRIMA
let finalContent = content;
if (modelInstance.provider?.name && 
    !['ideogram', 'google-veo'].includes(modelInstance.provider.name)) {
  finalContent = await preparePromptWithContext(content, chat_id, modelInstance.provider.name);
}

// 2. Calcola costi DOPO (con finalContent)
const costEstimation = await pythonAddonService.getExpectedCost(
  finalContent, // Usa finalContent invece di content
  model_id,
  'categories',
  'Qwen/Qwen2.5-7B-Instruct-Turbo',
  numberOfAttachments,
  false
);
```

## Impatto

- **Utenti**: Potrebbero rimanere senza crediti inaspettatamente
- **Sistema**: Sottostima dei costi reali
- **Business**: Perdita di controllo sui costi

## Priorità

**ALTA** - Questo bug può causare problemi finanziari e di user experience.
