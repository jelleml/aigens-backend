# Fix Finale: Calcolo Costi Include Contesto Chat

## Problema Identificato

Il secondo punto di calcolo costi (linea ~1191) usa ancora `content` invece di `finalContent`, causando sottostima dei costi.

## Analisi del Flusso

### Flusso Attuale (BUGGATO)
1. **Calcolo costi** (linea ~1191): Usa `content` (senza contesto)
2. **Preparazione contesto** (linea ~1507): Crea `finalContent` (con contesto)
3. **Invio AI** (linea ~1530): Usa `finalContent` (con contesto)

### Risultato
- **Costi stimati**: Basati su `content` (senza contesto)
- **Costi reali**: Basati su `finalContent` (con contesto)
- **Differenza**: Sottostima significativa dei costi

## Soluzione

Spostare la preparazione del `finalContent` **PRIMA** del calcolo dei costi.

### Modifiche Necessarie

#### 1. Spostare preparazione contesto prima del calcolo costi

**PRIMA (buggato):**
```javascript
// Calcolo costi (linea ~1191)
const costEstimation = await pythonAddonService.getExpectedCost(
  content, // ❌ Senza contesto
  model_id,
  // ...
);

// Preparazione contesto (linea ~1507) - TROPPO TARDI!
let finalContent = content;
if (modelInstance.provider?.name && 
    !['ideogram', 'google-veo'].includes(modelInstance.provider.name)) {
  finalContent = await prepareContentWithContext(...);
}
```

**DOPO (corretto):**
```javascript
// Preparazione contesto PRIMA del calcolo costi
let finalContent = content;
if (modelInstance.provider?.name && 
    !['ideogram', 'google-veo'].includes(modelInstance.provider.name)) {
  finalContent = await prepareContentWithContext(...);
}

// Calcolo costi con contenuto completo
const costEstimation = await pythonAddonService.getExpectedCost(
  finalContent, // ✅ Con contesto
  model_id,
  // ...
);
```

## Benefici

1. **Costi accurati**: Il Python Addon riceve il prompt completo
2. **Nessuna modifica Python Addon**: Riceve già tutto quello che serve
3. **Consistenza**: Entrambi i punti di calcolo usano lo stesso contenuto
4. **Precisione**: Gli utenti vedono i costi reali prima dell'invio

## Test di Verifica

Il test `cost-calculation-test.js` mostra:
- **Contenuto originale**: 6 token
- **Contenuto con contesto**: 111 token
- **Aumento**: 1750%!

Con questa fix, il Python Addon riceverà sempre 111 token invece di 6.
