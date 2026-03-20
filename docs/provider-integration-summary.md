# Integrazione FileContentExtractorService con i Provider AI

## Panoramica

Questo documento riepiloga le integrazioni del `FileContentExtractorService` con i vari provider AI del sistema. Ogni provider è stato aggiornato per utilizzare il servizio di estrazione del contenuto quando un tipo di file non è supportato nativamente.

## Provider Aggiornati

### 1. Deepseek ✅

**File**: `services/deepseek.service.js`

**Modifiche**:

-   Aggiunto import del `FileContentExtractorService`
-   Aggiornata funzione `processAttachments` per supportare:
    -   **Immagini**: Inviate come `image_url` (supporto nativo)
    -   **Altri file**: Contenuto estratto e aggiunto al prompt come testo

**Comportamento**:

```javascript
// Immagini → image_url
// PDF, DOCX, TXT, etc. → Contenuto estratto e aggiunto al prompt
```

### 2. Anthropic ✅

**File**: `services/anthropic.service.js`

**Modifiche**:

-   Aggiunto import del `FileContentExtractorService`
-   Aggiornata funzione `processAttachments` per supportare:
    -   **Immagini**: Inviate come allegati binari (supporto nativo)
    -   **Altri file**: Contenuto estratto e aggiunto al prompt come testo

**Comportamento**:

```javascript
// Immagini → Allegati binari
// PDF, DOCX, TXT, etc. → Contenuto estratto e aggiunto al prompt
```

### 3. OpenAI ✅

**File**: `services/openai.service.js`

**Modifiche**:

-   Aggiunto import del `FileContentExtractorService`
-   Aggiornata funzione `processAttachments` per supportare:
    -   **Immagini**: Inviate come `image_url` (supporto nativo)
    -   **Altri file**: Contenuto estratto e aggiunto al prompt come testo

**Comportamento**:

```javascript
// Immagini → image_url
// PDF, DOCX, TXT, etc. → Contenuto estratto e aggiunto al prompt
```

### 4. OpenRouter ✅

**File**: `services/openrouter.service.js`

**Modifiche**:

-   Aggiunto import del `FileContentExtractorService`
-   Aggiornata funzione `processAttachments` per supportare:
    -   **Immagini**: Inviate come `image_url` (supporto nativo)
    -   **Altri file**: Contenuto estratto e aggiunto al prompt come testo

**Comportamento**:

```javascript
// Immagini → image_url
// PDF, DOCX, TXT, etc. → Contenuto estratto e aggiunto al prompt
```

## Provider Non Aggiornati

### Together AI

**File**: `services/together.service.js`

**Motivo**: Il servizio Together non ha gestione di allegati e non supporta immagini o file binari. Non richiede aggiornamenti.

## Pattern di Integrazione

Tutti i provider aggiornati seguono lo stesso pattern:

1. **Import del servizio**:

    ```javascript
    const fileContentExtractor = require("./file-content-extractor.service");
    ```

2. **Aggiornamento di `processAttachments`**:

    ```javascript
    const processAttachments = async (attachments = []) => {
      // Gestione immagini (supporto nativo)
      if (attachmentData.mime_type.startsWith('image/')) {
        // Processa come immagine
      } else {
        // Estrai contenuto per altri file
        nonImageAttachments.push(attachmentData);
      }

      // Estrai contenuto se necessario
      if (nonImageAttachments.length > 0) {
        enrichedPrompt = await fileContentExtractor.enrichPromptWithFileContent(...);
      }

      return { processedAttachments, enrichedPrompt };
    };
    ```

3. **Aggiornamento delle funzioni di richiesta**:

    ```javascript
    const { processedAttachments, enrichedPrompt } = await processAttachments(
    	attachments
    );

    let finalPrompt = prompt;
    if (enrichedPrompt) {
    	finalPrompt = enrichedPrompt.replace("{userPrompt}", prompt);
    }
    ```

## Vantaggi dell'Integrazione

### 1. **Supporto Universale**

-   Tutti i provider ora supportano implicitamente tutti i tipi di file
-   Non è necessario implementare la gestione per ogni provider separatamente

### 2. **Fallback Graceful**

-   Se un file non è supportato nativamente, il contenuto viene estratto
-   Gli errori di estrazione non bloccano l'intera richiesta

### 3. **Consistenza**

-   Comportamento uniforme tra tutti i provider
-   Stessa logica di gestione errori e limiti

### 4. **Estensibilità**

-   Facile aggiungere supporto per nuovi tipi di file
-   Modifiche centralizzate nel `FileContentExtractorService`

## Tipi di File Supportati

### Supporto Nativo (Immagini)

-   `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/tiff`, `image/bmp`

### Estrazione Contenuto

-   **Testo**: `text/plain`, `text/markdown`, `text/csv`, `text/html`
-   **Strutturati**: `application/json`, `application/xml`, `application/yaml`
-   **Documenti**: `application/pdf`, `application/vnd.openxmlformats-officedocument.*`
-   **Legacy**: `application/msword`, `application/vnd.ms-*`

## Limitazioni

### 1. **Dipendenze Opzionali**

Alcuni formati richiedono librerie esterne:

-   PDF: `pdf-parse`
-   DOCX: `mammoth`
-   XLSX: `xlsx`
-   PPTX: `pptx-text-extract`

### 2. **Limiti di Dimensione**

-   Contenuto estratto limitato a 50.000 caratteri per provider
-   File multipli limitati a 100.000 caratteri totali

### 3. **Performance**

-   Estrazione di file grandi può essere lenta
-   Nessun caching implementato (da considerare per il futuro)

## Test e Verifica

Per verificare l'integrazione:

1. **Test con immagini**: Dovrebbero funzionare come prima
2. **Test con PDF**: Contenuto estratto e aggiunto al prompt
3. **Test con file di testo**: Contenuto estratto e aggiunto al prompt
4. **Test con file non supportati**: Messaggio di errore chiaro

## Esempio di Utilizzo

```javascript
// Prima dell'integrazione
// ❌ Errore: "Tipo di allegato non supportato: application/pdf"

// Dopo l'integrazione
// ✅ PDF → Contenuto estratto e aggiunto al prompt
// ✅ Immagine → Inviata come image_url
// ✅ TXT → Contenuto estratto e aggiunto al prompt
```

## Prossimi Passi

1. **Test completi** con tutti i provider
2. **Monitoraggio performance** dell'estrazione
3. **Implementazione caching** per file frequentemente utilizzati
4. **Supporto OCR** per immagini (futuro)
5. **Streaming** per file molto grandi (futuro)
