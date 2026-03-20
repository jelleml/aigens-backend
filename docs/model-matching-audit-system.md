# Sistema di Audit per il Matching dei Modelli

## Panoramica

Il sistema di audit per il matching dei modelli (`model_matching_audit`) traccia tutte le decisioni di matching tra modelli integrati e modelli AA (Aggregated Models). Questo sistema fornisce visibilità completa su come vengono risolti i match e permette di analizzare l'efficacia degli algoritmi di matching.

## Struttura della Tabella

### Campi Principali

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `id` | INT | Chiave primaria auto-increment |
| `integrated_model_slug` | VARCHAR(255) | Slug del modello integrato che viene matchato |
| `aa_model_slug` | VARCHAR(255) | Slug del modello AA matchato (NULL se nessun match) |
| `match_type` | ENUM | Tipo di match trovato |
| `confidence_score` | DECIMAL(3,2) | Punteggio di confidenza (0.00-1.00) |
| `tier_used` | INT | Tier di matching utilizzato (1-4) |
| `reasoning` | TEXT | Spiegazione dettagliata della decisione |
| `processing_time_ms` | INT | Tempo di elaborazione in millisecondi |
| `llm_used` | BOOLEAN | Se è stato utilizzato un LLM per il match |
| `alternatives_considered` | TEXT | Array JSON delle alternative considerate |
| `created_at` | TIMESTAMP | Timestamp di creazione del record |

### Tipi di Match

- **`exact_match`**: Match esatto tra slug
- **`same_family`**: Modelli della stessa famiglia
- **`llm_assisted`**: Match assistito da LLM
- **`fuzzy_match`**: Match fuzzy basato su similarità
- **`no_match`**: Nessun match trovato

### Tier di Matching

- **Tier 1**: Match esatto
- **Tier 2**: Match per famiglia
- **Tier 3**: Match assistito da LLM
- **Tier 4**: Match fuzzy

## Utilizzo del Modello

### Creazione di Record di Audit

```javascript
const { ModelMatchingAudit } = require('../database/models');

// Esempio di match esatto
const auditRecord = await ModelMatchingAudit.create({
  integrated_model_slug: 'gpt-4',
  aa_model_slug: 'gpt-4',
  match_type: 'exact_match',
  confidence_score: 1.00,
  tier_used: 1,
  reasoning: 'Exact match found in database',
  processing_time_ms: 25,
  llm_used: false,
  alternatives_considered: null,
});
```

### Gestione del Campo JSON

Il campo `alternatives_considered` viene automaticamente gestito come JSON:

```javascript
// Il modello converte automaticamente l'array in JSON
const record = await ModelMatchingAudit.create({
  // ... altri campi
  alternatives_considered: [
    { slug: 'gpt-4-turbo', score: 0.95 },
    { slug: 'gpt-4o', score: 0.90 }
  ],
});

// Quando recuperi il record, ottieni l'array
console.log(record.alternatives_considered); // Array, non stringa JSON
```

## Query di Analisi

### Statistiche per Tipo di Match

```javascript
const matchTypeStats = await ModelMatchingAudit.findAll({
  attributes: [
    'match_type',
    [Sequelize.fn('COUNT', '*'), 'count'],
    [Sequelize.fn('AVG', Sequelize.col('confidence_score')), 'avg_confidence'],
    [Sequelize.fn('AVG', Sequelize.col('processing_time_ms')), 'avg_processing_time']
  ],
  group: ['match_type'],
  order: [[Sequelize.fn('COUNT', '*'), 'DESC']]
});
```

### Record con Bassa Confidenza

```javascript
const lowConfidenceRecords = await ModelMatchingAudit.findAll({
  where: {
    confidence_score: {
      [Sequelize.Op.lt]: 0.5
    }
  },
  order: [['confidence_score', 'ASC']],
  limit: 10
});
```

### Performance Analysis

