# Fix Errore ENUM Status BTCPay

## Contesto

Il webhook BTCPay funziona correttamente ma c'è un errore quando si cerca di aggiornare lo status della transazione:

```
Data truncated for column 'status' at row 1
```

## Errore Identificato

### Root Cause

Il mapping degli eventi BTCPay include valori non consentiti nell'ENUM del database:

```javascript
// CODICE PROBLEMATICO
const eventTypeMapping = {
	InvoiceExpired: "expired", // ❌ 'expired' non è nell'ENUM
	// ...
};
```

### ENUM Database Corretto

```javascript
status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending'
}
```

**Valori consentiti**: `pending`, `completed`, `failed`, `cancelled`
**Valore problematico**: `expired` ❌

## Analisi del Problema

### Mapping Attuale (ERRATO)

```javascript
const eventTypeMapping = {
	InvoiceReceivedPayment: "processing", // ❌ 'processing' non esiste
	InvoiceProcessing: "processing", // ❌ 'processing' non esiste
	InvoiceSettled: "completed", // ✅ OK
	InvoiceExpired: "expired", // ❌ 'expired' non esiste
	InvoiceInvalid: "failed", // ✅ OK
	InvoicePaid: "completed", // ✅ OK
	InvoiceConfirmed: "completed", // ✅ OK
	InvoiceComplete: "completed", // ✅ OK
	InvoicePaymentReceived: "processing", // ❌ 'processing' non esiste
	InvoicePaymentSettled: "completed", // ✅ OK
};
```

### Mapping Corretto (DA IMPLEMENTARE)

```javascript
const eventTypeMapping = {
	InvoiceReceivedPayment: "pending", // ✅ 'pending' esiste
	InvoiceProcessing: "pending", // ✅ 'pending' esiste
	InvoiceSettled: "completed", // ✅ 'completed' esiste
	InvoiceExpired: "failed", // ✅ 'failed' esiste
	InvoiceInvalid: "failed", // ✅ 'failed' esiste
	InvoicePaid: "completed", // ✅ 'completed' esiste
	InvoiceConfirmed: "completed", // ✅ 'completed' esiste
	InvoiceComplete: "completed", // ✅ 'completed' esiste
	InvoicePaymentReceived: "pending", // ✅ 'pending' esiste
	InvoicePaymentSettled: "completed", // ✅ 'completed' esiste
};
```

## Obiettivi

1. **Fix mapping eventi**: Usare solo valori ENUM consentiti
2. **Mantenere logica**: Preservare la semantica degli eventi
3. **Test completo**: Verificare che tutti gli eventi funzionino
4. **Documentazione**: Aggiornare mapping per riferimento futuro

## Risultati Attesi

-   ✅ Nessun errore database ENUM
-   ✅ Tutti gli eventi BTCPay mappati correttamente
-   ✅ Status transazioni aggiornati correttamente
-   ✅ Sistema webhook completamente funzionante
