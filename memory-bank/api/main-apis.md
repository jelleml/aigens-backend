# Main APIs

## Authentication

### Login
- **Endpoint**: /api/v1/auth/login
- **Method**: POST
- **Description**: User authentication with credentials
- **Parameters**:
  - email: string
  - password: string
- **Response**: JWT token

### Passwordless Login
- **Endpoint**: /api/v1/auth/login/passwordless
- **Method**: POST
- **Description**: Passwordless authentication
- **Parameters**:
  - email: string
- **Response**: Authentication link

### OAuth Callbacks
- **Endpoint**: /api/v1/auth/{provider}/callback
- **Method**: GET
- **Provider**: alby, portal, google, microsoft, github
- **Description**: OAuth callback handling

## Waitlist

### Subscribe
- **Endpoint**: /api/v1/waitlist/subscribe
- **Method**: POST
- **Description**: Waitlist subscription
- **Parameters**:
  - email: string
- **Response**: Subscription status

## Security

### CSRF Protection
- Applied to all non-API routes
- Excluded for specific endpoints using JWT

### Rate Limiting
- Applied to all /api routes
- Configurable for specific endpoints

## User Statistics

### Usage Statistics
- **Endpoint**: /api/v1/users/stats/usage
- **Method**: GET
- **Description**: Retrieves usage statistics for dashboard trend line (credits usage over time)
- **Parameters**:
  - user_id: string (required) - User ID
  - date_from: string (optional) - Start date filter (YYYY-MM-DD)
  - date_to: string (optional) - End date filter (YYYY-MM-DD)
- **Response**: Array of usage statistics with type "trendline_usage_credits"

### Favourite Models Statistics
- **Endpoint**: /api/v1/users/stats/favourites/models
- **Method**: GET
- **Description**: Retrieves favourite models statistics for pie chart
- **Parameters**:
  - user_id: string (required) - User ID
  - date_from: string (optional) - Start date filter (YYYY-MM-DD)
  - date_to: string (optional) - End date filter (YYYY-MM-DD)
- **Response**: Array of model statistics with type "pie_fav_models_count"

### Favourite Categories Statistics
- **Endpoint**: /api/v1/users/stats/favourites/categories
- **Method**: GET
- **Description**: Retrieves favourite categories statistics for pie chart
- **Parameters**:
  - user_id: string (required) - User ID
  - date_from: string (optional) - Start date filter (YYYY-MM-DD)
  - date_to: string (optional) - End date filter (YYYY-MM-DD)
- **Response**: Array of category statistics with type "pie_categories_count"

### Total Savings Statistics
- **Endpoint**: /api/v1/users/stats/savings/total
- **Method**: GET
- **Description**: Retrieves total savings statistics
- **Parameters**:
  - user_id: string (required) - User ID
  - date_from: string (optional) - Start date filter (YYYY-MM-DD)
  - date_to: string (optional) - End date filter (YYYY-MM-DD)
- **Response**: Array of savings statistics with type "savings_total"

### Savings by Provider Statistics
- **Endpoint**: /api/v1/users/stats/savings/by_provider
- **Method**: GET
- **Description**: Retrieves savings statistics grouped by provider
- **Parameters**:
  - user_id: string (required) - User ID
  - date_from: string (optional) - Start date filter (YYYY-MM-DD)
  - date_to: string (optional) - End date filter (YYYY-MM-DD)
- **Response**: Array of provider savings statistics with type "savings_total_model"
