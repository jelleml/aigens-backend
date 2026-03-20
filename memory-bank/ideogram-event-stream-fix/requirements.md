# Requisiti: Correzione Flusso Event Stream per Ideogram

## Contesto

Il servizio Ideogram attualmente non rispetta le specifiche di event stream per la comunicazione con il frontend. Quando si genera un'immagine, il backend non invia aggiornamenti in tempo reale al frontend tramite SSE (Server-Sent Events).

## Problemi Identificati

### 1. Flusso di Comunicazione non Event Stream

-   Il servizio Ideogram non utilizza il sistema di event stream implementato in `messages.js`
-   Il frontend non riceve aggiornamenti in tempo reale durante la generazione dell'immagine
-   Non c'è feedback visivo per l'utente durante il processo di generazione

### 2. Gestione Upload Immagini

-   Le immagini vengono scaricate e salvate direttamente su Google Cloud Storage
-   In caso di errore GCS, viene utilizzato il fallback locale
-   Non c'è una gestione temporanea delle immagini prima del caricamento finale

## Obiettivi

### 1. Implementare Event Stream per Ideogram

-   Modificare il servizio Ideogram per supportare il flusso event stream
-   Inviare eventi `process_started`, `delta`, `completed` al frontend
-   Gestire errori e interruzioni tramite eventi `error` e `interrupted`

### 2. Migliorare Gestione Upload Immagini

-   Salvare temporaneamente le immagini in `/uploads/` durante la generazione
-   Caricare le immagini su Google Cloud Storage solo al completamento dell'event stream
-   Implementare cleanup automatico dei file temporanei

### 3. Mantenere Compatibilità

-   Assicurarsi che il servizio funzioni sia in modalità streaming che non-streaming
-   Mantenere la compatibilità con l'API esistente
-   Non rompere le funzionalità esistenti

## Requisiti Tecnici

### Event Stream Implementation

-   Utilizzare la funzione `sendEvent` già implementata in `messages.js`
-   Inviare eventi durante le fasi di:
    -   Inizializzazione richiesta
    -   Generazione immagine
    -   Download e salvataggio
    -   Upload su GCS
    -   Completamento

### Gestione File Temporanei

-   Salvare immagini temporaneamente in `/uploads/images/`
-   Utilizzare nomi file univoci per evitare conflitti
-   Implementare cleanup automatico in caso di errore
-   Caricare su GCS solo al completamento con successo

### Gestione Errori

-   Gestire errori di generazione immagine
-   Gestire errori di download
-   Gestire errori di upload GCS
-   Implementare rollback in caso di errori

## Criteri di Successo

1. ✅ Il frontend riceve aggiornamenti in tempo reale durante la generazione
2. ✅ Le immagini vengono salvate temporaneamente e poi caricate su GCS
3. ✅ Il sistema gestisce correttamente gli errori e interruzioni
4. ✅ La compatibilità con l'API esistente è mantenuta
5. ✅ I file temporanei vengono puliti automaticamente
