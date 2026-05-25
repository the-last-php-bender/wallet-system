# Lendsqr Backend Engineer Assessment V2 - Wallet System

## Overview

A high-concurrency, financial-grade wallet system built with TypeScript, Node.js, Express, and MySQL 8.0. Implements a double-entry ledger system with deterministic pessimistic locking, **kobo-only integer string storage** (no decimals, no floating-point), and comprehensive compliance gates for identity verification via Adjutor Karma API.

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | ≥20.0.0 |
| Language | TypeScript | 5.5.3 |
| HTTP Framework | Express | 4.19.2 |
| Database | MySQL | 8.0 |
| Query Builder | Knex.js | 3.1.0 |
| Arithmetic | JavaScript BigInt | Native |
| Circuit Breaker | Opossum | 8.1.4 |
| Logging | Pino | 9.3.2 |
| Authentication | JWT (Access + Refresh) | jsonwebtoken |
| Password Hashing | bcrypt | 6.0.0 |
| Linting | ESLint + TypeScript ESLint | 8.57.1 |

## Database Design

### Entity Relationship Diagram

```mermaid
erDiagram
    USERS ||--|| WALLETS : "has"
    WALLETS ||--|{ LEDGER_ENTRIES : "generates"

    USERS {
        string id PK "UUID v4"
        string email UK "255 chars, indexed (lowercase)"
        string bvn UK "11 chars, indexed"
        string password_hash "255 chars"
        timestamp created_at "precision 6"
        timestamp updated_at "precision 6"
    }

    WALLETS {
        string id PK "UUID v4"
        string user_id FK UK "references users.id (UUID)"
        string balance "VARCHAR(64), integer kobo string, default '0'"
        timestamp created_at "precision 6"
        timestamp updated_at "precision 6"
    }

    LEDGER_ENTRIES {
        string id PK "UUID v4"
        string wallet_id FK "references wallets.id (UUID)"
        string amount "VARCHAR(64), integer kobo string"
        enum type "DEBIT or CREDIT"
        string description "255 chars"
        timestamp created_at "precision 6"
    }
```

### Relationship Constraints

- **Users to Wallets**: One-to-One (1:1) - Each user has exactly one wallet, enforced by `user_id UNIQUE` constraint
- **Wallets to Ledger Entries**: One-to-Many (1:N) - Each wallet can have multiple ledger entries
- **Cascade Rules**:
  - `users.id → wallets.user_id`: ON DELETE CASCADE (deleting a user deletes their wallet)
  - `wallets.id → ledger_entries.wallet_id`: ON DELETE RESTRICT (cannot delete wallet with ledger entries)

### Data Types & Precision

- **Monetary Values**: `VARCHAR(64)` - Stores **kobo as integer strings** (e.g., "10000" = 100.00 Naira). No decimals, no floating-point. Frontend handles all display conversions (divide by 100 to show Naira).
- **All IDs**: UUID v4 strings - Generated at **application level** (not database) for database-agnostic compatibility, testability, and transparency.
- **Timestamps**: Precision 6 microseconds for accurate transaction ordering
- **BVN**: 11-character string (Nigerian Bank Verification Number)
- **Email**: 255-character string with lowercase index for case-insensitive lookups

## Key Architectural Decisions (v1.3.0)

### 1. App-Level UUID Generation

**All UUIDs are generated at the application level** using a centralized `IdGenerator` utility implementing an `IIdGenerator` interface. This is NOT database-level `DEFAULT (UUID())` for four critical reasons:

1. **MySQL Compatibility**: MySQL's `LAST_INSERT_ID()` returns 0 for functional defaults, making post-insert retrieval broken
2. **Knex Compatibility**: Knex's `table.uuid()` generates Postgres-specific syntax incompatible with MySQL
3. **Testability**: Interface-based design allows mocking with `MockIdGenerator` for deterministic testing
4. **Transparency**: The ID is known BEFORE the insert, enabling transparent logging and clean `.where('id', knownId).first()` fetch queries

### 2. Kobo-Only Integer String Storage

**All monetary values are stored exclusively in kobo as integer strings** in `VARCHAR(64)` columns:

