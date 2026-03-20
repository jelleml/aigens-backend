# Dipendenze per FileContentExtractorService

## Dipendenze Opzionali

Il `FileContentExtractorService` utilizza librerie esterne per estrarre contenuto da diversi tipi di file. Queste librerie sono caricate dinamicamente solo quando necessarie, quindi puoi installarle solo quelle che ti servono.

## Installazione

### Per tutti i formati (installazione completa)

```bash
npm install pdf-parse mammoth xlsx pptx-text-extract textract
```

### Per formati specifici

#### PDF

```bash
npm install pdf-parse
```

#### Documenti Office (DOCX, XLSX, PPTX)

```bash
npm install mammoth xlsx pptx-text-extract
```

#### Documenti Legacy (DOC, PPT)

```bash
npm install textract
```

#### OCR per immagini (futuro)

```bash
npm install tesseract.js
```

## Verifica Installazione

Puoi verificare quali librerie sono installate eseguendo:

```javascript
const fileContentExtractor = require("./services/file-content-extractor.service");

// Verifica formati supportati
console.log("Formati supportati:", fileContentExtractor.getSupportedFormats());

// Testa un formato specifico
const isPdfSupported = fileContentExtractor.isSupported("application/pdf");
console.log("PDF supportato:", isPdfSupported);
```

## Gestione Errori

Se una libreria non è installata, il servizio restituirà un errore chiaro con le istruzioni per l'installazione:

```
Errore nell'estrazione del PDF: Libreria pdf-parse non installata. Installa con: npm install pdf-parse
```

## Performance

-   **Lazy Loading**: Le librerie vengono caricate solo quando necessarie
-   **Fallback Graceful**: Se una libreria non è disponibile, il servizio gestisce l'errore senza crashare
-   **Caching**: Considera l'implementazione di cache per file frequentemente utilizzati

## Note per Produzione

1. **Sicurezza**: Alcune librerie (come `textract`) possono eseguire comandi di sistema. Verifica sempre i file prima dell'elaborazione
2. **Memoria**: File grandi possono consumare molta memoria. Usa sempre `maxLength` appropriato
3. **Timeout**: Considera timeout per operazioni di estrazione lunghe
4. **Logging**: Monitora l'uso delle librerie per ottimizzare le dipendenze
