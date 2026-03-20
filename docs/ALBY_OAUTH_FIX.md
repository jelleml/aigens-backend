# Fix per Errore di Validazione Alby OAuth

## Problema Identificato

L'errore "Critical error in Alby OAuth callback: Validation error" era causato da due problemi principali:

1. **Mancanza della tabella `user_settings`**: La funzione `ensureUserSettings` nel callback Alby tentava di creare un record in una tabella che non esisteva.

2. **Errore `SequelizeUniqueConstraintError`**: Il metodo `findOrCreate` non gestiva correttamente i casi in cui un utente esistente aveva già un `alby_id` diverso o quando c'erano conflitti di unicità.

## Soluzione Implementata

### 1. Creazione della Tabella user_settings

È stata creata una nuova migrazione (`20250801173801-create-user-settings-table.js`) che:

-   Crea la tabella `user_settings` con tutti i campi necessari
-   Definisce la relazione con la tabella `users` tramite foreign key
-   Include tutti i campi per le impostazioni utente e i parametri auto-selector

### 2. Miglioramento della Gestione degli Errori

Sono stati apportati miglioramenti al codice:

-   Aggiunto logging dettagliato nella funzione `ensureUserSettings`
-   Migliorata la gestione degli errori nel callback Alby
-   Aggiunta gestione graceful degli errori per non bloccare il flusso di autenticazione

### 3. Risoluzione del Problema `SequelizeUniqueConstraintError`

È stata implementata una nuova logica per la gestione degli utenti che:

-   Prima cerca l'utente per `alby_id`
-   Se non lo trova, cerca per email
-   Se trova un utente esistente per email, aggiorna il `alby_id`
-   Se non trova nessun utente, ne crea uno nuovo
-   Gestisce correttamente i conflitti di unicità

### 4. Struttura della Tabella user_settings

La tabella include i seguenti campi:

```sql
- id (UUID, primary key)
- user_id (UUID, foreign key to users.id)
- default_language (STRING, default: 'italian')
- auto_save_chats (BOOLEAN, default: false)
- enable_notifications (BOOLEAN, default: true)
- dark_mode (BOOLEAN, default: false)
- show_tooltips (BOOLEAN, default: true)
- efficiency (INTEGER, default: 50, range: 0-100)
- quality (INTEGER, default: 50, range: 0-100)
- speed (INTEGER, default: 50, range: 0-100)
- syntheticity (INTEGER, default: 50, range: 0-100)
- creativity (INTEGER, default: 50, range: 0-100)
- scientificity (INTEGER, default: 50, range: 0-100)
- created_at (DATE)
- updated_at (DATE)
```

## Test di Verifica

### 1. Test dell'Endpoint Alby

```bash
curl -s "http://localhost:5555/api/v1/auth/alby" -w "%{http_code}"
```

**Risultato**: ✅ Reindirizza correttamente a Alby OAuth

### 2. Test dell'Endpoint di Test

```bash
curl -s "http://localhost:5555/api/v1/auth/alby-test-login" -w "%{http_code}"
```

**Risultato**: ✅ Genera token JWT valido e reindirizza al frontend

### 3. Test della Gestione Utenti Esistenti

```bash
# Test con utente esistente
curl -s "http://localhost:5555/api/v1/auth/alby-test-login" -w "%{http_code}"

# Test con nuovo utente
curl -s "http://localhost:5555/api/v1/auth/alby-test-login?email=newuser@example.com" -w "%{http_code}"
```

**Risultato**: ✅ Gestisce correttamente sia utenti esistenti che nuovi

### 4. Verifica Migrazione

```bash
npx sequelize-cli db:migrate:status
```

**Risultato**: ✅ Tutte le migrazioni sono state eseguite correttamente

## Configurazione OAuth Alby

Le credenziali Alby sono configurate correttamente:

### Sviluppo

-   **Client ID**: `lefOMpV1ms`
-   **Client Secret**: `2GEW4Z9f7Bfw8aha5F4n`
-   **Callback URL**: `http://localhost:5555/api/v1/auth/alby/callback`

### Produzione

-   **Client ID**: `uTEOij1b7t`
-   **Client Secret**: `scjGcEbGJi6qbP0ICL29`
-   **Callback URL**: `https://your-production-domain.com/api/v1/auth/alby/callback`

## Prossimi Passi

1. **Test Completo del Flusso OAuth**: Testare il flusso completo con Alby in ambiente di sviluppo
2. **Monitoraggio**: Monitorare i log per eventuali errori durante l'autenticazione
3. **Deploy in Produzione**: Assicurarsi che la migrazione sia eseguita anche in produzione
4. **Test di Integrazione**: Verificare che il frontend gestisca correttamente i token JWT generati

## Note Importanti

-   La funzione `ensureUserSettings` ora include gestione degli errori robusta
-   Il flusso di autenticazione non viene bloccato se la creazione delle impostazioni fallisce
-   I log dettagliati aiutano a identificare eventuali problemi futuri
-   La tabella `user_settings` è collegata alla tabella `users` tramite foreign key con CASCADE
-   La nuova logica di gestione utenti risolve i conflitti di unicità
-   Il sistema gestisce correttamente utenti esistenti e nuovi utenti
-   I token JWT vengono generati correttamente per l'autenticazione

## Comandi Utili

```bash
# Verificare lo stato delle migrazioni
npx sequelize-cli db:migrate:status

# Eseguire le migrazioni pendenti
npx sequelize-cli db:migrate

# Testare l'endpoint Alby
curl -s "http://localhost:5555/api/v1/auth/alby"

# Testare l'endpoint di test
curl -s "http://localhost:5555/api/v1/auth/alby-test-login"
```
