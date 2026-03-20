const db = require('../../database');
const googleVeoService = require('../../services/google-veo.service');

async function testGoogleVeoIntegration() {
    try {
        console.log('🧪 Test integrazione Google Veo...');

        // Inizializza il database
        await db.initialize();
        console.log('✅ Database inizializzato');

        // Test 1: Verifica modelli disponibili
        console.log('\n📋 Test 1: Verifica modelli disponibili');
        const models = await googleVeoService.getAvailableModels();
        console.log(`   Modelli trovati: ${models.length}`);
        models.forEach(model => {
            console.log(`   - ${model.name} (${model.id})`);
        });

        // Test 2: Verifica disponibilità modello
        console.log('\n📋 Test 2: Verifica disponibilità modello');
        const isAvailable = await googleVeoService.isModelAvailable('google-veo-1.0');
        console.log(`   Modello google-veo-1.0 disponibile: ${isAvailable}`);

        // Test 3: Calcolo costi
        console.log('\n📋 Test 3: Calcolo costi');
        const model = await db.models.Model.findOne({
            where: {
                id_provider: await db.models.Provider.findOne({ where: { name: 'google-veo' } }).then(p => p.id)
            }
        });

        if (model) {
            const cost = await googleVeoService.calculateCost(model.id, 1, 'Generate');
            console.log(`   Costo stimato: ${cost.estimatedCost} ${cost.currency}`);
            console.log(`   Modello: ${cost.modelName}`);
        } else {
            console.log('   ⚠️  Nessun modello Google Veo trovato');
        }

        // Test 4: Verifica fondi utente
        console.log('\n📋 Test 4: Verifica fondi utente');
        const testUser = await db.models.User.findOne({
            where: { email: 'test@example.com' }
        });

        if (testUser) {
            const hasFunds = await googleVeoService.checkUserFunds(testUser.id, 0.01);
            console.log(`   Utente ha fondi sufficienti: ${hasFunds}`);
        } else {
            console.log('   ⚠️  Utente di test non trovato');
        }

        console.log('\n✅ Tutti i test completati con successo!');

    } catch (error) {
        console.error('❌ Errore durante i test:', error);
    } finally {
        process.exit(0);
    }
}

// Esegui i test
testGoogleVeoIntegration(); 