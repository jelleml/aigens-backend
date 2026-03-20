# Google Veo Service - Documentazione

## Panoramica

Il servizio Google Veo fornisce funzionalità di generazione video da testo (text-to-video) utilizzando l'API di Google Veo. Il servizio è integrato nell'architettura esistente del server Node.js e supporta la gestione degli event stream per comunicare lo stato di avanzamento al frontend.

## Configurazione

### Prerequisiti

1. **API Key**: Assicurati che la variabile `GOOGLE_GEMINI_KEY` sia configurata nel file `.env`
2. **Dipendenze**: Il pacchetto `@google/genai` deve essere installato
3. **Database**: Il provider "google-veo" e i modelli devono essere configurati nel database

### Variabili d'Ambiente

```bash
GOOGLE_GEMINI_KEY=your_google_veo_api_key_here
```

## Funzionalità Principali

### 1. Generazione Video

Il servizio supporta la generazione di video da prompt testuali utilizzando i modelli Google Veo disponibili.

```javascript
const googleVeoService = require('./services/google-veo.service');

const result = await googleVeoService.processGoogleVeoRequest({
    prompt: 'Un gatto che gioca con una palla colorata',
    modelId: 1, // ID del modello Google Veo
    userId: 123,
    chatId: 456,
    onStream: (event) => {
        // Gestione eventi di progresso
        console.log('Evento:', event.type, event.data);
    }
});
```

### 2. Gestione Event Stream

Il servizio emette eventi per comunicare lo stato di avanzamento:

- `video-generation-started`: Inizio della generazione
- `video-generation-progress`: Aggiornamento del progresso (0-100%)
- `video-generation-completed`: Completamento della generazione
- `video-generation-error`: Errore durante la generazione

### 3. Gestione Fondi

Il servizio verifica automaticamente i fondi dell'utente prima di procedere con la generazione:

```javascript
const hasFunds = await googleVeoService.checkUserFunds(userId, estimatedCost);
if (!hasFunds) {
    throw new Error('Fondi insufficienti per la generazione del video');
}
```

## API Endpoints

### POST /api/v1/chats/:chatId/messages

Genera un video da un prompt testuale.

**Parametri:**
- `content` (string): Il prompt per la generazione del video
- `model_id` (number): ID del modello Google Veo da utilizzare
- `agent_type` (string): Deve essere impostato a `'video'`

**Esempio di richiesta:**
```json
{
    "content": "Un gatto che gioca con una palla colorata",
    "model_id": 1,
    "agent_type": "video"
}
```

**Risposta di successo:**
```json
{
    "success": true,
    "messageId": 123,
    "videoUrl": "https://storage.googleapis.com/...",
    "attachmentId": 456,
    "cost": 0.01
}
```

## Modelli Disponibili

### Google Veo 1.0
- **ID**: `google-veo-1.0`
- **Capacità**: Generazione video base
- **Costo**: 0.01 EUR per richiesta

### Google Veo 2.0
- **ID**: `google-veo-2.0`
- **Capacità**: Generazione video avanzata, editing video
- **Costo**: 0.02 EUR per richiesta

## Gestione Errori

Il servizio gestisce automaticamente i seguenti tipi di errori:

### Errori di Rete
- `ENOTFOUND`: Errore di connessione di rete
- `ECONNREFUSED`: Connessione rifiutata
- `ETIMEDOUT`: Timeout della connessione

### Errori di Configurazione
- API key non configurata
- API key non valida
- API key troppo corta

### Errori di Rate Limit
- Troppe richieste al minuto (max 10)
- Troppe richieste all'ora (max 100)

### Errori di Storage
- Spazio insufficiente sul disco
- Permessi insufficienti
- Errori di upload su Google Cloud Storage

### Errori di Generazione Video
- Prompt non valido
- Contenuto inappropriato rilevato
- Errori di elaborazione video

## Esempi di Utilizzo

### Esempio 1: Generazione Video Semplice

