# Integrazione Google Veo - Design

## Analisi dell'Architettura Esistente

### Pattern dei Servizi
Dall'analisi dei servizi esistenti (ideogram.service.js, anthropic.service.js), ho identificato i seguenti pattern:

1. **Struttura del servizio**:
   - Importazione delle dipendenze (database, config, logging)
   - Inizializzazione dei servizi di supporto (CostCalculator, GoogleCloudStorage)
   - Funzioni per la gestione dei modelli disponibili
   - Funzioni per il calcolo dei costi
   - Funzioni per la gestione dei fondi utente
   - Funzioni per il salvataggio di messaggi e attachment
   - Funzione principale per l'elaborazione delle richieste

2. **Gestione degli event stream**:
   - Callback `onStream` per comunicare lo stato al frontend
   - Gestione degli eventi di progresso
   - Gestione degli errori con eventi appropriati

3. **Integrazione con il database**:
   - Salvataggio dei messaggi
   - Salvataggio degli attachment
   - Salvataggio dei costi
   - Aggiornamento del wallet

## Piano di Implementazione

### 1. Creazione del Servizio Google Veo

#### File: `services/google-veo.service.js`

**Struttura del servizio**:
```javascript
const { GoogleGenerativeAI } = require('@google/genai');
const db = require("../database");
const config = require("../config/config");
const CostCalculator = require('./cost-calculator.service');
const GoogleCloudStorage = require('./google-cloud-storage.service');
const { getLogger } = require('./logging');

const logger = getLogger('google-veo', 'service');
```

**Funzioni principali**:
- `getGoogleVeoProviderId()`: Recupera l'ID del provider Google Veo dal database
- `fetchAvailableModels()`: Recupera i modelli disponibili
- `calculateCost()`: Calcola il costo della generazione (placeholder per ora)
- `checkUserFunds()`: Verifica i fondi dell'utente
- `saveMessage()`: Salva il messaggio nel database
- `saveAttachment()`: Salva l'attachment video
- `saveMessageCost()`: Salva i costi del messaggio
- `updateWalletBalance()`: Aggiorna il wallet dell'utente
- `downloadAndSaveVideo()`: Scarica e salva il video
- `processGoogleVeoRequest()`: Elabora la richiesta principale
- `sendRequest()`: Invia la richiesta a Google Veo

### 2. Integrazione con l'API

#### File: `api/v1/messages.js`

**Modifiche necessarie**:
- Aggiungere l'import del servizio Google Veo
- Aggiungere la gestione del tipo di agente 'video' nella funzione `sendMessage`
- Integrare la chiamata al servizio Google Veo nel flusso esistente

### 3. Configurazione del Database

#### Provider Google Veo
- Aggiungere il provider "google-veo" nella tabella `providers`
- Configurare i modelli disponibili nella tabella `models`

#### Modelli di Video
- Creare modelli per i diversi tipi di video supportati da Google Veo
- Configurare le capabilities appropriate

### 4. Gestione degli Event Stream

**Eventi da implementare**:
- `video-generation-started`: Inizio della generazione
- `video-generation-progress`: Progresso della generazione
- `video-generation-completed`: Completamento con URL del video
- `video-generation-error`: Errore durante la generazione

### 5. Gestione dei File Video

**Strategia di storage**:
- Utilizzare Google Cloud Storage per i file video
- Generare URL firmati per l'accesso frontend
- Salvare i metadati nel database

### 6. Integrazione con il Sistema di Logging

**Logging centralizzato**:
- Utilizzare il sistema di logging esistente
- Loggare le operazioni di generazione video
- Loggare errori e performance

## Struttura delle API

### Endpoint per la Generazione Video
```
POST /api/v1/messages
{
  "chatId": "chat-id",
  "content": "prompt per il video",
  "agentType": "video",
  "modelId": "google-veo-model-id"
}
```

### Response con Event Stream
```
data: {"type": "video-generation-started", "data": {...}}
data: {"type": "video-generation-progress", "data": {"progress": 50}}
data: {"type": "video-generation-completed", "data": {"videoUrl": "..."}}
```

## Gestione degli Errori

### Errori Comuni
- API key non valida
- Limiti di rate limit
- Errori di rete
- Errori di generazione video
- Errori di storage

### Strategia di Fallback
- Retry automatico per errori temporanei
- Fallback a messaggio di errore per errori permanenti
- Logging dettagliato per debugging

## Compatibilità con l'Architettura Esistente

### Sistema di Wallet
- Integrazione con il sistema di costi esistente
- Verifica fondi prima della generazione
- Aggiornamento del wallet dopo la generazione

### Sistema di Attachment
- Supporto per file video negli attachment
- Gestione dei metadati video
- Integrazione con Google Cloud Storage

### Sistema di Logging
- Utilizzo del logger centralizzato
- Logging delle operazioni di generazione
- Logging degli errori e performance

## Note di Implementazione

1. **API Key**: Utilizzare `GOOGLE_GEMINI_KEY` dal file `.env`
2. **Modelli**: Configurare i modelli Google Veo nel database
3. **Storage**: Utilizzare Google Cloud Storage per i file video
4. **Event Stream**: Implementare gli eventi di progresso
5. **Error Handling**: Gestire tutti i possibili errori
6. **Testing**: Creare test per il servizio

## Prossimi Passi

1. Creare il servizio Google Veo
2. Integrare con l'API messages
3. Configurare il database
4. Implementare la gestione degli event stream
5. Testare l'integrazione
6. Documentare l'uso
