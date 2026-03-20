# API Documentation - AIGens Backend

## Panoramica

Questa documentazione descrive le API disponibili nel backend AIGens, inclusa l'integrazione con Google Veo per la generazione video.

## Autenticazione

Tutte le API richiedono autenticazione tramite token Bearer nell'header `Authorization`.

```
Authorization: Bearer <your_token_here>
```

## Endpoints

### 1. Generazione Contenuti

#### POST /api/v1/chats/:chatId/messages

Genera contenuti testuali, immagini o video in base al tipo di agente specificato.

**Parametri URL:**
- `chatId` (number): ID della chat

**Body della richiesta:**
```json
{
    "content": "Il prompt per la generazione",
    "model_id": 1,
    "agent_type": "text|image|video"
}
```

**Parametri:**
- `content` (string, required): Il prompt per la generazione
- `model_id` (number, required): ID del modello da utilizzare
- `agent_type` (string, required): Tipo di agente (`text`, `image`, `video`)

**Risposta di successo (200):**
```json
{
    "success": true,
    "messageId": 123,
    "content": "Risposta generata",
    "modelId": 1,
    "cost": 0.01
}
```

**Risposta per video (200):**
```json
{
    "success": true,
    "messageId": 123,
    "videoUrl": "https://storage.googleapis.com/...",
    "attachmentId": 456,
    "cost": 0.01
}
```

**Risposta per immagini (200):**
```json
{
    "success": true,
    "messageId": 123,
    "imageUrl": "https://storage.googleapis.com/...",
    "attachmentId": 456,
    "cost": 0.02
}
```

**Errori comuni:**
- `400`: Parametri mancanti o non validi
- `401`: Non autorizzato
- `402`: Fondi insufficienti
- `404`: Chat non trovata
- `500`: Errore interno del server

### 2. Modelli Disponibili

#### GET /api/v1/models

Recupera la lista dei modelli disponibili, inclusi i modelli Google Veo.

**Risposta di successo (200):**
```json
{
    "models": [
        {
            "id": 1,
            "name": "GPT-4",
            "provider": {
                "name": "openai"
            },
            "capabilities": ["text-generation"],
            "is_active": true
        },
        {
            "id": 2,
            "name": "Google Veo 1.0",
            "provider": {
                "name": "google-veo"
            },
            "capabilities": ["video-generation"],
            "is_active": true
        },
        {
            "id": 3,
            "name": "Ideogram",
            "provider": {
                "name": "ideogram"
            },
            "capabilities": ["image-generation"],
            "is_active": true
        }
    ]
}
```

### 3. Gestione Chat

#### GET /api/v1/chats

Recupera la lista delle chat dell'utente.

**Risposta di successo (200):**
```json
{
    "chats": [
        {
            "id": 1,
            "title": "Chat di esempio",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z"
        }
    ]
}
```

#### POST /api/v1/chats

Crea una nuova chat.

**Body della richiesta:**
```json
{
    "title": "Nuova chat"
}
```

**Risposta di successo (201):**
```json
{
    "id": 2,
    "title": "Nuova chat",
    "created_at": "2024-01-01T00:00:00Z"
}
```

#### GET /api/v1/chats/:chatId/messages

Recupera i messaggi di una chat specifica.

**Parametri URL:**
- `chatId` (number): ID della chat

**Risposta di successo (200):**
```json
{
    "messages": [
        {
            "id": 1,
            "content": "Messaggio utente",
            "role": "user",
            "created_at": "2024-01-01T00:00:00Z"
        },
        {
            "id": 2,
            "content": "Risposta AI",
            "role": "assistant",
            "created_at": "2024-01-01T00:00:00Z",
            "attachments": [
                {
                    "id": 1,
                    "file_type": "video",
                    "file_name": "video_123.mp4",
                    "file_path": "https://storage.googleapis.com/..."
                }
            ]
        }
    ]
}
```

### 4. Gestione Wallet

#### GET /api/v1/wallet

Recupera il saldo del wallet dell'utente.

**Risposta di successo (200):**
```json
{
    "balance": 100.50,
    "currency": "EUR"
}
```

#### POST /api/v1/wallet/recharge

Ricarica il wallet.

**Body della richiesta:**
```json
{
    "amount": 50.00
}
```

**Risposta di successo (200):**
```json
{
    "success": true,
    "new_balance": 150.50
}
```

## Tipi di Agenti

### 1. Text Agent (`agent_type: "text"`)

Genera contenuti testuali utilizzando modelli come GPT-4, Claude, etc.