```javascript
const performanceStats = await ModelMatchingAudit.findAll({
  attributes: [
    'tier_used',
    [Sequelize.fn('AVG', Sequelize.col('processing_time_ms')), 'avg_time'],
    [Sequelize.fn('COUNT', '*'), 'count'],
    [Sequelize.fn('AVG', Sequelize.col('confidence_score')), 'avg_confidence']
  ],
  group: ['tier_used'],
  order: [['tier_used', 'ASC']]
});
```

## Indici per Performance

La tabella include i seguenti indici per ottimizzare le query:

- `idx_audit_integrated_model`: Per query su modello integrato
- `idx_audit_aa_model`: Per query su modello AA
- `idx_audit_match_type`: Per statistiche per tipo di match
- `idx_audit_confidence`: Per analisi di confidenza
- `idx_audit_tier`: Per analisi per tier
- `idx_audit_created_at`: Per query temporali
- `idx_audit_llm_used`: Per analisi uso LLM

## Integrazione con il Sistema di Matching

### Esempio di Integrazione

```javascript
async function matchModelWithAudit(integratedModelSlug) {
  const startTime = Date.now();
  
  try {
    // Logica di matching esistente
    const matchResult = await performModelMatching(integratedModelSlug);
    
    const processingTime = Date.now() - startTime;
    
    // Crea record di audit
    await ModelMatchingAudit.create({
      integrated_model_slug: integratedModelSlug,
      aa_model_slug: matchResult.matchedModel?.slug || null,
      match_type: matchResult.matchType,
      confidence_score: matchResult.confidence,
      tier_used: matchResult.tier,
      reasoning: matchResult.reasoning,
      processing_time_ms: processingTime,
      llm_used: matchResult.llmUsed,
      alternatives_considered: matchResult.alternatives,
    });
    
    return matchResult;
  } catch (error) {
    // Crea record di audit anche per errori
    await ModelMatchingAudit.create({
      integrated_model_slug: integratedModelSlug,
      match_type: 'no_match',
      confidence_score: 0.00,
      reasoning: `Error during matching: ${error.message}`,
      processing_time_ms: Date.now() - startTime,
      llm_used: false,
    });
    
    throw error;
  }
}
```

## Monitoraggio e Alerting

### Metriche Chiave

1. **Tasso di Successo**: Percentuale di match con confidenza > 0.8
2. **Tempo Medio di Elaborazione**: Per tier e tipo di match
3. **Utilizzo LLM**: Frequenza di utilizzo di assistenza LLM
4. **Distribuzione Tier**: Quanto spesso viene utilizzato ogni tier

### Query per Dashboard

```javascript
// Tasso di successo per giorno
const successRate = await ModelMatchingAudit.findAll({
  attributes: [
    [Sequelize.fn('DATE', Sequelize.col('created_at')), 'date'],
    [Sequelize.fn('COUNT', '*'), 'total_matches'],
    [Sequelize.fn('SUM', Sequelize.literal('CASE WHEN confidence_score >= 0.8 THEN 1 ELSE 0 END')), 'successful_matches']
  ],
  group: [Sequelize.fn('DATE', Sequelize.col('created_at'))],
  order: [[Sequelize.fn('DATE', Sequelize.col('created_at')), 'DESC']],
  limit: 30
});
```

## Manutenzione

### Pulizia Dati Vecchi

```javascript
// Elimina record più vecchi di 90 giorni
await ModelMatchingAudit.destroy({
  where: {
    created_at: {
      [Sequelize.Op.lt]: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    }
  }
});
```

### Backup e Archiviazione

Considerare l'archiviazione periodica dei dati di audit per mantenere le performance del database.

## Test

Il sistema include test unitari completi in `__tests__/unit/database/model-matching-audit.test.js` che coprono:

- Creazione di record
- Validazioni
- Gestione JSON
- Indici

Esegui i test con:

```bash
npm test -- __tests__/unit/database/model-matching-audit.test.js
```

## Esempi Pratici

Vedi `examples/model-matching-audit-usage.js` per esempi completi di utilizzo del sistema di audit. 