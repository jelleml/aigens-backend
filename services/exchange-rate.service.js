// services/exchange-rate.service.js
// Servizio per recuperare i tassi di cambio dalla BCE (USD/EUR) e da CoinGecko (BTC/EUR)

const fetch = require('node-fetch');

let cache = {
    usdEur: null,
    btcEur: null,
    lastFetch: 0
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minuti

/**
 * Recupera il tasso di cambio USD/EUR dalla BCE
 * @returns {Promise<number>} tasso USD/EUR
 */
async function getUsdEurRate() {
    const now = Date.now();
    if (cache.usdEur && now - cache.lastFetch < CACHE_TTL) {
        return cache.usdEur;
    }
    // Feed BCE XML: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
    const res = await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml');
    const xml = await res.text();
    const match = xml.match(/<Cube currency='USD' rate='([0-9.]+)'\/>/);
    if (!match) throw new Error('Tasso USD/EUR non trovato nella risposta BCE');
    const eurUsd = parseFloat(match[1]); // 1 EUR = eurUsd USD
    const usdEur = 1 / eurUsd; // 1 USD = usdEur EUR
    cache.usdEur = usdEur;
    cache.lastFetch = now;
    return usdEur;
}

/**
 * Recupera il tasso di cambio BTC/EUR da CoinGecko
 * @returns {Promise<number>} tasso BTC/EUR
 */
async function getBtcEurRate() {
    const now = Date.now();
    if (cache.btcEur && now - cache.lastFetch < CACHE_TTL) {
        return cache.btcEur;
    }
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur');
    const data = await res.json();
    if (!data.bitcoin || !data.bitcoin.eur) throw new Error('Tasso BTC/EUR non trovato');
    cache.btcEur = data.bitcoin.eur;
    cache.lastFetch = now;
    return cache.btcEur;
}

module.exports = {
    getUsdEurRate,
    getBtcEurRate
}; 