# AIGens Backend Setup Guide - From Scratch

This guide will walk you through setting up the AIGens backend system from scratch, including database setup, model initialization, and system configuration.

## Prerequisites

Before starting, ensure you have the following:

1. **Node.js** (>=16.0.0)
2. **MySQL Database** running and accessible
3. **API Keys** for external providers:
   - OpenAI API key
   - Together.ai API key
   - OpenRouter API key
   - Anthropic API key (optional but recommended)
   - Other provider APIs as needed

## Environment Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Database Configuration**
   - Ensure your MySQL database is running
   - Configure your database connection in your environment variables
   - Run migrations:
     ```bash
     npm run migration:up
     ```

3. **API Keys Configuration**
   - Configure your API keys in the environment variables
   - The system will automatically detect available providers based on configured keys

## Model System Setup

### 🚀 Modern Setup - API-Fetched Models

**Option A: Clean Setup (Recommended for fresh start)**
```bash
npm run setup-models-clean
```

**Option B: Additive Setup (adds to existing models)**
```bash
npm run setup-models
# OR explicitly:
npm run setup-models-modern
```

**When to use Clean vs Additive:**
- **Clean Setup** (`setup-models-clean`): ✅ **RECOMMENDED** - Removes all old hardcoded models and starts fresh with only API-fetched models
- **Additive Setup** (`setup-models`): Adds new API models but keeps any existing hardcoded models

### Clean Setup Process:
1. Remove all existing models and provider data
2. Initialize providers and subscriptions from `uploads/subscriptions.csv`
3. Populate aggregator pricing tiers (required for model relationships)
4. **Fetch live models from provider APIs** (OpenAI, Anthropic, DeepSeek, Ideogram, Together.ai, OpenRouter)
5. Populate the capabilities table (41 standard model capabilities)
6. Create model-capability relationships
7. Populate model subscriptions

**Benefits of Clean Setup:**
- ✅ Always up-to-date models from APIs
- ✅ No old hardcoded models cluttering the database
- ✅ Clean, consistent data structure
- ✅ Automatic discovery of new models
- ✅ No manual maintenance required


### Update model statistics and relationships
```bash
npm run update-model-stats-aa-and-relations
```

that is calling addons python endpoints 

```bash
/api/v1/db_manager/models/stats/aa/refresh

/api/v1/db_manager/models/update_price_score_from_aa

/api/v1/db_manager/models/refresh_relations_aa
```

### Update model status if price is in table ```models_price_score```

```bash
npm run update-model-status-pricing-presence
```

## Model Metadata Population

After the basic model setup, you can enhance model data with detailed metadata using two specialized scripts:

### 🎯 Method 1: JSON-Based Metadata Population

Populate comprehensive model metadata from a curated JSON file containing descriptions, capabilities, tags, and user guidance:

```bash
node scripts/setup-init/populate-model-metadata-from-json.js
```

**Features:**
- ✅ Populates model descriptions from `uploads/ai_models_descriptions_edo.json`
- ✅ Adds output capabilities, tags, best use cases, and ideal user types
- ✅ Supports fuzzy name matching between JSON and database models
- ✅ Updates JSON file with `model_slug_match` for manual completion of unmatched models
- ✅ Handles provider name variations and normalization

**Source file:** `uploads/ai_models_descriptions_edo.json` (40+ model descriptions)

### 🏗️ Method 2: Rule-Based Model Family Assignment

Categorize models into families using pattern-based rules:

```bash
# Process only models without family (default)
node scripts/setup-init/populate-model-families.js

# Update ALL models (overwrite existing families)
node scripts/setup-init/populate-model-families.js --force

# Process all models but don't overwrite existing families
node scripts/setup-init/populate-model-families.js --all
```

**Features:**
- ✅ Uses JSON-based pattern matching rules from `uploads/model_family_rules.json`
- ✅ Supports 20+ model families (GPT, Claude, Llama, Gemini, Mistral, etc.)
- ✅ Case-insensitive pattern matching with specificity-based sorting
- ✅ Command-line options for different update modes
- ✅ Easily extensible rule system without code changes

**Configuration file:** `uploads/model_family_rules.json` (22+ family rules)

### 📋 Comprehensive Model Setup Pipeline

For a complete model initialization including metadata, run these commands in sequence:

```bash
# 1. Clean model setup (removes old models, fetches fresh from APIs)
npm run setup-models-clean

# 2. Update model statistics and relationships
npm run update-model-stats-aa-and-relations

# 3. Update model status based on pricing data
npm run update-model-status-pricing-presence

# 4. Populate detailed metadata from JSON
node scripts/setup-init/populate-model-metadata-from-json.js

# 5. Assign model families using pattern rules
node scripts/setup-init/populate-model-families.js

# 6. Verify complete setup
npm run verify-setup
```

**Benefits of this pipeline:**
- 🎯 **Rich Metadata**: Models have comprehensive descriptions, capabilities, and usage guidance
- 🏗️ **Organized Structure**: Models are categorized into logical families for better management
- 🔄 **API-Fresh Data**: All models are fetched live from provider APIs
- ✅ **Complete Coverage**: Handles pricing, statistics, relationships, and metadata
- 🛠️ **Maintainable**: JSON-based configurations allow easy updates without code changes


### Manual Step-by-Step Setup (Advanced)

If you need more control or troubleshooting, you can use the modern model management system manually:

