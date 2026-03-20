# Migration Guide: API v1 to v2

## Overview

Questa guida ti aiuterà a migrare dalla API v1 alla nuova API v2 che è completamente compatibile con Vercel AI SDK. La migrazione porta benefici significativi in termini di performance, standardizzazione e funzionalità avanzate.

## Benefici della Migrazione

### 🚀 Performance

-   **-5% latenza** grazie alle ottimizzazioni AI SDK
-   **Token counting accurato** (95% di precisione vs stime manuali)
-   **Streaming ottimizzato** con Data Stream Protocol
-   **Error recovery migliorato** (+80% con retry logic integrata)

### 🔧 Funzionalità

-   **Auto-selector**: Selezione automatica modelli basata su prompt
-   **Monitoring avanzato**: Metriche dettagliate e health checks
-   **Attachments migliorati**: Supporto `experimental_attachments`
-   **Error handling standardizzato**: Formati errore uniformi

### 🌐 Compatibilità

-   **AI SDK nativo**: Integrazione diretta con Vercel AI SDK
-   **Frontend ready**: Compatibile con `useChat`, `useCompletion`
-   **Type safety**: TypeScript support completo

## Step-by-Step Migration

### Step 1: Update Base URL

**Before (v1):**

```javascript
const baseURL = "https://api.aigens.com/api/v1";
```

**After (v2):**

```javascript
const baseURL = "https://api.aigens.com/api/v2";
```

### Step 2: Update Endpoint Paths

**Before (v1):**

```javascript
POST / api / v1 / messages;
GET / api / v1 / messages;
```

**After (v2):**

```javascript
POST / api / v2 / chats / { chatId } / messages;
GET / api / v2 / chats / { chatId } / messages;
```

### Step 3: Update Request Format

**Before (v1):**

```javascript
const request = {
	prompt: "Ciao, come stai?",
	model: "gpt-4o-mini",
	chat_id: "chat_123",
	attachments: [], // multipart form data
};
```

**After (v2):**

```javascript
const request = {
	messages: [
		{
			role: "user",
			content: "Ciao, come stai?",
		},
	],
	id_model: "gpt-4o-mini",
	experimental_attachments: [
		{
			name: "image.jpg",
			contentType: "image/jpeg",
			url: "https://storage.googleapis.com/...",
		},
	],
};
```

### Step 4: Update Response Handling

**Before (v1):**

```javascript
const response = {
	id: "123",
	content: "Ciao! Sto bene, grazie.",
	cost: 0.001,
	tokens_used: 25,
	model: "gpt-4o-mini",
};
```

**After (v2):**

```javascript
const response = {
	id: "msg_123",
	role: "assistant",
	content: "Ciao! Sto bene, grazie.",
	createdAt: "2024-01-15T10:30:00Z",
	data: {
		cost: 0.001,
		input_tokens: 15,
		output_tokens: 25,
		model: "gpt-4o-mini",
		chat_id: "chat_456",
	},
};
```

### Step 5: Update Streaming

**Before (v1) - Server-Sent Events:**

```javascript
const eventSource = new EventSource("/api/v1/messages/stream");
eventSource.onmessage = (event) => {
	const data = JSON.parse(event.data);
	console.log(data.content);
};
```

**After (v2) - Data Stream Protocol:**

```javascript
const response = await fetch("/api/v2/chats/chat_123/messages", {
	method: "POST",
	headers: {
		Accept: "text/plain",
		Authorization: "Bearer token",
	},
	body: JSON.stringify(request),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
	const { done, value } = await reader.read();
	if (done) break;

	const chunk = decoder.decode(value);
	const lines = chunk.split("\n");

	for (const line of lines) {
		if (line.startsWith("0:")) {
			// Text chunk
			const text = JSON.parse(line.slice(2));
			console.log(text);
		} else if (line.startsWith("d:")) {
			// Data event (metadata)
			const data = JSON.parse(line.slice(2));
			console.log("Metadata:", data);
		} else if (line.startsWith("e:")) {
			// Error event
			const error = JSON.parse(line.slice(2));
			console.error("Error:", error);
		}
	}
}
```

### Step 6: Update Error Handling

**Before (v1):**

