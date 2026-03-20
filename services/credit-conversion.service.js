// services/credit-conversion.service.js
// Servizio utility per la conversione di valuta in crediti piattaforma

const EUR_TO_CREDIT = 1000;

/**
 * Converte un importo in EUR in crediti
 * @param {number} amountEUR
 * @returns {number} crediti
 */
function eurToCredits(amountEUR) {
    return amountEUR * EUR_TO_CREDIT;
}

/**
 * Converte un importo in USD in crediti
 * @param {number} amountUSD
 * @param {number} usdToEurRate - tasso di cambio USD/EUR
 * @returns {number} crediti
 */
function usdToCredits(amountUSD, usdToEurRate) {
    const amountEUR = amountUSD * usdToEurRate;
    return eurToCredits(amountEUR);
}

/**
 * Converte un importo in BTC in crediti
 * @param {number} amountBTC
 * @param {number} btcToEurRate - tasso di cambio BTC/EUR
 * @returns {number} crediti
 */
function btcToCredits(amountBTC, btcToEurRate) {
    const amountEUR = amountBTC * btcToEurRate;
    return eurToCredits(amountEUR);
}

/**
 * Converte crediti in EUR
 * @param {number} credits
 * @returns {number} importo in EUR
 */
function creditsToEur(credits) {
    return credits / EUR_TO_CREDIT;
}

module.exports = {
    eurToCredits,
    usdToCredits,
    btcToCredits,
    creditsToEur,
    EUR_TO_CREDIT
}; 