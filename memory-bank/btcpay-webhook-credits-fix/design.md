# Design - Fix Errore Credits Webhook BTCPay

## Analisi del Problema

### Codice Problematico

```javascript
// Riga 404 in paymentController.js
await user.increment("credits", { by: transaction.creditAmount });
```

### Problema

-   La tabella `users` non ha colonna `credits`
-   I crediti sono gestiti nella tabella `wallets` (colonna `balance`)
-   L'errore impedisce l'esecuzione del resto del codice

## Piano di Fix

### 1. Rimuovere Aggiornamento User.credits

Sostituire l'aggiornamento dell'utente con l'aggiornamento del wallet:

```javascript
// PRIMA (ERRATO)
await user.increment("credits", { by: transaction.creditAmount });

// DOPO (CORRETTO)
const wallet = await Wallet.findOne({ where: { user_id: user.id } });
if (wallet) {
	wallet.balance =
		parseFloat(wallet.balance) + parseFloat(transaction.creditAmount);
	await wallet.save();
}
```

### 2. Mantenere Logica Conversione Crediti

Utilizzare la logica di conversione già implementata nell'endpoint payment-status:

```javascript
// Importa servizi per conversione
const exchangeRateService = require("../services/exchange-rate.service");
const creditConversion = require("../services/credit-conversion.service");

// Calcola crediti convertiti
const btcToEurRate = await exchangeRateService.getBtcEurRate();
const amountBTC = parseFloat(transaction.amount);
const credits = creditConversion.btcToCredits(amountBTC, btcToEurRate);

// Aggiorna wallet con crediti
wallet.balance = parseFloat(wallet.balance) + credits;
```

### 3. Gestione Errori

Aggiungere try-catch per gestire errori di conversione:

```javascript
try {
	// Conversione crediti
} catch (conversionError) {
	// Fallback a creditAmount originale
	wallet.balance =
		parseFloat(wallet.balance) + parseFloat(transaction.creditAmount);
}
```

### 4. Email di Conferma

Assicurarsi che l'email venga inviata correttamente:

```javascript
await purchaseNotificationService.sendBTCPayPurchaseConfirmation(
	transaction,
	wallet,
	credits,
	amountBTC
);
```

## Struttura Database Corretta

### Tabella `users`

-   `id`, `email`, `name`, etc.
-   **NON ha colonna `credits`**

### Tabella `wallets`

-   `id`, `user_id`, `balance`, `currency`
-   **I crediti sono in `balance`**

### Tabella `transactions`

-   `id`, `user_id`, `wallet_id`, `amount`, `status`, etc.
-   `creditAmount` contiene i crediti da aggiungere

## Test Cases

### Test 1: Pagamento Normale

-   Input: 0.001 BTC (98,997 crediti)
-   Output: Wallet aggiornato + email inviata
-   Verifica: Nessun errore database

### Test 2: Conversione Fallback

-   Input: 0.001 BTC (conversione fallita)
-   Output: Wallet aggiornato con creditAmount
-   Verifica: Email inviata comunque

### Test 3: Wallet Non Trovato

-   Input: Pagamento per utente senza wallet
-   Output: Log errore, transazione aggiornata
-   Verifica: Non crash del sistema
