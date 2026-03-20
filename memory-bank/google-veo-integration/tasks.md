# Integrazione Google Veo - Tasks

## Elenco delle Attività

### Fase 1: Setup e Configurazione

-   [x] **Task 1.1**: Verificare che il pacchetto `@google/genai` sia installato
-   [x] **Task 1.2**: Verificare che la variabile `GOOGLE_GEMINI_KEY` sia presente nel file `.env`
-   [x] **Task 1.3**: Creare il provider "google-veo" nel database
-   [x] **Task 1.4**: Configurare i modelli Google Veo nel database

### Fase 2: Creazione del Servizio

-   [x] **Task 2.1**: Creare il file `services/google-veo.service.js`
-   [x] **Task 2.2**: Implementare la funzione `getGoogleVeoProviderId()`
-   [x] **Task 2.3**: Implementare la funzione `fetchAvailableModels()`
-   [x] **Task 2.4**: Implementare la funzione `calculateCost()` (placeholder)
-   [x] **Task 2.5**: Implementare la funzione `checkUserFunds()`
-   [x] **Task 2.6**: Implementare la funzione `saveMessage()`
-   [x] **Task 2.7**: Implementare la funzione `saveAttachment()`
-   [x] **Task 2.8**: Implementare la funzione `saveMessageCost()`
-   [x] **Task 2.9**: Implementare la funzione `updateWalletBalance()`
-   [x] **Task 2.10**: Implementare la funzione `downloadAndSaveVideo()`
-   [x] **Task 2.11**: Implementare la funzione `processGoogleVeoRequest()`
-   [x] **Task 2.12**: Implementare la funzione `sendRequest()`

### Fase 3: Integrazione con l'API

-   [x] **Task 3.1**: Aggiungere l'import del servizio Google Veo in `api/v1/messages.js`
-   [x] **Task 3.2**: Aggiungere la gestione del tipo di agente 'video' nella funzione `sendMessage`
-   [x] **Task 3.3**: Integrare la chiamata al servizio Google Veo nel flusso esistente
-   [x] **Task 3.4**: Testare l'integrazione con l'API

### Fase 4: Gestione degli Event Stream

-   [x] **Task 4.1**: Implementare l'evento `video-generation-started`
-   [x] **Task 4.2**: Implementare l'evento `video-generation-progress`
-   [x] **Task 4.3**: Implementare l'evento `video-generation-completed`
-   [x] **Task 4.4**: Implementare l'evento `video-generation-error`
-   [x] **Task 4.5**: Testare gli event stream

### Fase 5: Gestione degli Errori

-   [x] **Task 5.1**: Implementare la gestione degli errori di rete
-   [x] **Task 5.2**: Implementare la gestione degli errori di API key
-   [x] **Task 5.3**: Implementare la gestione dei rate limit
-   [x] **Task 5.4**: Implementare la gestione degli errori di generazione video
-   [x] **Task 5.5**: Implementare la gestione degli errori di storage

### Fase 6: Testing e Validazione

-   [x] **Task 6.1**: Creare test unitari per il servizio Google Veo
-   [x] **Task 6.2**: Creare test di integrazione per l'API
-   [x] **Task 6.3**: Testare la generazione di video con prompt semplici
-   [x] **Task 6.4**: Testare la gestione degli errori
-   [x] **Task 6.5**: Testare gli event stream
-   [x] **Task 6.6**: Testare l'integrazione con il sistema di wallet

### Fase 7: Documentazione

-   [x] **Task 7.1**: Documentare l'uso del servizio Google Veo
-   [x] **Task 7.2**: Aggiornare la documentazione delle API
-   [x] **Task 7.3**: Creare esempi di utilizzo
-   [x] **Task 7.4**: Documentare la gestione degli errori

## Note

-   Le attività sono ordinate per priorità e dipendenze
-   Ogni task deve essere completato prima di passare al successivo
-   I test devono essere eseguiti dopo ogni fase
-   La documentazione deve essere aggiornata durante l'implementazione
