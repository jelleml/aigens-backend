# Correzione Problema Credenziali Google Cloud Storage

## Problema Identificato

Il sistema presentava un errore di autenticazione quando tentava di leggere file da Google Cloud Storage:

```
Errore nell'estrazione del contenuto: Errore nella verifica del file su GCS: Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.
```

## Causa del Problema

Il problema era causato da un'inconsistenza nell'uso delle credenziali Google Cloud Storage:

1. **Salvataggio file**: Funzionava correttamente perché usava il servizio `GoogleCloudBlobStorage` configurato con le credenziali appropriate
2. **Lettura file**: Falliva perché i servizi di estrazione del contenuto creavano nuove istanze di `Storage` senza passare le credenziali

### Codice Problematico (Prima della Correzione)

```javascript
// ❌ Senza credenziali - causava errore
const { Storage } = require("@google-cloud/storage");
const storage = new Storage(); // Nessuna credenziale!

const file = storage.bucket(bucket).file(path);
const [buffer] = await file.download();
```

### Codice Corretto (Dopo la Correzione)

```javascript
// ✅ Con credenziali configurate
const GoogleCloudStorage = require("./google-cloud-storage.service");
const gcsService = new GoogleCloudStorage(); // Usa credenziali da config

const buffer = await gcsService.downloadFile(bucket, path);
```

## Soluzione Implementata

### 1. Aggiornamento FileContentExtractorService

-   **File**: `services/file-content-extractor.service.js`
-   **Modifiche**:
    -   Sostituito l'uso diretto di `Storage` con il servizio `GoogleCloudStorage` configurato
    -   Aggiornate le funzioni `readFile()` e `verifyFileExists()`

### 2. Aggiunta Metodi al GoogleCloudStorage

-   **File**: `services/google-cloud-storage.service.js`
-   **Nuovi metodi**:
    -   `downloadFile(bucketName, filePath)`: Scarica file da qualsiasi bucket
    -   `fileExists(bucketName, filePath)`: Verifica esistenza file in qualsiasi bucket

### 3. Aggiornamento Servizi Provider AI

Aggiornate le funzioni `readFileAsBase64()` in tutti i servizi provider:

-   `services/deepseek.service.js`
-   `services/openai.service.js`
-   `services/anthropic.service.js`
-   `services/openrouter.service.js`

## Vantaggi della Correzione

1. **Consistenza**: Tutti i servizi ora usano le stesse credenziali configurate
2. **Sicurezza**: Le credenziali sono gestite centralmente nel servizio `GoogleCloudStorage`
3. **Manutenibilità**: Un solo punto di configurazione per le credenziali GCS
4. **Affidabilità**: Eliminati gli errori di autenticazione per la lettura file

## Configurazione Richiesta

Assicurarsi che le seguenti variabili d'ambiente siano configurate correttamente:

```env
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_STORAGE_BUCKET=your-bucket-name
GOOGLE_CLOUD_TYPE=service_account
GOOGLE_CLOUD_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_CLOUD_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CLOUD_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_CLOUD_CLIENT_ID=your-client-id
GOOGLE_CLOUD_AUTH_URI=https://accounts.google.com/o/oauth2/auth
GOOGLE_CLOUD_TOKEN_URI=https://oauth2.googleapis.com/token
GOOGLE_CLOUD_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
GOOGLE_CLOUD_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com
GOOGLE_CLOUD_UNIVERSE_DOMAIN=googleapis.com
```

## Test della Correzione

Per verificare che la correzione funzioni:

1. **Upload file**: Carica un file (es. documento Word, PDF, immagine)
2. **Chat con allegato**: Invia un messaggio con l'allegato a un modello AI
3. **Verifica estrazione**: Il sistema dovrebbe ora estrarre correttamente il contenuto senza errori di autenticazione

### Dipendenze Installate

Le seguenti librerie sono state installate per supportare l'estrazione del contenuto:

```bash
npm install mammoth pdf-parse xlsx pptx-text-parser textract
```

-   **mammoth**: Estrazione testo da file DOCX
-   **pdf-parse**: Estrazione testo da file PDF
-   **xlsx**: Estrazione dati da file Excel (XLSX, XLS)
-   **pptx-text-parser**: Estrazione testo da file PowerPoint (PPTX)
-   **textract**: Estrazione testo da vari formati (DOC, PPT legacy, etc.)

### Verifica Installazione

Per verificare che tutte le librerie siano installate correttamente:

```bash
node -e "
const libs = ['mammoth', 'pdf-parse', 'xlsx', 'pptx-text-parser', 'textract'];
libs.forEach(lib => {
  try {
    require(lib);
    console.log('✅ ' + lib + ' - OK');
  } catch (e) {
    console.log('❌ ' + lib + ' - ERRORE: ' + e.message);
  }
});
"
```

## Note Tecniche

-   Il servizio `GoogleCloudStorage` è inizializzato con le credenziali dalla configurazione
-   I metodi `downloadFile()` e `fileExists()` supportano bucket diversi da quello di default
-   La correzione mantiene la compatibilità con file locali e file su GCS
-   Tutti i provider AI ora usano lo stesso meccanismo per l'accesso ai file

## Monitoraggio

Dopo la correzione, monitorare i log per verificare che non ci siano più errori di autenticazione GCS:

```bash
# Cerca errori GCS nei log
grep -i "gcs\|google.*cloud\|storage" logs/app.log
```
