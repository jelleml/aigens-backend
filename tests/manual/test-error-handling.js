const db = require('../../database');
const googleVeoService = require('../../services/google-veo.service');

async function testErrorHandling() {
    try {
        console.log('🔍 Test gestione errori Google Veo...');
        
        await db.initialize();
        console.log('✅ Database inizializzato');

        // Test 1: API key non configurata
        console.log('\n📋 Test 1: API key non configurata');
        const originalApiKey = process.env.GOOGLE_GEMINI_KEY;
        process.env.GOOGLE_GEMINI_KEY = '';
        
        try {
            await googleVeoService.sendRequest('test', {}, 1, 1);
            console.log('   ❌ Errore: dovrebbe fallire senza API key');
        } catch (error) {
            console.log(`   ✅ Errore catturato: ${error.message}`);
        }
        
        process.env.GOOGLE_GEMINI_KEY = originalApiKey;

        // Test 2: API key troppo corta
        console.log('\n📋 Test 2: API key troppo corta');
        process.env.GOOGLE_GEMINI_KEY = 'short';
        
        try {
            await googleVeoService.sendRequest('test', {}, 1, 1);
            console.log('   ❌ Errore: dovrebbe fallire con API key corta');
        } catch (error) {
            console.log(`   ✅ Errore catturato: ${error.message}`);
        }
        
        process.env.GOOGLE_GEMINI_KEY = originalApiKey;

        // Test 3: Rate limit
        console.log('\n📋 Test 3: Rate limit');
        try {
            // Simula molte richieste rapide
            const promises = [];
            for (let i = 0; i < 15; i++) {
                promises.push(googleVeoService.sendRequest(`test ${i}`, {}, 1, 1));
            }
            
            await Promise.all(promises);
            console.log('   ❌ Errore: dovrebbe fallire per rate limit');
        } catch (error) {
            console.log(`   ✅ Rate limit catturato: ${error.message}`);
        }

        // Test 4: Modello non trovato
        console.log('\n📋 Test 4: Modello non trovato');
        try {
            await googleVeoService.processGoogleVeoRequest({
                prompt: 'test',
                modelId: 999999,
                userId: 1,
                chatId: 1
            });
            console.log('   ❌ Errore: dovrebbe fallire per modello non trovato');
        } catch (error) {
            console.log(`   ✅ Errore catturato: ${error.message}`);
        }

        // Test 5: Fondi insufficienti
        console.log('\n📋 Test 5: Fondi insufficienti');
        const testUser = await db.models.User.findOne({
            where: { email: 'test@example.com' }
        });

        if (testUser) {
            // Imposta saldo a 0
            await db.models.Wallet.update(
                { balance: 0.0 },
                { where: { id_user: testUser.id } }
            );

            const model = await db.models.Model.findOne({
                where: { 
                    id_provider: await db.models.Provider.findOne({ where: { name: 'google-veo' } }).then(p => p.id)
                }
            });

            if (model) {
                try {
                    await googleVeoService.processGoogleVeoRequest({
                        prompt: 'test',
                        modelId: model.id,
                        userId: testUser.id,
                        chatId: 1
                    });
                    console.log('   ❌ Errore: dovrebbe fallire per fondi insufficienti');
                } catch (error) {
                    console.log(`   ✅ Errore catturato: ${error.message}`);
                }

                // Ripristina saldo
                await db.models.Wallet.update(
                    { balance: 100.0 },
                    { where: { id_user: testUser.id } }
                );
            }
        }

        // Test 6: Errori di storage
        console.log('\n📋 Test 6: Errori di storage');
        try {
            // Simula errore di storage
            const originalUploadFile = require('../../services/google-cloud-storage.service').prototype.uploadFile;
            require('../../services/google-cloud-storage.service').prototype.uploadFile = async () => {
                throw new Error('ENOSPC: no space left on device');
            };

            await googleVeoService.downloadAndSaveVideo('test', 'test.mp4', 1, 1);
            console.log('   ❌ Errore: dovrebbe fallire per errore di storage');
        } catch (error) {
            console.log(`   ✅ Errore di storage catturato: ${error.message}`);
        }

        // Test 7: Errori di rete
        console.log('\n📋 Test 7: Errori di rete');
        try {
            // Simula errore di rete
            const originalGenAI = require('@google/genai').GoogleGenerativeAI;
            require('@google/genai').GoogleGenerativeAI = class {
                constructor() {
                    throw new Error('ENOTFOUND: getaddrinfo ENOTFOUND api.google.com');
                }
            };

            await googleVeoService.sendRequest('test', {}, 1, 1);
            console.log('   ❌ Errore: dovrebbe fallire per errore di rete');
        } catch (error) {
            console.log(`   ✅ Errore di rete catturato: ${error.message}`);
        }

        // Test 8: Errori di generazione video
        console.log('\n📋 Test 8: Errori di generazione video');
        try {
            // Simula errore di contenuto inappropriato
            const originalRandom = Math.random;
            Math.random = () => 0.06; // 6% di probabilità di errore

            await googleVeoService.sendRequest('test', {}, 1, 1);
            console.log('   ❌ Errore: dovrebbe fallire per contenuto inappropriato');
        } catch (error) {
            console.log(`   ✅ Errore di generazione catturato: ${error.message}`);
        }

        console.log('\n🎉 Tutti i test di gestione errori completati!');
        
    } catch (error) {
        console.error('❌ Errore durante i test:', error);
    } finally {
        process.exit(0);
    }
}

testErrorHandling(); 