- **No decimals anywhere**: Removed `DECIMAL(20,4)` entirely
- **No floating-point**: All arithmetic uses JavaScript BigInt for perfect precision
- **No Decimal.js**: Removed Decimal.js dependency entirely
- **Frontend responsibility**: Frontend handles all display conversions (e.g., dividing by 100 to show Naira)
- **Example**: `"10000"` (string) represents 100.00 Naira

### 3. DAL Optimization: Reduced Round-Trips

Refactored all 3 creation methods (`createUser()`, `createWallet()`, `createEntry()`) from `INSERT → SELECT → Return` pattern to `INSERT → Return from memory`:

- **Before**: 2 database round-trips per creation (INSERT + SELECT)
- **After**: 1 database round-trip per creation (INSERT only)
- **Performance Impact**: 50% reduction in network hops per creation operation; ~30-50% faster latency in distributed deployments

### 4. No Docker Infrastructure

Removed Docker entirely (no Dockerfile, no docker-compose.yml, no Docker infrastructure):

- **Simpler deployment**: Native Node.js only for Render/Fly.io/Heroku
- **Reduced complexity**: No container orchestration, no image building
- **Faster CI/CD**: No Docker build/push steps

### 5. Aiven MySQL with SSL

Production deployment uses **Aiven MySQL** with enforced SSL connections:

- **Auto-enabled**: SSL is automatically enabled when `NODE_ENV=production` or `DB_SSL=true`
- **Secure by default**: Production connections require SSL encryption
- **Configured in**: `config/database.ts` and `knexfile.ts`

### 6. Adjutor Called in ALL Environments

Removed `NODE_ENV=development` skip for Adjutor verification:

- **Consistent behavior**: Adjutor Karma API is called in all environments (dev, test, prod)
- **No surprises**: Same validation logic everywhere
- **Circuit breaker**: Opossum circuit breaker with fallback still applies

## Architectural Patterns

### WET vs DRY Principles

