# Database Initialization Guide

**Version:** 2.0  
**Last Updated:** 2025-01-27  
**Prerequisites:** MySQL 8.0+, Node.js 18+

## 🎯 Overview

Questa guida descrive il processo completo di inizializzazione del database AiGens, dal setup iniziale al popolamento completo di tutti i dati.

## ⚠️ IMPORTANTE: Ordine di Esecuzione

Gli script **DEVONO** essere eseguiti in questo ordine specifico per evitare errori di dipendenze:

```
1. init-database-from-scratch.js
2. init-all-models-unified.js  
3. populate-model-subscriptions.js
```

---

## 📋 Processo Completo

### **Step 1: Database Structure & Base Data**
```bash
node scripts/init-database-from-scratch.js
```

#### **Cosa fa:**
✅ **Table Creation**: Crea tutte le tabelle con foreign keys corretti  
✅ **Provider Setup**: Popola 14 provider con classification corretta  
✅ **Subscription Import**: Legge e popola da `uploads/subscriptions.csv`  
✅ **Pricing Tiers**: Crea pricing tiers per Together.ai e OpenRouter

#### **Output Atteso:**
```
=== INIZIALIZZAZIONE DATABASE DA ZERO ===
1. Connessione al database...
2. Sincronizzazione tabelle...
Synchronized model: Provider
Synchronized model: ProviderSubscription
Synchronized model: Model
Synchronized model: AggregatorPricingTier
Synchronized model: AggregatedModel
Synchronized model: ModelsSubscription

3. Inizializzazione provider e subscription...
Inizializzazione providers...
Provider esistente: anthropic (direct)
Provider aggiornato: openai -> both
Provider aggiornato: meta -> indirect
Provider aggiornato: together -> aggregator
...

Inizializzazione subscriptions...
Caricati 14 subscription dal CSV
Subscription creata: openai - ChatGPT Plus
Subscription creata: anthropic - Claude Pro
...

Inizializzazione pricing tiers...
Pricing tier creato: together - standard (15.00%)
Pricing tier creato: openrouter - pay_as_you_go (20.00%)
...

Inizializzazione base completata.
```

#### **Database State After Step 1:**
- 🏗️ **14 providers** classificati per tipo
- 📊 **~14 subscriptions** da CSV  
- 💰 **4 pricing tiers** per aggregatori
- 🗂️ **Tutte le tabelle** create e pronte

---

### **Step 2: Model Population & Aggregation**
```bash
node scripts/init-all-models-unified.js
```

#### **Cosa fa:**
✅ **Static Models**: Carica modelli definiti staticamente (OpenAI, Anthropic, DeepSeek, Ideogram)  
✅ **API Models**: Fetcha modelli da API live (Together.ai, OpenRouter)  
✅ **Aggregated Relationships**: Crea automaticamente mapping aggregator → source provider  
✅ **Capability Detection**: Assegna capabilities (text, audio, image) basate su model type

#### **Output Atteso:**
```
=== UNIFIED MODEL INITIALIZATION ===
Found 14 providers in database

--- Initializing openai models ---
✅ openai: 4 models initialized

--- Initializing anthropic models ---  
✅ anthropic: 6 models initialized

--- Initializing deepseek models ---
✅ deepseek: 4 models initialized

--- Initializing ideogram models ---
✅ ideogram: 5 models initialized

--- Initializing together models ---
✅ together: 72 models initialized (58 chat + 2 audio + 12 image)

--- Initializing openrouter models ---
✅ openrouter: 302 models initialized

--- Creating aggregated model relationships ---

--- Processing aggregator: together ---
  Found 72 models for together
  ✅ Created relationship: meta-llama/Llama-3.3-70B -> meta
  ✅ Created relationship: black-forest-labs/FLUX.1-pro -> stability
  Created 45 relationships for together

--- Processing aggregator: openrouter ---  
  Found 302 models for openrouter
  ✅ Created relationship: anthropic/claude-3-opus -> anthropic
  Created 156 relationships for openrouter

✅ Total aggregated model relationships created: 201

=== INITIALIZATION COMPLETE ===
Total models initialized: 393
```

#### **Database State After Step 2:**
- 🤖 **~393 models** da tutti i provider
- 🔗 **~201 aggregated relationships** per traceability  
- 🎯 **Complete model coverage** (text, audio, image)

---

### **Step 3: Model-Subscription Linking**
```bash
node scripts/populate-model-subscriptions.js
```

#### **Cosa fa:**
✅ **Smart Linking**: Collega ogni modello alle subscription del suo provider  
✅ **Provider Analysis**: Mostra dettagli di quali provider hanno subscription  
✅ **Aggregator Skip**: Esclude aggregatori (usano pricing tiers)  
✅ **Relationship Creation**: Popola `models_subscriptions` junction table

