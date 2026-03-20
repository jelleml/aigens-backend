# Design - Fix Conversione Crediti BTCPay

## Analisi del Problema

### Flusso Attuale (ERRATO)

1. BTCPay conferma pagamento
2. Aggiorna wallet: `wallet.balance += transaction.amount` (EUR)
3. Invia email con `totalCredits = transaction.amount`

### Flusso Corretto (DA IMPLEMENTARE)

1. BTCPay conferma pagamento
2. Ottieni tasso di cambio BTC/EUR
3. Converti BTC → EUR: `amountEUR = amountBTC * btcToEurRate`
4. Converti EUR → Crediti: `credits = amountEUR * 1000`
5. Aggiorna wallet: `wallet.balance += credits`
6. Invia email con crediti corretti

## Piano di Implementazione

### 1. Servizio Tassi di Cambio

Utilizzare il servizio esistente `exchange-rate.service.js` per ottenere tasso BTC/EUR:

```javascript
const exchangeRateService = require("./exchange-rate.service");
const btcToEurRate = await exchangeRateService.getBTCToEURRate();
```

### 2. Servizio Conversione Crediti

Utilizzare il servizio esistente `credit-conversion.service.js`:

```javascript
const creditConversion = require("./credit-conversion.service");
const credits = creditConversion.btcToCredits(amountBTC, btcToEurRate);
```

### 3. Modifica Endpoint Payment Status

Aggiornare la logica in `/api/v1/wallets/payment-status/:id`:

```javascript
// Calcola crediti convertiti
const btcToEurRate = await exchangeRateService.getBTCToEURRate();
const amountBTC = parseFloat(transaction.amount);
const credits = creditConversion.btcToCredits(amountBTC, btcToEurRate);

// Aggiorna wallet con crediti
wallet.balance = parseFloat(wallet.balance) + credits;
```

### 4. Modifica Email di Conferma

Aggiornare `sendPurchaseConfirmationForTransaction`:

```javascript
// Calcola crediti corretti
const totalCredits = credits; // crediti convertiti
const baseCredits = totalCredits - bonusCredits;
```

## Gestione Errori

### Tasso di Cambio Non Disponibile

-   Fallback a tasso fisso (es. 1 BTC = 50000 EUR)
-   Log dell'errore per monitoraggio
-   Continua il processo con tasso di fallback

### Conversione Fallita

-   Log dell'errore
-   Non aggiornare wallet
-   Restituire errore al frontend

## Test Cases

### Test 1: Conversione Normale

-   Input: 0.001 BTC (€50)
-   Output: 50,000 crediti
-   Email: "Hai acquistato 50,000 crediti"

### Test 2: Tasso di Cambio Fallback

-   Input: 0.001 BTC (tasso non disponibile)
-   Output: 50,000 crediti (tasso fisso)
-   Email: "Hai acquistato 50,000 crediti"

### Test 3: Bonus Crediti

-   Input: 0.001 BTC + 10% bonus
-   Output: 55,000 crediti
-   Email: "50,000 crediti + 5,000 bonus"
