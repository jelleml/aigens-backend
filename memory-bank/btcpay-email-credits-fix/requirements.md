# Fix Email Conferma Acquisto BTCPay e Arrotondamento Crediti

## Contesto

Analizzando l'immagine della mail di conferma acquisto, sono stati identificati due problemi:

### Problema 1: Valore BTC Errato nell'Email

-   **Errore**: La mail mostra "5.00 BTC"
-   **Corretto**: Dovrebbe mostrare il valore EUR convertito in BTC (es. "0.00015 BTC")
-   **Causa**: Stiamo passando `amount` (EUR) invece del valore BTC reale

### Problema 2: Crediti con Troppi Decimali

-   **Errore**: `4308.859014133058 crediti` (troppi decimali)
-   **Corretto**: `4308.86 crediti` (arrotondato a 2 decimali)
-   **Causa**: Nessun arrotondamento nella conversione crediti

## Analisi del Problema

### Conversione Attuale (ERRATA)

```javascript
// PRIMA (ERRATO)
const amount = parseFloat(transaction.amount); // 5 EUR
const credits = amount * 1000; // 5000 crediti
// Email mostra: "5.00 BTC" ❌
// Crediti: 4308.859014133058 ❌
```

### Conversione Corretta (DA IMPLEMENTARE)

```javascript
// DOPO (CORRETTO)
const amount = parseFloat(transaction.amount); // 5 EUR
const credits = Math.floor(amount * 1000 * 100) / 100; // 5000.00 crediti
// Email mostra: "0.00015 BTC" ✅ (valore EUR convertito in BTC)
// Crediti: 5000.00 ✅
```

## Obiettivi

1. **Fix Email**: Mostrare il valore EUR convertito in BTC
2. **Arrotondamento Crediti**: Arrotondare a 2 decimali per difetto
3. **Consistenza**: Applicare fix sia in webhook che in polling
4. **Test**: Verificare che i valori siano corretti

## Risultati Attesi

-   ✅ Email mostra valore BTC corretto (EUR → BTC)
-   ✅ Crediti arrotondati a 2 decimali
-   ✅ Conversione consistente in tutto il sistema
-   ✅ Test completi per verificare i valori
