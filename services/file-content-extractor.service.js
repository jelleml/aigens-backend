const fs = require('fs').promises;
const path = require('path');
const { Attachment } = require('../database');
const GoogleCloudStorage = require('./google-cloud-storage.service');

/**
 * Servizio per l'estrazione del contenuto da file di diversi formati
 * Supporta l'integrazione con modelli AI aggiungendo il contenuto estratto al prompt
 */
class FileContentExtractorService {
    constructor() {
        // Inizializza il servizio Google Cloud Storage
        this.gcsService = new GoogleCloudStorage();

        this.supportedFormats = {
            // Testo semplice
            'text/plain': this.extractTextContent,
            'text/markdown': this.extractTextContent,
            'text/csv': this.extractTextContent,
            'text/html': this.extractTextContent,

            // Documenti strutturati
            'application/json': this.extractTextContent,
            'application/xml': this.extractTextContent,
            'application/yaml': this.extractTextContent,
            'application/yml': this.extractTextContent,

            // Documenti Office (richiedono librerie esterne)
            'application/pdf': this.extractPdfContent,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': this.extractDocxContent,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': this.extractXlsxContent,
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': this.extractPptxContent,

            // Documenti legacy
            'application/msword': this.extractDocContent,
            'application/vnd.ms-excel': this.extractXlsContent,
            'application/vnd.ms-powerpoint': this.extractPptContent,

            // Immagini (per OCR futuro)
            'image/jpeg': this.extractImageContent,
            'image/png': this.extractImageContent,
            'image/gif': this.extractImageContent,
            'image/webp': this.extractImageContent,
            'image/tiff': this.extractImageContent,
            'image/bmp': this.extractImageContent
        };
    }

    /**
     * Estrae il contenuto da un file e lo formatta per l'uso con modelli AI
     * @param {string|number} attachment - ID dell'allegato o oggetto allegato
     * @param {Object} options - Opzioni di estrazione
     * @param {number} options.maxLength - Lunghezza massima del contenuto estratto (default: 50000)
     * @param {boolean} options.includeMetadata - Se includere metadati del file (default: true)
     * @param {string} options.format - Formato di output ('text', 'structured', 'markdown')
     * @returns {Promise<Object>} Oggetto con contenuto estratto e metadati
     */
    async extractContent(attachment, options = {}) {
        const {
            maxLength = 50000,
            includeMetadata = true,
            format = 'text'
        } = options;

        try {
            // Recupera l'allegato dal database se è un ID
            let attachmentData = attachment;
            if (typeof attachment === 'number') {
                attachmentData = await Attachment.findByPk(attachment);
                if (!attachmentData) {
                    throw new Error(`Allegato con ID ${attachment} non trovato`);
                }
            }

            // Verifica che il file esista
            await this.verifyFileExists(attachmentData.file_path);

            // Determina il tipo di contenuto e il metodo di estrazione
            const extractor = this.supportedFormats[attachmentData.mime_type];
            if (!extractor) {
                throw new Error(`Formato file non supportato: ${attachmentData.mime_type}`);
            }

            // Estrai il contenuto
            const extractedContent = await extractor.call(this, attachmentData.file_path, attachmentData);

            // Trunca il contenuto se necessario
            const truncatedContent = this.truncateContent(extractedContent, maxLength);

            // Formatta il contenuto secondo le opzioni
            const formattedContent = this.formatContent(truncatedContent, format, attachmentData);

            // Prepara il risultato
            const result = {
                content: formattedContent,
                originalLength: extractedContent.length,
                truncated: extractedContent.length > maxLength,
                mimeType: attachmentData.mime_type,
                fileName: attachmentData.original_name,
                fileSize: attachmentData.file_size
            };

            // Aggiungi metadati se richiesto
            if (includeMetadata) {
                result.metadata = {
                    extractionMethod: extractor.name,
                    extractionTimestamp: new Date().toISOString(),
                    filePath: attachmentData.file_path,
                    supportedFormat: true
                };
            }

            return result;

        } catch (error) {
            throw new Error(`Errore nell'estrazione del contenuto: ${error.message}`);
        }
    }

