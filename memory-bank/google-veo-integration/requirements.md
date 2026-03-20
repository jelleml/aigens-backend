# Integrazione Google Veo - Requirements

## Contesto
Il progetto AIGens ha bisogno di integrare Google Veo per la generazione di video da testo (text-to-video). L'integrazione deve essere compatibile con l'architettura esistente del server Node.js e con il sistema di gestione degli event stream.

## Obiettivi
1. **Integrazione del servizio Google Veo**: Creare un servizio che utilizzi l'API di Google Veo per generare video da prompt testuali
2. **Compatibilità con event stream**: Il servizio deve supportare la gestione degli event stream per comunicare lo stato di avanzamento al frontend
3. **Integrazione con l'architettura esistente**: Il servizio deve seguire i pattern già utilizzati per altri servizi (Anthropic, OpenAI, Ideogram, etc.)
4. **Gestione delle risposte**: Il servizio deve restituire correttamente la response da Google Veo

## Requisiti Tecnici

### Dipendenze
- Il pacchetto `@google/genai` è già installato
- La API key di Google Gemini è disponibile nel file `.env` con il nome "GOOGLE_GEMINI_KEY"

### Architettura
- Il servizio deve seguire il pattern degli altri servizi esistenti (ideogram.service.js, anthropic.service.js, etc.)
- Deve essere integrato nel sistema di routing esistente
- Deve supportare la gestione degli errori e il logging centralizzato
- Deve essere compatibile con il sistema di costi e wallet

### Funzionalità Richieste
1. **Generazione video**: Ricevere un prompt testuale e generare un video
2. **Event streaming**: Comunicare lo stato di avanzamento al frontend
3. **Gestione file**: Salvare e gestire i file video generati
4. **Integrazione database**: Salvare i messaggi e i costi nel database
5. **Gestione errori**: Gestire errori di rete, limiti API, etc.

### Compatibilità
- Deve funzionare con il sistema di autenticazione esistente
- Deve essere compatibile con il sistema di wallet e costi
- Deve supportare il sistema di attachment per i file video
- Deve essere integrato nel sistema di logging centralizzato

## Note
- Non preoccuparsi della gestione del pricing in questa fase
- Concentrarsi sulla funzionalità core di generazione video
- Assicurarsi che il servizio restituisca correttamente la response da Google Veo
