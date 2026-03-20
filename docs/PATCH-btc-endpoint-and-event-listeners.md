# PATCH: Risoluzione Endpoint BTC e Event Listeners

## Problemi Risolti

### 1. Endpoint BTC 404 Not Found

**Problema**: L'endpoint `POST /api/v1/btc/create` restituiva 404 Not Found.

**Causa**:

-   La route legacy era definita in `api/v1/payments.js` ma non era montata correttamente
-   Il file `api/v1/btc-payments.js` non aveva la route `/create`

**Soluzione**:

-   ✅ Aggiunta route legacy `/create` in `api/v1/btc-payments.js`
-   ✅ La route mappa correttamente le richieste legacy al nuovo formato
-   ✅ Mantiene la compatibilità con il frontend esistente

### 2. MaxListenersExceededWarning

**Problema**:

```
(node:60037) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 21 uncaughtException listeners added to [process]. MaxListeners is 20.
(node:60037) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 21 unhandledRejection listeners added to [process]. MaxListeners is 20.
```

**Causa**:

-   Multiple servizi aggiungevano listener per `uncaughtException` e `unhandledRejection`
-   Il limite era impostato a 20 ma c'erano più di 20 listener
-   Il controllo `!process.listenerCount()` non era sufficiente

**Soluzione**:

-   ✅ Aumentato il limite a 50 in `server.js`
-   ✅ Implementata gestione centralizzata degli event handlers in `server.js`
-   ✅ Rimossi listener duplicati da:
    -   `services/model-management/monitoring-service.js`
    -   `services/model-management/cli/index.js`
    -   `scripts/model-management/cronjobs/health-check.js`
    -   `scripts/model-management/cronjobs/sync-all-models.js`
    -   `scripts/model-management/cronjobs/backup-database.js`

### 3. Errore Controller PaymentController

**Problema**:

```
TypeError: Cannot read properties of undefined (reading 'id')
notNull Violation: Transaction.user_id cannot be null,
notNull Violation: Transaction.wallet_id cannot be null,
notNull Violation: Transaction.amount cannot be null
```

**Causa**:

-   La route legacy non passava correttamente l'oggetto `req` con l'utente autenticato
-   Incompatibilità tra i nomi dei campi del controller e del modello database
-   Errore di riassegnazione variabile `const` nel controller di autenticazione

**Soluzione**:

-   ✅ Corretta la route legacy per passare l'oggetto `req` originale
-   ✅ Corretti i nomi dei campi nel controller per usare `user_id`, `wallet_id`, `invoice_id`
-   ✅ Corretto l'errore di riassegnazione variabile in `api/v1/auth.js`
-   ✅ Aggiornati tutti i riferimenti ai campi del database per essere coerenti

## Modifiche Apportate

### File Modificati

1. **`api/v1/btc-payments.js`**

    - Aggiunta route legacy `/create` per compatibilità
    - Corretta la mappatura delle richieste per passare l'oggetto `req` originale

2. **`server.js`**

    - Aumentato `setMaxListeners(50)`
    - Implementata gestione centralizzata degli event handlers
    - Aggiunto controllo per evitare listener duplicati

3. **`services/model-management/monitoring-service.js`**

    - Commentati i listener duplicati per `uncaughtException` e `unhandledRejection`
    - Aggiunto commento esplicativo sulla gestione centralizzata

4. **`services/model-management/cli/index.js`**

    - Rimossi listener duplicati
    - Mantenuti solo i listener per `SIGINT` e `SIGTERM`

5. **Script di cronjob**

    - Rimossi listener duplicati da tutti i file di cronjob
    - Mantenuta la funzionalità di gestione errori

6. **`controllers/paymentController.js`**

    - Corretti i nomi dei campi per usare `user_id`, `wallet_id`, `invoice_id`
    - Aggiornata la creazione della transazione per includere tutti i campi obbligatori
    - Corretti tutti i riferimenti ai campi del database

7. **`api/v1/auth.js`**
    - Corretto l'errore di riassegnazione variabile `const user`
    - Aggiunto `await` per la chiamata asincrona `getUserWithSettings`

### File Creati

1. **`PATCH-btc-endpoint-and-event-listeners.md`**
    - Documentazione completa delle modifiche

## Testing

### Test Endpoint BTC

```bash
# Avvia il server
npm start

# Test con autenticazione
curl -X POST http://localhost:5555/api/v1/btc/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"amount": 10, "details": {"creditAmount": 800}}'
```

### Verifica Event Listeners

```bash
# Verifica che non ci siano più warning
node --trace-warnings server.js
```

## Compatibilità

-   ✅ **Backward Compatibility**: L'endpoint legacy `/api/v1/btc/create` funziona ancora
-   ✅ **Frontend Compatibility**: Nessuna modifica richiesta al frontend
-   ✅ **API Compatibility**: Tutti gli endpoint esistenti continuano a funzionare
-   ✅ **Database Compatibility**: Corretta compatibilità con il modello Transaction

## Monitoraggio

### Log da Monitorare

-   `[MonitoringService] Process event handlers are managed centrally to prevent MaxListenersExceededWarning`
-   Nessun warning `MaxListenersExceededWarning` nei log
-   Nessun errore `TypeError: Cannot read properties of undefined (reading 'id')`

### Metriche

-   Endpoint BTC: `POST /api/v1/btc/create` dovrebbe restituire 200 OK con invoice
-   Event listeners: Dovrebbero essere sotto il limite di 50
-   Login: Dovrebbe funzionare senza errori di riassegnazione variabile

## Risposta Endpoint BTC

L'endpoint ora restituisce una risposta completa:

```json
{
	"success": true,
	"data": {
		"transactionId": 1,
		"invoice": {
			"invoiceId": "R41eaavtCVVwY4s5aMxM49",
			"checkoutLink": "https://payments.aigens.io/i/R41eaavtCVVwY4s5aMxM49",
			"amount": "10",
			"currency": "EUR",
			"status": "New",
			"expirationTime": 1753479001,
			"paymentMethods": {
				"checkout": {
					"paymentMethod": "BTCPay Checkout",
					"checkoutUrl": "https://payments.aigens.io/i/R41eaavtCVVwY4s5aMxM49",
					"qrCode": "data:image/png;base64,..."
				}
			}
		},
		"expiresAt": "2025-07-25T21:30:01.000Z"
	}
}
```

## Rollback

Se necessario, è possibile fare rollback:

1. **Endpoint BTC**: Rimuovere la route `/create` da `api/v1/btc-payments.js`
2. **Event Listeners**: Ripristinare i listener nei file originali e ridurre il limite a 20
3. **Controller**: Ripristinare i nomi dei campi originali nel controller

## Note per Sviluppatori

-   Gli event handlers sono ora gestiti centralmente in `server.js`
-   Non aggiungere nuovi listener per `uncaughtException` o `unhandledRejection`
-   Usare il sistema di logging centralizzato per tracciare errori
-   Per nuovi endpoint, seguire il pattern esistente in `api/v1/btc-payments.js`
-   I campi del database usano underscore (`user_id`, `wallet_id`, `invoice_id`)
-   Il controller di autenticazione ora gestisce correttamente le variabili `const`
