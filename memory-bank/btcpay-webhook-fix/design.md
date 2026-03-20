# Fix Webhook BTCPay - Design

## Analisi del Problema

Il problema è un **mismatch tra l'URL configurato nel servizio BTCPay e gli endpoint disponibili nel sistema**.

### 🔍 **Mappatura degli URL**

| URL Configurato          | URL Disponibili              | Status       |
| ------------------------ | ---------------------------- | ------------ |
| `/api/v1/btcpay/webhook` | ❌ Non esiste                | **PROBLEMA** |
| -                        | `/api/v1/payments/webhook`   | ✅ Esiste    |
| -                        | `/api/v1/btc/btcpay/webhook` | ✅ Esiste    |

### 🎯 **Soluzione: Opzione 1 - Correggere l'URL**

Modificare il servizio BTCPay per usare l'endpoint corretto `/api/v1/payments/webhook`.

## Piano di Implementazione

### **Fase 1: Correzione URL Webhook**

**File da modificare**: `services/btc-payments.service.js`

**Modifica**: Cambiare l'URL del webhook da:

```javascript
// PRIMA (riga 58)
invoiceData.notificationUrl =
	options.notificationUrl || `${config.appUrl}/api/v1/btcpay/webhook`;
```

A:

```javascript
// DOPO
invoiceData.notificationUrl =
	options.notificationUrl || `${config.appUrl}/api/v1/payments/webhook`;
```

### **Fase 2: Verifica Endpoint**

**File da verificare**: `api/v1/payments.js`

**Endpoint**: `/api/v1/payments/webhook`

-   ✅ Usa il middleware `validateWebhook`
-   ✅ Chiama `PaymentController.handleWebhook`
-   ✅ Gestisce correttamente gli eventi BTCPay

### **Fase 3: Test della Correzione**

1. **Test locale**: Verificare che l'URL sia corretto
2. **Test webhook**: Simulare un webhook BTCPay
3. **Test end-to-end**: Pagamento completo

## Implementazione Tecnica

### **Modifica al Servizio BTCPay**

```javascript
// In services/btc-payments.service.js, riga 58
if (options.notificationUrl || config.appUrl) {
	// CORREZIONE: Usare l'endpoint corretto
	invoiceData.notificationUrl =
		options.notificationUrl || `${config.appUrl}/api/v1/payments/webhook`;
}
```

### **Verifica Endpoint Esistente**

L'endpoint `/api/v1/payments/webhook` è già configurato correttamente:

```javascript
// In api/v1/payments.js, riga 128
router.post("/webhook", validateWebhook, (req, res, next) => {
	PaymentController.handleWebhook(req, res).catch(next);
});
```

## Vantaggi della Soluzione

1. **✅ Nessuna duplicazione di codice**
2. **✅ Usa l'endpoint già testato**
3. **✅ Mantiene la struttura esistente**
4. **✅ Minimo impatto sul sistema**

## Rischi e Mitigazioni

### **Rischi**

-   **Rischio**: Possibili errori di parsing del payload
-   **Mitigazione**: Il controller gestisce già diversi formati di payload

-   **Rischio**: Problemi di validazione della firma
-   **Mitigazione**: Il middleware `validateWebhook` è già robusto

## Test Plan

1. **Test Unitario**: Verificare che l'URL sia corretto
2. **Test Integrazione**: Simulare webhook BTCPay
3. **Test End-to-End**: Pagamento completo con BTCPay
