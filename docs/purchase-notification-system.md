# Sistema di Notifica Acquisti

## Panoramica

Il sistema di notifica acquisti invia automaticamente email di conferma agli utenti quando completano un acquisto di crediti, indipendentemente dal metodo di pagamento utilizzato (Stripe o BTCPay).

## Componenti

### 1. Template Email

**File:** `templates/emails/purchase-confirmation.mjml`

Template MJML responsive che include:

-   Dettagli della transazione (ID, data, metodo di pagamento, importo)
-   Crediti acquistati (base + bonus)
-   Saldo aggiornato
-   Design professionale con colori coordinati

### 2. Servizio Mailer

**File:** `services/mailer.service.js`

Estende il servizio email esistente con:

-   `sendPurchaseConfirmationEmail()` - Metodo per inviare email di conferma acquisto
-   `formatPaymentMethod()` - Formatta i metodi di pagamento per la visualizzazione
-   Tracking automatico in tabella `inbox`

### 3. Servizio di Notifica Acquisti

**File:** `services/purchase-notification.service.js`

Servizio centralizzato che gestisce:

-   `sendStripePurchaseConfirmation()` - Per pagamenti Stripe
-   `sendBTCPayPurchaseConfirmation()` - Per pagamenti BTCPay
-   `sendGenericPurchaseConfirmation()` - Per pagamenti generici
-   `sendPurchaseConfirmationForTransaction()` - Per transazioni esistenti

## Flusso di Funzionamento

### Pagamento Stripe

1. **Webhook Stripe** (`services/stripe.service.js`)

    - Riceve evento `payment_intent.succeeded`
    - Accredita crediti nel wallet
    - Chiama `purchaseNotificationService.sendStripePurchaseConfirmation()`

2. **Invio Email**
    - Recupera dati utente e transazione
    - Formatta dati per il template
    - Invia email via SendGrid
    - Salva record in tabella `inbox`

### Pagamento BTCPay

1. **Webhook BTCPay** (`api/v1/btc-payments.js`)

    - Riceve evento `InvoiceSettled`
    - Accredita crediti nel wallet
    - Chiama `purchaseNotificationService.sendBTCPayPurchaseConfirmation()`

2. **Invio Email**
    - Stesso processo di Stripe ma con dati BTC

## Dati Inclusi nell'Email

### Dettagli Transazione

-   **ID Transazione:** ID interno della transazione
-   **Data:** Data e ora dell'acquisto (formato italiano)
-   **Metodo di Pagamento:** Carta di Credito/Debito, Bitcoin, ecc.
-   **Importo Pagato:** Importo nella valuta originale

### Crediti Acquistati

-   **Crediti Base:** Crediti generati dall'importo pagato
-   **Crediti Bonus:** Crediti extra (se applicabili)
-   **Totale:** Somma di crediti base + bonus

### Saldo Aggiornato

-   **Nuovo Saldo:** Saldo del wallet dopo l'accredito

## Gestione Errori

-   **Non Bloccante:** Gli errori di invio email non bloccano il processo di accredito
-   **Logging:** Tutti gli errori vengono loggati per debugging
-   **Retry:** Il sistema di retry esistente gestisce email fallite

## Configurazione

### Variabili d'Ambiente

```bash
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@aigens.io
```

### Template Variables

```javascript
{
  first_name: "Nome utente",
  app_name: "Aigens",
  support_email: "support@aigens.com",
  transaction_id: "12345",
  transaction_date: "15 gennaio 2025, 14:30",
  payment_method: "Carta di Credito/Debito",
  amount_paid: "5.00",
  currency: "EUR",
  base_credits: 5000,
  bonus_credits_section: "<mj-text>...</mj-text>", // Solo se bonus > 0
  total_credits: 5500,
  new_balance: 10500
}
```

## Testing

### Test Unitari

-   `__tests__/services/purchase-notification.service.test.js`
-   `__tests__/templates/purchase-confirmation.test.js`

### Test Manuali

1. Effettua un acquisto di test
2. Verifica che l'email venga inviata
3. Controlla i dati nella tabella `inbox`
4. Verifica il formato e contenuto dell'email

## Monitoraggio

### Logs

-   Tutti gli invii email vengono loggati
-   Errori vengono registrati con dettagli
-   Performance tracking per debugging

### Database

-   Tabella `inbox` traccia tutte le email inviate
-   Stati: `pending`, `sent`, `error`
-   Retry count per email fallite

## Estensioni Future

### Possibili Miglioramenti

1. **Template Multilingua:** Supporto per altre lingue
2. **Personalizzazione:** Template personalizzabili per utente
3. **Notifiche Push:** Integrazione con notifiche push
4. **SMS:** Invio SMS di conferma
5. **Webhook:** Notifiche a sistemi esterni

### Integrazioni

-   **Analytics:** Tracking conversioni email
-   **A/B Testing:** Test di diversi template
-   **Automation:** Workflow automatici basati su acquisti
