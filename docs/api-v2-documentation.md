# API v2 Documentation - AI SDK Integration

## Overview

La nuova API v2 è stata progettata per essere completamente compatibile con Vercel AI SDK, fornendo un'interfaccia unificata per interagire con i modelli AI mantenendo tutta la business logic esistente.

## Base URL

```
https://api.aigens.com/api/v2
```

## Authentication

Tutte le richieste richiedono autenticazione tramite Bearer token:

```bash
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## Data Stream Protocol

Per le richieste streaming, utilizziamo il Data Stream Protocol per fornire aggiornamenti in tempo reale:

```
0:"Hello"                    # Text chunk
0:" world"                   # Text chunk continuation
d:{"cost":0.001}            # Data event (metadata)
e:{"type":"error"}          # Error event
```

### Headers per Streaming

```bash
Accept: text/plain
# or
X-Streaming: true
# or
Accept: text/event-stream
```

## Endpoints

### 1. Send Message

Invia un messaggio e riceve una risposta AI.

```http
POST /api/v2/chats/{chatId}/messages
```

#### Request Body

```json
{
	"messages": [
		{
			"role": "user",
			"content": "Ciao, come stai?"
		}
	],
	"id_model": "gpt-4o-mini",
	"experimental_attachments": [
		{
			"name": "image.jpg",
			"contentType": "image/jpeg",
			"url": "https://storage.googleapis.com/..."
		}
	],
	"data": {
		"user_preferences": {
			"temperature": 0.7,
			"max_tokens": 1000
		}
	}
}
```

#### Response (Non-Streaming)

```json
{
	"id": "msg_123",
	"role": "assistant",
	"content": "Ciao! Sto bene, grazie. Come posso aiutarti?",
	"createdAt": "2024-01-15T10:30:00Z",
	"data": {
		"cost": 0.001,
		"input_tokens": 15,
		"output_tokens": 25,
		"model": "gpt-4o-mini",
		"chat_id": "chat_456"
	}
}
```

#### Response (Streaming)

```
0:"Ciao! "
0:"Sto bene, "
0:"grazie. "
0:"Come posso "
0:"aiutarti?"
d:{"cost":0.001,"input_tokens":15,"output_tokens":25}
```

### 2. Get Messages

Recupera i messaggi di una chat in formato AI SDK.

```http
GET /api/v2/chats/{chatId}/messages?limit=50&offset=0
```

#### Response

```json
{
	"messages": [
		{
			"id": "msg_123",
			"role": "user",
			"content": "Ciao, come stai?",
			"createdAt": "2024-01-15T10:29:00Z",
			"data": {
				"chat_id": "chat_456",
				"status": "sent"
			}
		},
		{
			"id": "msg_124",
			"role": "assistant",
			"content": "Ciao! Sto bene, grazie. Come posso aiutarti?",
			"createdAt": "2024-01-15T10:30:00Z",
			"data": {
				"cost": 0.001,
				"input_tokens": 15,
				"output_tokens": 25,
				"model": "gpt-4o-mini",
				"chat_id": "chat_456",
				"status": "sent"
			}
		}
	],
	"pagination": {
		"total": 2,
		"limit": 50,
		"offset": 0,
		"hasMore": false
	}
}
```

### 3. Cost Estimation

Stima il costo di una richiesta prima di inviarla.

```http
POST /api/v2/messages/estimate-cost
```

#### Request Body

```json
{
	"messages": [
		{
			"role": "user",
			"content": "Scrivi un articolo di 500 parole"
		}
	],
	"id_model": "gpt-4o",
	"experimental_attachments": []
}
```

#### Response

```json
{
	"estimated_cost": 0.015,
	"breakdown": {
		"input_cost": 0.005,
		"estimated_output_cost": 0.01
	},
	"token_estimates": {
		"input_tokens": 12,
		"estimated_output_tokens": 500
	},
	"model_info": {
		"id": "gpt-4o",
		"provider": "openai",
		"input_price_per_token": 0.000005,
		"output_price_per_token": 0.000015
	},
	"sufficient_credits": true,
	"user_balance": 10.5
}
```

### 4. Auto-Selector

Utilizza la selezione automatica del modello basata su prompt e preferenze.

```http
POST /api/v2/chats/{chatId}/messages
```

#### Request Body

```json
{
	"messages": [
		{
			"role": "user",
			"content": "Analizza questa immagine e dimmi cosa vedi"
		}
	],
	"id_model": "auto",
	"experimental_attachments": [
		{
			"name": "photo.jpg",
			"contentType": "image/jpeg",
			"url": "https://storage.googleapis.com/..."
		}
	],
	"data": {
		"user_preferences": {
			"priority": "quality",
			"budget": "medium"
		}
	}
}
```

#### Response

```json
{
	"id": "msg_125",
	"role": "assistant",
	"content": "Nell'immagine vedo...",
	"createdAt": "2024-01-15T10:35:00Z",
	"data": {
		"cost": 0.008,
		"input_tokens": 1250,
		"output_tokens": 150,
		"model": "gpt-4o",
		"chat_id": "chat_456",
		"auto_selector_used": true,
		"auto_selector_confidence": 0.95,
		"auto_selector_category": "vision",
		"auto_selector_reason": "Image analysis requires vision-capable model"
	}
}
```

### 5. Upload Attachments

Carica allegati prima di inviarli nei messaggi.

```http
POST /api/v2/attachments/upload
```

#### Request (Multipart Form Data)

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files=@image.jpg" \
  -F "files=@document.pdf" \
  https://api.aigens.com/api/v2/attachments/upload
```

