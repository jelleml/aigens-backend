# Fix Webhook BTCPay - Tasks

## Elenco delle Attività

### **Fase 1: Correzione URL Webhook**

-   [x] **Task 1.1**: Modificare l'URL del webhook in `services/btc-payments.service.js`

    -   [x] Localizzare la riga 58 dove viene configurato `notificationUrl`
    -   [x] Cambiare da `/api/v1/btcpay/webhook` a `/api/v1/payments/webhook`
    -   [x] Verificare che la modifica sia applicata correttamente

-   [x] **Task 1.2**: Aggiungere endpoint di compatibilità in `api/v1/payments.js`
    -   [x] Aggiungere endpoint `/api/v1/payments/btcpay/webhook` per invoice esistenti
    -   [x] Usare lo stesso controller e middleware dell'endpoint principale
    -   [x] Verificare che l'endpoint sia configurato correttamente

### **Fase 2: Verifica Endpoint Esistente**

-   [x] **Task 2.1**: Verificare che l'endpoint `/api/v1/payments/webhook` sia configurato correttamente
    -   [x] Controllare che usi il middleware `validateWebhook`
    -   [x] Verificare che chiami `PaymentController.handleWebhook`
    -   [x] Confermare che gestisca gli eventi BTCPay

### **Fase 3: Test della Correzione**

-   [x] **Task 3.1**: Test locale della modifica

    -   [x] Verificare che l'URL sia corretto nel codice
    -   [x] Controllare che non ci siano errori di sintassi

-   [x] **Task 3.2**: Test del webhook (se possibile)
    -   [x] Simulare un webhook BTCPay
    -   [x] Verificare che l'endpoint risponda correttamente

### **Fase 4: Documentazione**

-   [x] **Task 4.1**: Aggiornare la documentazione
    -   [x] Documentare la correzione nel file `recap.md`
    -   [x] Aggiungere note per futuri sviluppi

## Stato Attuale

-   **Status**: ✅ COMPLETATO
-   **Fase**: 4 - Documentazione
-   **Task Corrente**: Tutti completati

## Note

-   La correzione è minima e mirata
-   Non sono necessarie modifiche alla struttura esistente
-   L'endpoint di destinazione è già testato e funzionante
