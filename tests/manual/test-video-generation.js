const db = require('../../database');
const googleVeoService = require('../../services/google-veo.service');

async function testVideoGeneration() {
    try {
        console.log('🎬 Test generazione video Google Veo...');
        
        await db.initialize();
        console.log('✅ Database inizializzato');

        // Trova un utente di test
        const testUser = await db.models.User.findOne({
            where: { email: 'test@example.com' }
        });

        if (!testUser) {
            console.log('⚠️  Utente di test non trovato, creo un utente temporaneo...');
            const newUser = await db.models.User.create({
                email: 'test-video@example.com',
                password: 'testpassword123',
                name: 'Test Video User',
                is_active: true
            });
            
            // Crea wallet per l'utente
            await db.models.Wallet.create({
                id_user: newUser.id,
                balance: 50.0
            });
            
            console.log(`✅ Utente di test creato: ${newUser.email}`);
        }

        const user = testUser || await db.models.User.findOne({
            where: { email: 'test-video@example.com' }
        });

        // Crea una chat di test
        const testChat = await db.models.Chat.create({
            user_id: user.id,
            title: 'Test Video Generation Chat',
            is_active: true
        });

        console.log(`✅ Chat di test creata: ${testChat.id}`);

        // Trova un modello Google Veo
        const googleVeoProvider = await db.models.Provider.findOne({
            where: { name: 'google-veo' }
        });

        if (!googleVeoProvider) {
            throw new Error('Provider Google Veo non trovato');
        }

        const model = await db.models.Model.findOne({
            where: { 
                id_provider: googleVeoProvider.id,
                is_active: true 
            }
        });

        if (!model) {
            throw new Error('Modello Google Veo non trovato');
        }

        console.log(`✅ Modello trovato: ${model.name} (ID: ${model.id})`);

        // Test con prompt semplici
        const testPrompts = [
            'Un gatto che gioca con una palla',
            'Un paesaggio di montagna al tramonto',
            'Un robot che cammina in una città futura',
            'Un fiore che sboccia in time-lapse',
            'Un uccello che vola nel cielo azzurro'
        ];

        for (let i = 0; i < testPrompts.length; i++) {
            const prompt = testPrompts[i];
            console.log(`\n📹 Test ${i + 1}/${testPrompts.length}: "${prompt}"`);
            
            try {
                const startTime = Date.now();
                
                const result = await googleVeoService.processGoogleVeoRequest({
                    prompt: prompt,
                    modelId: model.id,
                    userId: user.id,
                    chatId: testChat.id,
                    onStream: (event) => {
                        if (event.type === 'video-generation-started') {
                            console.log('   🚀 Generazione video iniziata');
                        } else if (event.type === 'video-generation-progress') {
                            console.log(`   📊 Progresso: ${event.data.progress}%`);
                        } else if (event.type === 'video-generation-completed') {
                            console.log('   ✅ Generazione video completata');
                        } else if (event.type === 'video-generation-error') {
                            console.log(`   ❌ Errore: ${event.data.error}`);
                        }
                    }
                });

                const endTime = Date.now();
                const duration = (endTime - startTime) / 1000;

                console.log(`   ✅ Successo!`);
                console.log(`   📁 File: ${result.fileName}`);
                console.log(`   🔗 URL: ${result.videoUrl}`);
                console.log(`   💰 Costo: ${result.cost} EUR`);
                console.log(`   ⏱️  Durata: ${duration.toFixed(2)}s`);

            } catch (error) {
                console.log(`   ❌ Errore: ${error.message}`);
            }

            // Pausa tra i test
            if (i < testPrompts.length - 1) {
                console.log('   ⏳ Pausa di 2 secondi...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // Cleanup
        await db.models.Chat.destroy({ where: { id: testChat.id } });
        if (!testUser) {
            await db.models.Wallet.destroy({ where: { id_user: user.id } });
            await db.models.User.destroy({ where: { id: user.id } });
        }

        console.log('\n🎉 Tutti i test di generazione video completati!');
        
    } catch (error) {
        console.error('❌ Errore durante i test:', error);
    } finally {
        process.exit(0);
    }
}

testVideoGeneration(); 