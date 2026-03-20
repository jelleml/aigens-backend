# GitHub OAuth Configuration Guide

## Credentials

We have two sets of credentials, one for development and one for production:

### Development Environment

-   **Client ID**: `Ov23liVEiHK6RtsL0U6A`
-   **Client Secret**: `8b840cd48535a82fa73284738f284f3d19f5da72`
-   **App Name**: AigensAppDev

### Production Environment

-   **Client ID**: `Ov23lie0BBf7sEZA9Xzh`
-   **Client Secret**: `d6762eece6a7bc673bc7d7b97839d418ae1f66b`
-   **App Name**: AigensAppProd

## How to Configure

1. **Add the following to your `.env` file:**

    ```
    # GitHub OAuth - Development
    GITHUB_CLIENT_ID_DEV=Ov23liVEiHK6RtsL0U6A
    GITHUB_CLIENT_SECRET_DEV=8b840cd48535a82fa73284738f284f3d19f5da72

    # GitHub OAuth - Production
    GITHUB_CLIENT_ID_PROD=Ov23lie0BBf7sEZA9Xzh
    GITHUB_CLIENT_SECRET_PROD=d6762eece6a7bc673bc7d7b97839d418ae1f66b

    # Common Configuration
    GITHUB_CALLBACK_URL=/api/v1/auth/github/callback
    ```

2. **Verify that the NODE_ENV is set correctly:**

    - For development: `NODE_ENV=development` (or not set, as development is the default)
    - For production: `NODE_ENV=production`

3. **The server will automatically choose the correct credentials based on the environment.**

## Implementation Details

The GitHub OAuth flow is implemented in these files:

-   `server.js` - Sets up the GitHub OAuth configuration based on environment
-   `config/passport.js` - Configures the GitHub authentication strategy
-   `api/v1/auth.js` - Implements the GitHub authentication routes

## Testing

For testing in development mode, you can use:

-   Regular OAuth flow: `/api/v1/auth/github`
-   Test login (bypasses OAuth): `/api/v1/auth/github-test-login`

The test endpoint is only available in development mode.

## Callback URLs

Make sure these callback URLs are configured in your GitHub OAuth apps:

-   Development: `http://localhost:5555/api/v1/auth/github/callback`
-   Production: `https://your-production-domain.com/api/v1/auth/github/callback`

## Verification

You can verify your configuration by running:

```
node setup-github-oauth.js
```