**Modelli supportati:**
- OpenAI: GPT-4, GPT-3.5-turbo
- Anthropic: Claude-3, Claude-2
- DeepSeek: DeepSeek-Coder
- Together: Llama-2, Mistral

### 2. Image Agent (`agent_type: "image"`)

Genera immagini utilizzando modelli come Ideogram, DALL-E, etc.

**Modelli supportati:**
- Ideogram: Ideogram XL, Ideogram Pro
- OpenAI: DALL-E 3
- Midjourney (tramite proxy)

### 3. Video Agent (`agent_type: "video"`)

Genera video utilizzando Google Veo.

**Modelli supportati:**
- Google Veo 1.0: Generazione video base
- Google Veo 2.0: Generazione video avanzata

## Event Stream

Per le richieste di generazione video, il server supporta event stream per comunicare lo stato di avanzamento.

### Eventi Video

```javascript
// Esempio di gestione eventi
const eventSource = new EventSource('/api/v1/chats/123/messages/stream');

eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
        case 'video-generation-started':
            console.log('🚀 Generazione video iniziata');
            break;
        case 'video-generation-progress':
            console.log(`📊 Progresso: ${data.data.progress}%`);
            break;
        case 'video-generation-completed':
            console.log('✅ Generazione video completata');
            console.log('Video URL:', data.data.videoUrl);
            break;
        case 'video-generation-error':
            console.log('❌ Errore:', data.data.error);
            break;
    }
};
```

## Gestione Errori

### Codici di Errore

- `400 Bad Request`: Parametri mancanti o non validi
- `401 Unauthorized`: Token di autenticazione mancante o non valido
- `402 Payment Required`: Fondi insufficienti nel wallet
- `403 Forbidden`: Accesso negato
- `404 Not Found`: Risorsa non trovata
- `429 Too Many Requests`: Rate limit superato
- `500 Internal Server Error`: Errore interno del server

### Formato Errori

```json
{
    "error": "Descrizione dell'errore",
    "code": "ERROR_CODE",
    "details": {
        "field": "Dettagli aggiuntivi"
    }
}
```

## Rate Limiting

### Limiti per Utente

- **Text Generation**: 100 richieste/minuto
- **Image Generation**: 20 richieste/minuto
- **Video Generation**: 10 richieste/minuto

### Headers di Rate Limit

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Costi

### Struttura Prezzi

- **Text Generation**: 0.001-0.01 EUR per 1K token
- **Image Generation**: 0.02-0.05 EUR per immagine
- **Video Generation**: 0.01-0.02 EUR per video

### Calcolo Costi

I costi vengono calcolati automaticamente in base a:
- Modello utilizzato
- Dimensione del prompt
- Dimensione della risposta (per testi)
- Qualità richiesta (per immagini/video)

## Esempi di Utilizzo

### Esempio 1: Generazione Testo

```bash
curl -X POST http://localhost:3000/api/v1/chats/123/messages \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Spiega la teoria della relatività",
    "model_id": 1,
    "agent_type": "text"
  }'
```

### Esempio 2: Generazione Immagine

```bash
curl -X POST http://localhost:3000/api/v1/chats/123/messages \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Un gatto che gioca con una palla",
    "model_id": 5,
    "agent_type": "image"
  }'
```

### Esempio 3: Generazione Video

```bash
curl -X POST http://localhost:3000/api/v1/chats/123/messages \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Un gatto che gioca con una palla colorata",
    "model_id": 10,
    "agent_type": "video"
  }'
```

## Sicurezza

### Validazione Input

- Sanitizzazione di tutti gli input utente
- Validazione della lunghezza dei prompt
- Controllo del contenuto inappropriato
- Rate limiting per prevenire abusi

### Gestione Fondi

- Verifica automatica dei fondi prima di ogni operazione
- Transazioni atomiche per aggiornamenti del wallet
- Logging di tutte le transazioni

### Autenticazione

- Token JWT per l'autenticazione
- Refresh token per sessioni prolungate
- Logout automatico su token scaduto

## Monitoraggio

### Metriche Disponibili

- Numero di richieste per endpoint
- Tempo di risposta medio
- Tasso di errore
- Utilizzo dei fondi per utente
- Utilizzo dei modelli

### Logging

Tutti gli eventi vengono registrati con:
- Timestamp
- ID utente
- Endpoint chiamato
- Parametri della richiesta
- Risultato (successo/errore)
- Costo dell'operazione

## Supporto

Per supporto tecnico o domande:

1. Controlla i log del server
2. Verifica la documentazione specifica per ogni servizio
3. Contatta il team di sviluppo
4. Consulta la documentazione delle API dei provider 