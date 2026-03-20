# File Content Extractor Service

## Panoramica

Il `FileContentExtractorService` è un servizio modulare e robusto per l'estrazione del contenuto da file di diversi formati. È progettato per essere utilizzato da tutti i provider AI per arricchire i prompt con il contenuto dei file allegati.

## Caratteristiche

-   **Supporto multi-formato**: Gestisce immagini, documenti Office, PDF, file di testo e più
-   **Estrazione intelligente**: Utilizza librerie specializzate per ogni tipo di file
-   **Gestione errori robusta**: Gestisce gracefully i file non supportati o corrotti
-   **Formattazione flessibile**: Supporta output in testo, markdown e strutturato
-   **Limitazione contenuto**: Previene l'overflow dei token con troncamento intelligente
-   **Integrazione seamless**: Si integra facilmente con tutti i provider AI

## Formati Supportati

### File di Testo

-   `text/plain` - File di testo semplice
-   `text/markdown` - File Markdown
-   `text/csv` - File CSV
-   `text/html` - File HTML

### Documenti Strutturati

-   `application/json` - File JSON
-   `application/xml` - File XML
-   `application/yaml` - File YAML
-   `application/yml` - File YAML

### Documenti Office (richiedono librerie esterne)

-   `application/pdf` - File PDF (richiede `pdf-parse`)
-   `application/vnd.openxmlformats-officedocument.wordprocessingml.document` - File DOCX (richiede `mammoth`)
-   `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` - File XLSX (richiede `xlsx`)
-   `application/vnd.openxmlformats-officedocument.presentationml.presentation` - File PPTX (richiede `pptx-text-extract`)

### Documenti Legacy

-   `application/msword` - File DOC (richiede `textract`)
-   `application/vnd.ms-excel` - File XLS (richiede `xlsx`)
-   `application/vnd.ms-powerpoint` - File PPT (richiede `textract`)

### Immagini (placeholder per OCR futuro)

-   `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/tiff`, `image/bmp`

## Utilizzo

### Estrazione Base

```javascript
const fileContentExtractor = require("./services/file-content-extractor.service");

// Estrai contenuto da un singolo file
const result = await fileContentExtractor.extractContent(attachmentId, {
	maxLength: 50000,
	includeMetadata: true,
	format: "text",
});

console.log(result.content);
```

### Estrazione Multipla

```javascript
// Estrai contenuto da più file
const result = await fileContentExtractor.extractMultipleContents(attachments, {
	separator: "\n\n---\n\n",
	maxTotalLength: 100000,
	maxLength: 10000,
});

console.log(result.content);
```

### Arricchimento Prompt

```javascript
// Aggiungi il contenuto dei file al prompt dell'utente
const enrichedPrompt = await fileContentExtractor.enrichPromptWithFileContent(
	userPrompt,
	attachments,
	{
		promptTemplate:
			"Prompt utente: {userPrompt}\n\nContenuto file:\n{fileContent}",
		fileHeader: "=== CONTENUTO FILE ===",
		maxLength: 10000,
	}
);
```

## Opzioni di Configurazione

### Opzioni di Estrazione

-   `maxLength` (number): Lunghezza massima del contenuto estratto (default: 50000)
-   `includeMetadata` (boolean): Se includere metadati del file (default: true)
-   `format` (string): Formato di output ('text', 'structured', 'markdown')

### Opzioni di Formattazione

-   `promptTemplate` (string): Template per l'arricchimento del prompt
-   `fileHeader` (string): Header per il contenuto dei file
-   `separator` (string): Separatore per file multipli
-   `maxTotalLength` (number): Lunghezza massima totale per file multipli

## Integrazione con Provider AI

### Deepseek

```javascript
// Nel servizio Deepseek
const processedAttachments = await processAttachments(attachments);
// Le immagini vengono inviate come image_url, gli altri file come testo
```

### Altri Provider

```javascript
// Per provider che non supportano allegati binari
const enrichedPrompt = await fileContentExtractor.enrichPromptWithFileContent(
	userPrompt,
	attachments
);
// Invia solo il prompt arricchito
```

## Gestione Errori

Il servizio gestisce automaticamente:

-   **File non trovati**: Errore con messaggio chiaro
-   **Formati non supportati**: Messaggio informativo
-   **Librerie mancanti**: Istruzioni per l'installazione
-   **File corrotti**: Fallback graceful
-   **Limiti di dimensione**: Troncamento intelligente

## Dipendenze Opzionali

Per il supporto completo, installa le seguenti librerie:

```bash
# Per PDF
npm install pdf-parse

# Per documenti Office
npm install mammoth xlsx pptx-text-extract

# Per documenti legacy
npm install textract

# Per OCR futuro
npm install tesseract.js
```

## Best Practices

1. **Gestione asincrona**: Tutti i metodi sono asincroni, usa sempre `await`
2. **Limitazione contenuto**: Imposta sempre `maxLength` appropriato per il provider AI
3. **Gestione errori**: Usa try-catch per gestire errori di estrazione
4. **Caching**: Considera il caching per file grandi o frequentemente utilizzati
5. **Validazione**: Verifica sempre che i file esistano prima dell'estrazione

## Estensibilità

Il servizio è progettato per essere facilmente estendibile:

1. **Nuovi formati**: Aggiungi nuovi MIME types al `supportedFormats`
2. **Nuovi estrattori**: Implementa nuovi metodi di estrazione
3. **Nuovi formati di output**: Estendi `formatContent`
4. **OCR**: Sostituisci `extractImageContent` con implementazione OCR

## Performance

-   **Lazy loading**: Le librerie esterne vengono caricate solo quando necessarie
-   **Streaming**: Supporto per file grandi (da implementare)
-   **Caching**: Possibilità di implementare cache per file frequentemente utilizzati
-   **Parallelizzazione**: Estrazione parallela per file multipli
