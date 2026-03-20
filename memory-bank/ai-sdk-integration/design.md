# AI SDK Integration - Design

## Architettura Proposta

### Layer 1: AI SDK (Nuovo)

**File**: `services/ai-sdk.service.js`

-   Gestione unificata chiamate AI tramite Vercel AI SDK
-   Token counting automatico preciso
-   Streaming nativo con abort capability
-   Error handling standardizzato con mapping errori
-   Supporto multimodal (testo + immagini)

**Provider Mapping**: `config/ai-sdk-providers.js`

-   OpenAI → @ai-sdk/openai
-   Anthropic → @ai-sdk/anthropic
-   OpenRouter → @ai-sdk/openai (custom baseURL)
-   DeepSeek → @ai-sdk/openai (custom baseURL)
-   Together → @ai-sdk/openai (custom baseURL)

### Layer 2: Business Logic Adapter (Nuovo)

**File**: `services/business-logic-adapter.service.js`

-   Interfaccia tra AI SDK e business logic esistente
-   Gestione costi con markup preservata
-   Wallet updates e transazioni
-   Processamento attachments GCS
-   Chat context integration
-   Message recovery system

### Layer 3: API v2 (Nuovo)

**Endpoint**: `/api/v2/*`

-   Formato compatibile con Vercel AI SDK frontend
-   Data Stream Protocol per streaming
-   Gestione experimental_attachments
-   Error handling standardizzato
-   Backward compatibility con v1

## Flusso di Elaborazione

### Request Flow (Non-Streaming)

```
1. Client → POST /api/v2/chats/{id}/messages
2. API v2 → Business Logic Adapter
3. Adapter → Validate & prepare request
4. Adapter → Estimate cost & check funds
5. Adapter → Save user message
6. Adapter → AI SDK Service
7. AI SDK → Provider API call
8. AI SDK → Return result with usage
9. Adapter → Calculate actual cost
10. Adapter → Update wallet & save cost
11. Adapter → Save assistant message
12. API v2 → Return AI SDK format response
```

### Streaming Flow

```
1. Client → POST /api/v2/chats/{id}/messages (streaming headers)
2. API v2 → Setup SSE connection
3. API v2 → Business Logic Adapter (streaming=true)
4. Adapter → Pre-processing (same as non-streaming)
5. Adapter → AI SDK Service.streamText()
6. AI SDK → Start provider stream
7. For each token:
   - AI SDK → onToken callback
   - Adapter → Send via SSE (0:token)
8. On completion:
   - AI SDK → onFinish callback
   - Adapter → Finalize message & costs
   - API v2 → Send final metadata (d:data)
```

## Componenti Implementati

### 1. AI SDK Service (`services/ai-sdk.service.js`)

**Metodi Principali:**

-   `generateText(params)`: Generazione non-streaming
-   `streamText(params)`: Generazione streaming con callbacks
-   `abortStream(streamId)`: Interruzione stream attivo
-   `convertMessagesToAIFormat()`: Conversione formato messaggi
-   `handleAISDKError()`: Mapping errori standardizzato

**Gestione Provider:**

-   Configurazione centralizzata in `config/ai-sdk-providers.js`
-   Auto-detection provider da model slug
-   Supporto capacità (text, vision, tools)
-   Fallback graceful per modelli non mappati

### 2. Business Logic Adapter (`services/business-logic-adapter.service.js`)

**Responsabilità:**

-   Integrazione con database models esistenti
-   Gestione costi via `CostCalculator`
-   Wallet management e transazioni
-   Processamento attachments GCS
-   Chat context via `preparePromptWithContext`
-   Message recovery system

**Metodi Chiave:**

-   `processAIRequest()`: Entry point principale
-   `processStreamingRequest()`: Gestione streaming
-   `finalizeMessage()`: Completamento con business logic
-   `estimateCost()`: Stima costi pre-request
-   `checkUserFunds()`: Verifica crediti disponibili

### 3. API v2 Endpoints

**Messages** (`api/v2/messages.js`):

-   `POST /api/v2/chats/{id}/messages`: Invio messaggi
-   `GET /api/v2/chats/{id}/messages`: Recupero storico
-   Supporto streaming via Data Stream Protocol
-   Gestione experimental_attachments

**Cost Estimation** (`api/v2/cost-estimation.js`):

-   `POST /api/v2/messages/estimate-cost`: Stima costi
-   Supporto auto-selector
-   Calcolo costi attachments

**Attachments** (`api/v2/attachments.js`):

-   `POST /api/v2/attachments/upload`: Upload file
-   `GET /api/v2/attachments/{id}`: Info attachment
-   `DELETE /api/v2/attachments/{id}`: Eliminazione
-   Integrazione GCS con signed URLs

**Stream Control** (`api/v2/stream-control.js`):

-   `DELETE /api/v2/chats/{id}/messages/{msgId}/stream`: Stop stream
-   `GET /api/v2/streams`: Lista stream attivi
-   `DELETE /api/v2/streams/{streamId}`: Stop by stream ID

## Data Stream Protocol

### Formato Streaming Response

```
0:"Hello"           # Text chunk
0:" world"          # Text chunk
d:{"cost":0.001}    # Data event (metadata)
e:{"type":"error"}  # Error event
```

### Headers Response

```
Content-Type: text/plain; charset=utf-8
X-Model-Used: claude-sonnet-3-7
X-Cost-Total: 0.0015
X-Message-Id: msg_123
```

## Error Handling

### Standardized Error Format

```json
{
	"error": {
		"type": "insufficient_credits",
		"message": "Crediti insufficienti",
		"code": "INSUFFICIENT_CREDITS",
		"details": {
			"required": 10,
			"available": 5
		}
	}
}
```

### Error Types Mapping

-   AI SDK rate limit → `rate_limit` (429)
-   AI SDK quota → `quota_exceeded` (402)
-   Context length → `context_length_exceeded` (400)
-   Auth errors → `authentication_error` (401)
-   Model not found → `model_unavailable` (404)

## Compatibilità e Migrazione

### Backward Compatibility

-   Endpoint v1 mantenuti invariati
-   Router v2 aggiunto in parallelo
-   Gradual migration path per frontend
-   Dual support durante transizione

### Provider Configuration

-   Mapping interno model slug → AI SDK model ID
-   Provider detection automatica
-   Capability validation (text, vision, tools)
-   Fallback per modelli non configurati

### Database Integration

-   Models e Provider tables invariati
-   Message format esteso con campi AI SDK
-   Cost calculation system preservato
-   Transaction logging mantenuto

## Monitoring e Logging

### Metriche Tracciate

-   Latenza per provider
-   Token/secondo throughput
-   Error rate per tipo
-   Stream abort rate
-   Cost accuracy (stimato vs reale)

### Structured Logging

```json
{
	"timestamp": "2024-01-15T10:30:00Z",
	"level": "info",
	"service": "ai-sdk-service",
	"event": "text_generation_completed",
	"model": "claude-sonnet-3-7",
	"usage": { "input": 150, "output": 200 },
	"duration": 1250
}
```

## Ottimizzazioni Performance

### Connection Management

-   Riutilizzo connessioni HTTP
-   Connection pooling per provider
-   Keep-alive headers appropriati

### Memory Management

-   Stream buffering ottimizzato
-   Cleanup automatico stream abortiti
-   Garbage collection per large responses

### Caching Strategy

-   Model info cache (1h TTL)
-   Provider configuration cache
-   Token count cache per prompt ripetuti
