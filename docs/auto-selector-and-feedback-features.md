# Auto-Selector e Feedback Features

## Panoramica

Sono state aggiunte due nuove funzionalità al sistema:

1. **Auto-Selector Flag**: Un flag per indicare se l'utente sta usando l'auto-selector per la selezione del modello
2. **Message Feedback**: Sistema di like/dislike per i messaggi dell'assistente

## Modifiche al Database

### Tabella `chats`

-   **Campo aggiunto**: `use_auto_selector` (BOOLEAN, default: false)
-   **Descrizione**: Indica se l'utente sta usando l'auto-selector per la selezione del modello in questa chat

### Tabella `messages`

-   **Campo aggiunto**: `user_like` (BOOLEAN, nullable)
-   **Campo aggiunto**: `user_dislike` (BOOLEAN, nullable)
-   **Descrizione**: Feedback dell'utente sui messaggi dell'assistente

## API Modificate

### Chat API (`/api/v1/chats`)

#### GET `/api/v1/chats`

-   Ora include il campo `use_auto_selector` nella risposta

#### POST `/api/v1/chats`

-   **Nuovo parametro**: `use_auto_selector` (boolean, opzionale)
-   **Default**: `false`

#### PUT `/api/v1/chats/{id}`

-   **Nuovo parametro**: `use_auto_selector` (boolean, opzionale)
-   Permette di aggiornare il flag auto-selector

### Message API (`/api/v1/chats/{chatId}/messages`)

#### POST `/api/v1/chats/{chatId}/messages/{id}/like`

-   Imposta un like per un messaggio
-   Imposta `user_like = true` e `user_dislike = false`

#### POST `/api/v1/chats/{chatId}/messages/{id}/dislike`

-   Imposta un dislike per un messaggio
-   Imposta `user_dislike = true` e `user_like = false`

#### DELETE `/api/v1/chats/{chatId}/messages/{id}/feedback`

-   Rimuove il feedback da un messaggio
-   Imposta entrambi `user_like` e `user_dislike` a `null`

## Esempi di Utilizzo

### Creare una chat con auto-selector abilitato

```bash
curl -X POST /api/v1/chats \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Chat con Auto-Selector",
    "use_auto_selector": true
  }'
```

### Aggiornare il flag auto-selector

```bash
curl -X PUT /api/v1/chats/123 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "use_auto_selector": true
  }'
```

### Impostare un like su un messaggio

```bash
curl -X POST /api/v1/chats/123/messages/456/like \
  -H "Authorization: Bearer <token>"
```

### Impostare un dislike su un messaggio

```bash
curl -X POST /api/v1/chats/123/messages/456/dislike \
  -H "Authorization: Bearer <token>"
```

### Rimuovere il feedback da un messaggio

```bash
curl -X DELETE /api/v1/chats/123/messages/456/feedback \
  -H "Authorization: Bearer <token>"
```

## Migrazione

Per applicare le modifiche al database, esegui:

```bash
node scripts/run-migration-auto-selector.js
```

## Note per il Frontend

1. **Auto-Selector**: Il frontend può ora leggere il campo `use_auto_selector` per impostare lo stato dello switch all'apertura di una chat
2. **Feedback**: I messaggi ora includono i campi `user_like` e `user_dislike` che possono essere utilizzati per mostrare lo stato dei pulsanti like/dislike
3. **Payload dei Messaggi**: Tutti i messaggi restituiti dalle API includono automaticamente i campi `user_like` e `user_dislike` nel payload
4. **Validazione**: Tutte le API di feedback verificano che l'utente abbia accesso alla chat prima di permettere l'operazione

## API che includono i campi di feedback

Le seguenti API ora includono automaticamente i campi `user_like` e `user_dislike` nel payload dei messaggi:

-   `GET /api/v1/chats/{chatId}/messages` - Lista messaggi di una chat
-   `GET /api/v1/chats/{chatId}/messages/{id}` - Messaggio specifico
-   `GET /api/v1/chats/{id}` - Chat con messaggi inclusi
-   `GET /api/v1/chats` - Lista chat con ultimo messaggio
-   `POST /api/v1/chats/{chatId}/messages` - Risposta include i messaggi creati con feedback

### Esempio di payload messaggio

```json
{
	"id": 123,
	"chat_id": 456,
	"role": "assistant",
	"content": "Risposta dell'assistente",
	"agent_type": "chat",
	"agent_model": "claude-3-opus",
	"created_at": "2024-01-15T10:30:00.000Z",
	"user_like": true,
	"user_dislike": false,
	"Attachments": []
}
```

## Sicurezza

-   Tutte le API di feedback verificano l'autenticazione dell'utente
-   Le operazioni di feedback sono limitate ai messaggi delle chat dell'utente autenticato
-   Il campo `use_auto_selector` è specifico per ogni chat e utente
