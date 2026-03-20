# Design - Fix Webhook BTCPay Status Update

## Analisi del Problema

Il webhook BTCPay non aggiorna lo status delle transazioni. Dobbiamo identificare esattamente dove si interrompe il flusso.

## Piano di Debug e Fix

### 1. Debug del Payload Webhook

Aggiungere logging dettagliato per capire esattamente cosa riceve il webhook:

```javascript
// Nel handleWebhook
logger.info('Webhook payload completo:', JSON.stringify(event, null, 2));
logger.info('Invoice ID ricevuto:', invoiceId);
logger.info('Event type ricevuto:', type);
```

### 2. Verifica Mapping Eventi

I tipi di evento attesi sono:
- `InvoiceReceivedPayment` → `processing`
- `InvoiceProcessing` → `processing` 
- `InvoiceSettled` → `completed`
- `InvoiceExpired` → `expired`
- `InvoiceInvalid` → `failed`

Ma BTCPay potrebbe inviare eventi diversi. Dobbiamo verificare i tipi reali.

### 3. Verifica Database Update

Aggiungere logging per verificare che l'aggiornamento del database funzioni:

```javascript
logger.info(`Aggiornamento transazione ${transaction.id} da ${transaction.status} a ${newStatus}`);
await transaction.update({ status: newStatus });
logger.info(`Transazione ${transaction.id} aggiornata con successo`);
```

### 4. Fix del Mapping

Se i tipi di evento sono diversi, aggiornare il mapping:

```javascript
// Possibili mapping alternativi
const eventTypeMapping = {
  'InvoiceReceivedPayment': 'processing',
  'InvoiceProcessing': 'processing',
  'InvoiceSettled': 'completed',
  'InvoiceExpired': 'expired',
  'InvoiceInvalid': 'failed',
  // Aggiungere altri tipi se necessario
  'InvoicePaid': 'completed',
  'InvoiceConfirmed': 'completed',
  'InvoiceComplete': 'completed'
};
```

### 5. Gestione Errori Migliorata

Aggiungere try-catch specifici per ogni operazione critica.

## Implementazione

### File da Modificare

1. `controllers/paymentController.js` - Migliorare il metodo `handleWebhook`
2. `api/v1/payments.js` - Aggiungere logging nel webhook endpoint

### Test Plan

1. **Test con Payload Reale**: Simulare un webhook con payload reale
2. **Verifica Database**: Controllare che gli aggiornamenti vengano applicati
3. **Test End-to-End**: Verificare l'intero flusso di pagamento 