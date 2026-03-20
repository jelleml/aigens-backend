# Fix Webhook BTCPay Status Update

## Contesto

Il webhook BTCPay viene ricevuto correttamente ma non aggiorna lo status delle transazioni. Le transazioni rimangono sempre in stato "pending" anche quando i pagamenti sono stati effettuati.

## Problema Identificato

Dall'analisi dei dati di test:
- Le transazioni hanno status "pending" 
- I pagamenti sono stati effettuati
- Il webhook viene ricevuto ma non aggiorna lo status

## Possibili Cause

1. **Event Type Mismatch**: Il tipo di evento ricevuto dal webhook potrebbe non corrispondere ai case gestiti
2. **Invoice ID Mismatch**: L'invoice_id nel database potrebbe non corrispondere a quello nel webhook
3. **Webhook Payload Structure**: La struttura del payload potrebbe essere diversa da quella attesa
4. **Database Update Failure**: L'aggiornamento del database potrebbe fallire silenziosamente

## Obiettivi

1. **Debug del Webhook**: Identificare esattamente quale payload viene ricevuto
2. **Fix del Mapping**: Correggere il mapping tra eventi BTCPay e status interni
3. **Verifica Database**: Assicurarsi che gli aggiornamenti vengano applicati correttamente
4. **Test Completo**: Verificare che il flusso funzioni end-to-end

## Priorità

**CRITICA** - Il sistema di pagamenti Bitcoin non funziona correttamente senza questo fix. 