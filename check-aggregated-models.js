#!/usr/bin/env node

const db = require('./database');

async function checkAggregatedModels() {
  try {
    await db.initialize();
    
    const count = await db.sequelize.query('SELECT COUNT(*) as count FROM aggregated_models', {
      type: db.sequelize.QueryTypes.SELECT
    });
    
    console.log('Total aggregated_models records:', count[0].count);
    
    if (count[0].count > 0) {
      const records = await db.sequelize.query(`
        SELECT am.*, p1.name as aggregator_name, p2.name as source_name, m.model_slug 
        FROM aggregated_models am 
        JOIN providers p1 ON am.id_aggregator_provider = p1.id 
        JOIN providers p2 ON am.id_source_provider = p2.id 
        JOIN models m ON am.id_model = m.id 
        LIMIT 10
      `, {
        type: db.sequelize.QueryTypes.SELECT
      });
      
      console.log('\nFirst 10 records:');
      records.forEach((record, i) => {
        console.log(`${i+1}. Model: ${record.model_slug}`);
        console.log(`   Aggregator: ${record.aggregator_name}`);
        console.log(`   Source: ${record.source_name}`);
        console.log(`   Source Model ID: ${record.source_model_id}`);
        console.log('');
      });
    }
    
    await db.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkAggregatedModels();