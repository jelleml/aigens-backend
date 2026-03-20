# Technology Stack

## Core Technologies

- **Runtime**: Node.js (>=16.0.0)
- **Framework**: Express.js 4.x
- **Database**: MySQL 8.0+ with Sequelize ORM
- **Authentication**: Passport.js with multiple OAuth strategies
- **Testing**: Jest with Supertest for API testing
- **Documentation**: Swagger/OpenAPI 3.0

## Key Dependencies

### AI Provider SDKs
- `@anthropic-ai/sdk` - Anthropic Claude integration
- `openai` - OpenAI GPT models
- Custom HTTP clients for Together.ai, OpenRouter, DeepSeek, Ideogram

### Database & ORM
- `sequelize` - MySQL ORM with migrations
- `mysql2` - MySQL driver
- `sequelize-cli` - Migration and seeding tools

### Authentication & Security
- `passport` with OAuth strategies (Google, Microsoft, GitHub)
- `jsonwebtoken` - JWT token handling
- `bcryptjs` - Password hashing
- `helmet` - Security headers
- `cors` - CORS handling
- `csurf` - CSRF protection

### Payment Processing
- `stripe` - Credit card payments
- `btcpay-greenfield-node-client` - Bitcoin payments

## Common Commands

### Development
```bash
npm run dev          # Start development server with nodemon
npm start           # Start production server
npm test            # Run Jest tests
npm run test:detect # Run tests with open handle detection
npm run lint        # Run ESLint
```

### Database Management
```bash
npm run migration:create    # Create new migration
npm run migration:up       # Run pending migrations
npm run migration:down     # Rollback last migration
npm run seed              # Run database seeders
```

### Model & Provider Setup
```bash
npm run setup-models      # Initialize all AI models
npm run init-providers    # Initialize provider subscriptions
npm run verify-setup      # Verify database setup
npm run cleanup-indexes   # Remove duplicate database indexes
```

## Environment Configuration

Required environment variables:
- Database: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- JWT: `JWT_SECRET`
- AI APIs: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `TOGETHER_API_KEY`, etc.
- OAuth: `GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, `GITHUB_CLIENT_ID`
- Payments: `STRIPE_SECRET_KEY`, `BTCPAY_API_KEY`

## Build & Deployment

- No build step required (Node.js runtime)
- Uses PM2 or similar for production process management
- Database migrations run automatically on startup
- File uploads handled via Google Cloud Storage