```bash
# Step 0: Initialize providers and subscriptions
npm run init-providers

# Step 1: Populate aggregator pricing tiers
node scripts/setup-init/populate-aggregator-pricing-tiers.js

# Step 2: Sync models using modern API-fetching system
npm run model-mgmt sync

# Step 3: Populate capabilities
node scripts/setup-init/populate-capabilities.js

# Step 4: Create model-capability relationships  
node scripts/setup-init/populate-models-capabilities.js

# Step 5: Populate model subscriptions
node scripts/setup-init/populate-model-subscriptions.js
```

## Model Management System

After initial setup, you can use the modern Model Management CLI for ongoing operations:

### Basic Commands

```bash
# Check system status
npm run model-mgmt:status

# Sync models from all providers
npm run sync:all

# Sync from specific providers
npm run sync:openai
npm run sync:anthropic
npm run sync:together
npm run sync:openrouter
npm run sync:deepseek
npm run sync:ideogram

# Check system health
npm run model-mgmt:health

# View system metrics
npm run model-mgmt:metrics

# Interactive mode
npm run model-mgmt:interactive
```

### Provider-Specific Sync

```bash
# Sync specific providers
npm run model-mgmt sync --provider openai
npm run model-mgmt sync --provider anthropic
npm run model-mgmt sync --provider together
```

## Verification

After setup, verify everything is working:

```bash
# Verify setup completion
npm run verify-setup

# Check model statistics
npm run verify-model-stats

# Simple model stats verification
npm run verify-model-stats-simple
```

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   - Verify MySQL is running
   - Check database credentials in environment variables
   - Ensure database exists and is accessible

2. **API Key Issues**
   - Verify API keys are configured for external providers
   - Check rate limits and quotas

3. **Missing Dependencies**
   - Run `npm install` to ensure all packages are installed
   - Check Node.js version (>=16.0.0 required)

### Script Locations and Status

- **🚀 Modern Scripts**: 
  - `scripts/setup-init/setup-models-modern.js` (✅ **RECOMMENDED** - uses API-fetched models)
  - `scripts/setup-init/populate-model-metadata-from-json.js` (✅ **ACTIVE** - JSON-based metadata population)
  - `scripts/setup-init/populate-model-families.js` (✅ **ACTIVE** - rule-based family assignment)
  - `services/model-management/` (✅ **ACTIVE** - modern CLI system)
  
- **⚠️ Legacy Scripts**: 
  - `scripts/setup-init/setup-models-complete.js` (❌ **DEPRECATED** - hardcoded models)
  - `scripts/setup-init/init-all-models-unified.js` (❌ **DEPRECATED** - hardcoded models)
  - `scripts/update-models-info/` (❌ **LEGACY** - older approach)

### Migration Path

If you're currently using legacy scripts:

1. **Immediate**: Switch to `npm run setup-models` (now points to modern script)
2. **Fallback**: Use `npm run setup-models-legacy` if needed
3. **Future**: Ongoing operations use `npm run model-mgmt sync`

### Individual Troubleshooting Scripts

If you encounter issues, you can run individual components:

```bash
# Database cleanup
npm run cleanup-indexes

# Truncate and reset models
npm run truncate-models

# Debug setup issues  
npm run debug-setup

```

## System Architecture

The current system uses:

1. **Setup Scripts** (`scripts/setup-init/`): For initial system setup and database population
2. **Model Management Service** (`services/model-management/`): For ongoing operations, monitoring, and maintenance
3. **Update Scripts** (`scripts/update-models-info/`): Legacy scripts for model updates

## Best Practices

1. **Always use the modern setup script** (`npm run setup-models-clean`) for initial setup - uses API-fetched models
2. **Use the comprehensive setup pipeline** for complete model initialization including metadata
3. **Populate model metadata** using the JSON-based script for rich model descriptions and capabilities
4. **Assign model families** using the rule-based script for better organization and filtering
5. **Use the Model Management CLI** for ongoing operations and maintenance
6. **Avoid legacy scripts** - they use outdated hardcoded model lists
7. **Run verification scripts** after any major changes
8. **Monitor system health** regularly using `npm run model-mgmt:health`
9. **Keep API keys secure** and properly configured for all providers
10. **Regular model sync** - use `npm run sync:all` to keep models current
11. **Update metadata configurations** in JSON files when new models or families are added

## Maintenance

### Regular Tasks

```bash
# Weekly health check
npm run model-mgmt:health

# Monthly model sync
npm run sync:all

# Update model metadata after new models are added
node scripts/setup-init/populate-model-metadata-from-json.js

# Update model families when new models are detected
node scripts/setup-init/populate-model-families.js

# Quarterly system metrics review
npm run model-mgmt:metrics --export json
```

### Database Maintenance

```bash
# Run migrations
npm run migration:up

# Database maintenance operations
npm run model-mgmt maintenance --cleanup
```

## Support

If you encounter issues:

1. Check the logs: `npm run model-mgmt:logs`
2. Run health checks: `npm run model-mgmt:health`
3. Verify system status: `npm run model-mgmt:status`
4. Review the troubleshooting section above
5. For metadata issues, check the JSON configuration files:
   - `uploads/ai_models_descriptions_edo.json` (model metadata)
   - `uploads/model_family_rules.json` (family assignment rules)

For more detailed information, refer to:
- `docs/model-management-system.md`
- `docs/unified-model-manager.md`
- `docs/model-management-troubleshooting.md`