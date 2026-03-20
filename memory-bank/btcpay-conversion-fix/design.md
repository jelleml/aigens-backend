# Design - Fix Conversione BTCPay EUR vs BTC

## Analisi del Problema

### Errore di Conversione

Il sistema sta trattando l'importo come BTC invece che EUR:

```javascript
// CODICE PROBLEMATICO
const amountBTC = parseFloat(transaction.amount); // 5 (EUR)
const credits = creditConversion.btcToCredits(amountBTC, btcToEurRate); // Tratta 5 come BTC
```

### Errore Database

Il valore risultante è troppo grande per il tipo di dato `balance`:

-   **Valore calcolato**: 494,770,000 crediti
-   **Limite database**: Probabilmente INT o DECIMAL con limiti

## Piano di Fix

### 1. Fix Conversione Valuta

**Identificare la valuta corretta**:

```javascript
// PRIMA (ERRATO)
const amountBTC = parseFloat(transaction.amount);
const credits = creditConversion.btcToCredits(amountBTC, btcToEurRate);

// DOPO (CORRETTO)
const amountEUR = parseFloat(transaction.amount);
const credits = amountEUR * 1000; // 1 EUR = 1000 crediti
```

### 2. Gestione Valute Multiple

**Supportare sia EUR che USD**:

```javascript
const amount = parseFloat(transaction.amount);
const currency = transaction.currency || "EUR";

let credits;
if (currency === "EUR") {
	credits = amount * 1000; // 1 EUR = 1000 crediti
} else if (currency === "USD") {
	// Converti USD → EUR → Crediti
	const usdToEurRate = await exchangeRateService.getUsdEurRate();
	const amountEUR = amount * usdToEurRate;
	credits = amountEUR * 1000;
} else {
	// Fallback a EUR
	credits = amount * 1000;
}
```

### 3. Validazione Limiti Database

**Controllare che i valori non superino i limiti**:

```javascript
const MAX_BALANCE = 999999999; // Limite sicuro
const newBalance = parseFloat(wallet.balance) + credits;

if (newBalance > MAX_BALANCE) {
	logger.warn(
		`[Wallets] Balance troppo alto: ${newBalance}, limitato a ${MAX_BALANCE}`
	);
	wallet.balance = MAX_BALANCE;
} else {
	wallet.balance = newBalance;
}
```

### 4. Logging Migliorato

**Aggiungere log dettagliati**:

```javascript
logger.info(
	`[Wallets] Conversione: ${amount} ${currency} → ${credits} crediti`
);
logger.info(
	`[Wallets] Balance attuale: ${wallet.balance}, nuovo: ${newBalance}`
);
```

## Struttura Database

### Tabella `wallets`

-   `balance`: DECIMAL(15,2) o simile
-   **Limite**: Probabilmente 999,999,999.99

### Tabella `transactions`

-   `amount`: DECIMAL(10,2) - Importo in valuta fiat
-   `currency`: VARCHAR(3) - EUR, USD, etc.

## Test Cases

### Test 1: Pagamento EUR

-   Input: 5.00 EUR
-   Output: 5,000 crediti
-   Verifica: Nessun errore database

### Test 2: Pagamento USD

-   Input: 5.50 USD (tasso 0.85 EUR/USD)
-   Output: 4,675 crediti (5.50 × 0.85 × 1000)
-   Verifica: Conversione corretta

### Test 3: Limite Database

-   Input: 1,000,000 EUR
-   Output: Limitato a 999,999,999 crediti
-   Verifica: Non crash del sistema

## Implementazione

### 1. Modifica Endpoint Payment Status

Aggiornare `/api/v1/wallets/payment-status/:id` per gestire correttamente le valute.

### 2. Modifica Webhook Controller

Aggiornare `paymentController.js` per la stessa logica.

### 3. Aggiungere Validazione

Controllare limiti database in entrambi i punti.

### 4. Test Completo

Verificare con dati reali di BTCPay.
