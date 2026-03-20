#!/usr/bin/env node

/**
 * MODEL SUBSCRIPTIONS POPULATION SCRIPT
 * Links all models to their provider subscriptions
 * 
 * IMPORTANT: This is STEP 5 of a 5-step process. For complete setup, use:
 *   node scripts/setup-models-complete.js
 * 
 * Or run individual steps in order:
 *   1. node scripts/init-all-models-unified.js
 *   2. node scripts/populate-capabilities.js
 *   3. node scripts/populate-models-capabilities.js
 *   4. node scripts/populate-aggregator-pricing-tiers.js
 *   5. node scripts/populate-model-subscriptions.js         (this script)
 * 
 * This script creates the model-subscription relationships for proper pricing.
 */

const db = require('../../database');

const populateModelSubscriptions = async () => {
  try {
    console.log('=== POPOLAZIONE MODEL SUBSCRIPTIONS ===');
    
    // Inizializza la connessione al database
    await db.initialize();
    const { Provider, ProviderSubscription, Model, ModelsSubscription } = db.models;

    // Prima, vediamo tutti i provider non-aggregatori e cosa hanno
    console.log('\n--- ANALISI PROVIDER ---');
    const allNonAggregatorProviders = await Provider.findAll({
      where: {
        provider_type: ['direct', 'indirect', 'both']
      },
      include: [
        {
          model: ProviderSubscription,
          as: 'subscriptions',
          required: false
        },
        {
          model: Model,
          as: 'models',
          required: false
        }
      ]
    });

    for (const provider of allNonAggregatorProviders) {
      console.log(`${provider.name} (${provider.provider_type}): ${provider.models?.length || 0} modelli, ${provider.subscriptions?.length || 0} subscription`);
    }

    // Mostra tutte le subscription disponibili per debugging
    console.log('\n--- SUBSCRIPTION DISPONIBILI ---');
    const allSubscriptions = await ProviderSubscription.findAll({
      include: [{
        model: Provider,
        as: 'provider',
        attributes: ['name', 'provider_type']
      }]
    });
    
    const subscriptionsByProvider = {};
    allSubscriptions.forEach(sub => {
      const providerName = sub.provider?.name || 'unknown';
      if (!subscriptionsByProvider[providerName]) {
        subscriptionsByProvider[providerName] = [];
      }
      subscriptionsByProvider[providerName].push(sub.name);
    });
    
    Object.keys(subscriptionsByProvider).forEach(providerName => {
      console.log(`${providerName}: [${subscriptionsByProvider[providerName].join(', ')}]`);
    });

    // Ottieni tutti i provider che hanno ENTRAMBI subscription E modelli
    const providersWithBoth = allNonAggregatorProviders.filter(p => 
      p.models && p.models.length > 0 && 
      p.subscriptions && p.subscriptions.length > 0
    );

    console.log(`\n--- PROVIDER DA PROCESSARE ---`);
    console.log(`Trovati ${providersWithBoth.length} provider con subscription e modelli:`);
    providersWithBoth.forEach(p => console.log(`  - ${p.name} (${p.provider_type})`));

    let totalRelationsCreated = 0;
    let totalRelationsSkipped = 0;

    for (const provider of providersWithBoth) {
      console.log(`\n--- Processing provider: ${provider.name} (${provider.provider_type}) ---`);
      console.log(`  Modelli: ${provider.models.length}`);
      console.log(`  Subscription: ${provider.subscriptions.length}`);

      for (const model of provider.models) {
        for (const subscription of provider.subscriptions) {
          // Verifica se la relazione esiste già
          const existingRelation = await ModelsSubscription.findOne({
            where: {
              id_provider: provider.id,
              id_model: model.id,
              id_subscription: subscription.id
            }
          });

          if (existingRelation) {
            totalRelationsSkipped++;
            continue;
          }

          // Crea la relazione
          await ModelsSubscription.create({
            id_provider: provider.id,
            id_model: model.id,
            id_subscription: subscription.id
          });

          totalRelationsCreated++;
          console.log(`  ✓ Collegato: ${model.name} -> ${subscription.name}`);
        }
      }

      console.log(`  Relazioni create per ${provider.name}: ${provider.models.length * provider.subscriptions.length}`);
    }

    // Statistiche aggregatori saltati
    const aggregatorProviders = await Provider.findAll({
      where: {
        provider_type: 'aggregator'
      }
    });

    // Analisi dettagliata dei provider saltati
    const providersWithoutSubscriptions = allNonAggregatorProviders.filter(p => 
      !p.subscriptions || p.subscriptions.length === 0
    );
    
    const providersWithoutModels = allNonAggregatorProviders.filter(p => 
      !p.models || p.models.length === 0
    );

    console.log('\n=== RIEPILOGO ===');
    console.log(`✅ Relazioni create: ${totalRelationsCreated}`);
    console.log(`⏭️  Relazioni già esistenti: ${totalRelationsSkipped}`);
    console.log(`🚫 Provider aggregatori saltati: ${aggregatorProviders.length} (${aggregatorProviders.map(p => p.name).join(', ')})`);
    
    if (providersWithoutSubscriptions.length > 0) {
      console.log(`⚠️  Provider senza subscription saltati: ${providersWithoutSubscriptions.length}`);
      providersWithoutSubscriptions.forEach(p => console.log(`     - ${p.name} (${p.provider_type}) - ${p.models?.length || 0} modelli`));
    }
    
    if (providersWithoutModels.length > 0) {
      console.log(`⚠️  Provider senza modelli saltati: ${providersWithoutModels.length}`);
      providersWithoutModels.forEach(p => console.log(`     - ${p.name} (${p.provider_type}) - ${p.subscriptions?.length || 0} subscription`));
    }
    
    console.log('\n💡 SUGGERIMENTI:');
    if (providersWithoutSubscriptions.length > 0) {
      console.log('   - Verifica che i nomi dei provider nel CSV corrispondano ai nomi nel database');
      console.log('   - Controlla se il CSV è stato caricato correttamente');
    }
    console.log('\n=== POPOLAZIONE COMPLETATA ===');

    // Only close database and exit if running as standalone script
    if (require.main === module) {
      await db.close();
      process.exit(0);
    }
    
  } catch (error) {
    console.error('Errore durante la popolazione model subscriptions:', error);
    if (require.main === module) {
      process.exit(1);
    } else {
      throw error; // Re-throw for parent script to handle
    }
  }
};

// Esegui lo script se chiamato direttamente
if (require.main === module) {
  populateModelSubscriptions();
}

module.exports = { populateModelSubscriptions };