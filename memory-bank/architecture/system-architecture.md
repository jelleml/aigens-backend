# System Architecture

## Project Structure
```
├── api/           # API definitions
├── config/        # System configurations
├── controllers/   # Business logic
├── database/      # Database models and migrations
├── middlewares/   # Express middlewares
├── migrations/    # Database migration scripts
├── routes/        # Route definitions
├── services/      # Business services
└── uploads/       # Uploaded files
```

## Main Components

### Express Server
- Entry point: server.js
- Security configuration with Helmet
- Custom CORS handling
- API rate limiting
- CSRF protection
- Session management

### Authentication
- Multi-strategy with Passport.js
- Support for:
  - Google OAuth
  - Microsoft OAuth
  - GitHub OAuth
  - Passwordless
  - JWT

### Database
- MySQL as main database
- Sequelize as ORM
- Migration system for schema versioning

### API
- RESTful API design
- Swagger documentation
- Input validation with express-validator
- Centralized error handling

### Security
- Helmet for security headers
- Rate limiting
- CSRF protection
- Secure session management
- Input validation

### Logging and Monitoring
- Morgan for HTTP logging
- Structured error handling
- Configurable timeouts
