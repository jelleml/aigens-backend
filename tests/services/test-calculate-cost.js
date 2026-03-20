/**
 * Simple test to verify the calculateCost method is working correctly
 */

const db = require('../../database');

async function testCalculateCost() {
    try {
        console.log('Testing calculateCost method...');
        
        // Initialize database connection
        await db.sequelize.authenticate();
        console.log('Database connection established');
        
        // Import the calculateCost function directly
        const { calculateCost } = require('../../services/ideogram.service');
        
        // Find an Ideogram model in the database
        const { Model, Provider } = db.sequelize.models;
        
        const ideogramProvider = await Provider.findOne({
            where: { name: 'ideogram' }
        });
        
        if (!ideogramProvider) {
            console.log('No Ideogram provider found in database');
            return;
        }
        
        const ideogramModel = await Model.findOne({
            where: { 
                id_provider: ideogramProvider.id,
                is_active: true 
            }
        });
        
        if (!ideogramModel) {
            console.log('No active Ideogram models found in database');
            return;
        }
        
        console.log(`Found Ideogram model: ${ideogramModel.model_slug} (ID: ${ideogramModel.id})`);
        
        // Test different operations
        const operations = ['Generate', 'Remix', 'Edit', 'Reframe', 'Replace BG'];
        
        for (const operation of operations) {
            try {
                console.log(`\nTesting ${operation} operation:`);
                const cost = await calculateCost(ideogramModel.id, 1, operation);
                console.log(`- Base cost: ${cost.baseCost}`);
                console.log(`- Price per image: ${cost.pricePerImage}`);
                console.log(`- Total cost: ${cost.totalCost}`);
                console.log(`- Operation: ${cost.operation}`);
                console.log(`- Operation pricing:`, cost.operationPricing);
            } catch (error) {
                console.error(`Error testing ${operation}:`, error.message);
            }
        }
        
        // Test with invalid operation
        console.log('\nTesting invalid operation:');
        try {
            const cost = await calculateCost(ideogramModel.id, 1, 'InvalidOperation');
            console.log('Invalid operation result:', cost);
        } catch (error) {
            console.log('Expected error for invalid operation:', error.message);
        }
        
        console.log('\nCalculateCost test completed successfully!');
        
    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await db.sequelize.close();
    }
}

// Run the test
testCalculateCost();