**DRY (Don't Repeat Yourself) Applied:**

1. **Interface-Based Repository Contracts**
   - All repositories expose typed interfaces (`IWalletRepository`, `ILedgerRepository`, `IUserRepository`)
   - Service layers depend on interfaces, not concrete implementations
   - Enables seamless mocking for unit tests without database dependencies
   - Example: `WalletService` accepts `IWalletRepository` and `ILedgerRepository` in constructor

2. **Static Bootstrap Pattern**
   - Each module (`WalletModule`, `UserModule`) uses a singleton `bootstrap()` method
   - Prevents duplicate router instantiation and dependency injection
   - Centralizes module wiring logic in one location per module

3. **Centralized Error Handling**
   - Global `errorMiddleware` catches all exceptions
   - `ErrorLogger` provides consistent logging format across all services
   - Custom exception hierarchy (`InsufficientFundsException`, `BadRequestException`) eliminates repetitive error construction

**WET (Write Everything Twice) Intentionally Applied:**

1. **Explicit Transaction Scoping**
   - Each service method explicitly creates and passes transaction objects
   - No hidden transaction management in repository layer
   - Ensures transaction boundaries are visible and auditable in business logic

2. **Explicit Kobo Validation & Normalization**
   - Every monetary value is explicitly validated using `validateAmount()` and parsed using `parseBalance()` (returns BigInt)
   - Normalized to integer strings using `normalizeBalance()` (strips decimals, ensures valid integer)
   - Guarantees precision consistency across application

### OOP Design Concepts

1. **Encapsulation**
   - Repository classes encapsulate all data access logic
   - Service classes encapsulate business logic and orchestration
   - Controller classes encapsulate HTTP request/response handling
   - Private methods hide implementation details

2. **Dependency Injection**
   - Constructor-based injection throughout the codebase
   - No global state or singletons (except module bootstrap pattern)
   - Enables testability by injecting mock dependencies

3. **Interface Segregation**
   - Small, focused interfaces for each repository
   - Services only depend on methods they actually use
   - Example: `IWalletRepository` only exposes wallet-specific operations

4. **Single Responsibility Principle**
   - Controllers: HTTP handling only
   - Services: Business logic only
   - Repositories: Data access only
   - No cross-layer mixing of concerns

### Transaction Scoping Rules

1. **Explicit Transaction Boundaries**
   - Transactions are created in service methods using `withTransaction()` helper
   - Transaction objects are passed explicitly to repository methods
   - No implicit transaction management in repository layer

2. **Pessimistic Locking Strategy**
   - `findByUserIdForUpdate()` uses MySQL's `SELECT … FOR UPDATE` clause
   - Locks are acquired in deterministic order (sorted by user ID) to prevent deadlocks
   - Locks are held for the duration of the transaction

3. **Atomic Operations**
   - All balance mutations are atomic within transactions
   - Ledger entries are created atomically with balance updates
   - Transaction rollback on any error ensures consistency

4. **Isolation Level**
   - MySQL default READ COMMITTED isolation level
   - Combined with `FOR UPDATE` locks provides serializable behavior for wallet operations
   - Prevents dirty reads and non-repeatable reads

### Adjutor Karma Blacklist Gate

The system integrates with Lendsqr's Adjutor Karma API for identity verification during user registration:

**Implementation Details:**

1. **Circuit Breaker Pattern**
   - Opossum circuit breaker wraps external API calls
   - Configured with 3000ms timeout, 50% error threshold, 5 request volume threshold
   - Automatic fallback to `ServiceUnavailableException` when circuit is OPEN
   - Prevents cascading failures from external service degradation

2. **AntiSpamCache**
   - In-memory TTL cache (5 minutes) for clean BVN verification results
   - Blacklisted results are NEVER cached (immediate rejection required)
   - Auto-purge interval runs every 60 seconds
   - Reduces external API calls during registration retry loops

3. **Verification Flow**
   ```
   Registration Request → Extract BVN → Check AntiSpamCache
   ├─ Cache Hit → Return cached result (clean only)
   └─ Cache Miss → Fire Circuit Breaker → Call Adjutor API
       ├─ Blacklisted → Throw ForbiddenException (NOT cached)
       └─ Clean → Cache result → Return success
   ```

4. **Statistics Tracking**
   - Tracks fires, successes, failures, timeouts, cache hits, cache misses
   - Exposes health check endpoint with circuit state and cache size
   - Enables observability and operational monitoring

## API Route Specifications

### Account Creation

**Endpoint:** `POST /api/v1/users/register`

**Rate Limit:** 20 requests per 15 minutes (authLimiter)

**Request Body:**
```json
{
  "email": "user@example.com",
  "bvn": "12345678901",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1990-01-01",
  "phoneNumber": "+2348012345678"
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "walletId": "550e8400-e29b-41d4-a716-446655440001",
    "email": "user@example.com",
    "balance": "0",
    "timestamp": "2024-05-20T12:00:00.000Z"
  }
}
```

**Validation:**
- Email must be valid format and unique
- BVN must be 11 characters and unique
- Password must be at least 8 characters
- BVN is verified against Adjutor Karma blacklist (circuit breaker + cache)
- Password is hashed using bcrypt before storage
- All IDs are UUID v4 strings
- Balance is kobo-only integer string ("0" = 0.00 Naira)

**Authentication:** None (public endpoint)

---

### User Authentication

**Endpoint:** `POST /api/v1/users/authenticate`

**Rate Limit:** 20 requests per 15 minutes (authLimiter)

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Token Details:**
- **Access Token** (`token`): JWT, expires in 15m (`JWT_EXPIRES_IN`), signed with `JWT_SECRET`
- **Refresh Token** (`refreshToken`): JWT, expires in 7d (`JWT_REFRESH_EXPIRES_IN`), signed with `JWT_REFRESH_SECRET` (falls back to `JWT_SECRET`)

---

### Token Refresh

**Endpoint:** `POST /api/v1/users/refresh`

**Rate Limit:** 20 requests per 15 minutes (authLimiter)

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Flow:**
1. Client sends expired access token scenario → calls `/refresh` with `refreshToken` in body
2. Server verifies refresh token using `JWT_REFRESH_SECRET`
3. On success, issues a **new** access token (15m TTL) and a **new** refresh token (7d TTL) — token rotation
4. On failure, returns 401 `INVALID_AUTH_TOKEN`

---

### Wallet Funding

**Endpoint:** `POST /api/v1/wallet/fund`

**Rate Limit:** 50 requests per 15 minutes (walletLimiter)

**Idempotency:** Supported via `X-Idempotency-Key` header

**Request Headers:**
```
Authorization: Bearer {jwt_access_token}
X-Idempotency-Key: (optional) unique request key
```

**Request Body:**
```json
{
  "amount": "10000"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "transactionRef": "FND-1716200000000-ABC12345",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "amount_in_kobo": "10000",
    "new_balance_in_kobo": "10000",
    "currency": "NGN",
    "creditEntryId": "550e8400-e29b-41d4-a716-446655440002",
    "timestamp": "2024-05-20T12:00:00.000Z"
  }
}
```

**Validation:**
- Amount must be positive integer string (kobo only, no decimals)
- Amount is validated using `validateAmount()` and parsed to BigInt using `parseBalance()`
- Maximum amount: Limited by BigInt capacity (effectively unlimited)
- Uses `incrementBalance()` with pessimistic locking
- Creates CREDIT ledger entry atomically
- All IDs are UUID v4 strings
- All amounts are kobo-only integer strings

**Authentication:** Required (JWT Bearer token)

---

### Wallet Transfer

**Endpoint:** `POST /api/v1/wallet/transfer`

**Rate Limit:** 50 requests per 15 minutes (walletLimiter)

**Idempotency:** Supported via `X-Idempotency-Key` header

**Request Headers:**
```
Authorization: Bearer {jwt_access_token}
X-Idempotency-Key: (optional) unique request key
```

**Request Body:**
```json
{
  "receiverUserId": "550e8400-e29b-41d4-a716-446655440003",
  "amount": "5000"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "transactionRef": "TXN-1716200000000-XYZ67890",
    "senderUserId": "550e8400-e29b-41d4-a716-446655440000",
    "receiverUserId": "550e8400-e29b-41d4-a716-446655440003",
    "amount_in_kobo": "5000",
    "sender_new_balance_in_kobo": "5000",
    "receiver_new_balance_in_kobo": "5000",
    "currency": "NGN",
    "timestamp": "2024-05-20T12:00:00.000Z"
  }
}
```

**Validation:**
- Sender and receiver must be different users
- Both users must have active wallets
- Amount must be positive integer string (kobo only, no decimals)
- Sender must have sufficient balance (BigInt comparison)
- Uses deterministic lock ordering (sorted by user ID) to prevent deadlocks
- Creates paired DEBIT (sender) and CREDIT (receiver) ledger entries atomically
- All IDs are UUID v4 strings
- All amounts are kobo-only integer strings

**Authentication:** Required (JWT Bearer token)

---

### Wallet Withdrawal

**Endpoint:** `POST /api/v1/wallet/withdraw`

**Rate Limit:** 50 requests per 15 minutes (walletLimiter)

**Idempotency:** Supported via `X-Idempotency-Key` header

**Request Headers:**
```
Authorization: Bearer {jwt_access_token}
X-Idempotency-Key: (optional) unique request key
```

**Request Body:**
```json
{
  "amount": "2500"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "transactionRef": "WTH-1716200000000-DEF24680",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "amount_in_kobo": "2500",
    "new_balance_in_kobo": "2500",
    "currency": "NGN",
    "timestamp": "2024-05-20T12:00:00.000Z"
  }
}
```

**Validation:**
- Amount must be positive integer string (kobo only, no decimals)
- User must have active wallet
- User must have sufficient balance (BigInt comparison)
- Uses `findByUserIdForUpdate()` for pessimistic locking
- Uses `decrementBalance()` with atomic balance update
- Creates DEBIT ledger entry atomically
- All operations within isolated database transaction
- All IDs are UUID v4 strings
- All amounts are kobo-only integer strings

**Authentication:** Required (JWT Bearer token)

---

### Balance Inquiry

**Endpoint:** `GET /api/v1/wallet/balance`

**Request Headers:**
```
Authorization: Bearer {jwt_access_token}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "walletId": "550e8400-e29b-41d4-a716-446655440001",
    "balance_in_kobo": "10000",
    "currency": "NGN",
    "isNew": false
  }
}
```

**Authentication:** Required (JWT Bearer token)

---

### Ledger Reconciliation

**Endpoint:** `GET /api/v1/wallet/reconcile`

**Request Headers:**
```
Authorization: Bearer {jwt_access_token}
```

**Response (200 OK - Balanced):**
```json
{
  "status": "success",
  "code": "BALANCE_RECONCILED",
  "data": {
    "walletId": "550e8400-e29b-41d4-a716-446655440001",
    "ledger_sum_in_kobo": "10000",
    "cached_balance_in_kobo": "10000",
    "isBalanced": true,
    "discrepancy_in_kobo": "0",
    "currency": "NGN"
  }
}
```

**Response (409 Conflict - Mismatch):**
```json
{
  "status": "error",
  "code": "BALANCE_MISMATCH",
  "data": {
    "walletId": "550e8400-e29b-41d4-a716-446655440001",
    "ledger_sum_in_kobo": "10000",
    "cached_balance_in_kobo": "9900",
    "isBalanced": false,
    "discrepancy_in_kobo": "100",
    "currency": "NGN"
  }
}
```

**Logic:**
- Sums all ledger entries for the wallet (CREDIT as positive, DEBIT as negative)
- Compares sum to cached `wallets.balance` field
- Tolerance: 0 (exact match required for integer strings)
- Logs CRITICAL alert if mismatch detected
- All amounts are kobo-only integer strings

**Authentication:** Required (JWT Bearer token)

---

## Installation & Setup

### Prerequisites

- Node.js ≥20.0.0
- MySQL 8.0 (local or Aiven for production)
- No Docker required (native Node.js only)

### Local Development

1. **Clone the repository**
```bash
git clone <repository-url>
cd wallet-system
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

**Required environment variables:**
```env
# Server
PORT=3000
NODE_ENV=development

# Database (MySQL)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=wallet_engine
DB_SSL=false # Set to true for Aiven MySQL with SSL

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key
JWT_REFRESH_EXPIRES_IN=7d

# Adjutor Karma API
ADJUTOR_API_KEY=your_adjutor_api_key
ADJUTOR_API_URL=https://adjutor.lendsqr.com/v2

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

4. **Run database migrations**
```bash
npm run migrate
```

5. **Load demo data (optional)**
```bash
npm run demo:init
```

6. **Start development server**
```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Production Build

```bash
npm run build
npm start
```

## CI/CD Pipeline (GitHub Actions)

The project includes a comprehensive CI/CD pipeline with 4 jobs:

### 1. Typecheck
- Runs `npm run typecheck` (TypeScript compilation with `--noEmit`)
- Ensures no TypeScript errors

### 2. Lint
- Runs `npm run lint` (ESLint with TypeScript ESLint)
- Ensures code quality and consistency

### 3. Test
- Runs `npm test` with MySQL 8.0 service container
- Runs migrations before tests (`knex migrate:latest --env test`)
- Uploads coverage artifacts
- Environment variables configured for test MySQL

### 4. Security Audit
- Runs `npm audit --audit-level=high`
- Checks for vulnerable dependencies
- Continues on error (informational only)

### Pipeline Triggers
- Push to `main` or `dev` branches
- Pull requests to `main` or `dev` branches

### Concurrency
- Grouped by workflow + ref
- Cancel-in-progress: true (cancels old runs on new push)

## Testing

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:cov
```

### Test Categories
- **Unit tests**: Test services with mocked repositories (no database)
- **Integration tests**: Test API endpoints with real database (MySQL)
- **All tests**: 84 passing tests as of v1.3.0

## Deployment

### Render / Fly.io / Heroku

The application is configured for deployment to cloud platforms with **native Node.js** (no Docker).

### Required Environment Variables (Production)

```env
# Server
PORT=3000
NODE_ENV=production # Enables SSL for MySQL

# Database (Aiven MySQL)
DB_HOST=your-aiven-mysql-host.aivencloud.com
DB_PORT=26257
DB_USER=avnadmin
DB_PASSWORD=your_aiven_password
DB_NAME=wallet_engine
DB_SSL=true # Enables SSL for MySQL connection

# JWT
JWT_SECRET=your_secure_production_jwt_secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your_secure_production_jwt_refresh_secret
JWT_REFRESH_EXPIRES_IN=7d

# Adjutor Karma API
ADJUTOR_API_KEY=your_adjutor_api_key
ADJUTOR_API_URL=https://adjutor.lendsqr.com/v2

# CORS
ALLOWED_ORIGINS=https://your-frontend-domain.com
```

### Build Command
```bash
npm run build
```

### Start Command
```bash
npm start
```

### Migration Command (run before starting server)
```bash
npm run migrate:prod
```

## Security Features

- **Password Hashing**: bcrypt with configurable salt rounds (default: 12)
- **JWT Bearer Authentication**: Access token (15m TTL) + Refresh token (7d TTL) with rotation
- **Pessimistic Locking**: MySQL `SELECT … FOR UPDATE` prevents race conditions on wallet balance
- **Idempotency**: DB-backed pessimistic locking via `idempotency_keys` table; returns 409 on concurrent in-flight requests
- **Rate Limiting**: `apiLimiter` (100/15m global), `authLimiter` (20/15m for auth endpoints), `walletLimiter` (50/15m for fund/transfer/withdraw)
- **Security Headers**: helmet (CSP, HSTS preload, frameguard deny, hidePoweredBy), `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`
- **CORS**: Restricted to allowed origins via `ALLOWED_ORIGINS` env var
- **SQL Injection Prevention**: Knex parameterized queries
- **Precision Arithmetic**: JavaScript BigInt eliminates floating-point errors (kobo-only integer strings)
- **DB Connection Hardening**: `lock_wait_timeout=3s`, `max_execution_time=30s`, pool exhaustion returns 503 with `retryAfterMs`
- **SSL Enforcement**: Production MySQL connections require SSL (Aiven MySQL)

## Monitoring & Observability

- **Structured Logging**: Pino logger with request correlation IDs
- **Health Checks**: `/health` and `/ready` endpoints
- **Metrics**: Prometheus `/metrics` via prom-client
- **Error Tracking**: Centralized error logging with context
- **Circuit Breaker Stats**: Real-time circuit state and metrics
- **Cache Metrics**: Hit/miss ratios for AntiSpamCache

## Key Files to Review

### Architecture
- `ARCHITECTURAL_BLUEPRINT.md`: Detailed architectural decisions and patterns
- `LOOM_VIDEO_SCRIPT.md`: 3-minute demo script with all key features

### Core Utilities
- `src/common/utils/id-generator.ts`: Centralized UUID generator with `IIdGenerator` interface
- `src/common/utils/money.ts`: Kobo validation/normalization utilities (`validateAmount()`, `parseBalance()`, `normalizeBalance()`)

### Repository Interfaces
- `src/modules/wallet/wallet.repository.interface.ts`: `IWalletRepository` interface
- `src/modules/ledger/ledger.repository.interface.ts`: `ILedgerRepository` interface
- `src/modules/user/user.repository.interface.ts`: `IUserRepository` interface

### CI/CD
- `.github/workflows/ci.yml`: GitHub Actions CI/CD pipeline

### Configuration
- `.eslintrc.cjs`: ESLint + TypeScript ESLint configuration
- `knexfile.ts`: Knex configuration with SSL support
- `config/database.ts`: Database configuration with SSL auto-enable
- `config/environment.ts`: Environment configuration

## Recent Production Changes (v1.3.0)

| Change | Details |
|--------|---------|
| **UUID Generation** | Moved from database (`DEFAULT UUID()`) to **app-level `IdGenerator` utility** (`src/common/utils/id-generator.ts`). Uses `IIdGenerator` interface for testability. |
| **Kobo Storage** | Changed from `DECIMAL(20,4)` to `VARCHAR(64)` for integer kobo strings. No decimals, no floating-point. Frontend handles all display conversions. |
| **BigInt Arithmetic** | Replaced Decimal.js with native JavaScript BigInt for perfect precision. No floating-point anywhere. |
| **DAL Optimization** | Refactored all 3 creation methods from `INSERT → SELECT → Return` to `INSERT → Return from memory`. Eliminated 1 database round-trip per creation. |
| **Removed Docker** | No Dockerfile, docker-compose, or Docker infrastructure—native Node.js only. |
| **Removed OpenTelemetry** | `prom-client` already provides working `/metrics` endpoint. |
| **Aiven MySQL SSL** | SSL auto-enabled when `NODE_ENV=production` or `DB_SSL=true`. |
| **ESLint + TypeScript ESLint** | Replaced `standard` JavaScript linter with **ESLint + TypeScript ESLint** for proper TypeScript support. |
| **CI/CD Pipeline** | GitHub Actions workflow with 4 jobs: `typecheck`, `lint`, `test` (MySQL 8.0 service + coverage), `security-audit`. |
| **Adjutor in All Envs** | Removed `NODE_ENV=development` skip—Adjutor called in ALL environments for consistent behavior. |

## License

ISC
