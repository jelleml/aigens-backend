# Fix Errore Credits Webhook BTCPay

## Contesto

Il pagamento BTCPay avviene correttamente ma non vengono registrati i crediti e non viene inviata la mail di conferma.

## Errore Identificato

```
Unknown column 'credits' in 'SET'
```

**Problema**: Il controller `paymentController.js` alla riga 404 sta cercando di aggiornare una colonna `credits` nella tabella `users` che non esiste.

**Codice problematico**:

```javascript
await user.increment("credits", { by: transaction.creditAmount });
```

## Analisi del Problema

### 1. Struttura Database

-   **Tabella `users`**: Non ha colonna `credits`
-   **Tabella `wallets`**: Ha colonna `balance` per i crediti
-   **Sistema corretto**: I crediti sono nel wallet, non nell'utente

### 2. Flusso Corretto

1. BTCPay conferma pagamento
2. Aggiorna status transazione
3. **Aggiorna wallet.balance** (non user.credits)
4. Invia email di conferma

### 3. Problemi Attuali

-   ❌ Aggiorna `user.credits` (colonna inesistente)
-   ❌ Non aggiorna `wallet.balance`
-   ❌ Email non inviata per errore database

## Obiettivi

1. **Fix errore database**: Rimuovere aggiornamento `user.credits`
2. **Aggiornare wallet**: Usare `wallet.balance` per i crediti
3. **Ripristinare email**: Assicurarsi che l'email venga inviata
4. **Mantenere logica**: Preservare la logica di conversione crediti

## Risultati Attesi

-   ✅ Nessun errore database
-   ✅ Crediti registrati correttamente nel wallet
-   ✅ Email di conferma inviata
-   ✅ Sistema BTCPay completamente funzionante
