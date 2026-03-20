# Design: Correzione Flusso Event Stream per Ideogram

## Analisi del Problema

### Stato Attuale

Il servizio Ideogram attualmente:

1. Processa la richiesta in modo sincrono
2. Scarica le immagini direttamente su GCS
3. Non invia eventi al frontend durante il processo
4. Restituisce il risultato solo al completamento

### Problemi Identificati

1. **Mancanza di Event Stream**: Il frontend non riceve aggiornamenti in tempo reale
2. **Gestione File Non Ottimale**: Le immagini vengono caricate direttamente su GCS senza gestione temporanea
3. **Errore GCS**: L'errore `ERR_OSSL_UNSUPPORTED` indica problemi con le credenziali GCS

## Soluzione Proposta

### 1. Modifica del Servizio Ideogram

#### Nuovo Metodo `sendRequestWithStreaming`

```javascript
const sendRequestWithStreaming = async (
	prompt,
	model,
	userId,
	chatId,
	agentType,
	attachmentIds,
	onStream,
	sendEvent
) => {
	// Fase 1: Inizializzazione
	sendEvent("process_started", {
		message: "Inizializzazione generazione immagine...",
	});

	// Fase 2: Generazione immagine
	sendEvent("delta", { text: "Generazione immagine in corso..." });
	const ideogramResponse = await callIdeogramAPI(prompt, model);

	// Fase 3: Download temporaneo
	sendEvent("delta", { text: "Download immagine..." });
	const tempImages = await downloadImagesToTemp(ideogramResponse.images);

	// Fase 4: Upload su GCS
	sendEvent("delta", { text: "Caricamento su cloud storage..." });
	const finalImages = await uploadImagesToGCS(tempImages);

	// Fase 5: Completamento
	sendEvent("completed", {
		text: `Immagine generata con successo!`,
		images: finalImages,
	});

	return { success: true, images: finalImages };
};
```

#### Modifica del Metodo `sendRequest` Esistente

```javascript
const sendRequest = async (prompt, model, userId, chatId, agentType = 'image', attachmentIds = [], onStream = null) => {
    // Se onStream è fornito, usa il nuovo metodo streaming
    if (onStream) {
        return await sendRequestWithStreaming(prompt, model, userId, chatId, agentType, attachmentIds, onStream);
    }

    // Altrimenti, usa il metodo esistente per compatibilità
    return await processIdeogramRequest({...});
};
```

### 2. Gestione File Temporanei

#### Nuova Funzione `downloadImagesToTemp`

```javascript
const downloadImagesToTemp = async (imageUrls, userId, chatId) => {
	const tempImages = [];

	for (let i = 0; i < imageUrls.length; i++) {
		const imageUrl = imageUrls[i];
		const tempFileName = `temp-${Date.now()}-${i}-${userId}-${chatId}.png`;
		const tempPath = path.join(
			process.cwd(),
			"uploads",
			"images",
			tempFileName
		);

		// Download e salvataggio temporaneo
		const imageBuffer = await downloadImage(imageUrl);
		await fs.writeFile(tempPath, imageBuffer);

		tempImages.push({
			tempPath,
			tempFileName,
			originalUrl: imageUrl,
			index: i,
		});
	}

	return tempImages;
};
```

#### Nuova Funzione `uploadImagesToGCS`

```javascript
const uploadImagesToGCS = async (tempImages, userId, chatId) => {
	const finalImages = [];

	for (const tempImage of tempImages) {
		try {
			// Upload su GCS
			const gcsResult = await gcsService.uploadFileFromPath(
				tempImage.tempPath,
				`ideogram-${tempImage.index + 1}.png`,
				{
					folder: `chat_${chatId}`,
					contentType: "image/png",
					metadata: {
						userId: userId.toString(),
						chatId: chatId.toString(),
						originalUrl: tempImage.originalUrl,
					},
				}
			);

			finalImages.push(gcsResult);

			// Cleanup file temporaneo
			await fs.unlink(tempImage.tempPath);
		} catch (error) {
			// Se GCS fallisce, mantieni il file locale
			logger.warn(
				`GCS upload failed for ${tempImage.tempFileName}, keeping local file`
			);
			finalImages.push({
				filePath: tempImage.tempPath,
				fileName: tempImage.tempFileName,
				storageType: "local",
			});
		}
	}

	return finalImages;
};
```

### 3. Integrazione con Messages API

#### Modifica in `messages.js`

```javascript
// Nel blocco di gestione Ideogram
if (modelInstance.provider?.name === "ideogram") {
	sendEvent("process_started", {
		message: "Inizializzazione generazione immagine...",
	});

	try {
		const result = await ideogramService.sendRequest(
			content,
			model_id,
			userId,
			chat_id,
			agent_type,
			savedAttachmentIds,
			(chunk, usage) => {
				if (chunk) {
					sendEvent("delta", { text: chunk });
				}
			},
			image_options,
			sendEvent // Passa la funzione sendEvent
		);

		if (result.success) {
			sendEvent("completed", {
				text: result.message,
				images: result.images,
			});
		} else {
			sendEvent("error", { error: result.error });
		}
	} catch (error) {
		sendEvent("error", { error: error.message });
	}
}
```

### 4. Gestione Errori e Cleanup

#### Funzione di Cleanup

```javascript
const cleanupTempFiles = async (tempImages) => {
	for (const tempImage of tempImages) {
		try {
			await fs.unlink(tempImage.tempPath);
		} catch (error) {
			logger.warn(
				`Failed to cleanup temp file ${tempImage.tempPath}:`,
				error
			);
		}
	}
};
```

#### Gestione Errori Migliorata

```javascript
try {
	// Processo di generazione
} catch (error) {
	// Cleanup file temporanei
	await cleanupTempFiles(tempImages);

	// Invia evento di errore
	sendEvent("error", {
		error: "Errore durante la generazione",
		details: error.message,
	});

	throw error;
}
```

## Struttura delle Modifiche

### File da Modificare

1. `services/ideogram.service.js`

    - Aggiungere `sendRequestWithStreaming`
    - Modificare `sendRequest` per supportare streaming
    - Aggiungere funzioni per gestione file temporanei

2. `api/v1/messages.js`
    - Modificare la gestione di Ideogram per supportare event stream
    - Passare la funzione `sendEvent` al servizio

### Nuove Funzioni

1. `downloadImagesToTemp` - Download temporaneo
2. `uploadImagesToGCS` - Upload su GCS
3. `cleanupTempFiles` - Pulizia file temporanei
4. `sendRequestWithStreaming` - Nuovo metodo streaming

## Vantaggi della Soluzione

1. **Event Stream Completo**: Il frontend riceve aggiornamenti in tempo reale
2. **Gestione File Ottimale**: File temporanei con cleanup automatico
3. **Robustezza**: Gestione errori migliorata con rollback
4. **Compatibilità**: Mantiene la compatibilità con l'API esistente
5. **Debugging**: Logging dettagliato per troubleshooting

## Considerazioni di Sicurezza

1. **File Temporanei**: Utilizzare nomi univoci per evitare conflitti
2. **Cleanup**: Pulizia automatica dei file temporanei
3. **Validazione**: Validazione dei file scaricati
4. **Timeout**: Timeout appropriati per le operazioni di rete
