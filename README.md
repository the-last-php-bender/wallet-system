# Lendsqr Backend Engineer Assessment V2 - Wallet System

## Overview

A high-concurrency, financial-grade wallet system built with TypeScript, Node.js, Express, and PostgreSQL. Implements a double-entry ledger system with deterministic pessimistic locking, precision decimal arithmetic, and comprehensive compliance gates for identity verification.

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | ≥20.0.0 |
| Language | TypeScript | 5.5.3 |
| HTTP Framework | Express | 4.19.2 |
| Database | MySQL | 8.0 |
| Query Builder | Knex.js | 3.1.0 |
| Decimal Arithmetic | Decimal.js | 10.4.3 |
| Circuit Breaker | Opossum | 8.1.4 |
| Logging | Pino | 9.3.2 |
| Authentication | JWT (Access + Refresh) | jsonwebtoken |
| Password Hashing | bcrypt | 6.0.0 |

## Database Design

### Entity Relationship Diagram

```mermaid
erDiagram
    USERS ||--|| WALLETS : "has"
    WALLETS ||--|{ LEDGER_ENTRIES : "generates"

    USERS {
        integer id PK
        string email UK "255 chars, indexed (lowercase)"
        string bvn UK "11 chars, indexed"
        string password_hash "255 chars"
        timestamp created_at "precision 6"
        timestamp updated_at "precision 6"
    }

    WALLETS {
        integer id PK
        integer user_id FK UK "references users.id"
        decimal balance "DECIMAL(20,4), default 0.0000"
        timestamp created_at "precision 6"
        timestamp updated_at "precision 6"
    }

    LEDGER_ENTRIES {
        integer id PK
        integer wallet_id FK "references wallets.id"
        decimal amount "DECIMAL(20,4)"
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

- **Monetary Values**: `DECIMAL(20,4)` - Supports up to 16 digits before decimal, 4 digits after (e.g., 9999999999999999.9999)
- **Timestamps**: Precision 6 microseconds for accurate transaction ordering
- **BVN**: 11-character string (Nigerian Bank Verification Number)
- **Email**: 255-character string with lowercase index for case-insensitive lookups

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

2. **Explicit Decimal Normalization**
   - Every monetary value is explicitly normalized using `amount.toFixed(4)`
   - No implicit decimal conversion in database layer
   - Guarantees precision consistency across application

### OOP Design Concepts

1. **Encapsulation**
   - Repository classes encapsulate all data access logic
   - Service classes encapsulate business logic and orchestration
   - Controller classes encapsulate HTTP request/response handling
   - Private methods (`createMockTransaction()`) hide implementation details

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
   - Transactions are created in service methods using `createMockTransaction()`
   - Transaction objects are passed explicitly to repository methods
   - No implicit transaction management in repository layer

2. **Pessimistic Locking Strategy**
   - `findByUserIdForUpdate()` uses PostgreSQL's `FOR UPDATE` clause
   - Locks are acquired in deterministic order (sorted by user ID) to prevent deadlocks
   - Locks are held for the duration of the transaction

3. **Atomic Operations**
   - All balance mutations are atomic within transactions
   - Ledger entries are created atomically with balance updates
   - Transaction rollback on any error ensures consistency

4. **Isolation Level**
   - PostgreSQL default READ COMMITTED isolation level
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
  "password": "SecurePassword123!"
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "data": {
    "userId": 1,
    "email": "user@example.com",
    "bvn": "12345678901",
    "walletId": 1,
    "balance": "0.0000"
  }
}
```

**Validation:**
- Email must be valid format and unique
- BVN must be 11 characters and unique
- Password must be at least 8 characters
- BVN is verified against Adjutor Karma blacklist (circuit breaker + cache)
- Password is hashed using bcrypt before storage

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
    "userId": 1,
    "email": "user@example.com",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Token Details:**
- **Access Token** (`token`): JWT, expires in 15m (`JWT_EXPIRES_IN`), signed with `JWT_SECRET`
- **Refresh Token** (`refreshToken`): JWT, expires in 7d (`JWT_REFRESH_EXPIRES_IN`), signed with `JWT_REFRESH_SECRET` (falls back to `JWT_SECRET`)
- Both tokens contain `{ sub: userId, email, bvn }` claims

---

### Token Refresh

**Endpoint:** `POST /api/v1/users/refresh`

**Rate Limit:** 20 requests per 15 minutes (authLimiter)

**Request Headers:**
```
Authorization: Bearer {refresh_token}
```

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
    "userId": 1,
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
  "amount": "1000.50"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "transactionRef": "FND-1716200000000-ABC12345",
    "userId": 1,
    "amount": "1000.5000",
    "newBalance": "1000.5000",
    "creditEntryId": 1,
    "timestamp": "2024-05-20T12:00:00.000Z"
  }
}
```

**Validation:**
- Amount must be positive decimal string
- Amount is normalized to 4 decimal places using Decimal.js
- Maximum amount: 99999999999999999.9999
- Uses `incrementBalance()` with pessimistic locking
- Creates CREDIT ledger entry atomically

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
  "receiverUserId": 2,
  "amount": "500.25"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "transactionRef": "TXN-1716200000000-XYZ67890",
    "senderUserId": 1,
    "receiverUserId": 2,
    "amount": "500.2500",
    "senderNewBalance": "500.2500",
    "receiverNewBalance": "500.2500",
    "timestamp": "2024-05-20T12:00:00.000Z"
  }
}
```

