# Design - Fix Email Conferma Acquisto BTCPay e Arrotondamento Crediti

## Analisi del Problema

### Problema 1: Email BTC Errata

L'email mostra "5.00 BTC" invece del valore EUR convertito in BTC.

**Causa**: Stiamo passando `amount` (EUR) alla funzione email invece del valore BTC reale.

### Problema 2: Crediti con Troppi Decimali

I crediti mostrano `4308.859014133058` invece di un valore arrotondato.

**Causa**: Nessun arrotondamento nella conversione crediti.

## Piano di Fix

### 1. Arrotondamento Crediti

**Implementare arrotondamento a 2 decimali per difetto**:

```javascript
// PRIMA (ERRATO)
const credits = amount * 1000; // 4308.859014133058

// DOPO (CORRETTO)
const credits = Math.floor(amount * 1000 * 100) / 100; // 4308.86
```

### 2. Calcolo Valore BTC per Email

**Calcolare il valore EUR convertito in BTC**:

```javascript
// Calcola valore BTC per email
const btcToEurRate = await exchangeRateService.getBtcEurRate();
const amountBTC = amount / btcToEurRate; // 5 EUR / 98952 = 0.0000505 BTC
```

### 3. Fix Email Template

**Passare il valore BTC corretto**:

```javascript
// PRIMA (ERRATO)
await purchaseNotificationService.sendBTCPayPurchaseConfirmation(
	transaction,
	wallet,
	credits,
	amount // amount è EUR
);

// DOPO (CORRETTO)
await purchaseNotificationService.sendBTCPayPurchaseConfirmation(
	transaction,
	wallet,
	credits,
	amountBTC // amountBTC è il valore BTC
);
```

### 4. Applicazione Consistente

**Applicare fix in entrambi i punti**:

-   `controllers/paymentController.js` (webhook)
-   `api/v1/wallets.js` (polling)

## Logica di Conversione

### Conversione EUR → Crediti

```javascript
const amount = parseFloat(transaction.amount); // 5 EUR
const credits = Math.floor(amount * 1000 * 100) / 100; // 5000.00 crediti
```

### Conversione EUR → BTC (per email)

```javascript
const btcToEurRate = await exchangeRateService.getBtcEurRate(); // 98952
const amountBTC = amount / btcToEurRate; // 5 / 98952 = 0.0000505 BTC
```

### Conversione USD → EUR → Crediti

```javascript
const usdToEurRate = await exchangeRateService.getUsdEurRate(); // 0.85
const amountEUR = amount * usdToEurRate; // 5 USD * 0.85 = 4.25 EUR
const credits = Math.floor(amountEUR * 1000 * 100) / 100; // 4250.00 crediti
```

## Test Cases

### Test 1: Conversione EUR

-   Input: 5 EUR
-   Output: 5000.00 crediti
-   Email: 0.0000505 BTC

### Test 2: Conversione USD

-   Input: 5 USD (tasso 0.85)
-   Output: 4250.00 crediti
-   Email: 0.000043 BTC

### Test 3: Arrotondamento

-   Input: 4.999 EUR
-   Output: 4999.00 crediti (arrotondato per difetto)

## Implementazione

### 1. Modifica paymentController.js

Aggiornare la conversione crediti e il calcolo BTC.

### 2. Modifica api/v1/wallets.js

Applicare le stesse correzioni al polling.

### 3. Test Completo

Verificare che i valori siano corretti in entrambi i punti.

### 4. Documentazione

Aggiornare la logica di conversione per riferimento futuro.
