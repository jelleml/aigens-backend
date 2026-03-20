# Database Tables Documentation

**Last Updated:** 2025-01-27  
**Schema Version:** 2.0 (Provider-Subscription Model)

## <× Core Architecture

Il database è strutturato attorno a un sistema di **Provider Classification** che distingue tra provider diretti, indiretti, aggregatori, e supporta relazioni complesse tra modelli e subscription.

## =Ê Table Overview

### **Core Tables**
- `providers` - Classification e metadata dei provider AI
- `models` - Modelli AI di tutti i provider  
- `provider_subscriptions` - Piani subscription dei provider
- `models_subscriptions` - Junction table modelli ” subscription

### **Aggregator System**  
- `aggregator_pricing_tiers` - Pricing tiers per aggregatori
- `aggregated_models` - Mapping aggregator ’ source provider

### **User System**
- `users`, `chats`, `messages` - Sistema di chat
- `transactions`, `wallets` - Sistema payments

### **Analytics & Stats**
- `message_costs`, `model_stats_*` - Tracking usage e performance

---

## =Â Detailed Table Schemas

### **providers**
**Purpose:** Classificazione e metadata di tutti i provider AI

```sql
CREATE TABLE providers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  provider_type ENUM('direct', 'indirect', 'both', 'aggregator') NOT NULL DEFAULT 'direct',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_name (name),
  INDEX idx_provider_type (provider_type)
);
```

**Provider Types:**
- **`direct`**: Provider integrati direttamente (anthropic, deepseek, ideogram)
- **`indirect`**: Provider disponibili solo via aggregatori (meta, mistral, cohere, ai21)  
- **`both`**: Provider disponibili direct E via aggregatori (openai, google)
- **`aggregator`**: Servizi che espongono modelli di altri provider (together, openrouter)

**Sample Data:**
```sql
INSERT INTO providers (name, description, provider_type) VALUES
('anthropic', 'Anthropic AI - Creatori di Claude', 'direct'),
('meta', 'Meta AI - Creatori di Llama', 'indirect'),
('openai', 'OpenAI - Creatori di GPT', 'both'),
('together', 'Together AI - Aggregatore modelli', 'aggregator');
```

---

### **models**
**Purpose:** Tutti i modelli AI disponibili nel sistema

```sql
CREATE TABLE models (
  id INT PRIMARY KEY AUTO_INCREMENT,
  model_id VARCHAR(255) UNIQUE NOT NULL,
  id_provider INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  max_tokens INT NOT NULL DEFAULT 16000,
  capabilities JSON,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  has_stats_aa BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (id_provider) REFERENCES providers(id),
  INDEX idx_provider (id_provider),
  INDEX idx_model_id (model_id),
  INDEX idx_active (is_active)
);
```

**Capabilities Examples:**
```json
["text", "vision", "reasoning"]     -- Claude models
["text"]                           -- GPT-3.5
["image"]                         -- FLUX, Ideogram  
["audio"]                         -- Cartesia Sonic
```

---

### **provider_subscriptions**
**Purpose:** Piani subscription dei provider (fonte: CSV)

```sql
CREATE TABLE provider_subscriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  id_provider INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  cost DECIMAL(10,2) NOT NULL,
  source VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (id_provider) REFERENCES providers(id),
  UNIQUE KEY unique_provider_subscription (id_provider, name),
  INDEX idx_provider (id_provider),
  INDEX idx_name (name),
  INDEX idx_source (source)
);
```

**Sample Data:**
```sql
-- OpenAI Subscriptions  
('ChatGPT Plus', 20.00, 'https://openai.com/pricing')
('ChatGPT Pro', 200.00, 'https://openai.com/pricing')

-- Anthropic Subscriptions
('Claude Pro', 20.00, 'https://anthropic.com/pricing')  
('Claude Team', 25.00, 'https://anthropic.com/pricing')
```

---

### **models_subscriptions** 
**Purpose:** Junction table che collega modelli alle subscription del loro provider

```sql
CREATE TABLE models_subscriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  id_provider INT NOT NULL,
  id_model INT NOT NULL,  
  id_subscription INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (id_provider) REFERENCES providers(id),
  FOREIGN KEY (id_model) REFERENCES models(id),
  FOREIGN KEY (id_subscription) REFERENCES provider_subscriptions(id),
  UNIQUE KEY unique_model_subscription (id_provider, id_model, id_subscription),
  INDEX idx_provider (id_provider),
  INDEX idx_model (id_model),
  INDEX idx_subscription (id_subscription)
);
```

**Logic:** 
- Ogni modello di un provider è collegato a TUTTE le subscription di quel provider
- Provider aggregatori sono esclusi (usano pricing tiers)

---

## = Aggregator System

### **aggregator_pricing_tiers**
**Purpose:** Pricing tiers per provider aggregatori (volume-based, time-based)

```sql
CREATE TABLE aggregator_pricing_tiers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  id_aggregator_provider INT NOT NULL,
  tier_name VARCHAR(100) NOT NULL,
  markup_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  markup_fixed DECIMAL(10,6) NOT NULL DEFAULT 0.000000,
  min_volume INT NOT NULL DEFAULT 0,
  max_volume INT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE,
  effective_until DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (id_aggregator_provider) REFERENCES providers(id),
  UNIQUE KEY unique_aggregator_tier (id_aggregator_provider, tier_name),
  INDEX idx_aggregator (id_aggregator_provider),
  INDEX idx_tier_name (tier_name),
  INDEX idx_active (is_active),
  INDEX idx_volume_range (min_volume, max_volume)
);
```

