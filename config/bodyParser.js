/**
 * Configurazione del body parser per Express
 * @module config/bodyParser
 */

const express = require('express');

/**
 * Configurazione per il parsing di JSON
 * @type {Object}
 */
const jsonOptions = {
  limit: '50mb'
};

/**
 * Configurazione per il parsing di URL encoded
 * @type {Object}
 */
const urlencodedOptions = {
  extended: true,
  limit: '50mb'
};

/**
 * Configura i middleware di body parsing per l'app Express
 * @param {Express} app - Istanza dell'applicazione Express
 */
const setupBodyParser = (app) => {
  app.use(express.json(jsonOptions));
  app.use(express.urlencoded(urlencodedOptions));
};

module.exports = {
  setupBodyParser,
  jsonOptions,
  urlencodedOptions
}; 