#### Response

```json
{
	"attachments": [
		{
			"id": "att_123",
			"name": "image.jpg",
			"contentType": "image/jpeg",
			"size": 245760,
			"url": "https://storage.googleapis.com/aigens-storage/uploads/att_123.jpg",
			"uploadedAt": "2024-01-15T10:25:00Z"
		},
		{
			"id": "att_124",
			"name": "document.pdf",
			"contentType": "application/pdf",
			"size": 1048576,
			"url": "https://storage.googleapis.com/aigens-storage/uploads/att_124.pdf",
			"uploadedAt": "2024-01-15T10:25:01Z"
		}
	]
}
```

### 6. Stream Control

Gestisci i stream attivi.

#### Stop Stream

```http
DELETE /api/v2/chats/{chatId}/messages/{messageId}/stream
```

#### Response

```json
{
	"success": true,
	"message": "Stream interrotto con successo",
	"stream_id": "stream_123"
}
```

#### List Active Streams

```http
GET /api/v2/streams
```

#### Response

```json
{
	"active_streams": [
		{
			"id": "stream_123",
			"chat_id": "chat_456",
			"message_id": "msg_125",
			"model": "gpt-4o",
			"started_at": "2024-01-15T10:35:00Z",
			"duration": 5000
		}
	],
	"total": 1
}
```

### 7. Performance Monitoring

Accedi alle metriche di performance del sistema.

#### Get Comprehensive Metrics

```http
GET /api/v2/monitoring/metrics
```

#### Response

```json
{
	"system": {
		"uptime": 3600000,
		"uptimeFormatted": "1h 0m 0s",
		"startTime": "2024-01-15T09:30:00Z"
	},
	"requests": {
		"total": 1250,
		"errors": 15,
		"errorRate": 1.2,
		"streams": 350,
		"activeStreams": 3,
		"requestsPerMinute": 20.8
	},
	"providers": {
		"openai": {
			"requests": 800,
			"averageDuration": 1250,
			"errorRate": 0.01,
			"totalTokens": 125000,
			"streamingRequests": 200
		},
		"anthropic": {
			"requests": 300,
			"averageDuration": 1800,
			"errorRate": 0.005,
			"totalTokens": 45000,
			"streamingRequests": 100
		}
	},
	"autoSelector": {
		"totalRequests": 150,
		"successRate": 95.5,
		"fallbackRate": 4.5,
		"averageConfidence": 0.87,
		"categoryDistribution": {
			"text": 80,
			"vision": 45,
			"code": 25
		}
	},
	"health": {
		"status": "healthy",
		"alerts": []
	},
	"generatedAt": "2024-01-15T10:30:00Z"
}
```

#### Health Check

```http
GET /api/v2/monitoring/health
```

#### Response

```json
{
	"status": "healthy",
	"alerts": [],
	"timestamp": "2024-01-15T10:30:00Z"
}
```

