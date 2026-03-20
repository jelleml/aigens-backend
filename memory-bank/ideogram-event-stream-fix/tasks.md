# Tasks: Correzione Flusso Event Stream per Ideogram

## Task List

### Fase 1: Analisi e Preparazione

-   [x] **Task 1.1**: Analizzare il codice attuale del servizio Ideogram
-   [x] **Task 1.2**: Identificare i problemi nel flusso event stream
-   [x] **Task 1.3**: Analizzare l'errore GCS `ERR_OSSL_UNSUPPORTED`
-   [x] **Task 1.4**: Studiare l'implementazione event stream in `messages.js`

### Fase 2: Modifica del Servizio Ideogram

-   [x] **Task 2.1**: Aggiungere funzione `downloadImagesToTemp` per salvataggio temporaneo
-   [x] **Task 2.2**: Aggiungere funzione `uploadImagesToGCS` per upload finale
-   [x] **Task 2.3**: Aggiungere funzione `cleanupTempFiles` per pulizia automatica
-   [x] **Task 2.4**: Creare nuovo metodo `sendRequestWithStreaming`
-   [x] **Task 2.5**: Modificare metodo `sendRequest` esistente per supportare streaming
-   [x] **Task 2.6**: Aggiungere gestione errori migliorata con rollback

### Fase 3: Integrazione con Messages API

-   [x] **Task 3.1**: Modificare la gestione di Ideogram in `messages.js`
-   [x] **Task 3.2**: Passare la funzione `sendEvent` al servizio Ideogram
-   [x] **Task 3.3**: Implementare eventi di progresso durante la generazione
-   [x] **Task 3.4**: Gestire errori e interruzioni nel flusso event stream

### Fase 4: Testing e Validazione

-   [x] **Task 4.1**: Testare il flusso event stream con frontend
-   [x] **Task 4.2**: Verificare la gestione dei file temporanei
-   [x] **Task 4.3**: Testare il cleanup automatico dei file
-   [x] **Task 4.4**: Validare la compatibilità con l'API esistente
-   [x] **Task 4.5**: Testare la gestione errori GCS

### Fase 5: Documentazione e Cleanup

-   [x] **Task 5.1**: Aggiornare la documentazione del servizio
-   [x] **Task 5.2**: Aggiungere commenti al codice
-   [x] **Task 5.3**: Verificare che non ci siano file temporanei orfani
-   [x] **Task 5.4**: Creare file recap.md con riepilogo delle modifiche

## Dettagli delle Task

### Task 2.1: Aggiungere funzione `downloadImagesToTemp`

**Obiettivo**: Creare funzione per scaricare immagini temporaneamente
**File**: `services/ideogram.service.js`
**Implementazione**:

-   Utilizzare `axios` per download delle immagini
-   Salvare in `/uploads/images/` con nomi univoci
-   Gestire errori di download
-   Restituire array di oggetti con metadati

### Task 2.2: Aggiungere funzione `uploadImagesToGCS`

**Obiettivo**: Caricare immagini da temp a GCS
**File**: `services/ideogram.service.js`
**Implementazione**:

-   Utilizzare `google-cloud-storage.service.js`
-   Gestire errori di upload
-   Cleanup automatico dei file temporanei
-   Fallback a storage locale se GCS fallisce

### Task 2.3: Aggiungere funzione `cleanupTempFiles`

**Obiettivo**: Pulizia automatica dei file temporanei
**File**: `services/ideogram.service.js`
**Implementazione**:

-   Iterare su array di file temporanei
-   Utilizzare `fs.unlink` per eliminazione
-   Gestire errori di cleanup
-   Logging per debugging

### Task 2.4: Creare nuovo metodo `sendRequestWithStreaming`

**Obiettivo**: Implementare flusso event stream per Ideogram
**File**: `services/ideogram.service.js`
**Implementazione**:

-   Ricevere parametro `sendEvent` dalla chiamata
-   Inviare eventi durante le fasi di processo
-   Gestire errori e interruzioni
-   Restituire risultato compatibile con API esistente

### Task 2.5: Modificare metodo `sendRequest` esistente

**Obiettivo**: Mantenere compatibilità con API esistente
**File**: `services/ideogram.service.js`
**Implementazione**:

-   Controllare se `onStream` è fornito
-   Se sì, usare nuovo metodo streaming
-   Se no, usare metodo esistente
-   Mantenere signature esistente

### Task 3.1: Modificare gestione Ideogram in messages.js

**Obiettivo**: Integrare event stream con Ideogram
**File**: `api/v1/messages.js`
**Implementazione**:

-   Identificare blocco di gestione Ideogram
-   Passare funzione `sendEvent` al servizio
-   Gestire risposta del servizio streaming
-   Mantenere compatibilità con altri provider

### Task 3.2: Passare funzione `sendEvent` al servizio

**Obiettivo**: Abilitare comunicazione event stream
**File**: `api/v1/messages.js`
**Implementazione**:

-   Modificare chiamata a `ideogramService.sendRequest`
-   Aggiungere parametro `sendEvent`
-   Gestire callback di streaming
-   Mantenere struttura esistente

## Criteri di Completamento

### Per ogni task:

-   [ ] Codice implementato e funzionante
-   [ ] Test di base eseguiti
-   [ ] Errori gestiti appropriatamente
-   [ ] Logging aggiunto per debugging
-   [ ] Compatibilità mantenuta

### Per il progetto completo:

-   [x] Event stream funziona correttamente
-   [x] File temporanei gestiti appropriatamente
-   [x] Cleanup automatico implementato
-   [x] Errori GCS gestiti con fallback
-   [x] API esistente non rotta
-   [x] Documentazione aggiornata
-   [x] Fix errore `downloadAndSaveImage is not defined`
-   [x] Patch content vs attachment per Ideogram
-   [x] Fix event stream con sendEvent corretto
-   [x] Immagini salvate nel content invece che come attachment
-   [x] Fix errore `finalImages is not defined`
-   [x] Implementato fallback GCS robusto per errori OpenSSL
-   [x] Patch finale completa e definitiva
-   [x] Implementato formato Markdown per immagini
-   [x] Frontend ora renderizza correttamente le immagini
-   [x] Analizzato problema GCS OpenSSL vs allegati
-   [x] Implementato fix OpenSSL nel servizio Ideogram
-   [x] Unificato approccio con messages.js per upload GCS
-   [x] Implementato fallback a URL diretti di Ideogram
-   [x] Patch finale completa e definitiva per GCS
-   [x] Sistema sempre resiliente con immagini accessibili
