# Requirements - Documentazione Struttura Progetto

## Contesto
Il progetto `aigens-backend` è un'applicazione Node.js/Express complessa che gestisce un sistema di AI con integrazione di modelli multipli, autenticazione OAuth, gestione pagamenti e analytics. La struttura del progetto è diventata complessa e necessita di una documentazione chiara per facilitare la navigazione e la comprensione del codebase.

## Obiettivi
1. **Analizzare la struttura completa** del progetto aigens-backend
2. **Identificare tutti i file e cartelle** importanti
3. **Creare una regola Cursor** che documenti l'organizzazione del progetto
4. **Fornire una guida di navigazione** per sviluppatori e maintainer
5. **Documentare le convenzioni** di nomenclatura e architettura

## Requisiti Specifici

### Documentazione Struttura
- [x] Mappare tutte le directory principali
- [x] Identificare i file di configurazione importanti
- [x] Documentare la struttura delle API
- [x] Descrivere il layer dei servizi
- [x] Mappare i modelli del database
- [x] Documentare i controller e middleware
- [x] Identificare i file di setup e utility

### Regola Cursor
- [x] Creare una regola Cursor completa
- [x] Includere panoramica generale del progetto
- [x] Documentare la struttura delle directory
- [x] Spiegare le convenzioni di nomenclatura
- [x] Descrivere l'architettura del sistema
- [x] Fornire note importanti per lo sviluppo

### Organizzazione Informazioni
- [x] Struttura gerarchica chiara
- [x] Descrizioni concise ma complete
- [x] Identificazione dei ruoli di ogni componente
- [x] Riferimenti incrociati tra componenti correlati

## Risultati Attesi
1. Una regola Cursor completa in `.cursor/rules/project-structure.mdc`
2. Documentazione della struttura del progetto per riferimento futuro
3. Guida per nuovi sviluppatori che si uniscono al progetto
4. Base per future modifiche e miglioramenti alla documentazione

## Tecnologie e Framework
- **Backend**: Node.js, Express.js
- **Database**: Sequelize ORM
- **Testing**: Jest
- **Documentation**: Swagger, Markdown
- **Authentication**: Passport.js, OAuth
- **AI Integration**: Multiple providers (Anthropic, OpenAI, DeepSeek, etc.)
- **Payments**: Stripe, Bitcoin
- **File Storage**: Google Cloud Storage 