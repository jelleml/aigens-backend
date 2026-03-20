# Sistema di Autenticazione AIGens

Questa documentazione descrive il sistema di autenticazione passwordless e social implementato per AIGens.

## Panoramica

Il sistema di autenticazione utilizza un approccio moderno, eliminando la necessità di password tradizionali e offrendo un'esperienza utente migliorata attraverso:

1. **Autenticazione passwordless** - Gli utenti si autenticano tramite link sicuri inviati via email
2. **Autenticazione social** - Supporto per login tramite Google, Microsoft e GitHub
3. **Token JWT** - Utilizzo di token JWT per l'autenticazione delle API
4. **Gestione sessioni** - Utilizzo di sessioni Express per l'autenticazione web

## Modelli Dati

### User

Il modello utente è stato aggiornato per supportare l'autenticazione passwordless e social:

-   `id` - UUID come chiave primaria
-   `email` - Email unica dell'utente (richiesta)
-   `username` - Username opzionale
-   `password` - Password opzionale (per compatibilità con il vecchio sistema)
-   `first_name` e `last_name` - Nome e cognome dell'utente
-   `google_id`, `microsoft_id`, `github_id` - ID per i provider social
-   `is_email_verified` - Flag per indicare se l'email è stata verificata
-   `verification_token` - Token per la verifica dell'email
-   Altri campi precedentemente esistenti...

### Token

Nuovo modello per gestire i token di accesso passwordless:

-   `id` - ID numerico incrementale
-   `user_id` - Riferimento all'utente (può essere null)
-   `email` - Email dell'utente
-   `token` - Token univoco
-   `ttl` - Durata di validità in millisecondi
-   `is_valid` - Flag che indica se il token è ancora valido

## Flussi di Autenticazione

### Autenticazione Passwordless

1. L'utente inserisce la propria email e richiede un link di accesso
2. Il sistema genera un token univoco e lo invia all'email dell'utente
3. L'utente clicca sul link nell'email (contenente il token)
4. Il sistema verifica il token e autentica l'utente
5. Se l'utente non esiste, viene creato automaticamente

### Autenticazione Social

1. L'utente clicca sul pulsante per l'accesso social (Google, Microsoft o GitHub)
2. Viene reindirizzato alla pagina di autorizzazione del provider
3. Dopo l'autorizzazione, il provider reindirizza all'endpoint callback
4. Il sistema verifica le informazioni restituite dal provider
5. Se l'utente non esiste, viene creato automaticamente
6. Se esiste un utente con la stessa email, gli account vengono collegati

## Endpoint API

### Autenticazione Passwordless

-   `POST /api/v1/auth/login/passwordless` - Richiede un link di accesso via email
-   `GET /api/v1/auth/passwordless/:token` - Verifica il token e autentica l'utente

### Autenticazione Social

-   `GET /api/v1/auth/alby` - Avvia il flusso di autenticazione Alby
-   `GET /api/v1/auth/alby/callback` - Callback per l'autenticazione Alby
-   `GET /api/v1/auth/portal` - Avvia il flusso di autenticazione Portal
-   `GET /api/v1/auth/portal/callback` - Callback per l'autenticazione Portal
-   `GET /api/v1/auth/google` - Avvia il flusso di autenticazione Google
-   `GET /api/v1/auth/google/callback` - Callback per l'autenticazione Google
-   `GET /api/v1/auth/microsoft` - Avvia il flusso di autenticazione Microsoft
-   `GET /api/v1/auth/microsoft/callback` - Callback per l'autenticazione Microsoft
-   `GET /api/v1/auth/github` - Avvia il flusso di autenticazione GitHub
-   `GET /api/v1/auth/github/callback` - Callback per l'autenticazione GitHub

### Altri Endpoint

-   `GET /api/v1/auth/me` - Restituisce i dati dell'utente autenticato
-   `POST /api/v1/auth/refresh-token` - Rinnova il token JWT
-   `GET /api/v1/auth/verify-email/:token` - Verifica l'email dell'utente
-   `POST /api/v1/auth/logout` - Effettua il logout dell'utente
-   `POST /api/v1/auth/logout-all` - Effettua il logout da tutti i dispositivi

## Sicurezza

Il sistema implementa diverse misure di sicurezza:

1. **Token monouso** - I token passwordless possono essere utilizzati una sola volta
2. **Limitazione delle richieste** - Protezione contro attacchi di forza bruta
3. **Protezione CSRF** - Implementazione di token CSRF per le operazioni sensibili
4. **Headers di sicurezza** - Utilizzo di Helmet per impostare header HTTP sicuri
5. **Cookie sicuri** - Cookie di sessione con flag HttpOnly e Secure (in produzione)

## Configurazione

Per configurare il sistema, è necessario impostare le seguenti variabili d'ambiente:

```
# Email Service
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=user@example.com
EMAIL_PASSWORD=password
EMAIL_FROM=AIGens <no-reply@aigens.it>

# Session
SESSION_SECRET=your-secret-session-key

# OAuth Providers
ALBY_CLIENT_ID=your-alby-client-id
ALBY_CLIENT_SECRET=your-alby-client-secret
ALBY_CLIENT_ID=your-alby-client-id
PORTAL_SERVER_URL=your-portal-cerver
PORTAL_AUTH_TOKEN=your-portal-auth-client
NWC_URL=your-nostr-wallet-url
PORTAL_CALLBACK_URI=your-portal-callback-url
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

## Migrazione dal Sistema Precedente

Per migrare dal sistema di autenticazione precedente:

1. Esegui le migrazioni del database

    ```
    npx sequelize-cli db:migrate
    ```

2. Gli utenti esistenti conserveranno le loro credenziali ma potranno anche utilizzare i nuovi metodi di autenticazione
3. Il sistema gestisce automaticamente il collegamento degli account social con gli account esistenti basati su email

## Testing

Per testare il sistema di autenticazione:

```
npm test -- --testPathPattern=auth
```
