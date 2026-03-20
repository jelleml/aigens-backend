# Design Document: Model Statistics Update Script

## Overview

This design document outlines the technical approach for creating a script that automates the process of updating model statistics after the initial model setup. The script will call a series of Python addon API endpoints in the correct sequence to populate and update various model statistics tables, with appropriate error handling, verification, and delays between calls.

## Architecture

The solution will consist of the following components:

1. **Main Script**: A Node.js script (`setup-aa-stats-and-price.js`) that orchestrates the entire process.
2. **Python Addon API Client**: A module that handles communication with the Python addon API endpoints.
3. **Verification Utilities**: Functions to verify the success of each operation.
4. **Logging Utilities**: Functions to log the progress and results of each operation.

The script will be designed to be run after the model setup process is complete, either as a standalone script or potentially integrated into the existing model setup process.

## Components and Interfaces

### 1. Main Script (`scripts/setup-aa-stats-and-price.js`)

This script will be the entry point for the model statistics update process. It will:

- Import the necessary dependencies
- Define the sequence of operations
- Handle command-line arguments (if any)
- Provide overall error handling and logging
- Execute the operations in sequence with appropriate delays

```javascript
// Pseudo-code structure
const pythonAddonApiClient = require('./api-addons-py/python-addon-api-client');
const { verifyOperation, wait } = require('./utils');

async function updateModelStats() {
  try {
    // Step 1: Refresh model statistics
    console.log('Step 1: Refreshing model statistics...');
    await pythonAddonApiClient.refreshModelStats();
    await verifyOperation('models_stats_aa');
    await wait(5000); // 5 second delay
    
    // Step 2: Refresh model relationships
    console.log('Step 2: Refreshing model relationships...');
    await pythonAddonApiClient.refreshModelRelationships();
    await verifyOperation('models_models_stats_aa');
    await wait(5000); // 5 second delay
    
    // Step 3: Update price scores
    console.log('Step 3: Updating price scores...');
    await pythonAddonApiClient.updatePriceScores();
    await verifyOperation('models_price_score');
    
    console.log('Model statistics update completed successfully.');
  } catch (error) {
    console.error('Error updating model statistics:', error.message);
    process.exit(1);
  }
}

updateModelStats();
```

### 2. Python Addon API Client (`scripts/api-addons-py/python-addon-api-client.js`)

This module will handle communication with the Python addon API endpoints. It will:

- Import the existing `pythonAddonService` from `services/python-addon.service.js`
- Define functions for each API endpoint
- Handle API-specific error handling and response parsing

```javascript
// Pseudo-code structure
const pythonAddonService = require('../../services/python-addon.service');

async function refreshModelStats() {
  try {
    const response = await pythonAddonService.makeAuthenticatedRequest('/db_manager/models/stats/aa/refresh');
    if (response.status !== 'success') {
      throw new Error(`Failed to refresh model statistics: ${response.message || 'Unknown error'}`);
    }
    return response;
  } catch (error) {
    throw new Error(`Error refreshing model statistics: ${error.message}`);
  }
}

async function refreshModelRelationships() {
  try {
    const response = await pythonAddonService.makeAuthenticatedRequest('/db_manager/models/refresh_relations_aa');
    if (response.status !== 'success') {
      throw new Error(`Failed to refresh model relationships: ${response.message || 'Unknown error'}`);
    }
    return response;
  } catch (error) {
    throw new Error(`Error refreshing model relationships: ${error.message}`);
  }
}

async function updatePriceScores() {
  try {
    const response = await pythonAddonService.makeAuthenticatedRequest('/db_manager/models/update_price_score_from_aa');
    if (response.status !== 'success') {
      throw new Error(`Failed to update price scores: ${response.message || 'Unknown error'}`);
    }
    return response;
  } catch (error) {
    throw new Error(`Error updating price scores: ${error.message}`);
  }
}

module.exports = {
  refreshModelStats,
  refreshModelRelationships,
  updatePriceScores
};
```

### 3. Utility Functions (`scripts/api-addons-py/utils.js`)

This module will provide utility functions for the script, including:

- Verification functions to check if operations were successful
- Wait function to introduce delays between operations
- Logging functions to log the progress and results of operations

```javascript
// Pseudo-code structure
const { sequelize } = require('../../database');

async function verifyOperation(tableName) {
  try {
    let query;
    let result;
    
    switch (tableName) {
      case 'models_stats_aa':
        query = 'SELECT COUNT(*) as count FROM models_stats_aa';
        result = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
        if (result[0].count === 0) {
          throw new Error('No records found in models_stats_aa table');
        }
        break;
      
      case 'models_models_stats_aa':
        query = 'SELECT COUNT(*) as count FROM models_models_stats_aa';
        result = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
        if (result[0].count === 0) {
          throw new Error('No records found in models_models_stats_aa table');
        }
        break;
      
      case 'models_price_score':
        query = 'SELECT COUNT(*) as count FROM models_price_score WHERE aa_score IS NOT NULL';
        result = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
        if (result[0].count === 0) {
          throw new Error('No records with aa_score found in models_price_score table');
        }
        break;
      
      default:
        throw new Error(`Unknown table: ${tableName}`);
    }
    
    console.log(`Verification successful for ${tableName}`);
    return true;
  } catch (error) {
    throw new Error(`Verification failed for ${tableName}: ${error.message}`);
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  verifyOperation,
  wait
};
```

## Data Models

The script will interact with the following existing database tables:

1. **models_stats_aa**: Contains artificial analysis statistics for models
2. **models_models_stats_aa**: Contains relationships between models and their statistics
3. **models_price_score**: Contains pricing scores for models, including scores derived from artificial analysis

No new data models will be created for this feature.

## Error Handling

The script will implement comprehensive error handling at multiple levels:

1. **API Call Level**: Each API call will have specific error handling to catch and report API-specific errors.
2. **Verification Level**: After each operation, verification will be performed to ensure the operation was successful.
3. **Script Level**: The main script will have overall error handling to catch and report any errors that occur during execution.

Error messages will be descriptive and include information about which operation failed and why.

## Testing Strategy

The testing strategy for this script will include:

1. **Unit Tests**:
   - Test each API call function in isolation with mocked responses
   - Test verification functions with different scenarios (success, failure, empty results)
   - Test utility functions (wait, logging)

2. **Integration Tests**:
   - Test the script with a test database to verify it correctly updates the tables
   - Test error handling with simulated failures

3. **Manual Testing**:
   - Run the script after a complete model setup to verify it works as expected
   - Verify the tables are correctly updated with the expected data

## Documentation Updates

The following documentation updates will be made:

1. **README-models-setup.md**:
   - Add a new section about the model statistics update script
   - Explain how to run the script after model setup
   - Explain what the script does and why it's necessary

2. **scripts/README.md**:
   - Remove legacy information that is no longer relevant
   - Add information about the new script and its purpose

## Implementation Plan

The implementation will follow these steps:

1. Create the directory structure for the new script and modules
2. Implement the Python addon API client module
3. Implement the utility functions module
4. Implement the main script
5. Update the documentation
6. Test the script with a test database
7. Integrate the script with the existing model setup process (if desired)

## Considerations and Trade-offs

1. **Performance**: The script includes delays between operations to ensure each operation has time to complete before the next one starts. The delay duration may need to be adjusted based on the size of the database and the complexity of the operations.

2. **Error Recovery**: The script currently exits on any error. A more sophisticated approach could include retry logic or partial completion, but this would add complexity.

3. **Integration**: The script is designed to be run as a standalone script after model setup. It could potentially be integrated into the existing model setup process, but this would require changes to the existing scripts.

4. **Verification**: The verification approach is simple and checks for the presence of records in the tables. A more sophisticated approach could include more detailed verification of the data, but this would add complexity.

5. **Logging**: The script uses console logging for simplicity. A more sophisticated approach could include structured logging to a file or a logging service.

## Future Enhancements

1. Add command-line arguments to control script behavior (e.g., skip verification, adjust delay duration)
2. Add more detailed verification of the data in the tables
3. Add retry logic for failed operations
4. Add support for running specific operations individually
5. Integrate the script with the existing model setup process