```javascript
const result = await googleVeoService.processGoogleVeoRequest({
    prompt: 'Un paesaggio di montagna al tramonto',
    modelId: 1,
    userId: 123,
    chatId: 456
});

console.log('Video URL:', result.videoUrl);
console.log('Costo:', result.cost);
```

### Esempio 2: Generazione con Event Stream

```javascript
const result = await googleVeoService.processGoogleVeoRequest({
    prompt: 'Un robot che cammina in una città futura',
    modelId: 1,
    userId: 123,
    chatId: 456,
    onStream: (event) => {
        switch (event.type) {
            case 'video-generation-started':
                console.log('🚀 Generazione iniziata');
                break;
            case 'video-generation-progress':
                console.log(`📊 Progresso: ${event.data.progress}%`);
                break;
            case 'video-generation-completed':
                console.log('✅ Generazione completata');
                break;
            case 'video-generation-error':
                console.log(`❌ Errore: ${event.data.error}`);
                break;
        }
    }
});
```

### Esempio 3: Verifica Modelli Disponibili

```javascript
const models = await googleVeoService.getAvailableModels();
console.log('Modelli disponibili:', models);

const isAvailable = await googleVeoService.isModelAvailable('google-veo-1.0');
console.log('Modello disponibile:', isAvailable);
```

## Costi e Pricing

### Struttura dei Costi

- **Google Veo 1.0**: 0.01 EUR per richiesta
- **Google Veo 2.0**: 0.02 EUR per richiesta

### Calcolo Costi

```javascript
const costDetails = await googleVeoService.calculateCost(modelId, 1, 'Generate');
console.log('Costo stimato:', costDetails.estimatedCost);
```

## Sicurezza

### Validazione Input

- Verifica della lunghezza del prompt
- Controllo del contenuto inappropriato
- Validazione dell'API key

### Gestione Fondi

- Verifica automatica dei fondi prima della generazione
- Aggiornamento atomico del wallet
- Registrazione delle transazioni

### Rate Limiting

- Limite di 10 richieste al minuto per utente
- Limite di 100 richieste all'ora per utente
- Gestione automatica dei rate limit

## Monitoraggio e Logging

Il servizio utilizza il sistema di logging centralizzato per tracciare:

- Richieste di generazione video
- Errori e eccezioni
- Utilizzo dei fondi
- Performance e tempi di risposta

### Esempi di Log

```
[INFO] Google Veo Service: Invio richiesta a Google Veo per prompt: Un gatto che gioca...
[INFO] Google Veo Service: Wallet aggiornato per l'utente 123. Nuovo saldo: 99.99
[ERROR] Google Veo Service: Errore nell'invio della richiesta a Google Veo: Rate limit superato
```

## Troubleshooting

### Problemi Comuni

1. **API Key non configurata**
   - Verifica che `GOOGLE_GEMINI_KEY` sia presente nel file `.env`
   - Assicurati che l'API key sia valida

2. **Fondi insufficienti**
   - Verifica il saldo del wallet dell'utente
   - Ricarica il wallet se necessario

3. **Rate limit superato**
   - Aspetta 60 secondi prima di fare una nuova richiesta
   - Riduci la frequenza delle richieste

4. **Errori di storage**
   - Verifica lo spazio disponibile sul disco
   - Controlla i permessi di scrittura
   - Verifica la configurazione di Google Cloud Storage

### Debug

Per abilitare il debug, imposta il livello di log a `DEBUG`:

```javascript
const logger = require('./services/logging').getLogger('google-veo', 'service');
logger.setLevel('DEBUG');
```

## Performance

### Ottimizzazioni

- Cache dei modelli disponibili (1 ora)
- Gestione efficiente delle connessioni
- Upload asincrono su Google Cloud Storage
- Cleanup automatico dei file temporanei

### Metriche

- Tempo medio di generazione: ~30-60 secondi
- Dimensione media dei video: 1-5 MB
- Throughput massimo: 10 richieste/minuto per utente

## Supporto

Per problemi o domande relative al servizio Google Veo:

1. Controlla i log del server
2. Verifica la configurazione del database
3. Controlla lo stato dell'API key
4. Consulta la documentazione delle API Google Veo 