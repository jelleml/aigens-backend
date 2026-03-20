# Design - Documentazione Struttura Progetto

## Piano di Implementazione

### Fase 1: Analisi della Struttura
1. **Esplorazione Root Directory**
   - Identificare tutti i file e cartelle principali
   - Mappare i file di configurazione critici
   - Documentare i file di setup OAuth

2. **Analisi Layer per Layer**
   - **API Layer**: Esaminare `/api/v1/` e tutti gli endpoint
   - **Services Layer**: Analizzare tutti i servizi in `/services/`
   - **Database Layer**: Mappare modelli e migrazioni
   - **Controllers**: Documentare i controller
   - **Middlewares**: Identificare tutti i middleware

3. **Analisi Directory Specializzate**
   - **Scripts**: Documentare utility e script di setup
   - **Tests**: Mappare struttura dei test
   - **Docs**: Identificare documentazione esistente
   - **Memory Bank**: Analizzare documentazione interna
   - **Uploads**: Documentare gestione file
   - **Templates**: Mappare template email

### Fase 2: Creazione Regola Cursor
1. **Struttura della Regola**
   - Header con metadata appropriati
   - Panoramica generale del progetto
   - Struttura dettagliata delle directory
   - Convenzioni di nomenclatura
   - Architettura del sistema
   - Note importanti

2. **Organizzazione Contenuti**
   - Struttura gerarchica chiara
   - Emoji per identificazione rapida
   - Commenti descrittivi per ogni file/cartella
   - Raggruppamento logico dei componenti

### Fase 3: Documentazione Completa
1. **Sezioni Principali**
   - Root Directory e file principali
   - API Layer con tutti gli endpoint
   - Services Layer con tutti i servizi
   - Database Layer con modelli
   - Controllers e Middlewares
   - Configuration e Scripts
   - Tests e Documentation
   - Memory Bank e Uploads

2. **Informazioni Aggiuntive**
   - File di configurazione importanti
   - Convenzioni di nomenclatura
   - Architettura del sistema
   - Note per lo sviluppo

## Struttura della Regola Cursor

### Header
```markdown
---
description: Struttura del progetto aigens-backend e organizzazione dei file
globs: **/*
alwaysApply: false
---
```

### Contenuti Principali
1. **Panoramica Generale**
   - Descrizione del progetto
   - Tecnologie utilizzate
   - Scopo principale

2. **Struttura Directory**
   - Root Directory
   - API Layer
   - Services Layer
   - Database Layer
   - Controllers
   - Middlewares
   - Configuration
   - Scripts
   - Tests
   - Documentation
   - Memory Bank
   - Uploads
   - Templates
   - Public

3. **File Importanti**
   - File di Setup OAuth
   - File di Debug e Verifica
   - File di Utility

4. **Convenzioni e Architettura**
   - Convenzioni di nomenclatura
   - Layer Pattern
   - Gestione Modelli AI
   - Sistema di Logging

5. **Note Importanti**
   - Tecnologie utilizzate
   - Pattern architetturali
   - Integrazioni principali

## Esempi di Implementazione

### Struttura Directory con Emoji
```markdown
### 📁 **API Layer** (`/api`)
```
api/
└── v1/                         # API version 1
    ├── index.js                # Router principale API v1
    ├── auth.js                 # Endpoint autenticazione
    ├── chats.js                # Gestione chat
    └── ...                     # Altri endpoint
```

### Descrizione Servizi
```markdown
services/
├── auth.service.js             # Servizio autenticazione
├── model.service.js            # Gestione modelli AI
├── anthropic.service.js        # Integrazione Anthropic
├── openai.service.js           # Integrazione OpenAI
└── ...                         # Altri servizi
```

### Architettura Layer
```markdown
### **Layer Pattern**
1. **API Layer** (`/api`) - Endpoint REST
2. **Controllers** (`/controllers`) - Logica di controllo
3. **Services** (`/services`) - Logica di business
4. **Models** (`/database/models`) - Modelli dati
5. **Middlewares** (`/middlewares`) - Intercettori
```

## Criteri di Qualità

### Completezza
- [x] Tutte le directory principali mappate
- [x] Tutti i file importanti identificati
- [x] Descrizioni accurate e informative
- [x] Struttura gerarchica corretta

### Chiarezza
- [x] Linguaggio semplice e comprensibile
- [x] Organizzazione logica delle informazioni
- [x] Uso di emoji per identificazione rapida
- [x] Commenti descrittivi per ogni elemento

### Utilità
- [x] Guida per nuovi sviluppatori
- [x] Riferimento per maintainer
- [x] Base per future modifiche
- [x] Documentazione delle convenzioni

## Risultati Attesi
1. Regola Cursor completa e ben strutturata
2. Documentazione della struttura del progetto
3. Guida di navigazione per il codebase
4. Base per future aggiornamenti della documentazione 