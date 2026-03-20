/**
 * Script di test per l'integrazione con Vbout
 */

// Carica le variabili d'ambiente
require('dotenv').config();

const vboutClient = require('../services/vbout-email-client');
const config = require('../config/config');
const { getLogger } = require('../services/logging');
const logger = getLogger('test-vbout', 'script');

/**
 * Testa il recupero delle liste
 */
async function testGetLists() {
    try {
        logger.info('Recupero delle liste disponibili...');
        logger.info('API Key:', config.vbout.apiKey);

        const result = await vboutClient.getMailingLists();

        logger.info('Risposta completa:', JSON.stringify(result, null, 2));

        if (result && result.status === 'success') {
            logger.info('Liste recuperate con successo:');
            if (result.data && result.data.items) {
                console.table(result.data.items.map(list => ({
                    id: list.id,
                    name: list.name,
                    contacts: list.total_contacts
                })));
            } else {
                logger.warn('Dati ricevuti ma in formato inatteso:', result.data);
            }
        } else {
            logger.error('Errore nel recupero delle liste:', result?.error || 'Errore sconosciuto');
            logger.error('Dettagli completi:', result);
        }
    } catch (error) {
        logger.error('Errore durante il test di getMailingLists:');
        logger.error('Message:', error.message);
        if (error.response) {
            logger.error('Status:', error.response.status);
            logger.error('Data:', JSON.stringify(error.response.data, null, 2));
            logger.error('Headers:', JSON.stringify(error.response.headers, null, 2));
        }
        if (error.request) {
            logger.error('Request sent but no response received');
        }
    }
}

/**
 * Testa l'aggiunta di un contatto alla lista d'attesa
 * @param {string} email - Email da aggiungere alla lista
 */
async function testAddToWaitingList(email) {
    try {
        logger.info(`Aggiunta di ${email} alla lista d'attesa (ID: ${config.vbout.waitingListId})...`);
        logger.info('API Key:', config.vbout.apiKey);

        const contactData = {
            email,
            firstname: 'Test',
            lastname: 'User'
        };

        logger.info('Dati contatto:', contactData);

        const result = await vboutClient.addContactToWaitingList(contactData);

        logger.info('Risposta completa:', JSON.stringify(result, null, 2));

        if (result && result.status === 'success') {
            logger.info('Contatto aggiunto con successo alla lista d\'attesa');
            logger.info('Risultato:', result.data);
        } else {
            logger.error('Errore nell\'aggiunta del contatto:', result?.error || 'Errore sconosciuto');
            logger.error('Dettagli completi:', result);
        }
    } catch (error) {
        logger.error('Errore durante il test di addContactToWaitingList:');
        logger.error('Message:', error.message);
        if (error.response) {
            logger.error('Status:', error.response.status);
            logger.error('Data:', JSON.stringify(error.response.data, null, 2));
            logger.error('Headers:', JSON.stringify(error.response.headers, null, 2));
        }
        if (error.request) {
            logger.error('Request sent but no response received');
        }
    }
}

/**
 * Esegue tutti i test
 */
async function runTests() {
    // Testa il recupero delle liste
    await testGetLists();

    // Testa l'aggiunta di un contatto alla lista d'attesa
    const testEmail = `test-${Date.now()}@example.com`;
    await testAddToWaitingList(testEmail);
}

// Esegue i test se lo script è chiamato direttamente
if (require.main === module) {
    runTests()
        .then(() => {
            logger.info('Test completati');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Errore durante l\'esecuzione dei test:', error);
            process.exit(1);
        });
}

module.exports = {
    testGetLists,
    testAddToWaitingList,
    runTests
}; 