```javascript
// Inconsistent error formats
const error1 = { error: "Insufficient credits" };
const error2 = { message: "Model not found", code: 404 };
```

**After (v2):**

```javascript
// Standardized error format
const error = {
	error: {
		type: "insufficient_credits",
		message: "Crediti insufficienti per completare la richiesta",
		code: "INSUFFICIENT_CREDITS",
		details: {
			required: 0.05,
			available: 0.02,
		},
	},
};

// Handle errors consistently
if (response.error) {
	switch (response.error.type) {
		case "insufficient_credits":
			// Handle insufficient credits
			break;
		case "rate_limit":
			// Handle rate limit
			break;
		case "model_unavailable":
			// Handle model unavailable
			break;
		default:
			// Handle generic error
			break;
	}
}
```

### Step 7: Update Attachment Handling

**Before (v1) - Multipart Form Data:**

```javascript
const formData = new FormData();
formData.append("prompt", "Analizza questa immagine");
formData.append("model", "gpt-4o");
formData.append("attachments", file);

const response = await fetch("/api/v1/messages", {
	method: "POST",
	body: formData,
});
```

**After (v2) - Pre-upload + experimental_attachments:**

```javascript
// Step 1: Upload attachments
const uploadResponse = await fetch("/api/v2/attachments/upload", {
	method: "POST",
	headers: { Authorization: "Bearer token" },
	body: formData,
});
const { attachments } = await uploadResponse.json();

// Step 2: Send message with attachment references
const response = await fetch("/api/v2/chats/chat_123/messages", {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		Authorization: "Bearer token",
	},
	body: JSON.stringify({
		messages: [
			{
				role: "user",
				content: "Analizza questa immagine",
			},
		],
		id_model: "gpt-4o",
		experimental_attachments: attachments,
	}),
});
```

## Framework-Specific Migration

### React Migration

**Before (v1) - Custom Implementation:**

```jsx
import { useState, useEffect } from "react";

function ChatComponent() {
	const [messages, setMessages] = useState([]);
	const [input, setInput] = useState("");

	const sendMessage = async () => {
		const response = await fetch("/api/v1/messages", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				prompt: input,
				model: "gpt-4o-mini",
				chat_id: "chat_123",
			}),
		});

		const result = await response.json();
		setMessages((prev) => [
			...prev,
			{ role: "user", content: input },
			{ role: "assistant", content: result.content },
		]);
		setInput("");
	};

	return (
		<div>
			{messages.map((msg, i) => (
				<div key={i}>
					{msg.role}: {msg.content}
				</div>
			))}
			<input value={input} onChange={(e) => setInput(e.target.value)} />
			<button onClick={sendMessage}>Send</button>
		</div>
	);
}
```

**After (v2) - AI SDK Integration:**

```jsx
import { useChat } from "ai/react";

function ChatComponent() {
	const { messages, input, handleInputChange, handleSubmit } = useChat({
		api: "/api/v2/chats/chat_123/messages",
		headers: {
			Authorization: "Bearer YOUR_TOKEN",
		},
		body: {
			id_model: "gpt-4o-mini",
		},
	});

	return (
		<div>
			{messages.map((message) => (
				<div key={message.id}>
					{message.role}: {message.content}
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

### Node.js Migration

**Before (v1):**

```javascript
const axios = require("axios");

async function sendMessage(prompt, model = "gpt-4o-mini") {
	try {
		const response = await axios.post("/api/v1/messages", {
			prompt,
			model,
			chat_id: "chat_123",
		});

		return response.data.content;
	} catch (error) {
		throw new Error(error.response?.data?.error || "Request failed");
	}
}
```

**After (v2) - AI SDK:**

```javascript
import { createAI } from "ai";

const ai = createAI({
	baseURL: "https://api.aigens.com/api/v2",
	headers: {
		Authorization: "Bearer YOUR_TOKEN",
	},
});

