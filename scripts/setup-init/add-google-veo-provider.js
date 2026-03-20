const db = require('../../database');

async function addGoogleVeoProvider() {
    try {
        console.log('🔄 Aggiunta provider Google Veo...');

        // Verifica se il provider esiste già
        const existingProvider = await db.models.Provider.findOne({
            where: { name: 'google-veo' }
        });

        if (existingProvider) {
            console.log('✅ Provider Google Veo già esistente');
            return existingProvider;
        }

        // Crea il provider Google Veo
        const googleVeoProvider = await db.models.Provider.create({
            name: 'google-veo',
            description: 'Google Veo - Servizio di generazione video da testo',
            provider_type: 'direct'
        });

        console.log('✅ Provider Google Veo creato con successo');
        console.log(`   ID: ${googleVeoProvider.id}`);
        console.log(`   Nome: ${googleVeoProvider.name}`);
        console.log(`   Tipo: ${googleVeoProvider.provider_type}`);

        return googleVeoProvider;
    } catch (error) {
        console.error('❌ Errore durante la creazione del provider Google Veo:', error);
        throw error;
    }
}

// Esegui lo script se chiamato direttamente
if (require.main === module) {
    // Inizializza il database prima di eseguire
    db.initialize()
        .then(() => addGoogleVeoProvider())
        .then(() => {
            console.log('✅ Setup completato');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Setup fallito:', error);
            process.exit(1);
        });
}

module.exports = addGoogleVeoProvider; 