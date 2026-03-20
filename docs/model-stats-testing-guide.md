# Manual Testing and Verification Guide for Model Statistics Update Script

This guide outlines the steps to manually test and verify the model statistics update script after a complete model setup.

## Prerequisites

Before running the tests, ensure that:

1. The database is properly set up and accessible
2. The Python addon service is running and accessible
3. Environment variables are properly configured, especially:
   - Database connection variables
   - `API_PYTHON_ADDON_USERNAME` and `API_PYTHON_ADDON_PASSWORD` for Python addon authentication

## Testing Steps

### 1. Run the Model Setup Scripts

First, ensure that the model setup scripts have been run to populate the base model data:

```bash
# Initialize all models
npm run setup-models

# Initialize provider subscriptions
npm run init-providers

# Verify the setup
npm run verify-setup
```

### 2. Run the Model Statistics Update Script

Run the model statistics update script:

```bash
# Using the npm script
npm run update-model-stats-aa-and-relations

# Or directly
node scripts/update-model-stats-aa-and-relations.js
```

Observe the console output for:
- Successful API calls to the Python addon service
- Verification steps for each operation
- Summary of the operations at the end

### 3. Run the Verification Script

Run the verification script to check that the tables have been correctly updated:

```bash
node scripts/verify-model-stats.js
```

This script will:
1. Run the model statistics update script again
2. Verify that the `models_stats_aa` table has been populated
3. Verify that the `models_models_stats_aa` table has been populated
4. Verify that the `models_price_score` table has been updated with AA scores
5. Verify that the cost calculator service can use the updated data

### 4. Manual Database Verification

For a more thorough verification, you can directly query the database:

```sql
-- Check models_stats_aa table
SELECT COUNT(*) FROM models_stats_aa;
SELECT * FROM models_stats_aa LIMIT 10;

-- Check models_models_stats_aa table
SELECT COUNT(*) FROM models_models_stats_aa;
SELECT mmsa.*, m.name as model_name, msa.slug as stats_slug
FROM models_models_stats_aa mmsa
JOIN models m ON mmsa.id_model = m.id
JOIN models_stats_aa msa ON mmsa.id_model_aa = msa.id
LIMIT 10;

-- Check models_price_score table
SELECT COUNT(*) FROM models_price_score WHERE aa_score IS NOT NULL;
SELECT mps.*, m.name as model_name
FROM models_price_score mps
JOIN models m ON mps.id_model = m.id
WHERE mps.aa_score IS NOT NULL
LIMIT 10;
```

### 5. Test Error Handling

To test error handling, you can:

1. Stop the Python addon service and run the script to verify it handles API connection errors
2. Modify environment variables to use invalid credentials and verify authentication error handling
3. Disconnect from the database and verify database connection error handling

## Expected Results

After running the model statistics update script:

1. The `models_stats_aa` table should be populated with model statistics data:
   - Each record should have a valid `slug` field
   - Each record should have non-zero `price_1m_input_tokens` and `price_1m_output_tokens` values

2. The `models_models_stats_aa` table should contain relationships between models and their statistics:
   - Each record should link a valid model ID to a valid model stats ID
   - The `type` field should indicate the relationship type (e.g., 'exact_match', 'similar')

3. The `models_price_score` table should have updated AA scores:
   - Records should have non-null `aa_score` values
   - The `final_score` field should reflect the updated scores

4. The cost calculator service should be able to use the updated data:
   - It should retrieve pricing data from the `models_stats_aa` table via the relationships
   - It should calculate costs correctly based on the updated pricing data

## Troubleshooting

If the verification fails:

1. Check the Python addon service logs for API errors
2. Verify that the database connection is working properly
3. Check that the required tables exist and have the expected structure
4. Ensure that the Python addon service has the necessary permissions to access the database
5. Check the environment variables for proper configuration

## Reporting Issues

If you encounter issues during testing, document:

1. The specific step where the issue occurred
2. The exact error message or unexpected behavior
3. The state of the database tables before and after the operation
4. Any relevant logs from the script or Python addon service

This information will help in diagnosing and fixing the issue.