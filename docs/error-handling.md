# Gestione Errori - AIGens Backend

## Panoramica

Questa documentazione descrive la gestione degli errori nel backend AIGens, con particolare attenzione all'integrazione con Google Veo.

## Tipologie di Errori

### 1. Errori di Rete

#### ENOTFOUND - Host non trovato
```javascript
// Errore: getaddrinfo ENOTFOUND api.google.com
// Causa: Problemi di connessione internet o DNS
// Soluzione: Verifica la connessione internet e i server DNS

try {
    await googleVeoService.sendRequest(prompt, model, userId, chatId);
} catch (error) {
    if (error.code === 'ENOTFOUND') {
        console.error('Errore di connessione di rete. Verifica la connessione internet.');
    }
}
```

#### ECONNREFUSED - Connessione rifiutata
```javascript
// Errore: connect ECONNREFUSED 127.0.0.1:443
// Causa: Server non raggiungibile o firewall
// Soluzione: Verifica la configurazione del firewall e l'accesso al server

if (error.code === 'ECONNREFUSED') {
    console.error('Connessione rifiutata. Verifica la configurazione del server.');
}
```

#### ETIMEDOUT - Timeout della connessione
```javascript
// Errore: connect ETIMEDOUT api.google.com:443
// Causa: Connessione lenta o server sovraccarico
// Soluzione: Riprova più tardi o verifica la connessione

if (error.code === 'ETIMEDOUT') {
    console.error('Timeout della connessione. Riprova più tardi.');
}
```

### 2. Errori di Configurazione

#### API Key non configurata
```javascript
// Errore: API key Google Veo non configurata nel file .env
// Causa: Variabile GOOGLE_GEMINI_KEY mancante o vuota
// Soluzione: Configura la variabile d'ambiente

if (!process.env.GOOGLE_GEMINI_KEY) {
    throw new Error('API key Google Veo non configurata nel file .env');
}
```

#### API Key non valida
```javascript
// Errore: API key Google Veo non valida (troppo corta)
// Causa: API key con formato errato o troppo corta
// Soluzione: Verifica il formato dell'API key

if (GOOGLE_VEO_API_KEY.length < 10) {
    throw new Error('API key Google Veo non valida (troppo corta)');
}
```

#### API Key con formato errato
```javascript
// Warning: API key Google Veo potrebbe non essere nel formato corretto
// Causa: API key non inizia con 'AIza'
// Soluzione: Verifica che l'API key sia corretta

if (!GOOGLE_VEO_API_KEY.startsWith('AIza')) {
    logger.warn('API key Google Veo potrebbe non essere nel formato corretto');
}
```

### 3. Errori di Rate Limit

#### Troppe richieste al minuto
```javascript
// Errore: Rate limit superato: troppe richieste al minuto. Riprova tra 60 secondi.
// Causa: Superamento del limite di 10 richieste/minuto
// Soluzione: Aspetta 60 secondi prima di riprovare

const RATE_LIMIT = {
    maxRequestsPerMinute: 10,
    maxRequestsPerHour: 100
};

if (requestsLastMinute >= RATE_LIMIT.maxRequestsPerMinute) {
    throw new Error('Rate limit superato: troppe richieste al minuto. Riprova tra 60 secondi.');
}
```

#### Troppe richieste all'ora
```javascript
// Errore: Rate limit superato: troppe richieste all'ora. Riprova tra 1 ora.
// Causa: Superamento del limite di 100 richieste/ora
// Soluzione: Aspetta 1 ora prima di riprovare

if (requestsLastHour >= RATE_LIMIT.maxRequestsPerHour) {
    throw new Error('Rate limit superato: troppe richieste all\'ora. Riprova tra 1 ora.');
}
```

### 4. Errori di Storage

#### Spazio insufficiente sul disco
```javascript
// Errore: ENOSPC: no space left on device
// Causa: Disco pieno
// Soluzione: Libera spazio sul disco

if (error.message.includes('ENOSPC')) {
    throw new Error('Errore di storage: spazio insufficiente sul disco');
}
```

#### Permessi insufficienti
```javascript
// Errore: EACCES: permission denied
// Causa: Permessi di scrittura insufficienti
// Soluzione: Verifica i permessi della directory

if (error.message.includes('EACCES')) {
    throw new Error('Errore di storage: permessi insufficienti');
}
```

