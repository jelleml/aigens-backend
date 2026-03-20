const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const { getLogger } = require('../services/logging');
const logger = getLogger('database', 'database');

class DatabaseManager {
  constructor() {
    this.sequelize = new Sequelize(
      config.database.name,
      config.database.user,
      config.database.password,
      {
        host: config.database.host,
        dialect: config.database.dialect,
        logging: false,
        dialectOptions: {
          // MySQL2 connection options
        },
        pool: {
          max: 5,
          min: 0,
          acquire: 60000,
          idle: 10000
        },
        define: {
          underscored: true,
          timestamps: true,
          createdAt: 'created_at',
          updatedAt: 'updated_at'
        }
      }
    );
    this.models = {};
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      await this.sequelize.authenticate();
      logger.info('Database connection established successfully.');
      await this.loadModels();
      await this.setupAssociations();
      this.initialized = true;
    } catch (error) {
      logger.error('Unable to initialize database:', error);
      throw error;
    }
  }

  async loadModels() {
    const modelsDir = path.join(__dirname, 'models');
    const modelFiles = fs.readdirSync(modelsDir)
      .filter(file => file.indexOf('.') !== 0 && file !== 'index.js' && file.slice(-3) === '.js');
    for (const file of modelFiles) {
      const model = require(path.join(modelsDir, file))(this.sequelize);
      this.models[model.name] = model;
    }
  }

  async setupAssociations() {
    Object.keys(this.models).forEach(modelName => {
      if (this.models[modelName].associate) {
        this.models[modelName].associate(this.models);
      }
    });
  }

  async sync(options = {}) {
    // Se skipSync è true, salta completamente la sincronizzazione
    if (options.skipSync === true) {
      console.log('Sincronizzazione del database saltata (skipSync=true)');
      return true;
    }

    const defaultOptions = {
      alter: false,
      force: false,
      logging: false,
      hooks: false
    };
    const syncOptions = { ...defaultOptions, ...options };
    if (syncOptions.force) {
      throw new Error('Force option is disabled for safety. Use migrations instead.');
    }
    try {
      // Disable foreign key checks temporarily for MySQL
      if (this.sequelize.getDialect() === 'mysql') {
        await this.sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
      }

      // Define the order of model synchronization to handle dependencies
      const syncOrder = [
        'Provider',
        'ProviderSubscription',
        'Model',
        'AggregatorPricingTier',
        'AggregatedModel',
        'ModelsSubscription'
      ];

      // Sync models in dependency order
      for (const modelName of syncOrder) {
        if (this.sequelize.models[modelName]) {
          await this.sequelize.models[modelName].sync(syncOptions);
          logger.info(`Synchronized model: ${modelName}`);
        }
      }

      // Sync remaining models (excluding MessageCost and already synced models)
      const remainingModels = Object.keys(this.sequelize.models)
        .filter(name => name !== 'MessageCost' && !syncOrder.includes(name));

      for (const modelName of remainingModels) {
        await this.sequelize.models[modelName].sync(syncOptions);
        logger.info(`Synchronized model: ${modelName}`);
      }

      // Re-enable foreign key checks
      if (this.sequelize.getDialect() === 'mysql') {
        await this.sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');
      }

      logger.info('Database synchronized successfully.');
      return true;
    } catch (error) {
      logger.error('Error synchronizing database:', error);
      return false;
    }
  }

  async close() {
    await this.sequelize.close();
  }
}

const dbManager = new DatabaseManager();

module.exports = dbManager;