#### **Output Atteso:**
```
=== POPOLAZIONE MODEL SUBSCRIPTIONS ===

--- ANALISI PROVIDER ---
openai (both): 4 modelli, 3 subscription
anthropic (direct): 6 modelli, 3 subscription
ideogram (direct): 5 modelli, 3 subscription
meta (indirect): 0 modelli, 0 subscription
together (aggregator): 72 modelli, 0 subscription

--- SUBSCRIPTION DISPONIBILI ---
openai: [ChatGPT Plus, ChatGPT Pro, ChatGPT Team]
anthropic: [Claude Pro, Claude Max, Claude Team]
ideogram: [Basic, Plus, Pro]

--- PROVIDER DA PROCESSARE ---
Trovati 3 provider con subscription e modelli:
  - openai (both)
  - anthropic (direct)  
  - ideogram (direct)

--- Processing provider: openai (both) ---
  Modelli: 4
  Subscription: 3
  ✓ Collegato: GPT-4o -> ChatGPT Plus
  ✓ Collegato: GPT-4o -> ChatGPT Pro
  ✓ Collegato: GPT-4o -> ChatGPT Team
  ...
  Relazioni create per openai: 12

=== RIEPILOGO ===
✅ Relazioni create: 36
🚫 Provider aggregatori saltati: 2 (together, openrouter)
⚠️  Provider senza subscription saltati: 11
```

#### **Database State After Step 3:**
- 🔗 **~36 model-subscription links** 
- ✅ **Complete relationship mapping** per provider con subscription
- 🎯 **Ready for production** con tutti i dati collegati

---

## 🔍 Validation & Troubleshooting

### **Post-Initialization Validation**

#### **1. Provider Distribution Check**
```sql
SELECT provider_type, COUNT(*) as count 
FROM providers 
GROUP BY provider_type;

-- Expected:
-- direct: 4 (anthropic, deepseek, ideogram, perplexity)
-- indirect: 6 (meta, mistral, cohere, ai21, stability, huggingface)  
-- both: 2 (openai, google)
-- aggregator: 2 (together, openrouter)
```

#### **2. Model Count Verification**
```sql
SELECT p.name, p.provider_type, COUNT(m.id) as model_count
FROM providers p
LEFT JOIN models m ON p.id = m.id_provider
GROUP BY p.id
ORDER BY model_count DESC;

-- Expected top counts:
-- openrouter (aggregator): ~302 models
-- together (aggregator): ~72 models  
-- anthropic (direct): 6 models
-- openai (both): 4 models
```

#### **3. Aggregated Relationships Check**
```sql
SELECT COUNT(*) as total_aggregated_relationships
FROM aggregated_models;

-- Expected: ~200+ relationships
```

#### **4. Subscription Coverage Check**
```sql
SELECT p.name, COUNT(ms.id) as linked_models
FROM providers p
LEFT JOIN models_subscriptions ms ON p.id = ms.id_provider
WHERE p.provider_type IN ('direct', 'both')
GROUP BY p.id;

-- Expected:
-- openai: 12 links (4 models × 3 subscriptions)
-- anthropic: 18 links (6 models × 3 subscriptions)
-- ideogram: 15 links (5 models × 3 subscriptions)
```

### **Common Issues & Solutions**

#### **Issue: "Provider not found" errors**
```
✅ Solution: Verify provider names match between CSV and database
- CSV: "OpenAI" vs Database: "openai"  
- Check case sensitivity and exact spelling
```

#### **Issue: "Table doesn't exist" errors**
```
✅ Solution: Ensure Step 1 completed successfully
- Check database connection
- Verify MySQL user has CREATE TABLE permissions
- Re-run init-database-from-scratch.js
```

#### **Issue: API rate limiting**
```
✅ Solution: For Together.ai/OpenRouter API calls
- Verify API keys in .env file
- Check API rate limits
- Wait and retry if rate limited
```

#### **Issue: Foreign key constraint errors**
```
✅ Solution: Ensure scripts run in correct order
- Never skip Step 1
- Don't run Step 3 before Step 2
- Check foreign key relationships
```

---

## 📊 Data Sources

### **Static Data (Hardcoded)**
- ✅ **Provider definitions**: Names, types, descriptions
- ✅ **Static model definitions**: OpenAI, Anthropic, DeepSeek, Ideogram
- ✅ **Pricing tier configurations**: Together.ai, OpenRouter markup rates

### **CSV Data (File-based)**
- ✅ **Subscription data**: `uploads/subscriptions.csv`
- Format: `provider,name,cost,source`
- Source: Manual research of official pricing pages

### **API Data (Live fetched)**
- ✅ **Together.ai models**: Live API call durante initialization
- ✅ **OpenRouter models**: Live API call durante initialization  
- ⚠️ **Rate limiting**: Rispetta API limits, retry on failure

### **Derived Data (Auto-generated)**
- ✅ **Aggregated relationships**: Auto-detected da model IDs
- ✅ **Model-subscription links**: Auto-generated based on provider relationships
- ✅ **Provider mapping**: Pattern matching su model names

---

## 🚀 Production Considerations

### **Pre-Production Checklist**
- ✅ Verify all API keys are configured
- ✅ Test database connection and permissions  
- ✅ Backup existing data (if any)
- ✅ Run full initialization sequence
- ✅ Validate final data integrity
- ✅ Test API endpoints with populated data

### **Maintenance Schedule**
- 🔄 **Weekly**: Update model availability from APIs
- 🔄 **Monthly**: Review and update subscription data from CSV
- 🔄 **Quarterly**: Review pricing tiers and markup rates
- 🔄 **As needed**: Add new providers or model types

### **Monitoring**
- 📊 Track model initialization success rates
- 📊 Monitor API call failures and rate limiting  
- 📊 Validate data consistency across relationships
- 📊 Alert on missing critical provider data

---

## 🎯 Next Steps

After successful initialization:

1. **Test API Endpoints**: Verify model listings work
2. **Set up Monitoring**: Implement health checks  
3. **Configure Backups**: Database backup strategy
4. **Update Documentation**: Any environment-specific notes
5. **Team Training**: Share initialization procedures