const db = require('../../database');
const googleVeoService = require('../../services/google-veo.service');

async function testEventStreams() {
    try {
        console.log('📡 Test event stream Google Veo...');
        
        await db.initialize();
        console.log('✅ Database inizializzato');

        // Trova un utente di test
        const testUser = await db.models.User.findOne({
            where: { email: 'test@example.com' }
        });

        if (!testUser) {
            console.log('⚠️  Utente di test non trovato, creo un utente temporaneo...');
            const newUser = await db.models.User.create({
                email: 'test-stream@example.com',
                password: 'testpassword123',
                name: 'Test Stream User',
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
            where: { email: 'test-stream@example.com' }
        });

        // Crea una chat di test
        const testChat = await db.models.Chat.create({
            user_id: user.id,
            title: 'Test Event Stream Chat',
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

        // Test event stream
        console.log('\n📡 Test event stream...');
        
        const events = [];
        let eventCount = 0;
        
        const onStream = (event) => {
            eventCount++;
            events.push(event);
            
            console.log(`   📡 Evento ${eventCount}: ${event.type}`);
            
            switch (event.type) {
                case 'video-generation-started':
                    console.log(`      🚀 Messaggio ID: ${event.data.messageId}`);
                    console.log(`      🤖 Modello: ${event.data.modelId}`);
                    console.log(`      📝 Prompt: ${event.data.prompt}`);
                    break;
                    
                case 'video-generation-progress':
                    console.log(`      📊 Progresso: ${event.data.progress}%`);
                    break;
                    
                case 'video-generation-completed':
                    console.log(`      ✅ Messaggio ID: ${event.data.messageId}`);
                    console.log(`      🔗 Video URL: ${event.data.videoUrl}`);
                    console.log(`      📎 Attachment ID: ${event.data.attachmentId}`);
                    break;
                    
                case 'video-generation-error':
                    console.log(`      ❌ Errore: ${event.data.error}`);
                    break;
                    
                default:
                    console.log(`      📋 Dati: ${JSON.stringify(event.data)}`);
            }
        };

        try {
            const result = await googleVeoService.processGoogleVeoRequest({
                prompt: 'Un gatto che gioca con una palla colorata',
                modelId: model.id,
                userId: user.id,
                chatId: testChat.id,
                onStream: onStream
            });

            console.log('\n📊 Riepilogo eventi:');
            console.log(`   📡 Totale eventi: ${eventCount}`);
            console.log(`   🚀 Eventi started: ${events.filter(e => e.type === 'video-generation-started').length}`);
            console.log(`   📊 Eventi progress: ${events.filter(e => e.type === 'video-generation-progress').length}`);
            console.log(`   ✅ Eventi completed: ${events.filter(e => e.type === 'video-generation-completed').length}`);
            console.log(`   ❌ Eventi error: ${events.filter(e => e.type === 'video-generation-error').length}`);

            console.log('\n✅ Test event stream completato con successo!');
            console.log(`   📁 File generato: ${result.fileName}`);
            console.log(`   🔗 URL video: ${result.videoUrl}`);

        } catch (error) {
            console.log(`   ❌ Errore durante il test: ${error.message}`);
        }

        // Test event stream con errore
        console.log('\n📡 Test event stream con errore...');
        
        const errorEvents = [];
        let errorEventCount = 0;
        
        const onErrorStream = (event) => {
            errorEventCount++;
            errorEvents.push(event);
            
            console.log(`   📡 Evento errore ${errorEventCount}: ${event.type}`);
            
            if (event.type === 'video-generation-error') {
                console.log(`      ❌ Errore: ${event.data.error}`);
            }
        };

        try {
            // Simula un errore
            const originalRandom = Math.random;
            Math.random = () => 0.99; // 99% di probabilità di errore
            
            await googleVeoService.processGoogleVeoRequest({
                prompt: 'Test error',
                modelId: model.id,
                userId: user.id,
                chatId: testChat.id,
                onStream: onErrorStream
            });
            
            console.log('   ❌ Errore: dovrebbe fallire');
        } catch (error) {
            console.log(`   ✅ Errore catturato: ${error.message}`);
        }

        // Ripristina Math.random
        Math.random = originalRandom;

        console.log('\n📊 Riepilogo eventi errore:');
        console.log(`   📡 Totale eventi errore: ${errorEventCount}`);
        console.log(`   ❌ Eventi error: ${errorEvents.filter(e => e.type === 'video-generation-error').length}`);

        // Cleanup
        await db.models.Chat.destroy({ where: { id: testChat.id } });
        if (!testUser) {
            await db.models.Wallet.destroy({ where: { id_user: user.id } });
            await db.models.User.destroy({ where: { id: user.id } });
        }

        console.log('\n🎉 Tutti i test event stream completati!');
        
    } catch (error) {
        console.error('❌ Errore durante i test:', error);
    } finally {
        process.exit(0);
    }
}

testEventStreams(); 