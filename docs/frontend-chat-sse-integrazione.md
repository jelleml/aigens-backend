# Integrazione Frontend Chat SSE: UX, Errori, Retry e Resume

## Contesto

Abbiamo aggiornato il backend per la chat AI in modo che la risposta venga inviata tramite SSE (Server-Sent Events) in tempo reale, chunk per chunk/token per token, come OpenAI/Anthropic.
Inoltre, ora il backend gestisce in modo robusto errori e interruzioni di stream, permettendo all'utente di riprovare o riprendere un messaggio interrotto.

---

## 1. Come funziona la nuova response SSE

Quando invii un messaggio (`POST /api/v1/chats/:chatId/messages` con header `Accept: text/event-stream`):

-   Il backend risponde subito con uno stream SSE.
-   I messaggi SSE hanno sempre la forma:

```json
{ "type": "delta" | "completed" | "interrupted" | "error", ... }
```

**Tipi di evento SSE:**

-   `process_started`: la richiesta è stata accettata, inizia l'elaborazione.
-   `delta`: contiene un chunk/token della risposta AI (`text`).
-   `completed`: la risposta AI è stata completata con successo (`text` = risposta completa).
-   `interrupted`: lo stream è stato interrotto dal provider AI, il messaggio è parziale (`text` = testo parziale, `error` = motivo).
-   `error`: errore bloccante (es. fondi insufficienti, errore provider, ecc.), può contenere anche `text` parziale.

---

## 2. Cosa deve fare il frontend

-   **Durante lo stream:**
    -   Mostra i chunk/token ricevuti (`type: 'delta'`) in tempo reale nella chat.
-   **Alla fine dello stream:**
    -   Se ricevi `type: 'completed'`, mostra la risposta come completa.
    -   Se ricevi `type: 'interrupted'` o `type: 'error'`:
        -   Mostra il testo parziale ricevuto.
        -   Mostra un pulsante "Riprova" o "Riprendi" accanto al messaggio.
        -   Salva lo stato del messaggio come "incompleto" (puoi usare il campo `is_complete` se lo recuperi via API).
        -   Se l'utente clicca "Riprova", reinvia il prompt (magari con un parametro per riprendere dal testo parziale).
-   **Gestione retry:**
    -   Il retry viene gestito lato frontend: l'utente decide se e quando riprovare.
    -   Puoi inviare nuovamente il prompt originale o, se vuoi, aggiungere un parametro per "resume".

---

## 3. Esempio di gestione eventi SSE

```js
const eventSource = new EventSource("/api/v1/chats/1/messages", {
	withCredentials: true,
});

let partialText = "";

eventSource.onmessage = (event) => {
	const data = JSON.parse(event.data);
	switch (data.type) {
		case "process_started":
			// Mostra spinner o messaggio di attesa
			break;
		case "delta":
			partialText += data.text;
			// Aggiorna la UI della chat in tempo reale
			break;
		case "completed":
			// Mostra la risposta completa, chiudi lo stream
			eventSource.close();
			break;
		case "interrupted":
			// Mostra il testo parziale, pulsante "Riprendi"
			eventSource.close();
			showRetryButton(partialText, data.error);
			break;
		case "error":
			// Mostra errore, testo parziale se presente, pulsante "Riprova"
			eventSource.close();
			showRetryButton(partialText, data.error || data.details);
			break;
	}
};
```

---

## 4. Recupero messaggi incompleti

-   Quando recuperi la cronologia chat (`GET /api/v1/chats/:chatId/messages`), controlla il campo `is_complete` di ogni messaggio.
-   Se `is_complete: false`, mostra la UI di "resume"/"riprova" per quel messaggio.

---

## 5. UX consigliata

-   Spinner/loader durante l'elaborazione.
-   Streaming token/chunk in tempo reale.
-   Messaggio chiaro in caso di errore/interruzione.
-   Pulsante "Riprova" o "Riprendi" per messaggi incompleti.
-   Stato visivo per messaggi "incompleti" nella chat.

---

**In caso di dubbi, chiedi al backend di restituire sempre la struttura SSE sopra descritta.**
Per testare, puoi simulare errori/interruzioni dal backend o chiedere un prompt molto lungo.

Se vuoi un esempio di component React/Vue per questa logica, chiedi pure!
