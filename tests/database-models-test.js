/**
 * Test per verificare l'accesso ai modelli del database
 */

const db = require('../database');

async function testDatabaseModels() {
    console.log('🧪 Testing database models access...');

    try {
        // Inizializza il database
        console.log('📊 Test 1: Database initialization');
        await db.initialize();
        console.log('✅ Database initialized successfully');

        // Verifica che il database sia connesso
        console.log('\n📊 Test 2: Database connection');
        await db.sequelize.authenticate();
        console.log('✅ Database connection successful');

        // Verifica che i modelli siano disponibili
        console.log('\n📋 Test 3: Model availability');
        const models = db.sequelize.models;
        console.log('Available models:', Object.keys(models));

        // Verifica modelli specifici
        const requiredModels = ['Model', 'Provider', 'AggregatorPricingTier', 'ModelPriceScore'];

        for (const modelName of requiredModels) {
            if (!models[modelName]) {
                throw new Error(`Required model ${modelName} not found`);
            }
            console.log(`✅ Model ${modelName} available`);
        }

        // Test 4: Query sui modelli
        console.log('\n🔍 Test 4: Model queries');

        const { Model, Provider, AggregatorPricingTier } = models;

        // Test query sui modelli
        const modelCount = await Model.count();
        console.log(`✅ Models count: ${modelCount}`);

        const providerCount = await Provider.count();
        console.log(`✅ Providers count: ${providerCount}`);

        const pricingTierCount = await AggregatorPricingTier.count();
        console.log(`✅ Pricing tiers count: ${pricingTierCount}`);

        // Test 5: Query specifica per Anthropic
        console.log('\n🎯 Test 5: Anthropic provider query');

        const anthropicProvider = await Provider.findOne({
            where: { name: 'anthropic' }
        });

        if (!anthropicProvider) {
            throw new Error('Anthropic provider not found');
        }

        console.log('✅ Anthropic provider found:', {
            id: anthropicProvider.id,
            name: anthropicProvider.name
        });

        // Test 6: Query pricing tier per Anthropic
        console.log('\n💰 Test 6: Anthropic pricing tier query');

        const pricingTier = await AggregatorPricingTier.findOne({
            where: {
                id_aggregator_provider: anthropicProvider.id,
                tier_name: 'pay_as_you_go'
            }
        });

        if (!pricingTier) {
            throw new Error('Anthropic pricing tier not found');
        }

        console.log('✅ Anthropic pricing tier found:', {
            tier_name: pricingTier.tier_name,
            markup_percentage: pricingTier.markup_percentage,
            markup_fixed: pricingTier.markup_fixed
        });

        console.log('\n🎉 All database model tests passed!');

    } catch (error) {
        console.error('❌ Database model test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Esegui il test se il file viene chiamato direttamente
if (require.main === module) {
    testDatabaseModels()
        .then(() => {
            console.log('\n✅ Database model test completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Database model test failed:', error);
            process.exit(1);
        });
}

module.exports = { testDatabaseModels }; 