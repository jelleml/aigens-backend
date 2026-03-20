/**
 * Esempio di utilizzo del FileContentExtractorService
 * 
 * Questo file mostra come utilizzare il servizio per estrarre contenuto
 * da diversi tipi di file e integrarlo con i provider AI.
 */

const fileContentExtractor = require('../services/file-content-extractor.service');

/**
 * Esempio 1: Estrazione base da un singolo file
 */
async function exampleBasicExtraction() {
    console.log('=== Esempio 1: Estrazione Base ===');

    try {
        // Simula un allegato dal database
        const mockAttachment = {
            id: 1,
            original_name: 'documento.txt',
            mime_type: 'text/plain',
            file_path: './test-files/sample.txt',
            file_size: 1024
        };

        const result = await fileContentExtractor.extractContent(mockAttachment, {
            maxLength: 10000,
            includeMetadata: true,
            format: 'text'
        });

        console.log('Contenuto estratto:', result.content);
        console.log('Metadati:', result.metadata);
        console.log('Lunghezza originale:', result.originalLength);
        console.log('Troncato:', result.truncated);
    } catch (error) {
        console.error('Errore nell\'estrazione:', error.message);
    }
}

/**
 * Esempio 2: Estrazione da più file
 */
async function exampleMultipleExtraction() {
    console.log('\n=== Esempio 2: Estrazione Multipla ===');

    try {
        const mockAttachments = [
            {
                id: 1,
                original_name: 'config.json',
                mime_type: 'application/json',
                file_path: './test-files/config.json',
                file_size: 512
            },
            {
                id: 2,
                original_name: 'readme.md',
                mime_type: 'text/markdown',
                file_path: './test-files/readme.md',
                file_size: 2048
            }
        ];

        const result = await fileContentExtractor.extractMultipleContents(mockAttachments, {
            separator: '\n\n---\n\n',
            maxTotalLength: 50000,
            maxLength: 10000
        });

        console.log('Contenuto combinato:', result.content);
        console.log('Numero di file:', result.totalFiles);
        console.log('Lunghezza totale:', result.totalLength);
    } catch (error) {
        console.error('Errore nell\'estrazione multipla:', error.message);
    }
}

/**
 * Esempio 3: Arricchimento del prompt
 */
async function examplePromptEnrichment() {
    console.log('\n=== Esempio 3: Arricchimento Prompt ===');

    try {
        const userPrompt = "Analizza questo codice e suggerisci miglioramenti";
        const mockAttachments = [
            {
                id: 1,
                original_name: 'main.js',
                mime_type: 'application/javascript',
                file_path: './test-files/main.js',
                file_size: 1536
            }
        ];

        const enrichedPrompt = await fileContentExtractor.enrichPromptWithFileContent(
            userPrompt,
            mockAttachments,
            {
                promptTemplate: 'Prompt utente: {userPrompt}\n\nContenuto file:\n{fileContent}',
                fileHeader: '=== CONTENUTO FILE ===',
                maxLength: 10000
            }
        );

        console.log('Prompt arricchito:', enrichedPrompt);
    } catch (error) {
        console.error('Errore nell\'arricchimento del prompt:', error.message);
    }
}

/**
 * Esempio 4: Integrazione con provider AI
 */
async function exampleAIProviderIntegration() {
    console.log('\n=== Esempio 4: Integrazione Provider AI ===');

    try {
        const userPrompt = "Analizza questi dati e crea un report";
        const mockAttachments = [
            {
                id: 1,
                original_name: 'data.csv',
                mime_type: 'text/csv',
                file_path: './test-files/data.csv',
                file_size: 3072
            },
            {
                id: 2,
                original_name: 'chart.png',
                mime_type: 'image/png',
                file_path: './test-files/chart.png',
                file_size: 4096
            }
        ];

        // Per provider che supportano solo testo (es. GPT-3.5)
        const textOnlyPrompt = await fileContentExtractor.enrichPromptWithFileContent(
            userPrompt,
            mockAttachments,
            { maxLength: 8000 }
        );

        console.log('Prompt per provider solo testo:', textOnlyPrompt);

        // Per provider che supportano immagini (es. GPT-4 Vision)
        const imageAttachments = mockAttachments.filter(att => att.mime_type.startsWith('image/'));
        const nonImageAttachments = mockAttachments.filter(att => !att.mime_type.startsWith('image/'));

        let visionPrompt = userPrompt;
        if (nonImageAttachments.length > 0) {
            visionPrompt = await fileContentExtractor.enrichPromptWithFileContent(
                userPrompt,
                nonImageAttachments,
                { maxLength: 8000 }
            );
        }

        console.log('Prompt per provider con visione:', visionPrompt);
        console.log('Allegati immagine:', imageAttachments.length);
    } catch (error) {
        console.error('Errore nell\'integrazione provider:', error.message);
    }
}

/**
 * Esempio 5: Gestione errori
 */
async function exampleErrorHandling() {
    console.log('\n=== Esempio 5: Gestione Errori ===');

    try {
        const mockAttachments = [
            {
                id: 1,
                original_name: 'file.pdf',
                mime_type: 'application/pdf',
                file_path: './test-files/non-existent.pdf',
                file_size: 1024
            },
            {
                id: 2,
                original_name: 'unknown.xyz',
                mime_type: 'application/unknown',
                file_path: './test-files/unknown.xyz',
                file_size: 512
            }
        ];

        for (const attachment of mockAttachments) {
            try {
                const result = await fileContentExtractor.extractContent(attachment);
                console.log(`✅ Estrazione riuscita per ${attachment.original_name}`);
            } catch (error) {
                console.log(`❌ Errore per ${attachment.original_name}: ${error.message}`);
            }
        }
    } catch (error) {
        console.error('Errore generale:', error.message);
    }
}

/**
 * Esempio 6: Verifica formati supportati
 */
async function exampleSupportedFormats() {
    console.log('\n=== Esempio 6: Formati Supportati ===');

    const testFormats = [
        'text/plain',
        'text/markdown',
        'application/json',
        'application/pdf',
        'image/jpeg',
        'application/unknown'
    ];

    console.log('Formati supportati dal servizio:');
    for (const format of testFormats) {
        const isSupported = fileContentExtractor.isSupported(format);
        console.log(`${format}: ${isSupported ? '✅' : '❌'}`);
    }

    console.log('\nTutti i formati supportati:', fileContentExtractor.getSupportedFormats());
}

/**
 * Funzione principale per eseguire tutti gli esempi
 */
async function runExamples() {
    console.log('🚀 Avvio esempi FileContentExtractorService\n');

    await exampleBasicExtraction();
    await exampleMultipleExtraction();
    await examplePromptEnrichment();
    await exampleAIProviderIntegration();
    await exampleErrorHandling();
    await exampleSupportedFormats();

    console.log('\n✅ Tutti gli esempi completati!');
}

// Esegui gli esempi se il file viene chiamato direttamente
if (require.main === module) {
    runExamples().catch(console.error);
}

module.exports = {
    exampleBasicExtraction,
    exampleMultipleExtraction,
    examplePromptEnrichment,
    exampleAIProviderIntegration,
    exampleErrorHandling,
    exampleSupportedFormats,
    runExamples
}; 