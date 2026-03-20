/**
 * Test per verificare l'accesso a Op dal database
 */

async function testDatabaseOp() {
  console.log('🔍 Test accesso Op dal database...');
  
  try {
    // 1. Test database
    const db = require('../../database');
    console.log('✅ Database caricato');
    
    // 2. Test Op dal database
    try {
      const { Op } = db.sequelize;
      console.log('✅ Op disponibile dal database');
      console.log('📝 Op:', typeof Op);
    } catch (opError) {
      console.log('❌ Op non disponibile dal database:', opError.message);
    }
    
    // 3. Test import diretto
    try {
      const { Op: OpDirect } = require('sequelize');
      console.log('✅ Op disponibile da import diretto');
    } catch (directError) {
      console.log('❌ Op non disponibile da import diretto:', directError.message);
    }
    
    // 4. Test alternativa
    try {
      const Sequelize = require('sequelize');
      const Op = Sequelize.Op;
      console.log('✅ Op disponibile tramite Sequelize.Op');
    } catch (altError) {
      console.log('❌ Op non disponibile tramite Sequelize.Op:', altError.message);
    }
    
  } catch (error) {
    console.error('❌ Errore nel test database Op:', error);
  }
}

testDatabaseOp();