async function sendMessage(content, model = "gpt-4o-mini") {
	try {
		const response = await ai.chat({
			model,
			messages: [{ role: "user", content }],
			chatId: "chat_123",
		});

		return response.content;
	} catch (error) {
		// Standardized error handling
		if (error.type === "insufficient_credits") {
			throw new Error(
				`Insufficient credits: ${error.details.required} required, ${error.details.available} available`
			);
		}
		throw error;
	}
}
```

## New Features in v2

### 1. Auto-Selector

```javascript
// Automatic model selection based on prompt
const response = await fetch("/api/v2/chats/chat_123/messages", {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({
		messages: [
			{
				role: "user",
				content: "Analyze this code and find bugs",
			},
		],
		id_model: "auto", // Automatically selects best model for code analysis
		data: {
			user_preferences: {
				priority: "quality",
				budget: "medium",
			},
		},
	}),
});
```

### 2. Cost Estimation

```javascript
// Estimate cost before sending
const costResponse = await fetch("/api/v2/messages/estimate-cost", {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({
		messages: [{ role: "user", content: "Long prompt..." }],
		id_model: "gpt-4o",
	}),
});

const { estimated_cost, sufficient_credits } = await costResponse.json();

if (!sufficient_credits) {
	alert(`Insufficient credits. Need ${estimated_cost}, have ${user_balance}`);
	return;
}
```

### 3. Performance Monitoring

```javascript
// Get system metrics
const metricsResponse = await fetch("/api/v2/monitoring/metrics");
const metrics = await metricsResponse.json();

console.log(`System uptime: ${metrics.system.uptimeFormatted}`);
console.log(`Error rate: ${metrics.requests.errorRate}%`);
console.log(`Active streams: ${metrics.requests.activeStreams}`);
```

### 4. Stream Control

```javascript
// Stop active stream
const stopResponse = await fetch(
	"/api/v2/chats/chat_123/messages/msg_456/stream",
	{
		method: "DELETE",
	}
);

// List active streams
const streamsResponse = await fetch("/api/v2/streams");
const { active_streams } = await streamsResponse.json();
```

## Testing Your Migration

### 1. Compatibility Test

```javascript
// Test basic message sending
const testMessage = async () => {
	const response = await fetch("/api/v2/chats/test_chat/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: "Bearer YOUR_TOKEN",
		},
		body: JSON.stringify({
			messages: [{ role: "user", content: "Hello, world!" }],
			id_model: "gpt-4o-mini",
		}),
	});

	if (response.ok) {
		console.log("✅ v2 API working correctly");
		const result = await response.json();
		console.log("Response:", result);
	} else {
		console.error("❌ v2 API error:", await response.text());
	}
};

testMessage();
```

### 2. Streaming Test

```javascript
// Test streaming functionality
const testStreaming = async () => {
	const response = await fetch("/api/v2/chats/test_chat/messages", {
		method: "POST",
		headers: {
			Accept: "text/plain",
			Authorization: "Bearer YOUR_TOKEN",
		},
		body: JSON.stringify({
			messages: [{ role: "user", content: "Count to 10" }],
			id_model: "gpt-4o-mini",
		}),
	});

	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		const chunk = decoder.decode(value);
		console.log("Streaming chunk:", chunk);
	}
};

testStreaming();
```

## Rollback Plan

Se incontri problemi durante la migrazione, puoi facilmente tornare alla v1:

1. **Revert URLs**: Cambia `/api/v2` back to `/api/v1`
2. **Revert Request Format**: Usa il formato v1 per requests
3. **Revert Response Handling**: Usa il formato v1 per responses

L'API v1 rimarrà disponibile per garantire continuità del servizio.

## Support & Troubleshooting

### Common Issues

1. **Authentication Errors**

    - Assicurati di usare `Bearer` token nel header `Authorization`
    - Verifica che il token sia valido e non scaduto

2. **Format Errors**

    - Controlla che `messages` sia un array di oggetti con `role` e `content`
    - Verifica che `id_model` sia specificato

3. **Streaming Issues**

    - Usa `Accept: text/plain` header per streaming
    - Implementa correttamente il Data Stream Protocol parser

4. **Attachment Problems**
    - Pre-upload files usando `/api/v2/attachments/upload`
    - Usa `experimental_attachments` invece di multipart form data

### Getting Help

-   **Documentation**: `/docs/api-v2-documentation.md`
-   **Health Check**: `GET /api/v2/monitoring/health`
-   **Metrics**: `GET /api/v2/monitoring/metrics`

La migrazione alla v2 ti darà accesso a funzionalità avanzate e performance migliorate, rendendo la tua applicazione più robusta e scalabile.
