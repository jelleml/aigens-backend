/**
 * Python Addon API Client
 * 
 * This module handles communication with the Python addon API endpoints for model statistics updates.
 */

// Import dependencies
const pythonAddonService = require('../../services/python-addon.service');

/**
 * Refresh model statistics in the models_stats_aa table
 * @returns {Promise<Object>} API response
 */
async function refreshModelStats() {
  try {
    console.log('Calling Python addon API to refresh model statistics...');
    const response = await pythonAddonService.makeAuthenticatedRequest('/db_manager/models/stats/aa/refresh');
    
    if (response.status !== 'success') {
      throw new Error(`Failed to refresh model statistics: ${response.message || 'Unknown error'}`);
    }
    
    console.log('Model statistics refresh successful');
    return response;
  } catch (error) {
    console.error('Error refreshing model statistics:', error.message);
    throw new Error(`Error refreshing model statistics: ${error.message}`);
  }
}

/**
 * Refresh model relationships in the models_models_stats_aa table
 * @returns {Promise<Object>} API response
 */
async function refreshModelRelationships() {
  try {
    console.log('Calling Python addon API to refresh model relationships...');
    const response = await pythonAddonService.makeAuthenticatedRequest('/db_manager/models/refresh_relations_aa');
    
    if (response.status !== 'success') {
      throw new Error(`Failed to refresh model relationships: ${response.message || 'Unknown error'}`);
    }
    
    console.log('Model relationships refresh successful');
    return response;
  } catch (error) {
    console.error('Error refreshing model relationships:', error.message);
    throw new Error(`Error refreshing model relationships: ${error.message}`);
  }
}

/**
 * Update price scores from the artificial analysis data
 * @returns {Promise<Object>} API response
 */
async function updatePriceScores() {
  try {
    console.log('Calling Python addon API to update price scores...');
    const response = await pythonAddonService.makeAuthenticatedRequest('/db_manager/models/update_price_score_from_aa');
    
    if (response.status !== 'success') {
      throw new Error(`Failed to update price scores: ${response.message || 'Unknown error'}`);
    }
    
    console.log('Price scores update successful');
    return response;
  } catch (error) {
    console.error('Error updating price scores:', error.message);
    throw new Error(`Error updating price scores: ${error.message}`);
  }
}

module.exports = {
  refreshModelStats,
  refreshModelRelationships,
  updatePriceScores
};