    /**
     * Estrae il contenuto da più file e li combina
     * @param {Array} attachments - Array di allegati
     * @param {Object} options - Opzioni di estrazione
     * @returns {Promise<Object>} Oggetto con contenuto combinato
     */
    async extractMultipleContents(attachments, options = {}) {
        const {
            separator = '\n\n---\n\n',
            maxTotalLength = 100000,
            ...extractionOptions
        } = options;

        const results = [];
        let totalLength = 0;

        for (const attachment of attachments) {
            try {
                const result = await this.extractContent(attachment, extractionOptions);
                results.push(result);
                totalLength += result.content.length;

                // Interrompi se abbiamo raggiunto il limite totale
                if (totalLength > maxTotalLength) {
                    break;
                }
            } catch (error) {
                console.warn(`Errore nell'estrazione dell'allegato: ${error.message}`);
                results.push({
                    content: `[ERRORE: Impossibile estrarre contenuto da ${attachment.original_name || 'file sconosciuto'}]`,
                    error: error.message,
                    fileName: attachment.original_name
                });
            }
        }

        // Combina i contenuti
        const combinedContent = results
            .map(result => result.content)
            .join(separator);

        return {
            content: this.truncateContent(combinedContent, maxTotalLength),
            files: results,
            totalFiles: results.length,
            totalLength: combinedContent.length
        };
    }

    /**
     * Aggiunge il contenuto estratto al prompt dell'utente
     * @param {string} userPrompt - Prompt originale dell'utente
     * @param {string|number|Array} attachments - Allegato/i da processare
     * @param {Object} options - Opzioni di estrazione e formattazione
     * @returns {Promise<string>} Prompt arricchito con il contenuto dei file
     */
    async enrichPromptWithFileContent(userPrompt, attachments, options = {}) {
        const {
            promptTemplate = 'Prompt utente: {userPrompt}\n\nContenuto file:\n{fileContent}',
            fileHeader = '=== CONTENUTO FILE ===',
            ...extractionOptions
        } = options;

        if (!attachments || (Array.isArray(attachments) && attachments.length === 0)) {
            return userPrompt;
        }

        try {
            let fileContent;

            if (Array.isArray(attachments)) {
                const result = await this.extractMultipleContents(attachments, extractionOptions);
                fileContent = `${fileHeader}\n${result.content}`;
            } else {
                const result = await this.extractContent(attachments, extractionOptions);
                fileContent = `${fileHeader}\n${result.content}`;
            }

            return promptTemplate
                .replace('{userPrompt}', userPrompt)
                .replace('{fileContent}', fileContent);

        } catch (error) {
            console.error('Errore nell\'arricchimento del prompt:', error);
            // In caso di errore, restituisci il prompt originale
            return userPrompt;
        }
    }

    /**
     * Determina se un file path è su Google Cloud Storage
     * @param {string} filePath - Percorso del file
     * @returns {boolean} True se il file è su GCS
     */
    isGcsPath(filePath) {
        return filePath.startsWith('gs://') || filePath.startsWith('https://storage.googleapis.com/');
    }

    /**
     * Estrae il bucket e il path da un GCS URL
     * @param {string} gcsPath - Percorso GCS (gs://bucket/path o https://storage.googleapis.com/bucket/path)
     * @returns {Object} Oggetto con bucket e path
     */
    parseGcsPath(gcsPath) {
        if (gcsPath.startsWith('gs://')) {
            const parts = gcsPath.substring(5).split('/');
            const bucket = parts[0];
            const path = parts.slice(1).join('/');
            return { bucket, path };
        } else if (gcsPath.startsWith('https://storage.googleapis.com/')) {
            const parts = gcsPath.substring(30).split('/');
            const bucket = parts[0];
            const path = parts.slice(1).join('/');
            return { bucket, path };
        }
        throw new Error(`Formato GCS path non valido: ${gcsPath}`);
    }

