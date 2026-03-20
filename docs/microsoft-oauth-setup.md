# Microsoft OAuth Setup Instructions

## Credentials

### Development Environment

-   Display name: AigensAppDev
-   Application (client) ID: 58eef7aa-5940-4306-9820-946dd9d04164
-   Object ID: 2cde86a0-65ed-45c3-a75b-3471b2bd18d3
-   Directory (tenant) ID: 3a93c5ae-2ed2-44a5-b507-2ca64ffa861e

### Production Environment

-   Display name: appAigensProd
-   Application (client) ID: 3257f02e-16fb-413d-982e-acccb4ebed2c
-   Object ID: e95213ec-31a3-41e3-8c81-0fcea971dc18
-   Directory (tenant) ID: 3a93c5ae-2ed2-44a5-b507-2ca64ffa861e

## Setup Instructions

1. Add the following environment variables to your `.env` file:

```
# Microsoft OAuth Configuration - Development
MICROSOFT_CLIENT_ID=58eef7aa-5940-4306-9820-946dd9d04164
MICROSOFT_CLIENT_SECRET=your_dev_client_secret_here
MICROSOFT_CALLBACK_URL=/api/v1/auth/microsoft/callback
MICROSOFT_TENANT_ID=3a93c5ae-2ed2-44a5-b507-2ca64ffa861e
```

2. For production environment, use these values instead:

```
# Microsoft OAuth Configuration - Production
MICROSOFT_CLIENT_ID=3257f02e-16fb-413d-982e-acccb4ebed2c
MICROSOFT_CLIENT_SECRET=your_prod_client_secret_here
MICROSOFT_CALLBACK_URL=/api/v1/auth/microsoft/callback
MICROSOFT_TENANT_ID=3a93c5ae-2ed2-44a5-b507-2ca64ffa861e
```

3. Make sure to obtain the proper client secrets from the Azure Portal.

4. The OAuth configuration is already set up in `config/config.js` and passport configuration is in `config/passport.js`.

5. The authentication routes are already set up in `api/v1/auth.js`.

## Callback URL Configuration

Make sure to add the following redirect URI in your Microsoft Azure app registration:

-   For development: `http://localhost:5555/api/v1/auth/microsoft/callback`
-   For production: `https://your-production-domain.com/api/v1/auth/microsoft/callback`