## Error Handling

Tutti gli errori seguono un formato standardizzato:

```json
{
	"error": {
		"type": "insufficient_credits",
		"message": "Crediti insufficienti per completare la richiesta",
		"code": "INSUFFICIENT_CREDITS",
		"details": {
			"required": 0.05,
			"available": 0.02
		}
	}
}
```

### Error Types

-   `validation_error`: Errori di validazione input
-   `insufficient_credits`: Crediti insufficienti
-   `rate_limit`: Limite di rate raggiunto
-   `quota_exceeded`: Quota superata
-   `context_length_exceeded`: Contesto troppo lungo
-   `authentication_error`: Errore di autenticazione
-   `model_unavailable`: Modello non disponibile
-   `internal_error`: Errore interno del server

### HTTP Status Codes

-   `200`: Success
-   `201`: Created (messaggio inviato)
-   `400`: Bad Request (errore validazione)
-   `401`: Unauthorized (autenticazione richiesta)
-   `403`: Forbidden (accesso negato)
-   `404`: Not Found (risorsa non trovata)
-   `429`: Too Many Requests (rate limit)
-   `500`: Internal Server Error
-   `503`: Service Unavailable

## Modelli Supportati

### OpenAI

-   `gpt-4o`
-   `gpt-4o-mini`
-   `gpt-4-turbo`
-   `gpt-3.5-turbo`
-   `o1-preview`
-   `o1-mini`

### Anthropic

-   `claude-3-5-sonnet-20241022`
-   `claude-3-5-haiku-20241022`
-   `claude-3-opus-20240229`

### OpenRouter

-   `meta-llama/llama-3.2-90b-vision-instruct`
-   `anthropic/claude-3.5-sonnet`
-   `google/gemini-pro-1.5`

### DeepSeek

-   `deepseek-chat`
-   `deepseek-coder`

### Together

-   `meta-llama/Llama-2-70b-chat-hf`
-   `mistralai/Mixtral-8x7B-Instruct-v0.1`

### Auto-Selector

-   `auto`: Selezione automatica basata su prompt e preferenze

## Rate Limits

-   **Requests per minute**: 60
-   **Tokens per minute**: 100,000
-   **Concurrent streams**: 5
-   **File upload size**: 10MB per file
-   **Files per request**: 5

## SDK Integration Examples

### JavaScript/TypeScript

```typescript
import { createAI } from "ai/rsc";

const ai = createAI({
	model: "gpt-4o-mini",
	baseURL: "https://api.aigens.com/api/v2",
	headers: {
		Authorization: "Bearer YOUR_TOKEN",
	},
});

// Streaming chat
const response = await ai.chat({
	messages: [{ role: "user", content: "Ciao!" }],
	stream: true,
});

for await (const chunk of response) {
	console.log(chunk);
}
```

### React

```jsx
import { useChat } from "ai/react";

function ChatComponent() {
	const { messages, input, handleInputChange, handleSubmit } = useChat({
		api: "https://api.aigens.com/api/v2/chats/chat_123/messages",
		headers: {
			Authorization: "Bearer YOUR_TOKEN",
		},
	});

	return (
		<div>
			{messages.map((message) => (
				<div key={message.id}>
					<strong>{message.role}:</strong> {message.content}
				</div>
			))}

			<form onSubmit={handleSubmit}>
				<input value={input} onChange={handleInputChange} />
				<button type="submit">Send</button>
			</form>
		</div>
	);
}
```

## Migration from v1

### Key Changes

1. **Endpoint Structure**: `/api/v1/messages` → `/api/v2/chats/{chatId}/messages`
2. **Message Format**: Standardizzato per AI SDK compatibility
3. **Streaming Protocol**: Data Stream Protocol invece di SSE
4. **Error Format**: Formato errori standardizzato
5. **Attachments**: `experimental_attachments` invece di multipart

### Migration Steps

1. Update base URL to `/api/v2`
2. Update message format to AI SDK compatible
3. Update error handling for new format
4. Use Data Stream Protocol for streaming
5. Update attachment handling

### Backward Compatibility

L'API v1 rimane disponibile per compatibilità, ma è consigliato migrare alla v2 per beneficiare delle nuove funzionalità e miglioramenti.