    /**
     * Legge un file da GCS o dal filesystem locale
     * @param {string} filePath - Percorso del file
     * @returns {Promise<Buffer>} Buffer del file
     */
    async readFile(filePath) {
        if (this.isGcsPath(filePath)) {
            // File su Google Cloud Storage
            const { bucket, path } = this.parseGcsPath(filePath);

            try {
                // Usa il servizio GCS configurato con le credenziali corrette
                const buffer = await this.gcsService.downloadFile(bucket, path);
                return buffer;
            } catch (error) {
                throw new Error(`Errore nel download del file da GCS: ${error.message}`);
            }
        } else {
            // File locale
            return await fs.readFile(filePath);
        }
    }

    /**
     * Verifica che un file esista
     * @param {string} filePath - Percorso del file
     * @returns {Promise<void>}
     */
    async verifyFileExists(filePath) {
        if (this.isGcsPath(filePath)) {
            // Verifica esistenza file su GCS
            const { bucket, path } = this.parseGcsPath(filePath);

            try {
                const exists = await this.gcsService.fileExists(bucket, path);
                if (!exists) {
                    throw new Error(`File non trovato su GCS: ${filePath}`);
                }
            } catch (error) {
                throw new Error(`Errore nella verifica del file su GCS: ${error.message}`);
            }
        } else {
            // Verifica esistenza file locale
            try {
                await fs.access(filePath);
            } catch (error) {
                throw new Error(`File non trovato: ${filePath}`);
            }
        }
    }

    /**
 * Estrae contenuto da file di testo
 * @param {string} filePath - Percorso del file
 * @param {Object} attachmentData - Dati dell'allegato
 * @returns {Promise<string>} Contenuto del file
 */
    async extractTextContent(filePath, attachmentData) {
        const buffer = await this.readFile(filePath);

        // Prova a determinare l'encoding
        const encoding = this.detectEncoding(attachmentData.mime_type);

        try {
            return buffer.toString(encoding);
        } catch (error) {
            // Fallback a UTF-8
            return buffer.toString('utf8');
        }
    }

