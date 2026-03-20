/**
 * Model Status and Pricing Verification Script
 * 
 * This script analyzes the database to provide a detailed recap of:
 * - Total providers and their status
 * - Models linked with ModelStatsAA (via ModelModelStatsAA junction table)
 * - Models with pricing data in ModelPriceScore table
 * - Detailed breakdown of each model with provider info and active status
 */

const db = require('../../database');

class ModelPricingVerifier {
  constructor() {
    this.db = db;
  }

  async run() {
    try {
      console.log('🔍 Starting Model Status and Pricing Verification...\n');
      
      // Initialize database connection
      await this.db.initialize();
      
      // Get all models with their relationships
      const { Model, Provider, ModelStatsAA, ModelModelStatsAA, ModelPriceScore } = this.db.sequelize.models;
      
      // 1. Count total providers
      const providers = await Provider.findAll({
        order: [['name', 'ASC']]
      });
      
      console.log(`📊 PROVIDER SUMMARY:`);
      console.log(`Total Providers: ${providers.length}`);
      console.log('Provider Details:');
      providers.forEach(provider => {
        console.log(`  - ID: ${provider.id} | Name: ${provider.name} | Type: ${provider.provider_type}`);
      });
      console.log('');
      
      // 2. Get all models with their provider info
      const models = await Model.findAll({
        include: [
          {
            model: Provider,
            as: 'provider',
            attributes: ['id', 'name', 'provider_type']
          }
        ],
        order: [['id', 'ASC']]
      });
      
      console.log(`📊 MODEL SUMMARY:`);
      console.log(`Total Models: ${models.length}`);
      console.log('');
      
      // 3. Check ModelStatsAA relationships
      const modelStatsRelationships = await ModelModelStatsAA.findAll({
        include: [
          {
            model: ModelStatsAA,
            as: 'modelStatsAA',
            attributes: ['slug', 'price_1m_input_tokens', 'price_1m_output_tokens']
          }
        ]
      });
      
      const modelsWithStatsAA = [...new Set(modelStatsRelationships.map(rel => rel.id_model))];
      console.log(`📊 MODELS_STATS_AA RELATIONSHIPS:`);
      console.log(`Total Models Linked to ModelStatsAA: ${modelsWithStatsAA.length}`);
      console.log('');
      
      // 4. Check ModelPriceScore data
      const modelPriceScores = await ModelPriceScore.findAll();
      const modelsWithPriceScore = [...new Set(modelPriceScores.map(price => price.id_model))];
      console.log(`📊 MODELS_PRICE_SCORE DATA:`);
      console.log(`Total Models with Price Score: ${modelsWithPriceScore.length}`);
      console.log('');
      
      // 5. Create detailed breakdown
      console.log('📋 DETAILED MODEL BREAKDOWN:');
      console.log('=====================================');
      
      let activeModels = 0;
      let inactiveModels = 0;
      let modelsWithPricing = 0;
      let modelsWithoutPricing = 0;
      
      for (const model of models) {
        const hasStatsAA = modelsWithStatsAA.includes(model.id);
        const hasPriceScore = modelsWithPriceScore.includes(model.id);
        const hasPricing = hasStatsAA || hasPriceScore;
        
        if (model.is_active) activeModels++;
        else inactiveModels++;
        
        if (hasPricing) modelsWithPricing++;
        else modelsWithoutPricing++;
        
        console.log(`Model ID: ${model.id}`);
        console.log(`  ├─ Slug: ${model.model_slug}`);
        console.log(`  ├─ API Model ID: ${model.api_model_id}`);
        console.log(`  ├─ Provider: ${model.provider.name} (ID: ${model.provider.id})`);
        console.log(`  ├─ Provider Type: ${model.provider.provider_type}`);
        console.log(`  ├─ Active: ${model.is_active ? '✅ Yes' : '❌ No'}`);
        console.log(`  ├─ Has Stats AA: ${hasStatsAA ? '✅ Yes' : '❌ No'}`);
        console.log(`  ├─ Has Price Score: ${hasPriceScore ? '✅ Yes' : '❌ No'}`);
        console.log(`  └─ Has Pricing Data: ${hasPricing ? '✅ Yes' : '❌ No'}`);
        console.log('');
      }
      
      // 6. Summary statistics
      console.log('📊 FINAL SUMMARY:');
      console.log('=================');
      console.log(`Total Providers: ${providers.length}`);
      console.log(`Total Models: ${models.length}`);
      console.log(`  ├─ Active Models: ${activeModels}`);
      console.log(`  └─ Inactive Models: ${inactiveModels}`);
      console.log('');
      console.log(`Models Linked to ModelStatsAA: ${modelsWithStatsAA.length}`);
      console.log(`Models with PriceScore Data: ${modelsWithPriceScore.length}`);
      console.log(`  ├─ Models WITH Pricing: ${modelsWithPricing}`);
      console.log(`  └─ Models WITHOUT Pricing: ${modelsWithoutPricing}`);
      console.log('');
      
      // 7. Identify models without pricing (potential issues)
      console.log('⚠️  MODELS WITHOUT PRICING DATA:');
      console.log('==================================');
      
      if (modelsWithoutPricing === 0) {
        console.log('✅ All models have pricing data!');
      } else {
        const modelsWithoutPricingData = models.filter(model => {
          const hasStatsAA = modelsWithStatsAA.includes(model.id);
          const hasPriceScore = modelsWithPriceScore.includes(model.id);
          return !hasStatsAA && !hasPriceScore;
        });
        
        modelsWithoutPricingData.forEach(model => {
          console.log(`❌ Model ID: ${model.id} | Slug: ${model.model_slug} | Provider: ${model.provider.name} | Active: ${model.is_active}`);
        });
      }
      
      console.log('\n🔍 Verification Complete!');
      
    } catch (error) {
      console.error('❌ Error running verification:', error);
      throw error;
    } finally {
      // Close database connection
      await this.db.close();
    }
  }
}

// Run the verification
const verifier = new ModelPricingVerifier();
verifier.run()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });