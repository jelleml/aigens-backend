# Fix Conversione Crediti BTCPay

## Contesto

Una volta ricevuta la conferma del pagamento BTCPay, il sistema deve:

1. **Convertire l'importo in crediti** usando il tasso di conversione (1000 crediti per 1 EUR)
2. **Aggiornare il wallet** con i crediti convertiti (non con l'importo in EUR)
3. **Inviare email di conferma** con i dettagli corretti dei crediti

## Problema Identificato

### 1. Conversione Crediti Mancante

-   **Attuale**: `wallet.balance = parseFloat(wallet.balance) + parseFloat(transaction.amount)`
-   **Dovrebbe essere**: `wallet.balance = parseFloat(wallet.balance) + creditiConvertiti`

### 2. Email con Dati Non Corretti

-   **Attuale**: Email inviata con `totalCredits = parseFloat(transaction.amount)`
-   **Dovrebbe essere**: Email con crediti convertiti corretti

### 3. Tasso di Cambio BTC/EUR

-   **Mancante**: Conversione da BTC a EUR prima della conversione in crediti
-   **Necessario**: Ottenere tasso di cambio BTC/EUR in tempo reale

## Obiettivi

1. **Implementare conversione crediti corretta** per pagamenti BTCPay
2. **Aggiornare wallet con crediti** invece che con importo EUR
3. **Inviare email con dettagli corretti** dei crediti acquistati
4. **Gestire tassi di cambio** BTC/EUR in tempo reale

## Risultati Attesi

-   ✅ Wallet aggiornato con crediti corretti
-   ✅ Email di conferma con dettagli corretti
-   ✅ Conversione BTC → EUR → Crediti funzionante
-   ✅ Sistema completo per pagamenti BTCPay
