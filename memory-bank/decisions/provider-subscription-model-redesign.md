# Provider-Subscription Model Redesign

**Status:** ✅ Implemented  
**Date:** 2025-01-27  
**Decision makers:** Development Team  
**Impact:** High - Complete database schema restructure  

## Context

Il sistema originale aveva un modello semplificato che non distingueva adeguatamente tra:
- Provider diretti (che integriamo direttamente)
- Provider indiretti (disponibili solo tramite aggregatori)
- Servizi aggregatori (che espongono modelli di altri provider)

Inoltre, la gestione delle subscription e dei pricing era troppo rigida e non supportava pricing dinamici per aggregatori.

## Problem Statement

### Issues del Sistema Precedente:
1. **Mancanza di distinzione provider types**: Tutti i provider erano trattati ugualmente
2. **Pricing statico**: Markup e costi fissi hardcoded nei modelli
3. **Nessuna tracciabilità aggregatori**: Non si sapeva quale modello veniva da quale provider originale
4. **Subscription management limitato**: Non c'era una struttura flessibile per gestire i piani

### Business Requirements:
- Supportare aggregatori come Together.ai e OpenRouter
- Tracciare source provider per modelli aggregati
- Gestire pricing tiers dinamici per aggregatori
- Collegare modelli alle subscription dei loro provider

## Decision

### 🏗️ **New Database Architecture**

#### 1. **Provider Classification System**
```sql
providers:
  - provider_type: ENUM('direct', 'indirect', 'both', 'aggregator')
    - direct: Provider che integriamo direttamente (anthropic, deepseek)
    - indirect: Provider solo via aggregatori (meta, mistral, cohere)
    - both: Provider disponibili direct E aggregated (openai, google)
    - aggregator: Servizi che espongono altri provider (together, openrouter)
```

#### 2. **Subscription Management**
```sql
provider_subscriptions:
  - id_provider (FK)
  - name (es. "ChatGPT Plus", "Claude Pro")
  - cost (costo mensile)
  - source (URL sorgente del dato)

models_subscriptions: (junction table)
  - id_provider (FK)
  - id_model (FK) 
  - id_subscription (FK)
```

#### 3. **Aggregator Pricing System**
```sql
aggregator_pricing_tiers:
  - id_aggregator_provider (FK)
  - tier_name (es. "standard", "enterprise")
  - markup_percentage
  - markup_fixed
  - min_volume / max_volume (volume-based pricing)
  - effective_from / effective_until (time-based)

aggregated_models:
  - id_aggregator_provider (FK) -- Together.ai, OpenRouter
  - id_source_provider (FK)     -- Meta, OpenAI, etc.
  - id_model (FK)               -- Endpoint del modello
  - source_model_id             -- ID originale del modello
  - id_pricing_tier (FK)        -- Pricing tier utilizzato
  - is_available
```

### 🔄 **Initialization Workflow**

#### 1. **Database Structure Setup**
```bash
node scripts/init-database-from-scratch.js
```
- Crea tutte le tabelle con foreign keys
- Popola provider con correct provider_type
- Legge subscription da CSV (`uploads/subscriptions.csv`)
- Crea pricing tiers per aggregatori

#### 2. **Model Population**  
```bash
node scripts/init-all-models-unified.js
```
- Inizializza modelli da TUTTI i provider (6 total)
- API calls per Together.ai e OpenRouter
- Crea automatic aggregated_model relationships
- Supporta chat, audio, image capabilities

#### 3. **Model-Subscription Linking**
```bash
node scripts/populate-model-subscriptions.js
```
- Collega ogni modello alle subscription del suo provider
- Salta aggregatori (hanno pricing tiers, non subscription)

## Consequences

### ✅ **Positive Outcomes:**

1. **Clear Provider Taxonomy**: 
   - Ogni provider ha un ruolo ben definito
   - Facile distinguere direct vs aggregated access

2. **Flexible Pricing Management**:
   - Pricing tiers separati per aggregatori
   - Volume-based e time-based pricing
   - Easy pricing updates senza toccare modelli

3. **Complete Traceability**:
   - Ogni modello aggregated può essere tracciato al provider originale
   - Markup tracking per business intelligence

4. **Scalable Architecture**:
   - Easy aggiungere nuovi aggregatori
   - Easy aggiungere nuovi provider (direct o indirect)

5. **Business Intelligence Ready**:
   ```sql
   -- Get pricing comparison across aggregators for same model
   SELECT sp.name as source, ap.name as aggregator, 
          apt.markup_percentage, apt.markup_fixed
   FROM aggregated_models am
   JOIN providers sp ON am.id_source_provider = sp.id
   JOIN providers ap ON am.id_aggregator_provider = ap.id  
   JOIN aggregator_pricing_tiers apt ON am.id_pricing_tier = apt.id
   WHERE sp.name = 'meta' AND am.source_model_id LIKE '%llama%';
   ```

### ⚠️ **Trade-offs:**

1. **Increased Complexity**: 
   - Più tabelle da gestire
   - Più relationship da mantenere

2. **Migration Complexity**:
   - Required complete schema restructure
   - Multiple scripts execution required

3. **Maintenance Overhead**:
   - Pricing tiers need periodic review
   - Aggregated relationships need validation

## Implementation Details

### **Script Consolidation**
- ❌ Removed: 5+ separate initialization scripts
- ✅ Created: `init-all-models-unified.js` (single source of truth)

### **Provider Detection Logic**
Automatic source provider detection da model_id:
```javascript
const getSourceProviderFromModelId = (modelId) => {
  if (modelId.includes('llama')) return 'meta';
  if (modelId.includes('claude')) return 'anthropic';
  if (modelId.includes('gpt')) return 'openai';
  // ... etc
};
```

### **CSV-Driven Subscription Data**
- Source of truth: `uploads/subscriptions.csv`
- Format: `provider,name,cost,source`
- Auto-population durante database initialization

## Monitoring & Validation

### **Success Metrics:**
- ✅ All provider types properly classified
- ✅ All models linked to correct providers  
- ✅ All aggregated relationships created
- ✅ All subscription links established

### **Validation Queries:**
```sql
-- Verify provider distribution
SELECT provider_type, COUNT(*) FROM providers GROUP BY provider_type;

-- Verify aggregated model coverage  
SELECT COUNT(*) FROM aggregated_models;

-- Verify subscription coverage
SELECT p.name, COUNT(ms.id) as model_count 
FROM providers p 
LEFT JOIN models_subscriptions ms ON p.id = ms.id_provider 
GROUP BY p.name;
```

## Future Considerations

1. **Enhanced Provider Detection**: ML-based model classification
2. **Dynamic Pricing Updates**: API-driven pricing tier updates  
3. **Multi-tier Aggregation**: Support aggregatori che usano altri aggregatori
4. **Geographic Pricing**: Region-specific pricing tiers
5. **Usage-based Pricing**: Real-time usage tracking per pricing optimization

## Related Decisions

- [Database Schema Evolution](./database-schema-evolution.md)
- [API Architecture Decisions](./api-architecture.md)
- [Subscription Management Strategy](./subscription-management.md)