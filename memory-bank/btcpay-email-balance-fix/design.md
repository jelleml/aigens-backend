# Design - Fix Email BTCPay e Gestione Balance - Valori Corretti

## Analisi del Problema

### Problema 1: BTC Arrotondato a Zero nell'Email

**Causa**: Nel `mailer.service.js` il valore BTC viene formattato con `.toFixed(2)`:

```javascript
amount_paid: amountPaid.toFixed(2), // ❌ Arrotonda a 2 decimali
```

**Risultato**: `0.0000505 BTC` → `0.00 BTC`

### Problema 2: Crediti Non Corrispondenti

**Causa**: La currency potrebbe essere USD invece di EUR, causando conversione errata:

```javascript
// Se currency è USD invece di EUR
const amount = parseFloat(transaction.amount); // 5 USD
const credits = Math.floor(amount * 1000 * 100) / 100; // 5000 crediti (errato per USD)
```

**Risultato**: 5 USD dovrebbe dare ~4250 crediti, non 5000

## Piano di Fix

### 1. Fix BTC Email - Senza Arrotondamento

**Modificare il mailer.service.js**:

```javascript
// PRIMA (ERRATO)
amount_paid: amountPaid.toFixed(2),

// DOPO (CORRETTO)
amount_paid: currency === 'BTC' ? amountPaid.toString() : amountPaid.toFixed(2),
```

### 2. Fix Gestione Currency

**Verificare e correggere la currency nelle transazioni BTCPay**:

```javascript
// PRIMA (ERRATO)
const currency = transaction.currency || "EUR"; // Potrebbe essere USD

// DOPO (CORRETTO)
// Forza EUR per BTCPay (come specificato nei requisiti)
const currency = "EUR"; // BTCPay gestisce sempre EUR
```

### 3. Verifica Balance Wallet

**Controllare che il balance sia aggiornato correttamente**:

```javascript
// Verifica che i crediti siano calcolati correttamente
const amount = parseFloat(transaction.amount); // 5 EUR
const credits = Math.floor(amount * 1000 * 100) / 100; // 5000.00 crediti
```

### 4. Logging Migliorato

**Aggiungere log per debug**:

```javascript
logger.info(
	`[BTCPay] Currency: ${currency}, Amount: ${amount}, Credits: ${credits}`
);
logger.info(`[BTCPay] BTC Value: ${amountBTC} (senza arrotondamento)`);
```

## Logica di Conversione Corretta

### Conversione EUR → Crediti (BTCPay)

```javascript
const amount = parseFloat(transaction.amount); // 5 EUR
const credits = Math.floor(amount * 1000 * 100) / 100; // 5000.00 crediti
```

### Conversione EUR → BTC (per email)

```javascript
const btcToEurRate = await exchangeRateService.getBtcEurRate(); // 98952
const amountBTC = amount / btcToEurRate; // 5 / 98952 = 0.0000505 BTC
// Email mostra: "0.0000505 BTC" (senza arrotondamento)
```

### Conversione USD → EUR → Crediti (se necessario)

```javascript
const usdToEurRate = await exchangeRateService.getUsdEurRate(); // 0.85
const amountEUR = amount * usdToEurRate; // 5 USD * 0.85 = 4.25 EUR
const credits = Math.floor(amountEUR * 1000 * 100) / 100; // 4250.00 crediti
```

## Test Cases

### Test 1: BTC Email

-   Input: 0.0000505 BTC
-   Output: "0.0000505 BTC" (senza arrotondamento)
-   Verifica: Email mostra valore BTC reale

### Test 2: Crediti EUR

-   Input: 5 EUR
-   Output: 5000.00 crediti
-   Verifica: Crediti corrispondono al valore EUR

### Test 3: Crediti USD

-   Input: 5 USD (tasso 0.85)
-   Output: 4250.00 crediti
-   Verifica: Conversione USD → EUR → Crediti corretta

## Implementazione

### 1. Modifica mailer.service.js

Aggiornare la formattazione del valore BTC.

### 2. Modifica paymentController.js

Forzare currency EUR per BTCPay.

### 3. Modifica api/v1/wallets.js

Applicare le stesse correzioni al polling.

### 4. Test Completo

Verificare che i valori siano corretti in entrambi i punti.
