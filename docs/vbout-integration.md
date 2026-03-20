# Vbout Email Gateway Integration

This document provides information about the Vbout Email Gateway integration in the AIGens platform.

## Overview

The AIGens platform integrates with Vbout's Email Gateway to manage email marketing features, including:

-   Adding contacts to mailing lists
-   Managing waiting lists for product launches
-   Sending transactional emails

## Configuration

The Vbout integration is configured in `config/config.js` with the following settings:

```javascript
vbout: {
  apiKey: process.env.VBOUT_API_KEY || '3013166457266121535428555',
  waitingListId: process.env.VBOUT_WAITING_LIST_ID || '159023',
  waitingListName: process.env.VBOUT_WAITING_LIST_NAME || 'Aigens.io Waiting List'
}
```

These values can be overridden by setting the corresponding environment variables.

## API Endpoints

### Waitlist Management

The platform provides REST API endpoints to manage the waiting list:

#### Add to Waiting List

```
POST /api/v1/waitlist/subscribe
```

**Request Body:**

```json
{
	"email": "user@example.com",
	"firstname": "Mario",
	"lastname": "Rossi"
}
```

Only the `email` field is required. Additional custom fields can be included in the request body and will be passed to Vbout.

**Responses:**

-   `201 Created`: Email successfully added to the waiting list
-   `400 Bad Request`: Invalid email or missing required field
-   `409 Conflict`: Email already exists in the waiting list
-   `500 Internal Server Error`: Server error

#### List All Mailing Lists

```
GET /api/v1/waitlist/lists
```

**Response:**

```json
{
	"success": true,
	"data": [
		{
			"id": "159023",
			"name": "Aigens.io Waiting List",
			"total_contacts": 42
		}
	]
}
```

## Implementation Details

### Services

-   `services/vbout-email-client.js`: Client for interacting with the Vbout API

### Controllers

-   `controllers/waitlist.controller.js`: Controller for managing waiting list subscriptions

### Routes

-   `routes/waitlist.routes.js`: API routes for waitlist management

## Testing

A test script is provided to verify the Vbout integration:

```bash
node scripts/test-vbout.js
```

This script:

1. Retrieves all available mailing lists
2. Adds a test contact to the waiting list

## Troubleshooting

### Common Issues

1. **API Key Invalid**

    - Check that the Vbout API key is correctly set in the environment variables or config file

2. **List ID Not Found**

    - Verify that the waiting list ID exists in your Vbout account
    - Use the `GET /api/v1/waitlist/lists` endpoint to see all available lists

3. **Email Already Exists**
    - The API will return a 409 status code if the email is already in the list
    - The response body contains details about the error

### Logging

Errors related to the Vbout integration are logged to the console. For production use, consider implementing a more robust logging solution.

## References

-   [Vbout API Documentation](https://www.vbout.com/api-documentation/)
-   [Express.js Documentation](https://expressjs.com/)
