const db = require('../../database');
const googleVeoService = require('../../services/google-veo.service');

async function testWalletIntegration() {
    try {
        console.log('💰 Test integrazione wallet Google Veo...');
        
        await db.initialize();
        console.log('✅ Database inizializzato');

        // Crea un utente di test
        const testUser = await db.models.User.create({
            email: 'test-wallet@example.com',
            password: 'testpassword123',
            name: 'Test Wallet User',
            is_active: true
        });

        // Crea wallet con saldo iniziale
        const initialBalance = 100.0;
        const wallet = await db.models.Wallet.create({
            id_user: testUser.id,
            balance: initialBalance
        });

        console.log(`✅ Utente creato: ${testUser.email}`);
        console.log(`💰 Saldo iniziale: ${initialBalance} EUR`);

        // Crea una chat di test
        const testChat = await db.models.Chat.create({
            user_id: testUser.id,
            title: 'Test Wallet Integration Chat',
            is_active: true
        });

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

        // Test 1: Verifica fondi sufficienti
        console.log('\n📋 Test 1: Verifica fondi sufficienti');
        const hasFunds = await googleVeoService.checkUserFunds(testUser.id, 0.01);
        console.log(`   💰 Fondi sufficienti: ${hasFunds}`);
        console.log(`   💰 Saldo attuale: ${wallet.balance} EUR`);

        // Test 2: Generazione video con fondi sufficienti
        console.log('\n📋 Test 2: Generazione video con fondi sufficienti');
        try {
            const result = await googleVeoService.processGoogleVeoRequest({
                prompt: 'Un gatto che gioca con una palla',
                modelId: model.id,
                userId: testUser.id,
                chatId: testChat.id
            });

            console.log(`   ✅ Video generato con successo!`);
            console.log(`   📁 File: ${result.fileName}`);
            console.log(`   💰 Costo: ${result.cost} EUR`);

            // Verifica saldo aggiornato
            const updatedWallet = await db.models.Wallet.findOne({
                where: { id_user: testUser.id }
            });
            console.log(`   💰 Nuovo saldo: ${updatedWallet.balance} EUR`);
            console.log(`   💰 Differenza: ${initialBalance - updatedWallet.balance} EUR`);

        } catch (error) {
            console.log(`   ❌ Errore: ${error.message}`);
        }

        // Test 3: Verifica transazioni
        console.log('\n📋 Test 3: Verifica transazioni');
        const transactions = await db.models.Transaction.findAll({
            where: { 
                id_wallet: wallet.id,
                type: 'video_generation'
            },
            order: [['createdAt', 'DESC']]
        });

        console.log(`   📊 Transazioni trovate: ${transactions.length}`);
        transactions.forEach((tx, index) => {
            console.log(`   📊 Transazione ${index + 1}:`);
            console.log(`      💰 Importo: ${tx.amount} EUR`);
            console.log(`      📝 Descrizione: ${tx.description}`);
            console.log(`      📅 Data: ${tx.createdAt}`);
            console.log(`      📊 Status: ${tx.status}`);
        });

        // Test 4: Verifica costi dei messaggi
        console.log('\n📋 Test 4: Verifica costi dei messaggi');
        const messageCosts = await db.models.MessageCost.findAll({
            where: { 
                user_id: testUser.id,
                chat_id: testChat.id
            },
            order: [['createdAt', 'DESC']]
        });

        console.log(`   📊 Costi messaggi trovati: ${messageCosts.length}`);
        messageCosts.forEach((cost, index) => {
            console.log(`   📊 Costo ${index + 1}:`);
            console.log(`      💰 Costo totale: ${cost.total_cost} EUR`);
            console.log(`      💰 Costo input: ${cost.input_cost} EUR`);
            console.log(`      💰 Costo output: ${cost.output_cost} EUR`);
            console.log(`      🤖 Modello: ${cost.model_id}`);
        });

        // Test 5: Test con fondi insufficienti
        console.log('\n📋 Test 5: Test con fondi insufficienti');
        
        // Imposta saldo a 0
        await db.models.Wallet.update(
            { balance: 0.0 },
            { where: { id_user: testUser.id } }
        );

        console.log(`   💰 Saldo impostato a: 0.0 EUR`);

        try {
            await googleVeoService.processGoogleVeoRequest({
                prompt: 'Un gatto che gioca con una palla',
                modelId: model.id,
                userId: testUser.id,
                chatId: testChat.id
            });
            console.log(`   ❌ Errore: dovrebbe fallire per fondi insufficienti`);
        } catch (error) {
            console.log(`   ✅ Errore catturato: ${error.message}`);
        }

        // Test 6: Test con saldo borderline
        console.log('\n📋 Test 6: Test con saldo borderline');
        
        // Imposta saldo a 0.005 (quasi sufficiente)
        await db.models.Wallet.update(
            { balance: 0.005 },
            { where: { id_user: testUser.id } }
        );

        console.log(`   💰 Saldo impostato a: 0.005 EUR`);

        try {
            await googleVeoService.processGoogleVeoRequest({
                prompt: 'Un gatto che gioca con una palla',
                modelId: model.id,
                userId: testUser.id,
                chatId: testChat.id
            });
            console.log(`   ❌ Errore: dovrebbe fallire per fondi insufficienti`);
        } catch (error) {
            console.log(`   ✅ Errore catturato: ${error.message}`);
        }

        // Test 7: Ripristina saldo e test finale
        console.log('\n📋 Test 7: Test finale con saldo ripristinato');
        
        await db.models.Wallet.update(
            { balance: 50.0 },
            { where: { id_user: testUser.id } }
        );

        console.log(`   💰 Saldo ripristinato a: 50.0 EUR`);

        try {
            const result = await googleVeoService.processGoogleVeoRequest({
                prompt: 'Un paesaggio di montagna al tramonto',
                modelId: model.id,
                userId: testUser.id,
                chatId: testChat.id
            });

            console.log(`   ✅ Video generato con successo!`);
            console.log(`   📁 File: ${result.fileName}`);
            console.log(`   💰 Costo: ${result.cost} EUR`);

            // Verifica saldo finale
            const finalWallet = await db.models.Wallet.findOne({
                where: { id_user: testUser.id }
            });
            console.log(`   💰 Saldo finale: ${finalWallet.balance} EUR`);

        } catch (error) {
            console.log(`   ❌ Errore: ${error.message}`);
        }

        // Cleanup
        await db.models.Chat.destroy({ where: { id: testChat.id } });
        await db.models.Wallet.destroy({ where: { id_user: testUser.id } });
        await db.models.User.destroy({ where: { id: testUser.id } });

        console.log('\n🎉 Tutti i test di integrazione wallet completati!');
        
    } catch (error) {
        console.error('❌ Errore durante i test:', error);
    } finally {
        process.exit(0);
    }
}

testWalletIntegration(); 