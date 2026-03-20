# Requirements - Fix Signed URLs CORS Issue

## Problema Identificato

### Issue: Signed URLs failing in browser due to CORS header signature mismatch

**Descrizione del Problema:**
- Le Signed URLs generate per le immagini caricate falliscono nel browser
- Errore causato da mismatch nella firma delle intestazioni CORS
- Il frontend JavaScript non riesce a recuperare le immagini a causa di conflitti CORS/signature

**Causa Tecnica:**
- Le Signed URLs di Google Cloud Storage includono le intestazioni HTTP nella firma
- Quando il browser aggiunge automaticamente intestazioni CORS, la firma non corrisponde più
- Questo causa un errore di autenticazione e il fallimento del caricamento dell'immagine

## Soluzioni Possibili

### Approccio #1: Include CORS headers in signature
- Generare Signed URLs includendo le intestazioni CORS attese nella firma
- Più complesso da implementare
- Richiede configurazione dettagliata delle intestazioni CORS

### Approccio #2: Make uploaded images public (RACCOMANDATO)
- Rendere pubbliche le immagini caricate
- Restituire URL pubblici semplici invece di Signed URLs
- Più semplice e affidabile per immagini generate (non dati sensibili)

## Requisiti Tecnici

### Per Approccio #2 (Raccomandato):

1. **Modifica Upload Process:**
   - Chiamare `makePublic()` sui file caricati
   - Restituire URL pubblici: `https://storage.googleapis.com/bucket-name/file-name`

2. **Compatibilità Frontend:**
   - Il frontend deve funzionare con entrambi gli approcci
   - Necessita solo di URL che possono essere recuperati via JavaScript senza conflitti CORS/signature

3. **Sicurezza:**
   - Le immagini generate non sono dati sensibili dell'utente
   - L'approccio pubblico è appropriato per questo tipo di contenuto

## Criteri di Accettazione

### Funzionalità Core
- [ ] Le immagini caricate sono accessibili dal browser senza errori CORS
- [ ] Gli URL restituiti sono pubblici e funzionanti
- [ ] Il frontend può recuperare le immagini senza problemi
- [ ] Non ci sono regressioni nelle funzionalità esistenti

### Qualità
- [ ] Gestione errori robusta durante il processo di upload
- [ ] Logging appropriato per debugging
- [ ] Performance non degradata

### Sicurezza
- [ ] Solo immagini generate (non dati sensibili) sono rese pubbliche
- [ ] Mantenimento delle policy di sicurezza appropriate

## Vincoli e Considerazioni

### Performance
- Il processo di `makePublic()` deve essere efficiente
- Non deve impattare negativamente sui tempi di upload

### Compatibilità
- Deve funzionare con il sistema esistente di upload
- Non deve rompere funzionalità esistenti

### Monitoring
- Logging appropriato per tracciare il processo di pubblicazione
- Alert in caso di errori nel processo
