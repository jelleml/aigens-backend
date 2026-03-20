# Portal (Nostr) Client Configuration

## Credentials

This document explains how to configure your application to talk to the Portal Rust “rest” daemon, and how to import the TS client—either from your local clone or from npm once published.

### Development Environment

- **Client ID**: `NOT YET`
- **Client Secret**: `NOT YET`
- **App Name**: NOT YET

### Production Environment

- **Client ID**: `NOT YET`
- **Client Secret**: `NOT YET`
- **App Name**: NOT YET

## How to Configure

1. **Add the following to your `.env` file:**

    ```
    # URL where the Portal REST/WebSocket daemon is listening
    PORTAL_SERVER_URL=http://localhost:3000

    # Authentication token for the Portal daemon
    # (must match the AUTH_TOKEN in lib/rest/.env)
    PORTAL_AUTH_TOKEN=<your_auth_token_here>

    # (Optional) One or more Nostr Wallet-Connect relay URLs
    NWC_URL=wss://relay1.example.com,wss://relay2.example.com

    # (Optional) Custom callback path (if needed)
    PORTAL_CALLBACK_URI=/api/v1/auth/portal/callback
    ```

2. **Verify that the NODE_ENV is set correctly:**

    - For development: `NODE_ENV=development` (or not set, as development is the default)
    - For production: `NODE_ENV=production`

## Usage

1. **Run the Portal daemon**

   - **Local:**

     ```bash
     cd aigens-backend/lib/rest
     cargo run --release
     ```

   - **Docker** (using `docker-compose.yml`):

     ```bash
     docker-compose up -d portal-rest
     ```

2. **Start your backend & frontend**

   ```bash
   # Backend
   cd aigens-backend
   npm install
   npm start

   # Frontend
   cd aigens-frontend
   npm install
   npm run dev

3. **Test the endpoints**

- **GET** `/api/v1/auth/portal`  

  ```json
  {
    "success": true,
    "data": {
      "url": "...",
      "stream_id": "..."
    }
    }```
  
- **POST** `/api/v1/auth/portal/callback` with payload:

  ```json
  {
    "main_key": "...",
    "subkeys": { /* ... */ }
    }```

- → Response:

  ```json
  {
    "success": true,
    "data": {
    "user": { /* ... */ },
    "authRes": { /* ... */ },
    "token": "..."
    }
    }```

4. **The server will automatically choose the correct credentials based on the environment.**

## Implementation Details

The Portal OAuth flow is implemented in these files:

- `server.js` - Sets up the Portal OAuth configuration based on environment
- `config/passport.js` - Configures the Portal authentication strategy
- `api/v1/auth.js` - Implements the Portal authentication routes
- `services/portal.service.js` - Wraps the PortalClient

## Testing

For testing in development mode, you can use:

- Regular OAuth flow: `/api/v1/auth/portal`
- Test login (bypasses OAuth): `/api/v1/auth/portal-test-login`

The test endpoint is only available in development mode.

## Callback URLs

Make sure these callback URLs are configured in your Portal OAuth apps:

- Development: `http://localhost:5555/api/v1/auth/portal/callback`
- Production: `https://your-production-domain.com/api/v1/auth/portal/callback`

## Verification

You can verify your configuration by running:

```
node setup-portal-oauth.js
```
