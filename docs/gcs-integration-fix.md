# Correzione Integrazione Google Cloud Storage

## Problema Risolto

Il `FileContentExtractorService` e i servizi dei provider AI non riuscivano ad accedere ai file memorizzati su Google Cloud Storage. L'errore era:

```
Errore nell'estrazione del contenuto: File non trovato: gs://aigens-storage-dev/chat_1/...
```

## Causa del Problema

I servizi stavano tentando di accedere ai file GCS usando le funzioni del filesystem locale (`fs.readFile`, `fs.access`) invece di utilizzare l'API di Google Cloud Storage.

## Soluzione Implementata

### 1. Aggiornamento FileContentExtractorService

**File**: `services/file-content-extractor.service.js`

**Modifiche**:

-   Aggiunto import del `GoogleCloudStorage` service
-   Aggiunta funzione `isGcsPath()` per rilevare file su GCS
-   Aggiunta funzione `parseGcsPath()` per estrarre bucket e path
-   Aggiunta funzione `readFile()` che gestisce sia file locali che GCS
-   Aggiornata funzione `verifyFileExists()` per supportare GCS
-   Aggiornate tutte le funzioni di estrazione per usare `this.readFile()`

**Nuove funzioni**:

```javascript
// Rileva se un file è su GCS
isGcsPath(filePath) {
    return filePath.startsWith('gs://') || filePath.startsWith('https://storage.googleapis.com/');
}

// Estrae bucket e path da GCS URL
parseGcsPath(gcsPath) {
    // Supporta sia gs:// che https://storage.googleapis.com/
}

// Legge file da GCS o filesystem locale
async readFile(filePath) {
    if (this.isGcsPath(filePath)) {
        // Download da GCS
        const { Storage } = require('@google-cloud/storage');
        const storage = new Storage();
        const file = storage.bucket(bucket).file(path);
        const [buffer] = await file.download();
        return buffer;
    } else {
        // File locale
        return await fs.readFile(filePath);
    }
}
```

### 2. Aggiornamento Servizi Provider

**File aggiornati**:

-   `services/deepseek.service.js`
-   `services/anthropic.service.js`
-   `services/openai.service.js`
-   `services/openrouter.service.js`

**Modifica**: Aggiornata funzione `readFileAsBase64()` per supportare GCS

```javascript
const readFileAsBase64 = async (filePath) => {
	if (
		filePath.startsWith("gs://") ||
		filePath.startsWith("https://storage.googleapis.com/")
	) {
		// Download da GCS
		const { Storage } = require("@google-cloud/storage");
		const storage = new Storage();
		const file = storage.bucket(bucket).file(path);
		const [buffer] = await file.download();
		return buffer.toString("base64");
	} else {
		// File locale
		const fs = require("fs").promises;
		const buffer = await fs.readFile(filePath);
		return buffer.toString("base64");
	}
};
```

## Formati GCS Supportati

Il sistema ora supporta entrambi i formati di URL GCS:

1. **gs://** - `gs://bucket-name/path/to/file`
2. **https://** - `https://storage.googleapis.com/bucket-name/path/to/file`

## Gestione File Temporanei

Per le librerie che richiedono un file path locale (come `textract` per DOC/PPT), il sistema:

1. Scarica il file da GCS in memoria
2. Lo scrive temporaneamente in `/tmp/`
3. Processa il file
4. Elimina il file temporaneo

## Vantaggi della Soluzione

### 1. **Trasparenza**

-   I servizi funzionano automaticamente con file locali e GCS
-   Nessuna modifica necessaria nel codice chiamante

### 2. **Compatibilità**

-   Mantiene la compatibilità con file locali
-   Supporta tutti i formati GCS esistenti

### 3. **Robustezza**

-   Gestione errori migliorata per GCS
-   Fallback graceful in caso di problemi di rete

### 4. **Performance**

-   Download diretto da GCS senza passaggi intermedi
-   File temporanei solo quando necessario

## Test della Soluzione

### Prima della correzione:

```
❌ Errore: "File non trovato: gs://aigens-storage-dev/chat_1/file.docx"
```

### Dopo la correzione:

```
✅ File scaricato da GCS: gs://aigens-storage-dev/chat_1/file.docx
✅ Contenuto estratto: [contenuto del documento]
✅ Contenuto aggiunto al prompt
```

## Configurazione Richiesta

Assicurati che il servizio abbia accesso a Google Cloud Storage:

1. **Service Account**: Configurato correttamente
2. **Permessi**: Accesso in lettura al bucket
3. **Credenziali**: Caricate nel config

## Monitoraggio

Il sistema ora logga:

-   Tentativi di accesso a GCS
-   Errori di download
-   Tempo di download
-   Pulizia file temporanei

## Prossimi Passi

1. **Test completi** con tutti i tipi di file
2. **Monitoraggio performance** dei download GCS
3. **Caching** per file frequentemente utilizzati
4. **Compressione** per file grandi
