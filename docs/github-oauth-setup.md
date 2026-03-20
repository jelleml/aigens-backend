# GitHub OAuth Setup Instructions

## Credentials

### Development Environment

-   Display name: AigensAppDev
-   Client ID: Ov23liVEiHK6RtsL0U6A
-   Client Secret: 8b840cd48535a82fa73284738f284f3d19f5da72

### Production Environment

-   Display name: AigensAppProd
-   Client ID: Ov23lie0BBf7sEZA9Xzh
-   Client Secret: d6762eece6a7bc673bc7d7b97839d418ae1f66b

## Setup Instructions

1. Add the following environment variables to your `.env` file:

```
# GitHub OAuth Configuration - Development
GITHUB_CLIENT_ID_DEV=Ov23liVEiHK6RtsL0U6A
GITHUB_CLIENT_SECRET_DEV=8b840cd48535a82fa73284738f284f3d19f5da72
GITHUB_CALLBACK_URL=/api/v1/auth/github/callback
```

2. For production environment, use these values instead:

```
# GitHub OAuth Configuration - Production
GITHUB_CLIENT_ID_PROD=Ov23lie0BBf7sEZA9Xzh
GITHUB_CLIENT_SECRET_PROD=d6762eece6a7bc673bc7d7b97839d418ae1f66b
GITHUB_CALLBACK_URL=/api/v1/auth/github/callback
```

3. The OAuth configuration is already set up in `config/config.js` and passport configuration is in `config/passport.js`.

4. The authentication routes are already set up in `api/v1/auth.js`.

## Callback URL Configuration

Make sure to add the following callback URL in your GitHub OAuth app settings:

-   For development: `http://localhost:5555/api/v1/auth/github/callback`
-   For production: `https://your-production-domain.com/api/v1/auth/github/callback`

## Testing

You can verify your GitHub OAuth configuration by running:

```
node setup-github-oauth.js
```

This will output your current configuration and the full callback URL that should be configured in your GitHub OAuth app settings.
