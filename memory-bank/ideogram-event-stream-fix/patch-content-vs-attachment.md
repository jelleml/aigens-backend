# Patch: Content vs Attachment per Ideogram

## Problema Identificato

### **1. Event Stream Non Attivato**

-   `sendEvent` era `null` perché non veniva passato correttamente
-   Il flusso event stream non veniva attivato per Ideogram

### **2. Immagini Salvate Come Attachment**

-   Le immagini venivano salvate come `Attachment` separati
-   Dovrebbero essere parte del `content` del messaggio per essere renderizzate correttamente
-   Il frontend si aspettava immagini nel content, non come attachment

## Soluzione Implementata

### **1. Fix Event Stream**

-   ✅ **Passaggio Corretto**: `sendEvent` viene passato correttamente al servizio Ideogram
-   ✅ **Eventi Streaming**: Implementati eventi `process_started`, `delta`, `completed`, `error`
-   ✅ **Logging Dettagliato**: Tracciamento di tutte le fasi del processo

### **2. Fix Content vs Attachment**

#### **Prima (Sbagliato)**

```javascript
// Salvava come Attachment separato
const attachment = await saveAttachment({
	message_id: assistantMessage.id,
	file_name: finalImage.fileName,
	// ...
});

// Content del messaggio senza immagini
const assistantResponse = "Ecco l'immagine generata...";
```

#### **Dopo (Corretto)**

```javascript
// Salva immagini nel content del messaggio
const imageUrlsInContent = finalImages.map((img) => img.downloadUrl).join("\n");
const assistantResponse = `Ecco l'immagine generata...\n\n${imageUrlsInContent}`;

const assistantMessage = await saveMessage({
	content: assistantResponse,
	media_type: "image",
	media_url: imageUrlsInContent,
});
```

### **3. Struttura Messaggio Aggiornata**

#### **Modello Message.js**

```javascript
{
    content: "Ecco l'immagine generata...\n\n/api/v1/uploads/images/temp-1234567890-ideogram-1.png",
    media_type: 'image',
    media_url: "/api/v1/uploads/images/temp-1234567890-ideogram-1.png",
    agent_type: 'image',
    agent_model: 'ideogram-v2'
}
```

#### **Eventi Streaming**

```javascript
// Fase 1: Inizializzazione
sendEvent("process_started", {
	message: "Inizializzazione generazione immagine...",
});

// Fase 2: Verifica modello
sendEvent("delta", { text: "Verifica modello e calcolo costi..." });

// Fase 3: Generazione
sendEvent("delta", { text: "Generazione immagine in corso..." });

// Fase 4: Download
sendEvent("delta", { text: "Download immagini..." });

// Fase 5: Upload
sendEvent("delta", { text: "Caricamento su cloud storage..." });

// Fase 6: Salvataggio
sendEvent("delta", { text: "Salvataggio messaggi e allegati..." });

// Fase 7: Completamento
sendEvent("completed", {
	text: assistantResponse,
	images: finalImages.map((img) => ({
		downloadUrl: img.downloadUrl,
		publicUrl: img.publicUrl,
		fileName: img.fileName,
		fileSize: img.size,
		contentType: img.contentType,
		storageType: img.storageType,
	})),
});
```

## File Modificati

### **Core Services**

-   `services/ideogram.service.js`:
    -   ✅ Rimosso salvataggio come Attachment
    -   ✅ Aggiunto salvataggio nel content del messaggio
    -   ✅ Implementato event stream completo
    -   ✅ Aggiornato return format per compatibilità

### **API Layer**

-   `api/v1/messages.js`:
    -   ✅ Passaggio corretto di `sendEvent` a Ideogram
    -   ✅ Gestione speciale per provider 'ideogram'

## Vantaggi della Soluzione

### **1. Event Stream Completo**

-   ✅ **Real-time Updates**: Frontend riceve aggiornamenti in tempo reale
-   ✅ **Feedback Visivo**: Utente vede progresso durante generazione
-   ✅ **Gestione Errori**: Eventi di errore appropriati

### **2. Content vs Attachment**

-   ✅ **Renderizzazione Corretta**: Immagini nel content del messaggio
-   ✅ **Compatibilità Frontend**: Formato atteso dal frontend
-   ✅ **Semantica Corretta**: Immagini sono parte del messaggio, non allegati

### **3. Robustezza**

-   ✅ **Fallback Locale**: Immagini accessibili anche se GCS fallisce
-   ✅ **Cleanup Automatico**: Rimozione file temporanei
-   ✅ **Logging Dettagliato**: Tracciamento completo del processo

## Testing

### **Test Event Stream**

```bash
# Testa generazione immagine con event stream
curl -X POST http://localhost:5555/api/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "create an image", "id_model": "85"}'
```

### **Verifica Content**

```sql
-- Verifica che le immagini siano nel content
SELECT content, media_type, media_url
FROM messages
WHERE agent_type = 'image'
ORDER BY created_at DESC
LIMIT 1;
```

### **Verifica Nessun Attachment**

```sql
-- Verifica che non ci siano attachment per messaggi immagine
SELECT m.id, m.content, COUNT(a.id) as attachment_count
FROM messages m
LEFT JOIN attachments a ON m.id = a.message_id
WHERE m.agent_type = 'image'
GROUP BY m.id
HAVING attachment_count = 0;
```

## Risultato Finale

✅ **Event Stream Funzionante**: `sendEvent` viene passato correttamente
✅ **Content Corretto**: Immagini salvate nel content del messaggio
✅ **Nessun Attachment**: Non vengono più creati attachment separati
✅ **Frontend Compatibile**: Formato atteso dal frontend
✅ **Logging Completo**: Tracciamento dettagliato del processo

La patch è **completa e funzionante**! 🎉
