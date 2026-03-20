# Fix Conversione BTCPay - EUR vs BTC

## Contesto

Il pagamento BTCPay avviene correttamente ma ci sono errori nella conversione crediti:

1. **Errore di conversione**: I `5` sono EUR, non BTC
2. **Errore database**: `Out of range value for column 'balance'`

## Errori Identificati

### 1. Errore Conversione Valuta

```
[Wallets] Conversione: 5 BTC → 494760000 crediti (tasso: 98952)
```

**Problema**: Il sistema sta trattando `5` come BTC invece che EUR.

**Logica attuale (ERRATA)**:

-   Input: `5` (EUR)
-   Trattato come: `5 BTC`
-   Conversione: `5 BTC × 98952 EUR/BTC = 494,760 EUR`
-   Crediti: `494,760 × 1000 = 494,760,000 crediti`

**Logica corretta (DA IMPLEMENTARE)**:

-   Input: `5` (EUR)
-   Conversione: `5 EUR × 1000 = 5,000 crediti`

### 2. Errore Database

```
Out of range value for column 'balance' at row 1
parameters: [ 494770000, '2025-08-06 19:36:46', 1 ]
```

**Problema**: Il valore `494,770,000` è troppo grande per il tipo di dato `balance`.

## Analisi del Problema

### Struttura Transazione

```sql
INSERT INTO `transactions` (
  `amount`, `currency`, `description`
) VALUES (
  5.00, 'USD', 'BTC payment for 5000 credits'
);
```

**Osservazioni**:

-   `amount`: `5.00` (importo in EUR/USD)
-   `currency`: `USD` (ma potrebbe essere EUR)
-   `description`: `'BTC payment for 5000 credits'`

### Flusso Corretto

1. BTCPay riceve pagamento in BTC
2. BTCPay converte BTC → EUR automaticamente
3. Sistema riceve importo in EUR
4. Sistema converte EUR → Crediti (1 EUR = 1000 crediti)

## Obiettivi

1. **Fix conversione**: Trattare importo come EUR, non BTC
2. **Fix database**: Assicurarsi che i valori non superino i limiti
3. **Mantenere logica**: Preservare la conversione corretta
4. **Test completo**: Verificare con dati reali

## Risultati Attesi

-   ✅ Conversione EUR → Crediti corretta
-   ✅ Nessun errore database
-   ✅ Crediti registrati correttamente
-   ✅ Email con dettagli corretti
