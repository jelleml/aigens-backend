#!/usr/bin/env node

/**
 * AGGREGATOR PRICING TIERS POPULATION SCRIPT
 * Creates or updates pricing tiers for aggregator providers (Together.ai, OpenRouter)
 * 
 * IMPORTANT: This is STEP 4 of a 5-step process. For complete setup, use:
 *   node scripts/setup-models-complete.js
 * 
 * Or run individual steps in order:
 *   1. node scripts/init-all-models-unified.js
 *   2. node scripts/populate-capabilities.js
 *   3. node scripts/populate-models-capabilities.js
 *   4. node scripts/populate-aggregator-pricing-tiers.js    (this script)
 *   5. node scripts/populate-model-subscriptions.js
 * 
 * This script creates or updates "pay_as_you_go" pricing tiers for all providers
 * with markup_percentage 20.00 and markup_fixed 0.01
 */

const db = require('../../database');
const DEFAULT_MARKUP_PERCENTAGE = 20.00;
const DEFAULT_MARKUP_FIXED = 0.01;


const populateAggregatorPricingTiers = async () => {
  try {
    console.log('=== POPOLAZIONE AGGREGATOR PRICING TIERS ===');
    
    // Inizializza la connessione al database
    await db.initialize();
    const { Provider, AggregatorPricingTier } = db.models;

    // Ottieni tutti i provider esistenti
    console.log('\n--- ANALISI PROVIDER ---');
    const allProviders = await Provider.findAll({
      attributes: ['id', 'name', 'provider_type']
    });

    console.log(`Trovati ${allProviders.length} provider nel database:`);
    allProviders.forEach(provider => {
      console.log(`  - ${provider.name} (${provider.provider_type})`);
    });

    let totalTiersCreated = 0;
    let totalTiersUpdated = 0;

    console.log('\n--- CREAZIONE/AGGIORNAMENTO PRICING TIERS ---');
    
    for (const provider of allProviders) {
      console.log(`\nProcessing provider: ${provider.name} (${provider.provider_type})`);
      
      // Verifica se esiste già un tier "pay_as_you_go" per questo provider
      const existingTier = await AggregatorPricingTier.findOne({
        where: {
          id_aggregator_provider: provider.id,
          tier_name: 'pay_as_you_go'
        }
      });

      if (existingTier) {
        // Aggiorna il tier esistente con i nuovi valori
        await existingTier.update({
          markup_percentage: DEFAULT_MARKUP_PERCENTAGE,
          markup_fixed: DEFAULT_MARKUP_FIXED,
          description: 'Pay-as-you-go pricing tier with standard markup',
          is_active: true,
          effective_from: new Date(),
          updated_at: new Date()
        });
        
        console.log(`  🔄 Aggiornato tier "pay_as_you_go" per ${provider.name} (markup: ${DEFAULT_MARKUP_PERCENTAGE}%, fixed: $${DEFAULT_MARKUP_FIXED})`);
        totalTiersUpdated++;
      } else {
        // Crea il tier pay_as_you_go
        await AggregatorPricingTier.create({
          id_aggregator_provider: provider.id,
          tier_name: 'pay_as_you_go',
          markup_percentage: DEFAULT_MARKUP_PERCENTAGE,
          markup_fixed: DEFAULT_MARKUP_FIXED,
          min_volume: 0,
          max_volume: null, // Illimitato
          description: 'Pay-as-you-go pricing tier with standard markup',
          is_active: true,
          effective_from: new Date(),
          effective_until: null // Indefinito
        });

        totalTiersCreated++;
        console.log(`  ✓ Creato tier "pay_as_you_go" per ${provider.name}`);
      }
    }

    console.log('\n=== RIEPILOGO ===');
    console.log(`✅ Tier creati: ${totalTiersCreated}`);
    console.log(`🔄 Tier aggiornati: ${totalTiersUpdated}`);
    console.log(`📊 Totale provider processati: ${allProviders.length}`);
    
    console.log('\n💡 DETTAGLI CONFIGURAZIONE:');
    console.log('   - Tier name: pay_as_you_go');
    console.log(`   - Markup percentage: ${DEFAULT_MARKUP_PERCENTAGE}%`);
    console.log(`   - Markup fixed: ${DEFAULT_MARKUP_FIXED}`);
    console.log('   - Min volume: 0 (nessun limite minimo)');
    console.log('   - Max volume: null (illimitato)');
    console.log('   - Status: active');
    console.log('   - Effective from: now');
    console.log('   - Effective until: indefinito');
    
    console.log('\n=== POPOLAZIONE/AGGIORNAMENTO COMPLETATO ===');

    // Only close database and exit if running as standalone script
    if (require.main === module) {
      await db.close();
      process.exit(0);
    }
    
  } catch (error) {
    console.error('Errore durante la popolazione aggregator pricing tiers:', error);
    if (require.main === module) {
      process.exit(1);
    } else {
      throw error; // Re-throw for parent script to handle
    }
  }
};

// Esegui lo script se chiamato direttamente
if (require.main === module) {
  populateAggregatorPricingTiers();
}

module.exports = { populateAggregatorPricingTiers };