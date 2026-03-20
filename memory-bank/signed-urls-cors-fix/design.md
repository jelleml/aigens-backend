# Design - Fix Signed URLs CORS Issue (Soluzione #1)

## Analisi del Problema

### Situazione Attuale
- Le immagini vengono caricate su Google Cloud Storage
- Gli URL restituiti sono Signed URLs che includono la firma delle intestazioni HTTP
- Il browser aggiunge automaticamente intestazioni CORS che causano mismatch nella firma
- Il frontend non riesce a recuperare le immagini a causa di errori di autenticazione

### Soluzione #1: Include CORS headers in signature

**Vantaggi:**
- Mantiene la sicurezza dei file (accesso controllato)
- Risolve il problema alla radice
- Non espone dati sensibili
- È la soluzione corretta dal punto di vista tecnico

## Modifiche Necessarie

### 1. Modifica del Servizio GCS - getSignedUrl

**File: `services/google-cloud-storage.service.js`**

```javascript
async getSignedUrl(filePath, options = {}) {
    try {
        const {
            action = 'read',
            expires = Date.now() + (this.config.signedUrlExpiration || 15 * 60 * 1000),
            contentType
        } = options;

        const file = this.bucket.file(filePath);
        const [exists] = await file.exists();

        if (!exists && action === 'read') {
            throw new Error(`AiGens file not found: ${filePath}`);
        }

        const signedUrlOptions = {
            version: 'v4',
            action,
            expires,
            // NUOVO: Include CORS headers nella firma
            query: {
                'response-content-type': contentType || 'image/*',
                'response-content-disposition': 'inline'
            }
        };

        if (contentType) {
            signedUrlOptions.contentType = contentType;
        }

        const [signedUrl] = await file.getSignedUrl(signedUrlOptions);
        return signedUrl;
    } catch (error) {
        console.error('AiGens signed URL error:', error);
        throw new Error(`Failed to generate AiGens signed URL: ${error.message}`);
    }
}
```

### 2. Modifica della Chiamata in messages.js

**File: `api/v1/messages.js`**

```javascript
// Modifica nella funzione processAttachmentsForFrontend()
if (attachment.file_path && attachment.file_path.startsWith('gs://')) {
  try {
    // Parse GCS path: gs://bucket-name/path/to/file
    const gcsPath = attachment.file_path.replace('gs://', '');
    const [bucketName, ...pathParts] = gcsPath.split('/');
    const filePath = pathParts.join('/');

    // NUOVO: Genera Signed URL con CORS headers inclusi
    const signedUrl = await gcsService.getSignedUrl(filePath, {
      action: 'read',
      expires: Date.now() + (15 * 60 * 1000), // 15 minutes expiration
      contentType: attachment.mime_type // Include content type nella firma
    });

    processed.downloadUrl = signedUrl;
    processed.accessUrl = signedUrl;
    processed.isGcsFile = true;
    processed.bucket = bucketName;
    processed.gcsPath = filePath;
  } catch (error) {
    console.error(`Error generating signed URL for attachment ${attachment.id}:`, error);
    // Fallback: use file_path as-is
    processed.downloadUrl = attachment.file_path;
    processed.accessUrl = attachment.file_path;
    processed.isGcsFile = true;
    processed.error = 'Could not generate access URL';
  }
}
```

## Implementazione Graduale

### Fase 1: Modifica getSignedUrl (Immediata)
- Aggiungere opzioni CORS al metodo `getSignedUrl()`
- Testare che le Signed URLs funzionino con CORS

### Fase 2: Modifica Chiamata (Immediata)
- Aggiornare la chiamata in `processAttachmentsForFrontend()`
- Passare il content type corretto

### Fase 3: Testing e Validazione
- Testare che le immagini siano accessibili dal browser
- Verificare che non ci siano errori CORS

## Considerazioni Tecniche

### CORS Headers Inclusi
- `response-content-type`: Specifica il tipo di contenuto
- `response-content-disposition`: Imposta come inline per visualizzazione

### Sicurezza
- I file rimangono privati con accesso controllato
- Le Signed URLs hanno scadenza (15 minuti)
- Nessuna esposizione di dati sensibili

### Performance
- Nessun overhead aggiuntivo significativo
- Le Signed URLs sono generate on-demand

## Criteri di Successo

### Funzionalità
- [ ] Le immagini sono accessibili dal browser senza errori CORS
- [ ] Le Signed URLs funzionano correttamente
- [ ] Nessun errore di autenticazione

### Sicurezza
- [ ] I file rimangono privati
- [ ] Accesso controllato tramite Signed URLs
- [ ] Nessuna esposizione di dati sensibili

### Compatibilità
- [ ] Nessuna regressione nelle funzionalità esistenti
- [ ] Frontend funziona senza modifiche
