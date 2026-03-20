# Fix Salvataggio Costi Messaggi

## Contesto del Problema

Il sistema sta riscontrando errori durante il salvataggio dei costi dei messaggi nella tabella `message_costs`. Gli errori principali sono:

1. **Errore Database**: `Unknown column 'credit_cost' in 'INSERT INTO'`

    - Il codice sta tentando di inserire una colonna `credit_cost` che non esiste nella tabella `message_costs`
    - Errore SQL: `ER_BAD_FIELD_ERROR`

2. **Errore CostCalculator**: `TypeError: Cannot read properties of undefined (reading 'lte')`

    - Errore nel metodo `getMarkupConfiguration` del servizio `cost-calculator.service.js`
    - Il problema si verifica alla riga 216 del file

3. **Errore Sequelize**: `TypeError: Cannot read properties of undefined (reading 'create')`
    - Errore nel tentativo di creare un record nella tabella `message_costs`
    - Il modello `MessageCost` non è definito correttamente

## Obiettivi

1. **Risolvere l'errore della colonna mancante**: Rimuovere il riferimento alla colonna `credit_cost` non esistente
2. **Fixare l'errore del CostCalculator**: Correggere la logica di `getMarkupConfiguration`
3. **Verificare il modello MessageCost**: Assicurarsi che il modello sia definito correttamente
4. **Testare la funzionalità**: Verificare che il salvataggio dei costi funzioni correttamente

## Impatto

-   I costi dei messaggi non vengono salvati correttamente
-   Possibile perdita di dati di analytics sui costi
-   Errori nei log che potrebbero mascherare altri problemi
