# AiGens Backend

Backend API per la piattaforma AiGens - Sistema di gestione modelli AI con supporto per provider diretti e aggregatori.

## 🚀 Quick Start

### Prerequisiti
- Node.js 18+
- MySQL 8.0+
- NPM/Yarn

### Installazione
```bash
git clone <repository-url>
cd aigens-backend
npm install
```

### Configurazione
1. Copia e configura il file di environment:
```bash
cp .env.example .env
```

2. Configura le variabili nel file `.env`:
```bash
# Database
DB_HOST=localhost
DB_NAME=aigens
DB_USER=your_user
DB_PASSWORD=your_password

# API Keys
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
TOGETHER_API_KEY=your_together_key
OPENROUTER_API_KEY=your_openrouter_key
```

## 🗄️ Inizializzazione Database

### Procedura Completa (Fresh Start)

Segui **ESATTAMENTE** questo ordine per inizializzare il database da zero:

#### 1. Inizializzazione Struttura e Dati Base
```bash
node scripts/init-database-from-scratch.js
```
**Cosa fa:**
- ✅ Crea tutte le tabelle del database
- ✅ Popola la tabella `providers` (direct/indirect/both/aggregator)
- ✅ Popola la tabella `provider_subscriptions` (da CSV)
- ✅ Crea i pricing tiers per gli aggregatori

#### 2. Popolamento Modelli
```bash
node scripts/init-all-models-unified.js
```
**Cosa fa:**
- ✅ Inizializza TUTTI i modelli di TUTTI i provider
- ✅ Supporta provider diretti (OpenAI, Anthropic, DeepSeek, Ideogram)
- ✅ Fetcha modelli da API degli aggregatori (Together.ai, OpenRouter)
- ✅ Crea automaticamente le relazioni `aggregated_models`
- ✅ Include modelli chat, audio e image

#### 3. Collegamento Modelli-Subscription
```bash
node scripts/populate-model-subscriptions.js
```
**Cosa fa:**
- ✅ Collega ogni modello alle subscription del suo provider
- ✅ Salta provider aggregatori (Together.ai, OpenRouter)
- ✅ Salta provider senza subscription

### Output Atteso

```
=== UNIFIED MODEL INITIALIZATION ===
Found 14 providers in database

--- Initializing openai models ---
✅ openai: 4 models initialized

--- Initializing anthropic models ---
✅ anthropic: 6 models initialized

--- Initializing together models ---
✅ together: 72 models initialized

--- Initializing openrouter models ---
✅ openrouter: 302 models initialized

--- Creating aggregated model relationships ---
✅ Total aggregated model relationships created: 201

=== INITIALIZATION COMPLETE ===
Total models initialized: 400+
```

## 🏗️ Architettura Database

### Schema Principale

```
Provider (anthropic, openai, meta, together, etc.)
├── provider_type: direct|indirect|both|aggregator
├── Models (modelli del provider)
├── ProviderSubscriptions (piani pricing)
└── AggregatorPricingTiers (solo per aggregatori)

AggregatedModel (junction table)
├── Collega aggregator → source provider
├── Tracks markup e availability
└── References pricing tier
```

### Tipi di Provider

- **direct**: Provider che integriamo direttamente (anthropic, deepseek)
- **indirect**: Provider disponibili solo tramite aggregatori (meta, mistral)
- **both**: Provider disponibili sia direct che via aggregatori (openai, google)
- **aggregator**: Servizi che espongono modelli di altri provider (together, openrouter)

## 📁 Struttura Progetto

```
aigens-backend/
├── api/v1/              # API endpoints
├── controllers/         # Business logic
├── services/           # External integrations
├── database/
│   ├── models/         # Sequelize models
│   └── migrations/     # Database migrations
├── scripts/            # Initialization & maintenance
├── memory-bank/        # Technical documentation
└── uploads/           # File uploads (including subscriptions.csv)
```

## 🛠️ Script Principali

### Inizializzazione
- `index.js` - Setup iniziale database
- `init-all-models-unified.js` - Popolamento tutti i modelli
- `populate-model-subscriptions.js` - Collegamento modelli-subscription

### Manutenzione
- `cleanup.js` - Pulizia database
- `migrate-message-costs.js` - Migrazione costi messaggi
- `export-swagger.js` - Generazione documentazione API

## 🔧 API Endpoints

### Modelli
- `GET /api/v1/models` - Lista modelli disponibili
- `GET /api/v1/models/:id` - Dettagli modello specifico

### Chat
- `POST /api/v1/chats` - Crea nuova chat
- `POST /api/v1/messages` - Invia messaggio

### Utenti
- `POST /api/v1/auth/login` - Login utente
- `GET /api/v1/users/me` - Profilo utente corrente

## 📊 Monitoring & Analytics

Il sistema traccia automaticamente:
- Usage statistics per modello
- Costi per messaggio
- Performance metrics
- User analytics

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm run test:integration
npm run test:services
```

## 🚀 Deployment

```bash
# Production build
npm run build

# Start production server
npm start

# Start development server
npm run dev
```

## 📝 Documentation

Documentazione tecnica dettagliata disponibile in:
- `memory-bank/architecture/` - Architettura sistema
- `memory-bank/decisions/` - Decisioni architetturali
- `docs/` - Guide specifiche

## 🤝 Contributing

1. Fork del repository
2. Crea feature branch
3. Commit delle modifiche
4. Push del branch
5. Apri Pull Request
