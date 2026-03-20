const db = require('../../database');

async function addGoogleVeoModels() {
    try {
        console.log('🔄 Aggiunta modelli Google Veo...');

        // Trova il provider Google Veo
        const provider = await db.models.Provider.findOne({
            where: { name: 'google-veo' }
        });

        if (!provider) {
            throw new Error('Provider Google Veo non trovato. Eseguire prima add-google-veo-provider.js');
        }

        console.log(`Provider trovato: ${provider.name} (ID: ${provider.id})`);

        // Modelli Google Veo da aggiungere
        const models = [
            {
                name: 'Google Veo 1.0',
                display_name: 'Google Veo 1.0',
                model_slug: 'google-veo-1.0',
                api_model_id: 'google-veo-1.0',
                description: 'Google Veo 1.0 - Modello di generazione video da testo',
                id_provider: provider.id,
                is_active: true,
                max_tokens: 0, // Non applicabile per video
                model_family: 'Google Veo',
                capabilities: ['video-generation'],
                pricing_type: 'per_request',
                input_price_per_1k_tokens: 0,
                output_price_per_1k_tokens: 0
            },
            {
                name: 'Google Veo 2.0',
                display_name: 'Google Veo 2.0',
                model_slug: 'google-veo-2.0',
                api_model_id: 'google-veo-2.0',
                description: 'Google Veo 2.0 - Modello avanzato di generazione video da testo',
                id_provider: provider.id,
                is_active: true,
                max_tokens: 0, // Non applicabile per video
                model_family: 'Google Veo',
                capabilities: ['video-generation', 'video-editing'],
                pricing_type: 'per_request',
                input_price_per_1k_tokens: 0,
                output_price_per_1k_tokens: 0
            }
        ];

        let createdCount = 0;
        let existingCount = 0;

        for (const modelData of models) {
            // Verifica se il modello esiste già
            const existingModel = await db.models.Model.findOne({
                where: {
                    model_slug: modelData.model_slug,
                    id_provider: provider.id
                }
            });

            if (existingModel) {
                console.log(`   ⚠️  Modello ${modelData.name} già esistente`);
                existingCount++;
            } else {
                // Crea il modello
                const model = await db.models.Model.create(modelData);
                console.log(`   ✅ Modello ${model.name} creato (ID: ${model.id})`);
                createdCount++;
            }
        }

        console.log(`\n📊 Riepilogo:`);
        console.log(`   Modelli creati: ${createdCount}`);
        console.log(`   Modelli esistenti: ${existingCount}`);
        console.log(`   Totale: ${createdCount + existingCount}`);

        return { createdCount, existingCount };
    } catch (error) {
        console.error('❌ Errore durante la creazione dei modelli Google Veo:', error);
        throw error;
    }
}

// Esegui lo script se chiamato direttamente
if (require.main === module) {
    // Inizializza il database prima di eseguire
    db.initialize()
        .then(() => addGoogleVeoModels())
        .then(() => {
            console.log('✅ Setup modelli completato');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Setup modelli fallito:', error);
            process.exit(1);
        });
}

module.exports = addGoogleVeoModels; 