#### Errori di upload su Google Cloud Storage
```javascript
// Errore: Errore nell'upload su Google Cloud Storage
// Causa: Problemi di configurazione GCS o credenziali
// Soluzione: Verifica la configurazione di Google Cloud Storage

try {
    await gcsService.uploadFile(filePath, gcsPath);
} catch (uploadError) {
    throw new Error(`Errore di storage: impossibile caricare file su cloud storage - ${uploadError.message}`);
}
```

### 5. Errori di Generazione Video

#### Prompt non valido
```javascript
// Errore: Errore di generazione video: prompt non valido
// Causa: Prompt troppo corto, troppo lungo o contenuto inappropriato
// Soluzione: Modifica il prompt

const randomError = Math.random();
if (randomError < 0.05) {
    throw new Error('Errore di generazione video: prompt non valido');
}
```

#### Contenuto inappropriato
```javascript
// Errore: Errore di generazione video: contenuto inappropriato rilevato
// Causa: Prompt contiene contenuto inappropriato
// Soluzione: Modifica il prompt per rimuovere contenuto inappropriato

if (randomError < 0.1) {
    throw new Error('Errore di generazione video: contenuto inappropriato rilevato');
}
```

### 6. Errori di Database

#### Modello non trovato
```javascript
// Errore: Modello 999 non trovato
// Causa: ID modello non esistente nel database
// Soluzione: Verifica l'ID del modello

const model = await db.models.Model.findByPk(modelId);
if (!model) {
    throw new Error(`Modello ${modelId} non trovato`);
}
```

#### Wallet non trovato
```javascript
// Errore: Wallet non trovato per l'utente
// Causa: Utente senza wallet nel database
// Soluzione: Crea un wallet per l'utente

const wallet = await Wallet.findOne({ where: { id_user: userId } });
if (!wallet) {
    throw new Error('Wallet non trovato per l\'utente');
}
```

#### Fondi insufficienti
```javascript
// Errore: Fondi insufficienti per la generazione del video
// Causa: Saldo wallet insufficiente
// Soluzione: Ricarica il wallet

const hasFunds = wallet.balance >= estimatedCost;
if (!hasFunds) {
    throw new Error('Fondi insufficienti per la generazione del video');
}
```

## Gestione Errori nel Codice

### 1. Try-Catch Pattern

```javascript
async function processGoogleVeoRequest(requestData) {
    try {
        // Logica principale
        const result = await sendRequest(prompt, model, userId, chatId, onStream);
        return result;
    } catch (error) {
        logger.error('Errore nell\'elaborazione della richiesta Google Veo:', error);
        
        // Gestione specifica degli errori
        if (onStream) {
            onStream({
                type: 'video-generation-error',
                data: { error: error.message }
            });
        }
        
        throw error;
    }
}
```

### 2. Classificazione degli Errori

```javascript
function classifyError(error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return {
            type: 'NETWORK_ERROR',
            message: 'Errore di connessione di rete. Verifica la connessione internet.',
            retryable: true,
            retryDelay: 5000
        };
    } else if (error.code === 'ETIMEDOUT') {
        return {
            type: 'TIMEOUT_ERROR',
            message: 'Timeout della connessione. Riprova più tardi.',
            retryable: true,
            retryDelay: 10000
        };
    } else if (error.message.includes('API key')) {
        return {
            type: 'CONFIGURATION_ERROR',
            message: 'Errore di configurazione API key. Contatta l\'amministratore.',
            retryable: false
        };
    } else {
        return {
            type: 'UNKNOWN_ERROR',
            message: `Errore di rete: ${error.message}`,
            retryable: false
        };
    }
}
```

### 3. Retry Logic

```javascript
async function sendRequestWithRetry(prompt, model, userId, chatId, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await sendRequest(prompt, model, userId, chatId);
        } catch (error) {
            const errorInfo = classifyError(error);
            
            if (!errorInfo.retryable || attempt === maxRetries) {
                throw error;
            }
            
            console.log(`Tentativo ${attempt} fallito, riprovo tra ${errorInfo.retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, errorInfo.retryDelay));
        }
    }
}
```

## Logging degli Errori

### 1. Struttura del Log

```javascript
// Esempio di log strutturato
logger.error('Errore Google Veo', {
    error: error.message,
    code: error.code,
    stack: error.stack,
    userId: userId,
    chatId: chatId,
    modelId: modelId,
    prompt: prompt.substring(0, 100),
    timestamp: new Date().toISOString()
});
```

### 2. Livelli di Log

```javascript
// DEBUG: Informazioni dettagliate per il debug
logger.debug('Inizio generazione video', { prompt, modelId, userId });

