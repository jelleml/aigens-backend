# Models Setup Documentation

This document explains the new models system architecture and setup process.


### Quick Setup (Recommended)

complete models setup:

```bash
npm run setup-models
```

This will:
1. Initialize all models from all providers
2. Populate the 41 standard capabilities
3. Create model-capability relationships
4. Create aggregator pricing tiers for Together.ai and OpenRouter
5. Link models to their provider subscriptions

### Manual Setup (Step by Step)

If you need to run individual steps:

```bash
# Step 0: Initialize providers, subscriptions, pricing tiers (PREREQUISITE - run first!)
node scripts/init-provider-subscription.js

# Step 1: Initialize models (without capabilities JSON field)
node scripts/init-all-models-unified.js

# Step 2: Populate capabilities table with 41 standard capabilities
node scripts/populate-capabilities.js

# Step 3: Create model-capability relationships
node scripts/populate-models-capabilities.js

# Step 4: Create aggregator pricing tiers
node scripts/populate-aggregator-pricing-tiers.js

# Step 5: Link models to subscriptions
node scripts/populate-model-subscriptions.js
```


## 🚀 Quick Checks


### Step 2: Verify Setup (Optional)
```bash
npm run verify-setup
```

## ⚠️ Reset/Cleanup Commands

### Complete Data Reset (DANGER ZONE)
```bash
npm run truncate-models
```
**WARNING**: This will DELETE ALL data from models and providers tables. Use with extreme caution!

This script will truncate the following tables:
- `models` - All AI models
- `providers` - All AI providers  
- `aggregated_models` - Model aggregation relationships
- `aggregator_pricing_tiers` - Aggregator pricing configurations
- `models_models_capabilities` - Model-capability links
- `models_stats_aa` - Artificial Analysis statistics
- `models_models_stats_aa` - Model-statistics relationships
- `provider_subscriptions` - Provider subscription data
- `models_price_history` - Historical pricing data
- `models_price_score` - Model scoring data

The script includes multiple confirmation prompts for safety.

Or run directly:
```bash
# First time only - initialize providers, subscriptions, pricing tiers
node scripts/init-provider-subscription-pricing-tier.js

# Main models setup
node scripts/setup-models-complete.js
```

## ✅ What This Does

1. **Initializes all models** from OpenAI, Anthropic, DeepSeek, Ideogram, Together.ai, OpenRouter
2. **Creates 41 standard capabilities** (text, vision, reasoning, etc.)
3. **Links models to capabilities** based on their type and provider
4. **Creates aggregator pricing tiers** for Together.ai and OpenRouter
5. **Links models to subscriptions** for proper pricing

### Step 6: Update Model Statistics (Required)

After setting up all models, you need to update the model statistics tables. This can be done using the automated script:

```bash
node scripts/update-model-stats-aa-and-relations.js
```

This script will:
1. Call the Python addon API to refresh model statistics in the `models_stats_aa` table
2. Verify the operation was successful
3. Call the Python addon API to refresh model relationships in the `models_models_stats_aa` table
4. Verify the operation was successful
5. Call the Python addon API to update price scores from the artificial analysis data
6. Verify the operation was successful

The script includes appropriate error handling and delays between operations to ensure each step completes successfully before proceeding to the next.

Alternatively, you can run this as an npm script:

```bash
npm run update-model-stats-aa-and-relations
```

### Step 7: Verify Model Statistics (Recommended)

After updating the model statistics, you should verify that the tables have been correctly updated. This can be done using the verification script:

```bash
node scripts/verify-model-stats.js
```

Or using the npm script:

```bash
npm run verify-model-stats
```

This script will:
1. Run the model statistics update script again
2. Verify that the `models_stats_aa` table has been populated
3. Verify that the `models_models_stats_aa` table has been populated
4. Verify that the `models_price_score` table has been updated with AA scores
5. Verify that the cost calculator service can use the updated data

For more detailed testing instructions, refer to the [Model Statistics Testing Guide](./model-stats-testing-guide.md).



## 📊 New API Endpoints

### For Frontend (Complete Info)
```
GET /api/v1/models/frontend
```
Returns: provider, model name, description, capabilities list, pricing

### For General Use (Updated)
```
GET /api/v1/models
```
Now uses normalized capabilities instead of JSON field



## API Changes

### New Endpoint for Models Page list

**`GET /api/v1/models/frontend`**

Returns complete model information for frontend rendering:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "GPT-4o",
      "slug": "gpt-4o",
      "description": "Il modello più avanzato di OpenAI...",
      "provider": "openai",
      "capabilities": [
        {
          "id": 1,
          "name": "Text generation",
          "type": "text",
          "description": "Generazione di testo libero su richiesta"
        }
      ],
      "pricing": {
        "inputPricePerMillion": 5.0,
        "outputPricePerMillion": 15.0
      }
    }
  ]
}
```

### Updated Existing Endpoints

- **`GET /api/v1/models`** - Now uses normalized capabilities
- **`GET /api/v1/models/public`** - Maintains backward compatibility

## Capabilities List

The system includes 41 standard capabilities:

### Text Capabilities (1-9)
- Text generation
- Text completion
- Summarization
- Translation
- Sentiment analysis
- Named entity recognition
- Text classification
- Grammar correction
- Style transfer

### Code Capabilities (10-11)
- Code generation
- Code explanation

### Cognitive Capabilities (12-18)
- Logical reasoning
- Mathematical reasoning
- Commonsense reasoning
- Chain-of-thought reasoning
- Multi-step problem solving
- Planning
- Memory usage

### Vision Capabilities (19-24)
- Image understanding
- Image generation
- Image editing
- Diagram interpretation
- OCR
- Video understanding

### Audio Capabilities (25)
- Audio transcription

### Input Capabilities (26-30)
- Text input
- Image input
- Audio input
- Video input
- File input

### Output Capabilities (31-34)
- Text output
- Image output
- Audio output
- Structured output

### Tool Use Capabilities (35-41)
- API calling
- Function calling
- Web browsing
- Code interpreter
- Retrieval-augmented generation
- Data visualization
- Personalization / memory

## Model-Capability Mapping

The system uses intelligent mapping based on provider and model type:

### OpenAI Models
- **GPT-4o**: Text + Vision + Reasoning
- **GPT-4 Turbo**: Text + Reasoning
- **GPT-4 Vision**: Text + Vision + Reasoning
- **GPT-3.5 Turbo**: Text only

### Anthropic Models
- **All Claude models**: Text + Vision + Reasoning
- **Claude 3.5/3.7**: + Advanced reasoning

### DeepSeek Models
- **deepseek-chat**: Text + Reasoning
- **deepseek-coder**: Text + Code
- **deepseek-lite**: Text only
- **deepseek-vision**: Text + Vision

### Ideogram Models
- **All models**: Image generation + Text input

### Together.ai / OpenRouter
- **Pattern-based detection** by model name and type

## Prerequisites

Before running the setup:

1. **Database**: Must be running and accessible
2. **Database Tables**: Must be created (run migrations if needed)
3. **API Keys**: Configure for external providers:
   - Together.ai API key
   - OpenRouter API key
4. **Dependencies**: All npm packages installed
5. **Providers Initialization**: Run `npm run init-providers` first (one-time setup)

