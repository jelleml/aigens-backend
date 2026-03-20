# Analisi Polling BTCPay Frontend

## Contesto

Il frontend dopo aver ricevuto il `checkoutLink` dal backend fa le seguenti attività:

-   L'hook fa polling ogni 5 secondi verso `/api/v1/wallets/payment-status/${invoiceId}`
-   Il polling si ferma quando lo status diventa 'paid'

## Obiettivi

1. **Verificare se l'endpoint** `/api/v1/wallets/payment-status/${invoiceId}` funziona correttamente
2. **Analizzare il flusso** di polling e aggiornamento status
3. **Identificare potenziali problemi** nel sistema di polling
4. **Verificare la compatibilità** con le modifiche al webhook

## Domande da Rispondere

1. L'endpoint restituisce correttamente lo status 'paid' quando il pagamento è completato?
2. Il polling funziona con le transazioni create dal nostro sistema?
3. Ci sono conflitti tra webhook e polling?
4. Il sistema è ottimizzato per gestire polling frequenti?

## Risultati Attesi

-   Documentazione completa del flusso di polling
-   Identificazione di eventuali problemi
-   Raccomandazioni per ottimizzazioni