    /**
     * Estrae contenuto da file PDF
     * @param {string} filePath - Percorso del file
     * @param {Object} attachmentData - Dati dell'allegato
     * @returns {Promise<string>} Contenuto del PDF
     */
    async extractPdfContent(filePath, attachmentData) {
        try {
            // Prova a importare pdf-parse dinamicamente
            const pdfParse = require('pdf-parse');
            const buffer = await this.readFile(filePath);
            const data = await pdfParse(buffer);
            return data.text;
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error('Libreria pdf-parse non installata. Installa con: npm install pdf-parse');
            }
            throw new Error(`Errore nell'estrazione del PDF: ${error.message}`);
        }
    }

    /**
     * Estrae contenuto da file DOCX
     * @param {string} filePath - Percorso del file
     * @param {Object} attachmentData - Dati dell'allegato
     * @returns {Promise<string>} Contenuto del DOCX
     */
    async extractDocxContent(filePath, attachmentData) {
        try {
            const mammoth = require('mammoth');
            const buffer = await this.readFile(filePath);
            const result = await mammoth.extractRawText({ buffer });
            return result.value;
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error('Libreria mammoth non installata. Installa con: npm install mammoth');
            }
            throw new Error(`Errore nell'estrazione del DOCX: ${error.message}`);
        }
    }

    /**
 * Estrae contenuto da file XLSX
 * @param {string} filePath - Percorso del file
 * @param {Object} attachmentData - Dati dell'allegato
 * @returns {Promise<string>} Contenuto del XLSX
 */
    async extractXlsxContent(filePath, attachmentData) {
        try {
            const XLSX = require('xlsx');
            const buffer = await this.readFile(filePath);
            const workbook = XLSX.read(buffer, { type: 'buffer' });

            const sheets = [];
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                sheets.push(`Foglio: ${sheetName}\n${jsonData.map(row => row.join('\t')).join('\n')}`);
            }

            return sheets.join('\n\n');
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error('Libreria xlsx non installata. Installa con: npm install xlsx');
            }
            throw new Error(`Errore nell'estrazione del XLSX: ${error.message}`);
        }
    }

    /**
     * Estrae contenuto da file PPTX
     * @param {string} filePath - Percorso del file
     * @param {Object} attachmentData - Dati dell'allegato
     * @returns {Promise<string>} Contenuto del PPTX
     */
    async extractPptxContent(filePath, attachmentData) {
        try {
            const pptxTextParser = require('pptx-text-parser');
            const buffer = await this.readFile(filePath);
            const text = await pptxTextParser(buffer);
            return text;
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error('Libreria pptx-text-parser non installata. Installa con: npm install pptx-text-parser');
            }
            throw new Error(`Errore nell'estrazione del PPTX: ${error.message}`);
        }
    }

    /**
     * Estrae contenuto da file DOC (legacy)
     * @param {string} filePath - Percorso del file
     * @param {Object} attachmentData - Dati dell'allegato
     * @returns {Promise<string>} Contenuto del DOC
     */
    async extractDocContent(filePath, attachmentData) {
        try {
            const textract = require('textract');

            if (this.isGcsPath(filePath)) {
                // Per file su GCS, prima scarica il file temporaneamente
                const buffer = await this.readFile(filePath);
                const tempPath = `/tmp/temp_doc_${Date.now()}.doc`;

                try {
                    await fs.writeFile(tempPath, buffer);
                    return new Promise((resolve, reject) => {
                        textract.fromFileWithPath(tempPath, (error, text) => {
                            // Pulisci il file temporaneo
                            fs.unlink(tempPath).catch(() => { });

                            if (error) reject(error);
                            else resolve(text);
                        });
                    });
                } catch (error) {
                    // Pulisci il file temporaneo in caso di errore
                    fs.unlink(tempPath).catch(() => { });
                    throw error;
                }
            } else {
                // File locale
                return new Promise((resolve, reject) => {
                    textract.fromFileWithPath(filePath, (error, text) => {
                        if (error) reject(error);
                        else resolve(text);
                    });
                });
            }
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error('Libreria textract non installata. Installa con: npm install textract');
            }
            throw new Error(`Errore nell'estrazione del DOC: ${error.message}`);
        }
    }

    /**
     * Estrae contenuto da file XLS (legacy)
     * @param {string} filePath - Percorso del file
     * @param {Object} attachmentData - Dati dell'allegato
     * @returns {Promise<string>} Contenuto del XLS
     */
    async extractXlsContent(filePath, attachmentData) {
        // Usa lo stesso metodo di XLSX
        return this.extractXlsxContent(filePath, attachmentData);
    }

    /**
     * Estrae contenuto da file PPT (legacy)
     * @param {string} filePath - Percorso del file
     * @param {Object} attachmentData - Dati dell'allegato
     * @returns {Promise<string>} Contenuto del PPT
     */
    async extractPptContent(filePath, attachmentData) {
        try {
            const textract = require('textract');

            if (this.isGcsPath(filePath)) {
                // Per file su GCS, prima scarica il file temporaneamente
                const buffer = await this.readFile(filePath);
                const tempPath = `/tmp/temp_ppt_${Date.now()}.ppt`;

                try {
                    await fs.writeFile(tempPath, buffer);
                    return new Promise((resolve, reject) => {
                        textract.fromFileWithPath(tempPath, (error, text) => {
                            // Pulisci il file temporaneo
                            fs.unlink(tempPath).catch(() => { });

                            if (error) reject(error);
                            else resolve(text);
                        });
                    });
                } catch (error) {
                    // Pulisci il file temporaneo in caso di errore
                    fs.unlink(tempPath).catch(() => { });
                    throw error;
                }
            } else {
                // File locale
                return new Promise((resolve, reject) => {
                    textract.fromFileWithPath(filePath, (error, text) => {
                        if (error) reject(error);
                        else resolve(text);
                    });
                });
            }
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error('Libreria textract non installata. Installa con: npm install textract');
            }
            throw new Error(`Errore nell'estrazione del PPT: ${error.message}`);
        }
    }

    /**
     * Estrae contenuto da immagini (placeholder per OCR futuro)
     * @param {string} filePath - Percorso del file
     * @param {Object} attachmentData - Dati dell'allegato
     * @returns {Promise<string>} Descrizione dell'immagine
     */
    async extractImageContent(filePath, attachmentData) {
        // Per ora restituisce una descrizione generica
        // In futuro si può implementare OCR con librerie come tesseract.js
        return `[IMMAGINE: ${attachmentData.original_name} - Contenuto non ancora estratto tramite OCR]`;
    }

    /**
     * Determina l'encoding appropriato per un tipo MIME
     * @param {string} mimeType - Tipo MIME del file
     * @returns {string} Encoding da utilizzare
     */
    detectEncoding(mimeType) {
        // Per ora usa sempre UTF-8, ma si può estendere per supportare altri encoding
        return 'utf8';
    }

    /**
     * Tronca il contenuto se supera la lunghezza massima
     * @param {string} content - Contenuto da troncare
     * @param {number} maxLength - Lunghezza massima
     * @returns {string} Contenuto troncato
     */
    truncateContent(content, maxLength) {
        if (content.length <= maxLength) {
            return content;
        }

        const truncated = content.substring(0, maxLength);
        return `${truncated}\n\n[CONTENUTO TRONCATO - Lunghezza originale: ${content.length} caratteri]`;
    }

    /**
     * Formatta il contenuto secondo il formato richiesto
     * @param {string} content - Contenuto da formattare
     * @param {string} format - Formato di output
     * @param {Object} attachmentData - Dati dell'allegato
     * @returns {string} Contenuto formattato
     */
    formatContent(content, format, attachmentData) {
        switch (format) {
            case 'markdown':
                return this.formatAsMarkdown(content, attachmentData);
            case 'structured':
                return this.formatAsStructured(content, attachmentData);
            case 'text':
            default:
                return content;
        }
    }

    /**
     * Formatta il contenuto come Markdown
     * @param {string} content - Contenuto da formattare
     * @param {Object} attachmentData - Dati dell'allegato
     * @returns {string} Contenuto in formato Markdown
     */
    formatAsMarkdown(content, attachmentData) {
        const extension = path.extname(attachmentData.original_name).toLowerCase();
        let language = 'text';

        // Determina il linguaggio per il code block
        switch (extension) {
            case '.json': language = 'json'; break;
            case '.xml': language = 'xml'; break;
            case '.yaml': case '.yml': language = 'yaml'; break;
            case '.md': language = 'markdown'; break;
            case '.csv': language = 'csv'; break;
            case '.html': language = 'html'; break;
            case '.js': language = 'javascript'; break;
            case '.py': language = 'python'; break;
            case '.java': language = 'java'; break;
            case '.cpp': language = 'cpp'; break;
            case '.c': language = 'c'; break;
            case '.php': language = 'php'; break;
            case '.rb': language = 'ruby'; break;
            case '.go': language = 'go'; break;
            case '.rs': language = 'rust'; break;
            case '.sql': language = 'sql'; break;
        }

        return `# File: ${attachmentData.original_name}\n\n\`\`\`${language}\n${content}\n\`\`\``;
    }

    /**
     * Formatta il contenuto in modo strutturato
     * @param {string} content - Contenuto da formattare
     * @param {Object} attachmentData - Dati dell'allegato
     * @returns {string} Contenuto strutturato
     */
    formatAsStructured(content, attachmentData) {
        return `FILE: ${attachmentData.original_name}\nTIPO: ${attachmentData.mime_type}\nDIMENSIONE: ${attachmentData.file_size} bytes\n\nCONTENUTO:\n${content}`;
    }

    /**
     * Verifica se un tipo MIME è supportato
     * @param {string} mimeType - Tipo MIME da verificare
     * @returns {boolean} True se supportato
     */
    isSupported(mimeType) {
        return this.supportedFormats.hasOwnProperty(mimeType);
    }

    /**
     * Ottiene la lista dei formati supportati
     * @returns {Object} Oggetto con i formati supportati
     */
    getSupportedFormats() {
        return Object.keys(this.supportedFormats);
    }
}

// Esporta un'istanza singleton
module.exports = new FileContentExtractorService(); 