# Gestione Sincronizzazione Database

## Panoramica

Il sistema è stato ottimizzato per evitare la ricreazione automatica degli indici ad ogni avvio del server, migliorando significativamente i tempi di startup.

## Comportamento Predefinito

-   **Avvio normale del server**: La sincronizzazione del database è **disabilitata** di default
-   **Nessuna ricreazione di indici**: Gli indici esistenti non vengono modificati
-   **Avvio veloce**: Il server si avvia molto più rapidamente

## Comandi Disponibili

### 1. `npm run start-sync`

Esegue la sincronizzazione manuale del database per aggiornare indici e struttura delle tabelle.

**Quando usarlo:**

-   Dopo aver aggiunto nuovi modelli
-   Dopo aver modificato la struttura delle tabelle
-   Per aggiornare gli indici esistenti
-   Prima del deploy in produzione

**Comportamento:**

-   Usa `alter: true` per aggiornare la struttura
-   Non elimina dati esistenti
-   Ricrea solo gli indici necessari

### 2. `npm run force-sync`

Esegue la sincronizzazione forzata del database (⚠️ **PERICOLOSO**).

**Quando usarlo:**

-   Solo in ambiente di sviluppo
-   In caso di emergenza
-   Per ricreare completamente il database

**Comportamento:**

-   Elimina **TUTTI** i dati dal database
-   Ricrea tutte le tabelle da zero
-   Richiede conferma manuale

## Esempi di Utilizzo

### Sincronizzazione Normale

```bash
# Aggiorna indici e struttura senza perdere dati
npm run start-sync
```

### Sincronizzazione Forzata (Solo Development)

```bash
# Elimina tutto e ricrea da zero (richiede conferma)
npm run force-sync
```

### Avvio Server Normale

```bash
# Avvio veloce senza sincronizzazione
npm start
# oppure
npm run dev
```

## Vantaggi della Nuova Implementazione

1. **Performance**: Avvio del server molto più veloce
2. **Sicurezza**: Nessuna modifica accidentale agli indici
3. **Controllo**: Sincronizzazione solo quando necessario
4. **Flessibilità**: Comandi dedicati per diversi scenari

## Note Tecniche

-   La funzione `initializeDatabase()` ora accetta un parametro `enableSync` (default: `false`)
-   Il `DatabaseManager.sync()` supporta l'opzione `skipSync` per saltare completamente la sincronizzazione
-   Gli script di sincronizzazione gestiscono correttamente la chiusura delle connessioni

## Troubleshooting

### Problema: Tabelle mancanti dopo aggiornamento modelli

**Soluzione:** Eseguire `npm run start-sync`

### Problema: Indici duplicati o corrotti

**Soluzione:** Eseguire `npm run cleanup-indexes` seguito da `npm run start-sync`

### Problema: Database completamente corrotto (solo development)

**Soluzione:** Eseguire `npm run force-sync` (⚠️ elimina tutti i dati)
