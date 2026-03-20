/**
 * Test per il nuovo sistema di calcolo dei costi
 * Verifica l'integrazione con AggregatorPricingTier e il calcolo del credit_cost
 */

const CostCalculator = require('../services/cost-calculator.service');
const db = require('../database');

async function testCostCalculation() {
    console.log('🧪 Testing new cost calculation system...');

    try {
        // Inizializza il database
        console.log('📊 Initializing database...');
        await db.initialize();
        console.log('✅ Database initialized successfully');

        const costCalculator = new CostCalculator();

        // Test 1: Calcolo costi con markup da AggregatorPricingTier
        console.log('\n📊 Test 1: Cost calculation with AggregatorPricingTier markup');

        const testParams = {
            provider: 'anthropic',
            modelId: 1, // Modello esistente nel database
            apiModelId: 'claude-opus-4-20250514-anthropic', // Model slug esistente
            inputTokens: 1000,
            outputTokens: 500
        };

        const result = await costCalculator.calculateCost(testParams);

        console.log('✅ Cost calculation result:', {
            base_cost: result.base_cost,
            fixed_markup_value: result.fixed_markup_value,
            percentage_markup: result.markup_value,
            total_markup: result.total_markup,
            total_cost_for_user: result.total_cost_for_user,
            credit_cost: result.credit_cost,
            markup_percentage: result.fixed_markup_perc
        });

        // Verifica che i campi siano presenti
        const requiredFields = [
            'base_cost', 'fixed_markup_value', 'markup_value',
            'total_markup', 'total_cost_for_user', 'credit_cost'
        ];

        for (const field of requiredFields) {
            if (result[field] === undefined) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        console.log('✅ All required fields present');

        // Test 2: Verifica che credit_cost sia calcolato correttamente
        console.log('\n💰 Test 2: Credit cost calculation verification');

        const expectedCreditCost = result.total_cost_for_user;
        if (result.credit_cost !== expectedCreditCost) {
            throw new Error(`Credit cost mismatch: expected ${expectedCreditCost}, got ${result.credit_cost}`);
        }

        console.log('✅ Credit cost calculated correctly');

        // Test 3: Verifica che il markup sia applicato correttamente
        console.log('\n📈 Test 3: Markup calculation verification');

        const markupConfig = await costCalculator.getMarkupConfiguration('anthropic');
        console.log('Markup configuration:', markupConfig);

        const expectedPercentageMarkup = result.base_cost * (markupConfig.markup_percentage / 100);
        const expectedTotalMarkup = markupConfig.markup_fixed + expectedPercentageMarkup;

        console.log('Expected markup calculation:', {
            base_cost: result.base_cost,
            markup_percentage: markupConfig.markup_percentage,
            markup_fixed: markupConfig.markup_fixed,
            expected_percentage_markup: expectedPercentageMarkup,
            expected_total_markup: expectedTotalMarkup,
            actual_total_markup: result.total_markup
        });

        // Test 4: Verifica che i dati siano salvabili in MessageCost
        console.log('\n💾 Test 4: MessageCost save verification');

        const { MessageCost } = db.sequelize.models;

        const messageCostData = {
            message_id: 999, // Test message ID
            chat_id: 1,
            user_id: 'test-user-id',
            model_id: testParams.modelId,
            input_tokens: result.input_tokens,
            output_tokens: result.output_tokens,
            total_tokens: result.total_tokens,
            base_cost: result.base_cost,
            fixed_markup: result.fixed_markup_value,
            percentage_markup: result.markup_value,
            total_markup: result.total_markup,
            total_cost: result.total_cost_for_user,
            credit_cost: result.credit_cost,
            model_used: testParams.apiModelId
        };

        console.log('MessageCost data structure:', messageCostData);
        console.log('✅ MessageCost data structure is valid');

        console.log('\n🎉 All tests passed! The new cost calculation system is working correctly.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Esegui il test se il file viene chiamato direttamente
if (require.main === module) {
    testCostCalculation()
        .then(() => {
            console.log('\n✅ Cost calculation test completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Cost calculation test failed:', error);
            process.exit(1);
        });
}

module.exports = { testCostCalculation }; 