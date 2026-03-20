# Design - Fix Errore ENUM Status BTCPay

## Analisi del Problema

### Errore Database

```
Data truncated for column 'status' at row 1
```

**Causa**: Stiamo cercando di inserire valori non consentiti nell'ENUM del database.

### Valori ENUM Consentiti

```javascript
ENUM("pending", "completed", "failed", "cancelled");
```

### Valori Problematici nel Mapping

-   `'processing'` → Non esiste nell'ENUM
-   `'expired'` → Non esiste nell'ENUM

## Piano di Fix

### 1. Correggere Mapping Eventi

**Sostituire valori non consentiti**:

```javascript
// PRIMA (ERRATO)
const eventTypeMapping = {
	InvoiceReceivedPayment: "processing", // ❌ Non esiste
	InvoiceProcessing: "processing", // ❌ Non esiste
	InvoiceExpired: "expired", // ❌ Non esiste
	InvoicePaymentReceived: "processing", // ❌ Non esiste
};

// DOPO (CORRETTO)
const eventTypeMapping = {
	InvoiceReceivedPayment: "pending", // ✅ Esiste
	InvoiceProcessing: "pending", // ✅ Esiste
	InvoiceExpired: "failed", // ✅ Esiste
	InvoicePaymentReceived: "pending", // ✅ Esiste
};
```

### 2. Logica di Mapping

**Semantica degli eventi**:

-   **`pending`**: Pagamento ricevuto ma non ancora confermato
-   **`completed`**: Pagamento confermato e completato
-   **`failed`**: Pagamento fallito o scaduto
-   **`cancelled`**: Pagamento cancellato

**Mapping semantico**:

-   `InvoiceReceivedPayment` → `pending` (pagamento ricevuto)
-   `InvoiceProcessing` → `pending` (in elaborazione)
-   `InvoiceSettled` → `completed` (confermato)
-   `InvoiceExpired` → `failed` (scaduto)
-   `InvoiceInvalid` → `failed` (invalido)

### 3. Validazione Aggiuntiva

**Aggiungere controllo prima dell'aggiornamento**:

```javascript
const validStatuses = ["pending", "completed", "failed", "cancelled"];

if (!validStatuses.includes(newStatus)) {
	logger.error(`❌ Status non valido: ${newStatus}`);
	return res.status(400).json({ error: "Invalid status" });
}
```

### 4. Logging Migliorato

**Aggiungere log dettagliati**:

```javascript
logger.info(`🔍 Mapping evento: ${type} → ${newStatus}`);
logger.info(`✅ Status valido: ${newStatus} in [${validStatuses.join(", ")}]`);
```

## Test Cases

### Test 1: Eventi Validati

-   Input: `InvoiceSettled`
-   Output: `completed`
-   Verifica: Nessun errore database

### Test 2: Eventi Problematici

-   Input: `InvoiceExpired`
-   Output: `failed` (invece di `expired`)
-   Verifica: Nessun errore database

### Test 3: Eventi Processing

-   Input: `InvoiceProcessing`
-   Output: `pending` (invece di `processing`)
-   Verifica: Nessun errore database

## Implementazione

### 1. Modifica paymentController.js

Aggiornare il mapping degli eventi BTCPay.

### 2. Aggiungere Validazione

Controllare che i valori siano validi prima dell'aggiornamento.

### 3. Test Completo

Verificare che tutti gli eventi funzionino senza errori.

### 4. Documentazione

Aggiornare il mapping per riferimento futuro.