**Sample Data:**
```sql
-- Together.ai Pricing Tiers
('standard', 15.00, 0.005000, 0, 10000, 'Standard tier fino a 10k requests/mese')
('enterprise', 10.00, 0.003000, 10001, NULL, 'Enterprise tier per volumi elevati')

-- OpenRouter Pricing Tiers  
('pay_as_you_go', 20.00, 0.001000, 0, NULL, 'Pay-as-you-go per tutti i volumi')
```

---

### **aggregated_models**
**Purpose:** Junction table che traccia relazioni aggregator ’ source provider

```sql
CREATE TABLE aggregated_models (
  id INT PRIMARY KEY AUTO_INCREMENT,
  id_aggregator_provider INT NOT NULL,  -- Together.ai, OpenRouter
  id_source_provider INT NOT NULL,      -- Meta, OpenAI, Anthropic
  id_model INT NOT NULL,                -- Model endpoint aggregatore  
  source_model_id VARCHAR(255) NOT NULL, -- ID originale del modello
  id_pricing_tier INT NOT NULL,         -- Pricing tier utilizzato
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (id_aggregator_provider) REFERENCES providers(id),
  FOREIGN KEY (id_source_provider) REFERENCES providers(id),
  FOREIGN KEY (id_model) REFERENCES models(id),
  FOREIGN KEY (id_pricing_tier) REFERENCES aggregator_pricing_tiers(id),
  UNIQUE KEY unique_aggregated_model (id_aggregator_provider, source_model_id),
  INDEX idx_aggregator (id_aggregator_provider),
  INDEX idx_source (id_source_provider),
  INDEX idx_model (id_model),
  INDEX idx_pricing_tier (id_pricing_tier),
  INDEX idx_aggregator_source (id_aggregator_provider, id_source_provider)
);
```

**Example:**
```sql
-- Together.ai espone "meta-llama/Llama-3.3-70B-Instruct-Turbo"
INSERT INTO aggregated_models VALUES (
  id_aggregator_provider: 13,  -- together
  id_source_provider: 7,       -- meta  
  id_model: 156,                -- endpoint together
  source_model_id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  id_pricing_tier: 1,          -- standard tier
  is_available: true
);
```

---

## = Common Queries

### **Get All Models with Provider Info**
```sql
SELECT m.model_id, m.name, p.name as provider, p.provider_type,
       m.capabilities, m.max_tokens
FROM models m
JOIN providers p ON m.id_provider = p.id  
WHERE m.is_active = true
ORDER BY p.provider_type, p.name, m.name;
```

### **Get All Claude Models (Direct + Aggregated)**
```sql
SELECT m.model_id, m.name, p.name as endpoint_provider,
       CASE 
         WHEN am.id IS NOT NULL THEN sp.name 
         ELSE p.name 
       END as source_provider,
       CASE 
         WHEN am.id IS NOT NULL THEN 'Via Aggregator' 
         ELSE 'Direct' 
       END as access_type
FROM models m
JOIN providers p ON m.id_provider = p.id
LEFT JOIN aggregated_models am ON m.id = am.id_model  
LEFT JOIN providers sp ON am.id_source_provider = sp.id
WHERE (p.name = 'anthropic' OR sp.name = 'anthropic')
  AND m.is_active = true;
```

### **Pricing Comparison Across Aggregators**
```sql
SELECT sp.name as source_provider, am.source_model_id,
       ap.name as aggregator, apt.tier_name,
       apt.markup_percentage, apt.markup_fixed
FROM aggregated_models am
JOIN providers ap ON am.id_aggregator_provider = ap.id
JOIN providers sp ON am.id_source_provider = sp.id  
JOIN aggregator_pricing_tiers apt ON am.id_pricing_tier = apt.id
WHERE sp.name = 'meta' AND am.source_model_id LIKE '%llama%'
ORDER BY apt.markup_percentage ASC;
```

### **Provider Statistics**
```sql
SELECT p.name, p.provider_type,
       COUNT(m.id) as total_models,
       COUNT(ps.id) as total_subscriptions,
       COUNT(apt.id) as total_pricing_tiers
FROM providers p
LEFT JOIN models m ON p.id = m.id_provider
LEFT JOIN provider_subscriptions ps ON p.id = ps.id_provider  
LEFT JOIN aggregator_pricing_tiers apt ON p.id = apt.id_aggregator_provider
GROUP BY p.id, p.name, p.provider_type
ORDER BY p.provider_type, total_models DESC;
```

---

## =€ Initialization Process

### **1. Structure Setup**
```bash
node scripts/init-database-from-scratch.js
```
- Creates all tables with proper foreign keys
- Populates providers with classification
- Loads subscriptions from CSV  
- Creates pricing tiers for aggregators

### **2. Model Population**
```bash  
node scripts/init-all-models-unified.js
```
- Initializes models from all 6 provider types
- Creates aggregated model relationships automatically
- Supports chat, audio, image capabilities

### **3. Subscription Linking**
```bash
node scripts/populate-model-subscriptions.js  
```
- Links models to their provider's subscriptions
- Skips aggregators (they use pricing tiers)

---

## =È Schema Evolution

### **Version 1.0 ’ 2.0 Migration**
-  Added `provider_type` classification
-  Separated subscription management  
-  Introduced aggregator pricing system
-  Added aggregated model tracking
-  Consolidated initialization scripts

### **Future Considerations**
- Multi-region pricing support
- Usage-based pricing tiers  
- Enhanced provider detection (ML-based)
- Time-based subscription management
- Multi-tier aggregation support