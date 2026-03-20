# Design - Fix Logger BTCPay Webhook

## Analisi del Problema

Il problema è che nel controller `paymentController.js` viene utilizzato `logger.log()` che non esiste nel sistema di logging strutturato. Il logger restituito da `getLogger()` è un'istanza di `StructuredLogger` che ha metodi specifici.

## Piano di Risoluzione

### 1. Identificazione dei Punti Critici

Cercare nel file `controllers/paymentController.js` tutte le occorrenze di:

-   `logger.log()`
-   Altri metodi non validi del logger

### 2. Sostituzione dei Metodi

Sostituire le chiamate `logger.log()` con i metodi appropriati:

-   Per informazioni generali: `logger.info()`
-   Per debug: `logger.debug()`
-   Per warning: `logger.warn()`

### 3. Verifica Globale

Cercare in tutto il progetto eventuali altri usi di `logger.log()` per prevenire errori simili.

### 4. Test del Webhook

Verificare che il webhook funzioni correttamente dopo le modifiche.

## Implementazione

### File da Modificare

1. `controllers/paymentController.js` - Fix del metodo `handleWebhook`

### Metodi di Logging Disponibili

```javascript
// Metodi corretti del logger strutturato
logger.info("Messaggio informativo");
logger.error("Messaggio di errore");
logger.warn("Messaggio di warning");
logger.debug("Messaggio di debug");
logger.verbose("Messaggio dettagliato");
logger.http("Messaggio HTTP");
```

### Esempio di Correzione

```javascript
// PRIMA (errato)
logger.log(`Unhandled webhook event type: ${type}`);

// DOPO (corretto)
logger.info(`Unhandled webhook event type: ${type}`);
```

## Test Plan

1. **Test Locale**: Verificare che il webhook riceva correttamente gli eventi
2. **Test Logging**: Controllare che i log vengano scritti correttamente
3. **Test Errori**: Verificare che gli errori vengano gestiti e loggati
