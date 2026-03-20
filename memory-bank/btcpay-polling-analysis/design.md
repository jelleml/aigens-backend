# Design - Analisi Polling BTCPay Frontend

## Analisi del Flusso Attuale

### 1. Endpoint Payment Status

L'endpoint `/api/v1/wallets/payment-status/:id` funziona così:

```javascript
// Cerca transazione per transaction_id (non invoice_id!)
const transaction = await Transaction.findOne({
	where: { transaction_id: id },
});

// Se trova la transazione, chiama BTCPay per lo status
const invoice = await BTCPayService.getInvoice(transaction.invoice_id);

// Mappa lo status
if (
	status === "Settled" ||
	status === "settled" ||
	status === "Completed" ||
	status === "completed"
) {
	// Aggiorna transazione e accredita wallet
	return { status: "paid" };
} else {
	return { status: "pending" };
}
```

### 2. Problemi Identificati

#### Problema 1: Parametro URL vs Database

-   **Frontend chiama**: `/payment-status/${invoiceId}`
-   **Backend cerca**: `transaction_id` (non `invoice_id`)
-   **Risultato**: Transazione non trovata

#### Problema 2: Duplicazione Logica

-   **Webhook**: Aggiorna status quando riceve evento
-   **Polling**: Aggiorna status quando chiama BTCPay
-   **Risultato**: Possibili conflitti o duplicazioni

#### Problema 3: Performance

-   **Polling ogni 5 secondi** → Molte chiamate a BTCPay
-   **BTCPay API limits** → Possibili rate limiting

## Piano di Fix

### 1. Fix Parametro URL

Cambiare l'endpoint per cercare per `invoice_id` invece di `transaction_id`

### 2. Ottimizzazione Logica

-   Usare principalmente il webhook per aggiornamenti
-   Polling come fallback
-   Cache dello status per ridurre chiamate BTCPay

### 3. Miglioramento Performance

-   Implementare cache locale
-   Ridurre frequenza polling se possibile
-   Aggiungere rate limiting lato server
