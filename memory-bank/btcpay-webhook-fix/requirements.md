# Fix Webhook BTCPay - Requirements

## Contesto

Il flusso di pagamento Bitcoin con BTCPay Server presenta un problema critico: il webhook non viene ricevuto correttamente dal backend, causando il modale in loading fisso nel frontend.

## Problema Identificato

### 🔴 **Errore 404 nel Webhook**

**URL chiamato da BTCPay**: `POST /api/v1/payments/btcpay/webhook`
**Errore ricevuto**: `HTTP/1.1 404 Not Found` con messaggio `{"error":"API endpoint non trovato"}`

### 🔍 **Analisi del Problema**

1. **URL configurato nel servizio BTCPay**: `${config.appUrl}/api/v1/btcpay/webhook`
2. **URL disponibili nel sistema**:

    - `/api/v1/payments/webhook` (in `api/v1/payments.js`)
    - `/api/v1/btc/btcpay/webhook` (in `api/v1/btc-payments.js`)

3. **Mismatch**: BTCPay chiama `/api/v1/payments/btcpay/webhook` che **non esiste**

### 📋 **Payload Webhook Ricevuto**

```json
{
	"deliveryId": "YUgpxWVTyWz6Wci4b7frgk",
	"webhookId": "Y9QwZ5o88wxqnvdiJiFobd",
	"originalDeliveryId": "YUgpxWVTyWz6Wci4b7frgk",
	"isRedelivery": false,
	"type": "InvoiceCreated",
	"timestamp": 1754503802,
	"storeId": "4WnJDhQSfbgB9ygkuMpQZHb8m4fe2N5rQrp8hYdsCdkd",
	"invoiceId": "UhTZBRApeQyU4QZ4voDf66",
	"metadata": {
		"userId": "5477eac6-2000-4991-a3c6-11d2951794ce",
		"creditAmount": 5000,
		"type": "credit_purchase",
		"transactionId": 1,
		"createdAt": 1754503801
	}
}
```

## Obiettivi

1. **Correggere l'URL del webhook** nel servizio BTCPay
2. **Assicurare che il webhook venga ricevuto correttamente**
3. **Verificare che la transazione venga aggiornata** quando il pagamento è completato
4. **Risolvere il problema del modale in loading fisso**

## Impatto

-   ✅ **Ripristino del flusso di pagamento Bitcoin**
-   ✅ **Aggiornamento automatico dello status delle transazioni**
-   ✅ **Risoluzione del modale in loading fisso**
-   ✅ **Miglioramento dell'esperienza utente**
