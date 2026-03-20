# Fix Processo Migrazione Database

## Contesto

Il sistema di migrazione del database sta generando errori di chiavi duplicate durante l'esecuzione delle migrazioni. L'errore specifico è:

```
ERROR: Duplicate key name 'inbox_user_id'
```

## Problema Identificato

-   Le migrazioni stanno tentando di creare indici che già esistono nel database
-   Mancanza di controlli per verificare l'esistenza di indici prima della creazione
-   Possibile inconsistenza tra lo stato del database e le migrazioni

## Obiettivi

1. **Identificare la causa radice** dell'errore di chiave duplicata
2. **Implementare controlli di sicurezza** nelle migrazioni per evitare errori simili
3. **Creare un sistema di verifica** dello stato del database prima delle migrazioni
4. **Implementare rollback sicuro** in caso di errori durante la migrazione
5. **Migliorare il logging** per tracciare meglio il processo di migrazione

## Requisiti Tecnici

-   Mantenere compatibilità con Sequelize ORM
-   Non interrompere le migrazioni esistenti
-   Implementare controlli senza impatto sulle performance
-   Fornire feedback chiaro durante il processo di migrazione

## Criteri di Successo

-   Nessun errore di chiave duplicata durante le migrazioni
-   Processo di migrazione più robusto e sicuro
-   Logging migliorato per debugging
-   Possibilità di rollback in caso di errori