**Validation:**
- Sender and receiver must be different users
- Both users must have active wallets
- Amount must be positive decimal string
- Sender must have sufficient balance
- Uses deterministic lock ordering (sorted by user ID) to prevent deadlocks
- Creates paired DEBIT (sender) and CREDIT (receiver) ledger entries atomically

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
  "amount": "250.75"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "transactionRef": "WTH-1716200000000-DEF24680",
    "userId": 1,
    "amount": "250.7500",
    "newBalance": "249.5000",
    "timestamp": "2024-05-20T12:00:00.000Z"
  }
}
```

**Validation:**
- Amount must be positive decimal string
- User must have active wallet
- User must have sufficient balance
- Uses `findByUserIdForUpdate()` for pessimistic locking
- Uses `decrementBalance()` with atomic balance update
- Creates DEBIT ledger entry atomically
- All operations within isolated database transaction

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
    "walletId": 1,
    "balance": "1000.5000",
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
    "walletId": 1,
    "ledgerSum": "1000.5000",
    "cachedBalance": "1000.5000",
    "isBalanced": true,
    "discrepancy": "0.0000"
  }
}
```

**Response (409 Conflict - Mismatch):**
```json
{
  "status": "error",
  "code": "BALANCE_MISMATCH",
  "data": {
    "walletId": 1,
    "ledgerSum": "1000.5000",
    "cachedBalance": "999.5000",
    "isBalanced": false,
    "discrepancy": "1.0000"
  }
}
```

**Logic:**
- Sums all ledger entries for the wallet (CREDIT as positive, DEBIT as negative)
- Compares sum to cached `wallets.balance` field
- Tolerance: 0.0001 (accounts for DECIMAL(20,4) precision)
- Logs CRITICAL alert if mismatch detected

**Authentication:** Required (JWT Bearer token)

---

## Installation & Setup

### Prerequisites

- Node.js ≥20.0.0
- PostgreSQL 15
- Docker & Docker Compose (for local development)

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

4. **Start the database with Docker Compose**
```bash
docker compose up -d
```

5. **Run database migrations**
```bash
npm run migrate
```

6. **Load demo data for deployment**
```bash
npm run demo:init
```

7. **Start development server**
```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Production Build

```bash
npm run build
npm start
```

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

## Deployment

### Render / Fly.io / Heroku

The application is configured for deployment to cloud platforms. The expected deployment URL follows the pattern:

```
https://<candidate-name>-lendsqr-be-test.<domain>
```

See `Procfile` and `Dockerfile` for deployment configuration.

### Environment Variables (Production)

Required environment variables for production deployment:

- `DATABASE_URL`: MySQL connection string (or individual `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Set to `production`
- `JWT_SECRET`: Secret key for signing JWT access tokens (15m TTL)
- `JWT_REFRESH_SECRET`: Secret key for signing JWT refresh tokens (7d TTL, falls back to `JWT_SECRET`)
- `ADJUTOR_API_KEY`: Adjutor Karma API key for identity verification
- `ADJUTOR_API_URL`: Adjutor Karma API endpoint

## Security Features

- **Password Hashing**: bcrypt with configurable salt rounds (default: 12)
- **JWT Bearer Authentication**: Access token (15m TTL) + Refresh token (7d TTL) with rotation
- **Pessimistic Locking**: MySQL `SELECT … FOR UPDATE` prevents race conditions on wallet balance
- **Idempotency**: DB-backed pessimistic locking via `idempotency_keys` table; returns 409 on concurrent in-flight requests
- **Rate Limiting**: `apiLimiter` (100/15m global), `authLimiter` (20/15m for auth endpoints), `walletLimiter` (50/15m for fund/transfer/withdraw)
- **Security Headers**: helmet (CSP, HSTS preload, frameguard deny, hidePoweredBy), `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`
- **CORS**: Restricted to allowed origins via `ALLOWED_ORIGINS` env var
- **SQL Injection Prevention**: Knex parameterized queries
- **Precision Arithmetic**: Decimal.js eliminates floating-point errors
- **Secrets Manager**: Pluggable `SecretProvider` interface (Environment or HashiCorp Vault)
- **DB Connection Hardening**: `lock_wait_timeout=3s`, `max_execution_time=30s`, pool exhaustion returns 503 with `retryAfterMs`

## Monitoring & Observability

- **Structured Logging**: Pino logger with request correlation IDs
- **Health Checks**: `/health` and `/ready` endpoints
- **Error Tracking**: Centralized error logging with context
- **Circuit Breaker Stats**: Real-time circuit state and metrics
- **Cache Metrics**: Hit/miss ratios for AntiSpamCache

## License

ISC
