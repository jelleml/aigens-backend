# Tasks: Fix Processo Migrazione Database

## Task List

### Fase 1: Analisi e Preparazione

-   [x] **Task 1.1**: Analizzare la migrazione problematica `20250722212127-create-inbox-table`
-   [x] **Task 1.2**: Verificare lo stato attuale del database
-   [x] **Task 1.3**: Identificare tutte le migrazioni che potrebbero avere problemi simili
-   [ ] **Task 1.4**: Creare backup del database prima di procedere

### Fase 2: Implementazione Utility di Sicurezza

-   [x] **Task 2.1**: Creare file `utils/migration-helpers.js` con utility di sicurezza
-   [x] **Task 2.2**: Implementare funzione `checkIndexExists`
-   [x] **Task 2.3**: Implementare funzione `safeCreateIndex`
-   [x] **Task 2.4**: Implementare funzione `checkColumnExists`
-   [x] **Task 2.5**: Implementare funzione `safeAddColumn`
-   [x] **Task 2.6**: Testare le utility con database di test

### Fase 3: Fix Migrazione Problematica

-   [x] **Task 3.1**: Localizzare la migrazione `20250722212127-create-inbox-table`
-   [x] **Task 3.2**: Modificare la migrazione per utilizzare controlli di sicurezza
-   [x] **Task 3.3**: Aggiungere logging dettagliato alla migrazione
-   [x] **Task 3.4**: Testare la migrazione modificata
-   [x] **Task 3.5**: Verificare che il rollback funzioni correttamente

### Fase 4: Sistema di Verifica Pre-Migrazione

-   [x] **Task 4.1**: Creare script `scripts/verify-migration-state.js`
-   [x] **Task 4.2**: Implementare verifica connessione database
-   [x] **Task 4.3**: Implementare verifica tabelle esistenti
-   [x] **Task 4.4**: Implementare verifica indici problematici
-   [x] **Task 4.5**: Aggiungere script al package.json per facile esecuzione

### Fase 5: Miglioramento Logging

-   [x] **Task 5.1**: Creare logger specializzato per migrazioni
-   [x] **Task 5.2**: Implementare funzioni di logging per step di migrazione
-   [x] **Task 5.3**: Integrare il logger nelle migrazioni esistenti
-   [x] **Task 5.4**: Testare il logging in ambiente di sviluppo

### Fase 6: Script di Pulizia

-   [x] **Task 6.1**: Creare script `scripts/cleanup-duplicate-indexes.js`
-   [x] **Task 6.2**: Implementare logica per identificare indici duplicati
-   [x] **Task 6.3**: Implementare logica di pulizia sicura
-   [x] **Task 6.4**: Testare lo script su database di test

### Fase 7: Documentazione e Best Practices

-   [x] **Task 7.1**: Creare guida per sviluppatori su migrazioni sicure
-   [x] **Task 7.2**: Documentare best practices per controlli di sicurezza
-   [x] **Task 7.3**: Creare troubleshooting guide
-   [ ] **Task 7.4**: Aggiornare README con nuove procedure

### Fase 8: Test e Validazione

-   [ ] **Task 8.1**: Test con database pulito
-   [ ] **Task 8.2**: Test con database con dati esistenti
-   [ ] **Task 8.3**: Test di rollback
-   [ ] **Task 8.4**: Test di performance
-   [ ] **Task 8.5**: Test di stress con multiple migrazioni

### Fase 9: Deploy e Monitoraggio

-   [ ] **Task 9.1**: Deploy in ambiente di staging
-   [ ] **Task 9.2**: Eseguire migrazioni in staging
-   [ ] **Task 9.3**: Monitorare log e performance
-   [ ] **Task 9.4**: Deploy in produzione
-   [ ] **Task 9.5**: Configurare alert per errori di migrazione

## Note di Implementazione

### Priorità

-   **Alta**: Task 1.1, 1.2, 2.1-2.6, 3.1-3.5
-   **Media**: Task 4.1-4.5, 5.1-5.4, 6.1-6.4
-   **Bassa**: Task 7.1-7.4, 8.1-8.5, 9.1-9.5

### Dipendenze

-   Task 2.1-2.6 devono essere completati prima di Task 3.1-3.5
-   Task 4.1-4.5 possono essere eseguiti in parallelo con Task 5.1-5.4
-   Task 6.1-6.4 richiedono il completamento di Task 2.1-2.6

### Stima Tempi

-   **Fase 1**: 2 ore
-   **Fase 2**: 4 ore
-   **Fase 3**: 3 ore
-   **Fase 4**: 3 ore
-   **Fase 5**: 2 ore
-   **Fase 6**: 3 ore
-   **Fase 7**: 2 ore
-   **Fase 8**: 4 ore
-   **Fase 9**: 2 ore

**Totale stimato**: 25 ore
