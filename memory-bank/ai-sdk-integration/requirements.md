# AI SDK Integration - Requirements

## Obiettivo

Sostituire l'attuale sistema di orchestrazione AI manuale con Vercel AI SDK per ridurre la complessità del codice e migliorare la manutenibilità, mantenendo intatta tutta la business logic esistente.

## Contesto

Il sistema attuale utilizza servizi separati per ogni provider AI (anthropic.service.js, openai.service.js, etc.) con:

-   Logica duplicata per streaming
-   Stime manuali dei token (Math.ceil(prompt.length / 4))
-   Error handling inconsistente
-   Retry logic duplicata
-   Gestione provider frammentata

## Problemi da Risolvere

1. **Complessità di manutenzione**: Ogni provider ha la sua implementazione custom
2. **Codice duplicato**: Streaming, error handling, token counting replicati
3. **Inconsistenza**: Formati di risposta diversi tra provider
4. **Scalabilità**: Difficile aggiungere nuovi provider
5. **Testing**: Ogni servizio richiede test separati

## Requisiti Funzionali

### 1. Compatibilità Frontend

-   Nuovi endpoint v2 compatibili con Vercel AI SDK frontend
-   Formato messaggi standardizzato (id, role, content, createdAt, data)
-   Data Stream Protocol per streaming (0:text, d:data, e:error)
-   Supporto experimental_attachments

### 2. Business Logic Preservata

-   Sistema costi con markup mantenuto
-   Gestione wallet e transazioni invariata
-   Processamento attachments via GCS
-   Auto-selector integration
-   Provider selection logic

### 3. Backward Compatibility

-   Endpoint v1 mantenuti per retrocompatibilità
-   Migrazione graduale senza breaking changes
-   Dual support durante transizione

### 4. Funzionalità AI SDK

-   Token counting automatico preciso
-   Streaming unificato per tutti i provider
-   Error handling standardizzato
-   Retry logic integrata
-   Provider abstraction

## Requisiti Non Funzionali

### 1. Performance

-   Latenza streaming non peggiorata
-   Memory usage ottimizzato
-   Connection pooling mantenuto

### 2. Reliability

-   Error recovery robusto
-   Graceful degradation
-   Circuit breaker pattern

### 3. Monitoring

-   Logging strutturato mantenuto
-   Metriche performance
-   Health checks

### 4. Security

-   Autenticazione invariata
-   API key management sicuro
-   Rate limiting preservato

## Vincoli

1. **Zero downtime**: Migrazione senza interruzioni
2. **Data consistency**: Nessuna perdita di dati
3. **API compatibility**: Frontend esistente deve continuare a funzionare
4. **Cost neutrality**: Nessun aumento significativo dei costi operativi

## Criteri di Successo

1. Riduzione del 70% del codice duplicato
2. Tempo di aggiunta nuovo provider < 2 ore
3. Coverage test > 90%
4. Latenza streaming invariata
5. Zero regressioni funzionali

## Stakeholder

-   **Frontend Team**: Compatibilità API
-   **Backend Team**: Manutenibilità codice
-   **DevOps**: Deployment e monitoring
-   **Business**: Continuità servizio