// INFO: Informazioni generali
logger.info('Video generato con successo', { videoUrl, cost });

// WARN: Situazioni anomale ma non critiche
logger.warn('API key potrebbe non essere nel formato corretto');

// ERROR: Errori che impediscono l'operazione
logger.error('Errore nella generazione video', { error: error.message });

// FATAL: Errori critici che richiedono attenzione immediata
logger.fatal('Database non raggiungibile', { error: error.message });
```

## Monitoraggio degli Errori

### 1. Metriche da Monitorare

```javascript
// Tasso di errore per tipo
const errorMetrics = {
    networkErrors: 0,
    configurationErrors: 0,
    rateLimitErrors: 0,
    storageErrors: 0,
    generationErrors: 0,
    databaseErrors: 0
};

// Incrementa metriche
function incrementErrorMetric(errorType) {
    if (errorMetrics[errorType] !== undefined) {
        errorMetrics[errorType]++;
    }
}
```

### 2. Alerting

```javascript
// Alert per errori critici
function checkErrorThresholds() {
    const totalErrors = Object.values(errorMetrics).reduce((a, b) => a + b, 0);
    
    if (totalErrors > 100) {
        // Invia alert
        sendAlert('Troppi errori Google Veo rilevati', { metrics: errorMetrics });
    }
}
```

## Best Practices

### 1. Gestione delle Risorse

```javascript
// Cleanup automatico
async function generateVideoWithCleanup() {
    let tempFile = null;
    
    try {
        const result = await processGoogleVeoRequest(requestData);
        return result;
    } catch (error) {
        logger.error('Errore durante la generazione:', error);
        throw error;
    } finally {
        // Cleanup sempre eseguito
        if (tempFile) {
            await fs.unlink(tempFile).catch(() => {});
        }
    }
}
```

### 2. Timeout Management

```javascript
// Timeout per operazioni lunghe
async function sendRequestWithTimeout(prompt, model, userId, chatId, timeout = 300000) {
    return Promise.race([
        sendRequest(prompt, model, userId, chatId),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), timeout)
        )
    ]);
}
```

### 3. Circuit Breaker Pattern

```javascript
class CircuitBreaker {
    constructor(failureThreshold = 5, resetTimeout = 60000) {
        this.failureThreshold = failureThreshold;
        this.resetTimeout = resetTimeout;
        this.failures = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    }
    
    async execute(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.resetTimeout) {
                this.state = 'HALF_OPEN';
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }
        
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    onSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }
    
    onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }
}
```

## Troubleshooting

### 1. Checklist per Errori Comuni

- [ ] Verifica la connessione internet
- [ ] Controlla la configurazione dell'API key
- [ ] Verifica i permessi del filesystem
- [ ] Controlla lo spazio disponibile sul disco
- [ ] Verifica la configurazione di Google Cloud Storage
- [ ] Controlla i log del server
- [ ] Verifica il saldo del wallet
- [ ] Controlla i rate limit

### 2. Comandi di Debug

```bash
# Verifica configurazione
node -e "console.log('GOOGLE_GEMINI_KEY:', process.env.GOOGLE_GEMINI_KEY ? 'Configurata' : 'Mancante')"

# Test connessione database
node -e "require('./database').initialize().then(() => console.log('DB OK')).catch(console.error)"

# Test servizio Google Veo
node tests/manual/test-google-veo-manual.js
```

### 3. Log Analysis

```bash
# Cerca errori nei log
grep "ERROR.*google-veo" logs/app.log

# Conta errori per tipo
grep "ERROR" logs/app.log | grep "google-veo" | awk '{print $4}' | sort | uniq -c

# Monitora errori in tempo reale
tail -f logs/app.log | grep "ERROR.*google-veo"
```

Questa documentazione fornisce una guida completa per la gestione degli errori nel sistema AIGens, con particolare attenzione all'integrazione con Google Veo. 