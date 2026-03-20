# Project Structure

## Directory Organization

```
aigens-backend/
├── api/v1/              # API route handlers (RESTful endpoints)
├── config/              # Configuration modules
├── controllers/         # Business logic controllers
├── database/            # Database models and migrations
│   ├── models/          # Sequelize model definitions
│   └── migrations/      # Database schema migrations
├── middlewares/         # Express middleware functions
├── services/            # Business logic services
├── scripts/             # Database initialization and maintenance
├── uploads/             # File upload storage
├── memory-bank/         # Technical documentation
├── docs/                # API and integration documentation
└── __tests__/           # Test files (mirrors src structure)
```

## Key Architectural Patterns

### API Layer (`api/v1/`)
- RESTful route definitions
- Request validation and parsing
- Response formatting
- Swagger documentation annotations
- File upload handling with Multer

### Service Layer (`services/`)
- External API integrations (AI providers, payments)
- Business logic implementation
- Cost calculation and credit management
- Email and notification services
- File storage (Google Cloud Storage)

### Database Layer (`database/`)
- Sequelize models with associations
- Migration files for schema changes
- Centralized database manager class
- Model relationships and constraints

### Configuration (`config/`)
- Environment-specific settings
- Database connection setup
- Authentication strategies
- CORS and security policies
- Swagger API documentation setup

## Naming Conventions

### Files and Directories
- Use kebab-case for file names: `user-settings.service.js`
- Use camelCase for JavaScript variables and functions
- Use PascalCase for class names and Sequelize models
- API routes follow REST conventions: `/api/v1/users/:id`

### Database
- Table names: snake_case plural (`user_settings`, `message_costs`)
- Column names: snake_case (`created_at`, `user_id`)
- Foreign keys: `id_` prefix (`id_user`, `id_model`)
- Junction tables: combine entity names (`user_chats`, `models_capabilities`)

### Code Organization
- One class/service per file
- Group related functionality in services
- Separate route handlers from business logic
- Use dependency injection for services
- Centralized error handling

## Testing Structure
- Mirror source directory structure in `__tests__/`
- Unit tests for services and utilities
- Integration tests for API endpoints
- Mock external dependencies (AI APIs, payment providers)
- Use descriptive test names and group related tests

## Documentation
- `memory-bank/` contains architectural decisions and context
- `docs/` contains integration guides and API documentation
- Inline JSDoc comments for complex functions
- Swagger annotations for all API endpoints