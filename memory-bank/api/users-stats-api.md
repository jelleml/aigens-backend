# Users Statistics API Documentation

**Last Updated:** 2025-01-09  
**Version:** 1.0.0

## Overview

The Users Statistics API provides access to user analytics data for dashboard visualization. All endpoints retrieve data from the `user_model_usage_stats` table and support date filtering for flexible data analysis.

## Base URL

```
/api/v1/users/stats
```

## Authentication

All endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## Common Parameters

All endpoints support the following query parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | Yes | UUID of the user |
| `date_from` | string | No | Start date filter (YYYY-MM-DD format) |
| `date_to` | string | No | End date filter (YYYY-MM-DD format) |

## Common Response Format

All endpoints return data in the following format:

```json
{
  "success": boolean,
  "data": [
    {
      "id": integer,
      "id_user": string,
      "type": string,
      "label": string,
      "value": number,
      "aggregation_level": string,
      "calculated_at": string,
      "created_at": string,
      "updated_at": string
    }
  ]
}
```

## Error Response Format

```json
{
  "success": false,
  "error": string
}
```

## Endpoints

### 1. Usage Statistics

**Endpoint:** `GET /api/v1/users/stats/usage`

**Purpose:** Retrieves usage statistics for dashboard trend line visualization showing credits usage over time.

**Database Query:** Filters records with `type = 'trendline_usage_credits'`

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/v1/users/stats/usage?user_id=123e4567-e89b-12d3-a456-426614174000&date_from=2024-01-01&date_to=2024-01-31" \
  -H "Authorization: Bearer your_jwt_token"
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "id_user": "123e4567-e89b-12d3-a456-426614174000",
      "type": "trendline_usage_credits",
      "label": "Daily Credits Usage",
      "value": 150.5,
      "aggregation_level": "day",
      "calculated_at": "2024-01-15T10:00:00.000Z",
      "created_at": "2024-01-15T10:00:00.000Z",
      "updated_at": "2024-01-15T10:00:00.000Z"
    },
    {
      "id": 2,
      "id_user": "123e4567-e89b-12d3-a456-426614174000",
      "type": "trendline_usage_credits",
      "label": "Daily Credits Usage",
      "value": 200.0,
      "aggregation_level": "day",
      "calculated_at": "2024-01-16T10:00:00.000Z",
      "created_at": "2024-01-16T10:00:00.000Z",
      "updated_at": "2024-01-16T10:00:00.000Z"
    }
  ]
}
```

### 2. Favourite Models Statistics

**Endpoint:** `GET /api/v1/users/stats/favourites/models`

**Purpose:** Retrieves favourite models statistics for pie chart visualization.

**Database Query:** Filters records with `type = 'pie_fav_models_count'`

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/v1/users/stats/favourites/models?user_id=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer your_jwt_token"
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 3,
      "id_user": "123e4567-e89b-12d3-a456-426614174000",
      "type": "pie_fav_models_count",
      "label": "Claude 3.5 Sonnet",
      "value": 45,
      "aggregation_level": "last30days",
      "calculated_at": "2024-01-15T10:00:00.000Z",
      "created_at": "2024-01-15T10:00:00.000Z",
      "updated_at": "2024-01-15T10:00:00.000Z"
    },
    {
      "id": 4,
      "id_user": "123e4567-e89b-12d3-a456-426614174000",
      "type": "pie_fav_models_count",
      "label": "GPT-4",
      "value": 30,
      "aggregation_level": "last30days",
      "calculated_at": "2024-01-15T10:00:00.000Z",
      "created_at": "2024-01-15T10:00:00.000Z",
      "updated_at": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

### 3. Favourite Categories Statistics

**Endpoint:** `GET /api/v1/users/stats/favourites/categories`

**Purpose:** Retrieves favourite categories statistics for pie chart visualization.

**Database Query:** Filters records with `type = 'pie_categories_count'`

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/v1/users/stats/favourites/categories?user_id=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer your_jwt_token"
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "id_user": "123e4567-e89b-12d3-a456-426614174000",
      "type": "pie_categories_count",
      "label": "Text Generation",
      "value": 60,
      "aggregation_level": "last30days",
      "calculated_at": "2024-01-15T10:00:00.000Z",
      "created_at": "2024-01-15T10:00:00.000Z",
      "updated_at": "2024-01-15T10:00:00.000Z"
    },
    {
      "id": 6,
      "id_user": "123e4567-e89b-12d3-a456-426614174000",
      "type": "pie_categories_count",
      "label": "Image Generation",
      "value": 25,
      "aggregation_level": "last30days",
      "calculated_at": "2024-01-15T10:00:00.000Z",
      "created_at": "2024-01-15T10:00:00.000Z",
      "updated_at": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

### 4. Total Savings Statistics

**Endpoint:** `GET /api/v1/users/stats/savings/total`

**Purpose:** Retrieves total savings statistics.

**Database Query:** Filters records with `type = 'savings_total'`

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/v1/users/stats/savings/total?user_id=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer your_jwt_token"
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 7,
      "id_user": "123e4567-e89b-12d3-a456-426614174000",
      "type": "savings_total",
      "label": "Total Savings",
      "value": 125.50,
      "aggregation_level": "last30days",
      "calculated_at": "2024-01-15T10:00:00.000Z",
      "created_at": "2024-01-15T10:00:00.000Z",
      "updated_at": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

### 5. Savings by Provider Statistics

**Endpoint:** `GET /api/v1/users/stats/savings/by_provider`

**Purpose:** Retrieves savings statistics grouped by provider.

**Database Query:** Filters records with `type = 'savings_total_model'`

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/v1/users/stats/savings/by_provider?user_id=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer your_jwt_token"
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 8,
      "id_user": "123e4567-e89b-12d3-a456-426614174000",
      "type": "savings_total_model",
      "label": "OpenAI",
      "value": 75.25,
      "aggregation_level": "last30days",
      "calculated_at": "2024-01-15T10:00:00.000Z",
      "created_at": "2024-01-15T10:00:00.000Z",
      "updated_at": "2024-01-15T10:00:00.000Z"
    },
    {
      "id": 9,
      "id_user": "123e4567-e89b-12d3-a456-426614174000",
      "type": "savings_total_model",
      "label": "Anthropic",
      "value": 50.25,
      "aggregation_level": "last30days",
      "calculated_at": "2024-01-15T10:00:00.000Z",
      "created_at": "2024-01-15T10:00:00.000Z",
      "updated_at": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

## Error Responses

### 400 Bad Request

**Missing user_id:**
```json
{
  "success": false,
  "error": "user_id parameter is required"
}
```

**Invalid date format:**
```json
{
  "success": false,
  "error": "date_from must be a valid date format"
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "Internal server error"
}
```

## Data Types and Aggregation Levels

### Supported Types
- `trendline_usage_credits` - Usage data for trend line charts
- `pie_fav_models_count` - Favourite models data for pie charts
- `pie_categories_count` - Favourite categories data for pie charts
- `savings_total` - Total savings data
- `savings_total_model` - Provider-specific savings data

### Aggregation Levels
- `day` - Daily aggregation
- `last7days` - Last 7 days
- `last14days` - Last 14 days
- `last30days` - Last 30 days
- `thisMonth` - Current month
- `last3month` - Last 3 months
- `year` - Yearly aggregation

## Date Filtering

Date filtering is applied to the `calculated_at` field:

- **date_from**: Filters records with `calculated_at >= date_from`
- **date_to**: Filters records with `calculated_at <= date_to`
- **Both**: Filters records with `calculated_at` between the two dates

Date format: `YYYY-MM-DD` (e.g., `2024-01-15`)

## Usage Examples

### Get usage statistics for last 30 days
```bash
curl -X GET "http://localhost:3000/api/v1/users/stats/usage?user_id=123&date_from=2024-01-01&date_to=2024-01-31" \
  -H "Authorization: Bearer your_token"
