# Fix Logger BTCPay Webhook

## Contesto

L'errore si verifica durante la ricezione di webhook da BTCPay Server. Il problema è nel controller `paymentController.js` alla riga 368, dove viene chiamato `logger.log()` che non è un metodo disponibile nel sistema di logging strutturato.

## Errore Attuale

```
TypeError: logger.log is not a function
    at Object.handleWebhook (/Users/slandi/www/sl/aigens/aigens-backend/controllers/paymentController.js:368:28)
```

## Obiettivi

1. **Identificare tutti i punti** nel controller dove viene utilizzato `logger.log()`
2. **Sostituire** le chiamate `logger.log()` con i metodi appropriati del logger strutturato
3. **Verificare** che non ci siano altri errori simili nel codice
4. **Testare** il webhook per assicurarsi che funzioni correttamente

## Sistema di Logging

Il progetto utilizza un sistema di logging strutturato con i seguenti metodi disponibili:

-   `logger.info()` - Per informazioni generali
-   `logger.error()` - Per errori
-   `logger.warn()` - Per warning
-   `logger.debug()` - Per debug
-   `logger.verbose()` - Per log dettagliati
-   `logger.http()` - Per log HTTP

## Priorità

**ALTA** - Il webhook BTCPay è critico per il funzionamento dei pagamenti Bitcoin.
