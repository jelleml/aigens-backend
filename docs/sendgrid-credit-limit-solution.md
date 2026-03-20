# Soluzione per il problema "Maximum credits exceeded" di SendGrid

## Problema identificato

Il tuo account SendGrid ha raggiunto il limite di crediti disponibili, causando errori 401 "Unauthorized" con il messaggio "Maximum credits exceeded".

## Soluzioni implementate

### 1. Sistema di Fallback

-   **Funzionalità**: Quando SendGrid fallisce, invia una notifica all'amministratore
-   **Configurazione**: `enableFallback: true` e `fallbackEmail: 'admin@aigens.io'`
-   **Comportamento**: Tenta di inviare una email di notifica all'amministratore quando l'email originale fallisce

### 2. Sistema di Coda Email

-   **Funzionalità**: Salva le email in coda quando SendGrid non è disponibile
-   **Posizione**: `./temp/email-queue/`
-   **Formato**: File JSON con metadati dell'email
-   **Retry**: Fino a 3 tentativi automatici

### 3. API per la gestione della coda

-   **GET** `/api/v1/email-queue/stats` - Statistiche della coda
-   **POST** `/api/v1/email-queue/process` - Processa le email in coda
-   **DELETE** `/api/v1/email-queue/clear` - Svuota la coda (emergenze)

### 4. Script di processamento

-   **File**: `scripts/process-email-queue.js`
-   **Uso**: `node scripts/process-email-queue.js`
-   **Funzionalità**: Processa automaticamente tutte le email in coda

## Come risolvere il problema

### Opzione 1: Aggiornare il piano SendGrid

1. Accedi al [dashboard SendGrid](https://app.sendgrid.com/)
2. Vai su "Settings" > "Billing"
3. Aggiorna il tuo piano per ottenere più crediti
4. Il sistema riprenderà automaticamente a funzionare

### Opzione 2: Usare il sistema di coda temporaneamente

1. Le email vengono automaticamente accodate
2. Processa la coda quando SendGrid è di nuovo disponibile:
    ```bash
    node scripts/process-email-queue.js
    ```
3. Oppure usa l'API:
    ```bash
    curl -X POST http://localhost:5555/api/v1/email-queue/process
    ```

### Opzione 3: Monitorare la coda

```bash
# Statistiche della coda
curl http://localhost:5555/api/v1/email-queue/stats

# Processare la coda
curl -X POST http://localhost:5555/api/v1/email-queue/process

# Svuotare la coda (solo emergenze)
curl -X DELETE http://localhost:5555/api/v1/email-queue/clear
```

## Configurazione

### Variabili d'ambiente

```bash
# Email di fallback per le notifiche
FALLBACK_EMAIL=admin@aigens.io

# Chiave API SendGrid (già configurata)
SENDGRID_API_KEY=SG.xxx...
```

### Configurazione nel codice

```javascript
const emailer = new EmailerService({
	enableFallback: true,
	enableQueue: true,
	fallbackEmail: "admin@aigens.io",
	queuePath: "./temp/email-queue",
});
```

## Monitoraggio

### Statistiche della coda

```javascript
const stats = await emailer.getQueueStats();
console.log(stats);
// Output:
// {
//   totalQueued: 5,
//   totalRetries: 3,
//   retryDistribution: { '0': 2, '1': 2, '2': 1 },
//   averageRetries: '0.60'
// }
```

### Log del sistema

-   ✅ Email inviata normalmente
-   ⚠️ SendGrid credits exceeded. Using fallback notification.
-   📧 Email accodata: [queue-id]
-   ❌ Fallback email also failed
-   🔄 Avvio processamento coda email...

## Raccomandazioni

1. **Aggiorna il piano SendGrid** per evitare interruzioni
2. **Monitora l'uso** tramite il dashboard SendGrid
3. **Configura alert** per quando i crediti sono bassi
4. **Considera alternative** come Mailgun, Postmark, o AWS SES per ridondanza

## Test del sistema

```bash
# Test del sistema di fallback
node test-sendgrid-fallback.js

# Test del sistema di coda
node test-email-queue.js

# Processamento della coda
node scripts/process-email-queue.js
```

## Risoluzione immediata

Per ripristinare immediatamente il servizio email:

1. **Aggiorna il piano SendGrid** (soluzione permanente)
2. **Oppure** processa la coda quando i crediti sono ripristinati:
    ```bash
    node scripts/process-email-queue.js
    ```

Il sistema è ora resiliente e continuerà a funzionare anche quando SendGrid ha problemi temporanei.