```

### Get current month's favourite models
```bash
curl -X GET "http://localhost:3000/api/v1/users/stats/favourites/models?user_id=123&date_from=2024-01-01" \
  -H "Authorization: Bearer your_token"
```

### Get all-time savings data
```bash
curl -X GET "http://localhost:3000/api/v1/users/stats/savings/total?user_id=123" \
  -H "Authorization: Bearer your_token"
```

## Database Schema Reference

The API queries the `user_model_usage_stats` table with the following structure:

```sql
CREATE TABLE user_model_usage_stats (
  id INT PRIMARY KEY AUTO_INCREMENT,
  id_user UUID NOT NULL,
  type VARCHAR(255) NOT NULL,
  label VARCHAR(255) NOT NULL,
  value FLOAT NOT NULL,
  aggregation_level VARCHAR(255) NOT NULL,
  calculated_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Performance Considerations

- All endpoints are indexed on `id_user`, `type`, and `calculated_at` for optimal query performance
- Results are ordered by `calculated_at ASC` for consistent chronological data
- Date filtering uses database indexes for efficient range queries
- Consider implementing pagination for large result sets in future versions

## Rate Limiting

All endpoints are subject to the application's global rate limiting policy. Current limits:
- 100 requests per minute per IP address
- 1000 requests per hour per authenticated user

## Changelog

### Version 1.0.0 (2025-01-09)
- Initial release
- Added 5 core statistics endpoints
- Implemented date filtering
- Added comprehensive validation
- Added authentication middleware
- Added error handling