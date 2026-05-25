# Scientific Finance Wallet Engine
## Architectural Blueprint & Documentation Manual
### Version 1.0.0 | TypeScript + Node.js + Express + PostgreSQL + PgBouncer

---

## Table of Contents

1. [Architectural Overview](#1-architectural-overview)
2. [Core Architectural Philosophy](#2-core-architectural-philosophy)
3. [Advanced Caching Patterns](#3-advanced-caching-patterns)
4. [Rate Limiting Implementation](#4-rate-limiting-implementation)
5. [Process Lifecycle & Graceful Cleanup](#5-process-lifecycle--graceful-cleanup)
6. [Module Reference](#6-module-reference)
7. [Database Schema & Migrations](#7-database-schema--migrations)
8. [Infrastructure Configuration](#8-infrastructure-configuration)
9. [Security & Observability](#9-security--observability)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. Architectural Overview

The Wallet Engine is a high-concurrency, financial-grade transactional system built on a **NestJS-inspired modular architecture** using pure Node.js. It implements a double-entry ledger system with deterministic pessimistic locking, fault-tolerant external service integration, and zero-floating-point monetary arithmetic.

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | ≥20.0.0 |
| Language | TypeScript | 5.5.3 |
| HTTP Framework | Express | 4.19.2 |
| Database | PostgreSQL | 15 (Alpine) |
| Connection Pooler | PgBouncer | 1.22 |
| Query Builder | Knex.js | 3.1.0 |
| Decimal Arithmetic | Decimal.js | 10.4.3 |
| Validation | Joi | 17.13.3 |
| Circuit Breaker | Opossum | 8.1.4 |
| Logging | Pino | 9.3.2 |
| Authentication | Custom Bearer Token | — |
| Testing | Jest + Supertest | — |

### Directory Structure

```
wallet-system/
├── src/
│   ├── app.ts                          # Express application bootstrap
│   ├── index.ts                        # Entry point
│   ├── server.ts                       # HTTP server lifecycle & graceful shutdown
│   ├── common/
│   │   ├── db/
│   │   │   └── transaction.helper.ts   # withTransaction utility for Knex
│   │   ├── enums/
│   │   │   └── index.ts                # Shared enums (LedgerEntryType, ErrorCode, etc.)
│   │   ├── exceptions/
│   │   │   ├── http.exception.ts       # Typed exception hierarchy
│   │   │   ├── index.ts
│   │   │   └── repository.exception.ts # Repository-level exceptions
│   │   ├── filters/
│   │   │   ├── error.middleware.ts     # Global error handler + ErrorLogger + pino
│   │   │   └── index.ts
│   │   ├── guards/
│   │   │   ├── auth.middleware.ts      # Bearer token authentication guard
│   │   │   ├── idempotency.ts          # Idempotency middleware
│   │   │   ├── idempotency-store.ts    # Database-backed idempotency store
│   │   │   ├── idempotency-store.interface.ts
│   │   │   ├── index.ts
│   │   │   ├── rate-limiter.ts         # Token bucket rate limiter
│   │   │   └── refresh.middleware.ts   # Refresh token verification guard
│   │   ├── middleware/
│   │   │   └── validation.middleware.ts # Joi validation middleware (used by modules)
│   │   ├── response/
│   │   │   ├── index.ts
│   │   │   └── response.helper.ts     # Standardized JSON response helper
│   │   ├── secrets/
│   │   │   └── secrets.manager.ts     # Secrets management
│   │   ├── telemetry/
│   │   │   ├── metrics.ts             # Prometheus metrics (prom-client)
│   │   │   └── tracing.ts             # OpenTelemetry tracing
│   │   ├── utils/
│   │   │   ├── express.ts             # Express utility helpers
│   │   │   └── money.ts               # Kobo-based monetary arithmetic (bigint)
│   │   └── validators/
│   │       ├── index.ts
│   │       └── middleware.ts           # Legacy Joi validation middleware
│   └── modules/
│       ├── blacklist/
│       │   ├── blacklist.module.ts     # Circuit breaker + AntiSpamCache
│       │   ├── providers/
│       │   │   └── adjutor.provider.ts # Lendsqr Adjutor Karma API client
│       │   └── index.ts
│       ├── ledger/
│       │   ├── index.ts
│       │   ├── ledger.repository.ts    # Append-only ledger data mapper
│       │   ├── ledger.repository.interface.ts
│       │   └── ledger.validation.ts
│       ├── user/
│       │   ├── index.ts                # Static bootstrap wiring (UserModule)
│       │   ├── user.controller.ts      # Registration, authentication, profile
│       │   ├── user.service.ts         # Orchestration with compliance gate
│       │   ├── user.repository.ts      # User data mapper with bcrypt
│       │   ├── user.repository.interface.ts
│       │   ├── user.schema.ts          # Legacy Joi validation schemas
│       │   └── user.validation.ts      # Active Joi validation schemas
│       └── wallet/
│           ├── index.ts                # Static bootstrap wiring (WalletModule)
│           ├── wallet.controller.ts    # Balance, transfer, reconciliation, funding, withdrawal
│           ├── wallet.service.ts       # Transfer logic with deterministic locking
│           ├── wallet.repository.ts    # Wallet data mapper with FOR UPDATE
│           ├── wallet.repository.interface.ts
│           ├── wallet.schema.ts        # Legacy Joi validation schemas
│           └── wallet.validation.ts
├── config/
│   ├── environment.ts                  # Strongly-typed environment validation
│   └── database.ts                    # Knex singleton with afterCreate hooks
├── database/
│   ├── migrations/                    # PostgreSQL DDL migration scripts
│   │   ├── 20250601000001_create_users_table.ts
│   │   ├── 20250601000002_create_wallets_table.ts
│   │   ├── 20250601000003_create_ledger_entries_table.ts
│   │   ├── 20250601000004_create_idempotency_keys_table.ts
│   │   └── 20250601000005_harden_db_constraints.ts
│   └── seeds/
│       └── 01_demo_data.ts
├── docker/
│   ├── postgres/
│   │   ├── conf.d/postgresql.conf     # Tuned PostgreSQL parameters
│   │   └── init.d/01-init.sql         # Extensions, roles, grants
│   └── pgbouncer/
│       ├── pgbouncer.ini               # Transaction mode pool configuration
│       └── userlist.txt                # MD5-authenticated credentials
├── tests/
│   ├── jest.config.json                # Jest test configuration
│   ├── setup.ts                        # Jest global setup with env vars
│   ├── unit/
│   │   ├── wallet.service.test.ts      # Interface-based mock tests
│   │   ├── refresh-token.test.ts       # Refresh token middleware tests
│   │   └── idempotency-store.test.ts   # Idempotency store tests
│   └── integration/
│       └── user.api.test.ts            # Supertest HTTP integration tests
├── scripts/
│   └── dev.ps1                         # Development startup script
├── docker-compose.yml                  # Postgres + PgBouncer orchestration
├── knexfile.ts                         # Multi-environment Knex config
├── package.json                        # Dependencies & scripts
├── tsconfig.json                       # Strict TypeScript config
└── jest.config.ts                     # Jest test configuration alias
```

---

## 2. Core Architectural Philosophy

### 3.1 Modular Architecture with Static Bootstrap Pattern

The application uses a **constructor-based dependency injection pattern** inspired by NestJS modules, but implemented without decorators or framework overhead. Each module follows a strict layering:

```
┌─────────────────────────────────────────────────┐
│                  Module Bootstrap                 │
│  (static bootstrap() → returns Express Router)  │
├─────────────────────────────────────────────────┤
│              Controller Layer                     │
│  (HTTP request/response handling, validation)  │
├─────────────────────────────────────────────────┤
│              Service Layer                        │
│  (Business logic orchestration, transactions)    │
├─────────────────────────────────────────────────┤
│             Repository Layer                      │
│  (Data access, query building, Knex wrapper)   │
└─────────────────────────────────────────────────┘
```

#### Static Bootstrap Pattern

Each module exposes a static `bootstrap()` method that:
1. Creates a singleton router the first time it is called
2. Instantiates concrete repository classes implementing typed interfaces
3. Injects those repositories into service constructors
4. Injects the service into the controller constructor
5. Wires HTTP verb handlers to controller methods
6. Returns the fully configured Express Router

```typescript
export class WalletModule {
  private static router: Router | null = null;
  private static walletService: WalletService | null = null;
  private static controller: WalletController | null = null;

  public static bootstrap(): Router {
    if (WalletModule.router !== null) {
      return WalletModule.router;
    }

    const walletRepository = new WalletRepository();
    const ledgerRepository = new LedgerRepository();
    WalletModule.walletService = new WalletService(
      walletRepository,
      ledgerRepository
    );
    WalletModule.controller = new WalletController(WalletModule.walletService);

    const router = express.Router();
    router.get('/balance', authMiddleware, (req, res, next) => {
      WalletModule.controller!.getBalance(req, res, next);
    });
    // ...

    WalletModule.router = router;
    return router;
  }
}
```

This pattern ensures that **technical side effects (HTTP routing, middleware chains, database connections) are kept strictly separate from business logic** (transfer validation, balance checks, compliance gating).

#### Interface-Based Repository Contracts

Every repository layer exposes a typed interface that the service layer depends on:

```typescript
export interface IWalletRepository {
  findByUserIdForUpdate(userId: string, trx: Knex.Transaction): Promise<WalletSnapshot | null>;
  findByUserId(userId: string, trx: Knex.Transaction): Promise<WalletSnapshot | null>;
  findByWalletId(walletId: string, trx: Knex.Transaction): Promise<WalletSnapshot | null>;
  createWallet(userId: string, trx: Knex.Transaction): Promise<WalletSnapshot>;
  incrementBalance(walletId: string, amount: string, trx: Knex.Transaction): Promise<void>;
  decrementBalance(walletId: string, amount: string, trx: Knex.Transaction): Promise<void>;
  // ...
}
```

```typescript
export interface ILedgerRepository {
  createEntry(params: { walletId: string; amount: string; type: LedgerEntryType; description: string }, trx: Knex.Transaction): Promise<LedgerEntryRecord>;
  sumByWalletId(walletId: string, trx: Knex.Transaction): Promise<string>;
  findByWalletId(walletId: string, trx: Knex.Transaction, options?: PaginationOptions): Promise<LedgerEntryRecord[]>;
  countByWalletId(walletId: string, trx: Knex.Transaction): Promise<number>;
}
```

```typescript
export interface IUserRepository {
  createUser(params: CreateUserParams, trx: Knex.Transaction): Promise<UserRecord>;
  findById(userId: string, trx: Knex.Transaction): Promise<UserRecord | null>;
  findByEmail(email: string, trx: Knex.Transaction): Promise<UserRecord | null>;
  findByBvn(bvn: string, trx: Knex.Transaction): Promise<UserRecord | null>;
  emailExists(email: string, trx: Knex.Transaction): Promise<boolean>;
  verifyPassword(userId: string, password: string, trx: Knex.Transaction): Promise<boolean>;
  // ...
}
```

**Benefits of interface-based DI:**
- **Testability**: Services can be unit-tested with in-memory mock repositories without touching the database or loading any Knex driver.
- **Portability**: The repository implementation can be swapped (e.g., for a different database dialect) without changing service code.
- **Clarity**: The exact contract each repository must fulfill is explicit and checked by the TypeScript compiler at compile time.
- **No runtime magic**: Dependencies are resolved at construction time, making the codebase fully auditable without reflection or decorators.

---

### 2.2 The Physics Metaphor: Financial Integrity Laws

The Wallet Engine is governed by three immutable physical laws of money that are enforced at the code level:

#### Law 1: Conservation of Value

> **The total monetary value in the system is conserved across every transaction. Money is neither created nor destroyed — it moves.**

Enforced by:
- Every `processTransfer()` call creates a paired DEBIT entry on the sender's wallet and a paired CREDIT entry on the receiver's wallet with identical amounts.
- The `calculateAuditBalance()` reconciliation engine sums all ledger entries for a wallet and compares the aggregate to the cached `wallets.balance` field. Any mismatch triggers a CRITICAL alarm.
- `Decimal.js` is used for all monetary arithmetic, ensuring that `0.1 + 0.2 === 0.3` (unlike IEEE 754 floating-point).

```typescript
public async calculateAuditBalance(walletId: number): Promise<ReconciliationResult> {
  const ledgerSumResult = await this.ledgerRepository.sumByWalletId(walletId, mockTrx);
  const ledgerSum = new Decimal(ledgerSumResult);
  const cachedBalance = new Decimal(wallet.balance);
  const discrepancy = ledgerSum.minus(cachedBalance).abs();
  const isBalanced = discrepancy.lessThan('0.0001'); // 0.0001 tolerance for DECIMAL(20,4)

  if (!isBalanced) {
    ErrorLogger.log('fatal', 'CRITICAL: Wallet balance mismatch detected - possible data corruption',
      new Error('RECONCILIATION_FAILURE'), {
        walletId,
        ledgerSum: ledgerSum.toFixed(4),
        cachedBalance: cachedBalance.toFixed(4),
        discrepancy: discrepancy.toFixed(4),
        severity: 'CRITICAL',
        alertType: 'BALANCE_MISMATCH',
        requiresInvestigation: true,
      }
    );
  }
}
```

#### Law 2: Atomic Ledger Transitions

> **No balance mutation completes without a corresponding, permanent ledger entry. Ledger entries are append-only and immutable.**

Enforced by:
- The `wallets` table has **no UPDATE trigger** for balance changes in the application layer — all balance mutations flow through the repository which creates a ledger entry alongside any balance update.
- Ledger entries use a custom PostgreSQL enum type `ledger_entry_type` with values `'DEBIT'` and `'CREDIT'`.
- The `ledger_entries` table uses `ON DELETE RESTRICT` on the `wallet_id` foreign key, preventing deletion of a wallet while audit entries exist.

```typescript
// In processTransfer():
await this.walletRepository.decrementBalance(senderWalletId, normalizedAmount, trx);
await this.walletRepository.incrementBalance(receiverWalletId, normalizedAmount, trx);

const debitEntry = await this.ledgerRepository.createEntry({
  walletId: senderWalletId,
  amount: normalizedAmount,
  type: LedgerEntryType.DEBIT,
  description: `Transfer to user ${receiverUserId} | Ref: ${transactionRef}`,
}, trx);

const creditEntry = await this.ledgerRepository.createEntry({
  walletId: receiverWalletId,
  amount: normalizedAmount,
  type: LedgerEntryType.CREDIT,
  description: `Transfer from user ${senderUserId} | Ref: ${transactionRef}`,
}, trx);
```

#### Law 3: Pessimistic Locking with Deterministic Ordering

> **Concurrent transactions competing for the same wallet resources must acquire locks in a globally deterministic sequence to prevent deadlocks.**

Enforced by:
- `findByUserIdForUpdate()` wraps the wallet SELECT query with PostgreSQL's `FOR UPDATE` clause, acquiring a row-level exclusive lock.
- Before locking, user IDs are sorted: `[firstId, secondId] = senderId < receiverId ? [senderId, receiverId] : [receiverId, senderId]`.
- This ensures that whichever direction the transfer flows (A→B or B→A), both transactions will always lock user A's wallet first, then user B's wallet — **never in reverse order**.

```typescript
// Deterministic lock ordering - always lock the lower user ID first
const [firstUserId, secondUserId] = senderUserId < receiverUserId
  ? [senderUserId, receiverUserId]
  : [receiverUserId, senderUserId];

const firstWallet = await this.walletRepository.findByUserIdForUpdate(firstUserId, trx);
const secondWallet = await this.walletRepository.findByUserIdForUpdate(secondUserId, trx);
```

This eliminates database deadlocks because **two concurrent transfers between the same two users (simultaneous A→B and B→A) will never attempt to lock wallets in opposite directions**.

---

## 3. Advanced Caching Patterns

### 4.1 AntiSpamCache: Internal Memory-Map Cache

The `AntiSpamCache` is a lightweight, in-process TTL cache embedded within the `BlacklistModule`. It intercepts registration retry loops by caching negative (clean) identity verification results.

#### Cache Mechanics

| Property | Value |
|----------|-------|
| Data Structure | `Map<string, CacheEntry>` |
| Key Strategy | BVN (Bank Verification Number) — the identity anchor |
| Default TTL | 5 minutes (300,000 ms) |
| Auto-purge Interval | 60 seconds |
| Blacklisted entries | Never cached (immediate rejection) |

```typescript
interface CacheEntry {
  result: AdjutorBvnVerificationResult;
  expiresAt: number;
}

class AntiSpamCache {
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly ttl: number;

  constructor(ttlMs: number = CACHE_TTL_MS) {
    this.ttl = ttlMs;
    this.startCleanupInterval(); // Auto-purges every 60s
  }

  public set(request: IdentityVerificationRequest, result: AdjutorBvnVerificationResult): void {
    if (result.isBlacklisted) return; // NEVER cache blacklisted results
    const key = request.bvn;
    this.cache.set(key, { result, expiresAt: Date.now() + this.ttl });
  }

  public get(request: IdentityVerificationRequest): AdjutorBvnVerificationResult | null {
    const entry = this.cache.get(request.bvn);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(request.bvn);
      return null;
    }
    return entry.result;
  }
}
```

#### Cache Flow

```
Registration Request arrives for BVN: "12345678901"
         │
         ▼
┌─ Check AntiSpamCache.get(bvn) ───────────────┐
│                                               │
│  ┌─ CACHE HIT ─────────────────────────────┐  │
│  │  Result is returned immediately         │  │
│  │  No external network call made          │  │
│  │  AntiSpamCache stat incremented         │  │
│  └─────────────────────────────────────────┘  │
│                                               │
│  ┌─ CACHE MISS ─────────────────────────────┐  │
│  │  CircuitBreaker.fire(request) fired    │  │
│  │                                       │  │
│  │  ┌─ ADJUTOR API CALL ───────────────┐  │  │
│  │  │                                 │  │  │
│  │  │ Blacklisted?                    │  │  │
│  │  │   YES → throw ForbiddenException │  │  │
│  │  │          (NOT cached)           │  │  │
│  │  │   NO  → store in AntiSpamCache   │  │  │
│  │  │          TTL: 5 minutes         │  │  │
│  │  │          Return result          │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └─────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

#### Why BVN is the Cache Key

BVN (Nigerian Bank Verification Number) is the primary identity anchor used by the Adjutor Karma API. Every verification request contains a BVN, making it the natural cache key. If a user retries registration within 5 minutes of a clean verification, the second attempt is served from cache without any external network call.

#### Auto-Purge Mechanism

The cleanup interval runs every 60 seconds and removes all expired entries:

```typescript
private startCleanupInterval(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }, 60_000);
}
```

### 3.2 Circuit Breaker: Opossum Integration

The `BlacklistModule` wraps the `AdjutorProvider` behind an **Opossum Circuit Breaker** to prevent cascading failures when the external identity verification service degrades.

#### Circuit Breaker Configuration

| Parameter | Value | Source |
|----------|-------|--------|
| `timeout` | 3000ms | `CIRCUIT_BREAKER_TIMEOUT` |
| `errorPercentageThreshold` | 50% | `CIRCUIT_BREAKER_ERROR_PERCENTAGE_THRESHOLD` |
| `volumeThreshold` | 5 | `CIRCUIT_BREAKER_VOLUME_THRESHOLD` |
| `resetTimeout` | 60,000ms | Auto-assigned |
| Pool Mode | Transaction | PgBouncer config |

#### Circuit Breaker State Machine

```
                    ┌──────────────────────────────────────────┐
                    │           Circuit Breaker States            │
                    └──────────────────────────────────────────┘

    ┌─────────────┐         Success                  ┌─────────────┐
    │   CLOSED    │◄─────────────────────────────────►│   HALF_OPEN │
    │             │                                   │             │
    │ Normal      │  Failure rate    5 failures        │ Probing:    │
    │ operation   │  hits 50% AND   ─────────────────►│ 1 test call│
    │ requests   │  volume ≥ 5       threshold       │ allowed     │
    │ flow thru  │                                   │             │
    └─────────────┘                                   └──────┬──────┘
                                                                 │
                                               Success            │
                                               threshold          │ Failure
                                               met                │ reached
                                                                 │
                                                                 ▼
                                                         ┌─────────────┐
                                                         │    OPEN    │
                                                         │             │
                                                         │ All calls   │  resetTimeout
                                                         │ instantly   │  (60s) elapsed
                                                         │ rejected    │
                                                         │             │
                                                         └──────┬──────┘
                                                                │
                                                         After resetTimeout,
                                                                │
                                                                ▼
                                                         ┌─────────────┐
                                                         │  HALF_OPEN  │
                                                         │             │
                                                         │  (probing)  │
                                                         └─────────────┘
```

#### Circuit Breaker Fallback

When the circuit is OPEN (service is failing), the fallback function throws a `ServiceUnavailableException` that propagates through the global error handler:

```typescript
this.breaker.fallback(() => {
  throw new ServiceUnavailableException(
    'Identity verification service is temporarily unavailable due to high error rates. Please try again in a few moments.',
    this.serviceName,
    this.resetTimeout
  );
});
```

#### Statistics Tracking

The `BlacklistModule` maintains internal stats for observability:

```typescript
private readonly breakerStats: BreakerStats = {
  enabled: true,
  name: 'AdjutorKarmaCircuitBreaker',
  circuit: 'CLOSED',
  stats: {
    fires: 0,        // Total calls attempted
    successes: 0,   // Successful external calls
    failures: 0,    // Failed external calls
    timeouts: 0,    // Timed-out calls
    cacheHits: 0,   // Cache served hits
    cacheMisses: 0, // Cache misses
    opens: 0,        // Times breaker transitioned to OPEN
    fallbacks: 0,   // Times fallback was triggered
    rejects: 0,     // Calls rejected while OPEN
  },
};
```

---

## 4. Rate Limiting Implementation

The Wallet Engine implements Express-level traffic policing through a combination of custom middleware patterns and security header enforcement.

### 4.1 Request Throttling Architecture

Rate limiting is implemented as Express middleware that inspects the `Authorization` Bearer token (user ID) as the rate-limiting identity:

```typescript
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req.headers['authorization'] as string);
  if (!token) {
    throw new ForbiddenException('Missing or malformed Authorization header.', 'MISSING_AUTH_TOKEN');
  }
  const userId = parseUserId(token);
  if (userId === null) {
    throw new ForbiddenException('Invalid token format.', 'INVALID_AUTH_TOKEN');
  }
  req.user = { id: userId, email: '', bvn: '' };
  next();
}
```

### 4.2 Token Bucket Rate Limiting Strategy

The system uses a **token bucket model** where each user (identified by `userId` from the Bearer token) has a bucket that refills at a defined rate. The rate limiter middleware would be configured as follows (for integration into `app.ts`):

| Endpoint | Rate Limit | Window | Identifier |
|----------|-----------|--------|------------|
| `POST /api/v1/users/register` | 3 requests | per minute | IP address + BVN |
| `POST /api/v1/users/authenticate` | 10 requests | per minute | Email |
| `POST /api/v1/wallet/transfer` | 20 requests | per minute | `Authorization: Bearer <user_id>` |
| `GET /api/v1/wallet/balance` | 60 requests | per minute | `Authorization: Bearer <user_id>` |
| `GET /api/v1/wallet/reconcile` | 5 requests | per minute | `Authorization: Bearer <user_id>` |
| All other endpoints | 100 requests | per minute | IP address |

### 5.3 Heavy Transaction Spike Handling

For `/transfer` endpoints, the system handles brute-force transaction spikes through:

1. **Bearer Token Validation First**: Every transfer request must pass the `authMiddleware` before any business logic runs. Invalid or missing tokens are rejected immediately with HTTP 403, preventing unauthorized request volume from consuming transfer processing slots.

2. **Pessimistic Locking**: The `SELECT ... FOR UPDATE` on wallet rows serializes concurrent transfers involving the same wallet. Even if 100 concurrent transfers attempt to debit the same wallet, the database queue serializes them, ensuring no overdraft occurs.

3. **InsufficientFundsException Early Exit**: When a wallet has insufficient balance, the transaction is rolled back immediately at the database level without completing the full transfer workflow. This releases the lock quickly, allowing the next queued transfer to proceed.

4. **PgBouncer Transaction Mode**: PgBouncer in transaction mode (`pool_mode = transaction`) multiplexes hundreds of application connections over a small pool of real database connections. This means even under heavy spike traffic (e.g., 10,000 concurrent transfer requests), the system does not create 10,000 simultaneous database connections — PgBouncer queues them on ~20 real connections, preventing connection exhaustion.

```yaml
# PgBouncer transaction mode configuration
wallet-pgbouncer:
  environment:
    POOL_MODE: transaction
    MAX_CLIENT_CONN: "200"
    DEFAULT_POOL_SIZE: "20"
    MIN_POOL_SIZE: "5"
    RESERVE_POOL_SIZE: "5"
    RESERVE_POOL_TIMEOUT: "5"
    MAX_DB_CONNECTIONS: "100"
    SERVER_LIFETIME: "3600"
    SERVER_IDLE_TIMEOUT: "600"
```

### 4.4 Security Header Enforcement

All HTTP responses are decorated with security headers to prevent browser-based attacks:

```typescript
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('X-XSS-Protection', '1; mode=block');
res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
res.setHeader('Pragma', 'no-cache');
```

### 4.5 CORS Configuration

Cross-Origin Resource Sharing is restricted to known development origins:

```typescript
const allowedOrigins = ['http://localhost:3000', 'http://localhost:8080'];
if (allowedOrigins.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
}
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, X-Idempotency-Key');
res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID');
res.setHeader('Access-Control-Max-Age', '86400');
```

---

## 5. Process Lifecycle & Graceful Cleanup

### 5.1 Server Startup Sequence

```
Server.start()
       │
       ├── createApplication() ──► new Application()
       │    │
       │    ├── setupMiddleware() ──► body-parser, security headers, CORS, request logging
       │    │
       │    ├── setupRoutes() ──► mounts /api/v1/wallet, /api/v1/users, /health, /ready
       │    │
       │    └── setupErrorHandling() ──► global error handler, unhandled rejection handlers
       │
       ├── app.listen(config.port)
       │
       ├── logger.info('Wallet Engine started successfully')
       │
       └── setupShutdownHandlers() ──► registers SIGTERM, SIGINT, SIGUSR2 listeners
```

### 5.2 Graceful Shutdown State Machine

The graceful shutdown is driven by a 5-phase sequential pipeline triggered by any termination signal (`SIGTERM`, `SIGINT`, `SIGUSR2`):

```
Signal received (SIGTERM | SIGINT | SIGUSR2)
              │
              ▼
    ┌─ Duplicate Signal Guard ─┐
    │  if (isShuttingDown)      │
    │    return;                │  (Ignores duplicate signals)
    │  isShuttingDown = true    │
    └───────────────────────────┘
              │
              ▼
    ┌─ Start 30s Failsafe ─┐
    │  setTimeout(() =>     │
    │    process.exit(1),  │  (Forces exit if cleanup hangs)
    │    30000)             │
    └───────────────────────┘
              │
              ▼
    ┌─ Phase 1: closeConnections() ────────────────────────────────┐
    │  server.close((err?) => {                                    │
    │    // Stops accepting new HTTP connections                  │
    │    // Waits for in-flight requests to complete              │
    │    // Logs any close errors                                  │
    │  })                                                          │
    └───────────────────────────────────────────────────────────────┘
              │
              ▼
    ┌─ Phase 2: closeDatabasePool() ─────────────────────────────┐
    │  await db.destroy()                                          │
    │  // Closes all Knex connection pool sockets                 │
    │  // Returns connections to PgBouncer                         │
    │  // PgBouncer returns them to PostgreSQL                    │
    └──────────────────────────────────────────────────────────────┘
              │
              ▼
    ┌─ Phase 3: shutdownModules() ───────────────────────────────┐
    │  await blacklistModule.shutdown()                            │
    │  // breaker.close() - stops accepting new calls             │
    │  // cache.clear() - empties AntiSpamCache                   │
    │  // Logs final telemetry                                     │
    └──────────────────────────────────────────────────────────────┘
              │
              ▼
    ┌─ Phase 4: closeServer() ────────────────────────────────────┐
    │  server.close((err?) => {                                   │
    │    // Final server socket cleanup                            │
    │  })                                                          │
    └──────────────────────────────────────────────────────────────┘
              │
              ▼
    ┌─ Clear Failsafe Timeout ─┐
    │  clearTimeout(timeoutId) │
    └───────────────────────────┘
              │
              ▼
    ┌─ process.exit(0) ─┐
    │  Clean zero-exit  │
    │  termination      │
    └───────────────────┘
```

### 6.3 PgBouncer Connection Drain Sequence

When `db.destroy()` is called, the following sequence occurs at the infrastructure level:

```
Knex Connection Pool (Node.js)
  └─ Acquires all active connections
  └─ Executes any pending queries (with timeout)
  └─ Closes each connection socket

PgBouncer (Transaction Mode)
  └─ Sees connections close
  └─ Returns slots to available pool
  └─ Decrements active connection count
  └─ Does NOT close real database connections (pooled)

PostgreSQL (wallet-db)
  └─ Detects socket closure from PgBouncer
  └─ Backend process terminates cleanly
  └─ No orphaned connections
  └─ Connection slot freed in max_connections
```

### 5.4 Pino Diagnostic Telemetry During Shutdown

Every phase of shutdown emits structured logging via pino:

```typescript
logger.info({ service: 'WalletEngine', signal }, 
  'Received SIGTERM signal - initiating graceful shutdown');

ErrorLogger.log('info', 'Graceful shutdown initiated', new Error('shutdown_initiated'), {
  service: this.serviceName,
  signal,
});

logger.info({ service: 'WalletEngine' }, 'Closing active server connections...');
await this.closeConnections();

logger.info({ service: 'WalletEngine' }, 'Closing database connection pool...');
await this.closeDatabasePool();

logger.info({ service: 'WalletEngine' }, 'Shutting down modules...');
await this.shutdownModules();

logger.info({ service: 'WalletEngine', exitCode: 0 }, 
  'Graceful shutdown completed successfully');

process.exit(0);
```

---

## 7. Module Reference

### 6.1 Application Module (`app.ts`)

| Method | Purpose |
|--------|---------|
| `constructor()` | Creates Express app, calls setup methods |
| `setupMiddleware()` | Applies 9 layers: request ID, body parsers, security headers, CORS, logging |
| `setupRoutes()` | Mounts `/api/v1/wallet`, `/api/v1/users`, `/health`, `/ready`, `/health` HEAD |
| `setupErrorHandling()` | Global error handler, JSON parse error, unhandled rejection/exception handlers |
| `getApp()` | Returns the Express instance |

### 6.2 Server Module (`server.ts`)

| Method | Purpose |
|--------|---------|
| `start()` | Creates app, binds HTTP server, sets up error handlers |
| `setupShutdownHandlers()` | Registers SIGTERM, SIGINT, SIGUSR2 listeners |
| `initiateGracefulShutdown(signal)` | 5-phase sequential shutdown pipeline |
| `closeConnections()` | Wraps `server.close()` in Promise |
| `closeDatabasePool()` | Calls `db.destroy()` with error handling |
| `shutdownModules()` | Calls `blacklistModule.shutdown()` |
| `closeServer()` | Final `server.close()` wrapper |
| `handleServerError(error)` | Handles `EADDRINUSE`, `EACCES` with process.exit |

### 6.3 Blacklist Module (`blacklist.module.ts`)

| Method | Purpose |
|--------|---------|
| `verify(request)` | Main entry: cache check → circuit breaker fire → cache result |
| `getCacheSize()` | Returns `AntiSpamCache` size |
| `clearCache()` | Clears the cache |
| `isBreakerOpen()` | Returns whether breaker is in OPEN state |
| `healthCheck()` | Returns `{ healthy, breakerState, cacheSize }` |
| `shutdown()` | Closes breaker, clears cache, logs telemetry |

### 6.4 Wallet Service (`wallet.service.ts`)

| Method | Purpose |
|--------|---------|
| `processTransfer(senderUserId, receiverUserId, rawAmount)` | Deterministic lock ordering, kobo-based decimal validation, atomic balance mutation, dual ledger entries |
| `calculateAuditBalance(walletId)` | Sums ledger, compares to cached balance, logs CRITICAL on mismatch |
| `getWalletBalance(userId)` | Returns balance for user |
| `getOrCreateWallet(userId)` | Lazy wallet creation with `0` initial balance |
| `processFund(userId, rawAmount)` | Wallet funding with credit ledger entry |
| `processWithdrawal(userId, rawAmount)` | Wallet withdrawal with debit ledger entry |

### 6.5 User Service (`user.service.ts`)

| Method | Purpose |
|--------|---------|
| `registerUser(params)` | Full orchestration: compliance gate → duplicate check → user creation → wallet creation |
| `getUserById(userId)` | Returns user profile by UUID |
| `getUserByEmail(email)` | Returns user by email |
| `authenticateUser(email, password)` | Password verification via bcrypt, returns JWT + refresh token |

---

## 7. Database Schema & Migrations

### 7.1 Entity Relationship Diagram

```
┌─────────────────────┐         ┌─────────────────────┐         ┌─────────────────────────────┐
│       users         │         │      wallets        │         │      ledger_entries         │
│                     │         │                     │         │                             │
│ id (PK, UUID)       │◄─────── │ id (PK, UUID)       │◄─────── │ id (PK, UUID)               │
│ email (UNIQUE)     │    1:1   │ user_id (FK, UUID)  │    1:N   │ wallet_id (FK, UUID)       │
│ bvn (UNIQUE)       │         │ balance (DECIMAL)    │         │ amount (DECIMAL 20,4)       │
│ password_hash      │         │ created_at           │         │ type (ENUM: DEBIT|CREDIT)   │
│ created_at          │         │ updated_at           │         │ description                 │
│ updated_at          │         │                     │         │ created_at                  │
└─────────────────────┘         └─────────────────────┘         └─────────────────────────────┘
     ON DELETE CASCADE           ON DELETE RESTRICT                ON DELETE RESTRICT
```

Note: All primary and foreign keys now use UUID (v4) instead of auto-incrementing integers (SERIAL). The `wallets.user_id` foreign key references `users.id` with `ON DELETE CASCADE`, and `ledger_entries.wallet_id` references `wallets.id` with `ON DELETE RESTRICT`.

### 7.2 Migration Scripts

#### Migration 1: `20250601000001_create_users_table.ts`

Creates the `users` table with email and BVN uniqueness constraints using UUID primary keys.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT UUID()` | UUID v4 generated by MySQL |
| `email` | `VARCHAR(255)` | `NOT NULL UNIQUE` | Case-insensitive via index |
| `bvn` | `VARCHAR(11)` | `NOT NULL UNIQUE` | Nigerian BVN (11 digits) |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` | bcrypt (12 rounds) |
| `created_at` | `DATETIME(6)` | `NOT NULL DEFAULT CURRENT_TIMESTAMP(6)` | Microsecond precision |
| `updated_at` | `DATETIME(6)` | `NOT NULL DEFAULT CURRENT_TIMESTAMP(6)` | Updated on modification |

**Indexes:**
- `idx_users_email ON users ((lower(email::text)))` — Case-insensitive email lookup
- `idx_users_bvn ON users (bvn)` — BVN direct lookup

#### Migration 2: `20250601000002_create_wallets_table.ts`

Creates the `wallets` table with 1:1 relationship to users using UUID foreign keys.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT UUID()` | UUID v4 generated by MySQL |
| `user_id` | `UUID` | `NOT NULL UNIQUE`, `REFERENCES users(id) ON DELETE CASCADE` | 1 wallet per user |
| `balance` | `DECIMAL(20,4)` | `NOT NULL DEFAULT '0.0000'` | 20 total digits, 4 decimal places |
| `created_at` | `DATETIME(6)` | `NOT NULL DEFAULT CURRENT_TIMESTAMP(6)` | Microsecond precision |
| `updated_at` | `DATETIME(6)` | `NOT NULL DEFAULT CURRENT_TIMESTAMP(6)` | Updated on modification |

**Indexes:**
- `idx_wallets_user_id ON wallets (user_id)` — User-to-wallet lookup

**Key Design Decision**: `ON DELETE CASCADE` means deleting a user also deletes their wallet. This is intentional — user account removal triggers wallet cleanup.

#### Migration 3: `20250601000003_create_ledger_entries_table.ts`

Creates the `ledger_entries` table with double-entry bookkeeping using UUID foreign keys.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT UUID()` | UUID v4 generated by MySQL |
| `wallet_id` | `UUID` | `NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT` | Links to wallet |
| `amount` | `DECIMAL(20,4)` | `NOT NULL` | Exact decimal (no rounding) |
| `type` | `ENUM('DEBIT', 'CREDIT')` | `NOT NULL` | DEBIT or CREDIT |
| `description` | `VARCHAR(255)` | `NOT NULL` | Audit description with transaction reference |
| `created_at` | `DATETIME(6)` | `NOT NULL DEFAULT CURRENT_TIMESTAMP(6)` | Immutable timestamp |

**Indexes:**
- `idx_ledger_entries_wallet_created ON ledger_entries (wallet_id, created_at)` — Composite index for paginated ledger history queries

**Key Design Decision**: `ON DELETE RESTRICT` on `wallet_id` prevents deletion of a wallet that still has ledger entries, enforcing the **Conservation of Value** law at the database level.

### 7.3 Decimal Precision

All monetary fields use `DECIMAL(20,4)` — 20 total digits, 4 decimal places. This provides:

- **Range**: Up to `99,999,999,999,999,999.9999` (approximately 100 quadrillion)
- **Precision**: Exactly 4 decimal places (0.0001 precision, equivalent to 1/10,000 of the base currency unit)
- **No rounding errors**: Unlike `FLOAT` or `DOUBLE`, `DECIMAL` arithmetic is exact in SQL
- **Decimal.js alignment**: Both PostgreSQL `DECIMAL(20,4)` and `Decimal.js` use the same 4-decimal precision, preventing cross-boundary precision loss

---

## 8. Infrastructure Configuration

### 8.1 Docker Compose Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    wallet_network (bridge)                       │
│                     172.28.0.0/16 subnet                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    wallet-db                              │  │
│  │              postgres:15-alpine                            │  │
│  │              Port: 5433 (host)                           │  │
│  │              Internal: 5432                               │  │
│  │              max_connections: 200                          │  │
│  │              shared_buffers: 128MB                        │  │
│  │              healthcheck: pg_isready                       │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                             │                                     │
│                      Port: 5432                                   │
│                       (internal)                                   │
│                             │                                     │
│  ┌──────────────────────────▼─────────────────────────────────┐  │
│  │                  wallet-pgbouncer                           │  │
│  │                 edoburu/pgbouncer:1.22                     │  │
│  │                 Port: 5432 (host)                          │  │
│  │                 pool_mode: transaction                     │  │
│  │                 max_client_conn: 200                         │  │
│  │                 default_pool_size: 20                       │  │
│  │                 healthcheck: pgbouncer -V                   │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                             │                                     │
│                      Port: 5432                                   │
│                    (exposed to host)                              │
│                             │                                     │
│                    Node.js Application                           │
│                    (connects here)                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 PgBouncer Pool Configuration

| Parameter | Value | Implication |
|-----------|-------|-------------|
| `pool_mode` | `transaction` | Connections are only held during a transaction, maximizing multiplexing |
| `max_client_conn` | `200` | Up to 200 application-level connections can connect to PgBouncer |
| `default_pool_size` | `20` | Each user/database pair gets 20 real PostgreSQL connections |
| `min_pool_size` | `5` | PgBouncer maintains at least 5 connections even when idle |
| `reserve_pool_size` | `5` | Extra connections available for burst traffic |
| `reserve_pool_timeout` | `5s` | Extra connections returned after 5 seconds of idle |
| `max_db_connections` | `100` | Maximum connections per database across all pools |
| `server_lifetime` | `3600s` | Real connections rotated every hour |
| `server_idle_timeout` | `600s` | Idle connections closed after 10 minutes |
| `server_connect_query` | `SELECT 1` | Connection health check on acquire |

### 8.3 Node.js → PgBouncer Connection Flow

```
Application Layer
  │
  ├─ Knex.js Connection Pool (min=2, max=10)
  │    ├─ Manages up to 10 logical connections in-process
  │    ├─ acquireTimeoutMillis: 10000 (10s to get a connection)
  │    └─ afterCreate: SET datestyle, timezone, client_encoding, lock_timeout
  │
  └─► TCP: localhost:5432 ──► PgBouncer (wallets-pgbouncer:5432)
       │
       ├─► max_client_conn: 200
       │    └─ Up to 200 application connections multiplexed
       │
       └─► default_pool_size: 20
            └─► Real PostgreSQL connections: 20
                 └─► Database: wallet_engine
                      └─► max_connections: 200 (PostgreSQL setting)
```

### 8.4 PostgreSQL Tuning Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `max_connections` | 200 | Total backend processes |
| `shared_buffers` | 128MB | Memory for caching relation data |
| `effective_cache_size` | 256MB | Planner's estimate of available cache |
| `work_mem` | 4MB | Memory per sort/hash operation |
| `maintenance_work_mem` | 64MB | Memory for VACUUM, CREATE INDEX |
| `random_page_cost` | 1.1 | SSD-friendly sequential scan preference |
| `effective_io_concurrency` | 200 | Parallel I/O for bitmap scans |
| `max_worker_processes` | 8 | Parallel query parallelism |
| `max_parallel_workers_per_gather` | 4 | Workers per parallel node |
| `statement_timeout` | 30s | Hard query timeout |
| `lock_timeout` | 10s | Lock wait timeout |
| `deadlock_timeout` | 1s | Deadlock detection interval |
| `idle_in_transaction_session_timeout` | 60s | Auto-rollback of idle transactions |
| `full_page_writes` | off | PostgreSQL 15 optimization |
| `wal_compression` | off | PostgreSQL 15 optimization |

---

## 9. Security & Observability

### 9.1 Security Controls Matrix

| Control | Category | Implementation |
|---------|----------|---------------|
| Bearer Token Auth | Authentication | `authMiddleware` parses `Authorization: Bearer <user_id>` |
| Blacklist Compliance Gate | Compliance | `BlacklistModule.verify()` before user registration |
| bcrypt Password Hashing | Credential Storage | 12 rounds, prevents rainbow table attacks |
| CORS Restriction | Client Policy | Whitelist-based origin checking |
| Security Headers | Browser Protection | HSTS, X-Frame-Options, X-Content-Type-Options, CSP |
| SQL Injection Prevention | Data Access | Parameterized queries via Knex query builder |
| Decimal Arithmetic | Financial Integrity | `Decimal.js` — no floating-point rounding errors |
| FOR UPDATE Locking | Concurrency | Pessimistic locks prevent double-spending |
| Circuit Breaker | Resilience | Opossum prevents cascading failures to external API |

### 9.2 Pino Structured Logging Format

Every log entry uses pino's structured JSON format with consistent telemetry fields:

```typescript
logger.info({
  service: 'WalletEngine',
  port: 3000,
  nodeEnv: 'production',
  pid: 12345,
  timestamp: '2026-05-20T09:55:00.000Z',
}, 'Wallet Engine started successfully');
```

#### Error Log Format

```json
{
  "level": "error",
  "time": "2026-05-20T09:55:00.000Z",
  "service": "wallet-engine",
  "version": "1.0.0",
  "error": {
    "type": "DOMAIN_EXCEPTION",
    "errorCode": "INSUFFICIENT_FUNDS",
    "statusCode": 400,
    "message": "Insufficient funds in sender's wallet.",
    "timestamp": "2026-05-20T09:55:00.000Z",
    "stack": "..."
  },
  "service": "WalletService",
  "transactionRef": "TXN-1716194100123-abc12345",
  "senderUserId": 100,
  "receiverUserId": 200,
  "amount": "100.0000"
}
```

#### CRITICAL Alert Log (Reconciliation Failure)

```json
{
  "level": "fatal",
  "time": "2026-05-20T09:55:00.000Z",
  "service": "wallet-engine",
  "error": {
    "type": "DOMAIN_EXCEPTION",
    "errorCode": "RECONCILIATION_FAILURE",
    "statusCode": 500,
    "message": "CRITICAL: Wallet balance mismatch detected - possible data corruption",
    "timestamp": "2026-05-20T09:55:00.000Z",
    "stack": "..."
  },
  "walletId": 1,
  "ledgerSum": "990.0000",
  "cachedBalance": "1000.0000",
  "discrepancy": "10.0000",
  "severity": "CRITICAL",
  "alertType": "BALANCE_MISMATCH",
  "requiresInvestigation": true
}
```

### 9.3 Health & Readiness Endpoints

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/health` | GET | Liveness probe | `200 OK` with uptime, memory, PID |
| `/health` | HEAD | Lightweight liveness | `200 OK` no body |
| `/ready` | GET | Readiness probe | `200 OK` checks DB + circuit breaker |
| `/ready` | HEAD | Lightweight readiness | `200 OK` no body |

### 9.4 Prometheus Metrics and Runtime Telemetry

The application exposes a Prometheus scrape endpoint at `/metrics`.
This endpoint serves:

- default Node.js and process metrics collected by `prom-client`
- HTTP request duration histograms
- active request gauge counts
- total request counts by method, route, and status code
- wallet transaction counters labelled by transaction type (`fund`, `transfer`, `withdraw`)

The `/metrics` endpoint is implemented in `src/app.ts` using a shared `prom-client` registry from `src/common/telemetry/metrics.ts`.

This enables any Prometheus-compatible monitoring stack to scrape the service and correlate business throughput with system health.

---

## 11. Testing Strategy

### 11.1 Unit Testing: Zero-Database Pattern

All unit tests use **interface-based in-memory test doubles** that fully implement the repository interfaces without loading any database driver or opening network connections:

```typescript
class InMemoryWalletRepository implements IWalletRepository {
  private readonly wallets: Map<number, WalletSnapshot> = new Map();

  async findByUserIdForUpdate(userId: number, _trx: Knex.Transaction): Promise<WalletSnapshot | null> {
    // Pure TypeScript implementation — no Knex, no network
  }
  async decrementBalance(walletId: number, amount: string, _trx: Knex.Transaction): Promise<void> {
    // In-memory balance mutation
  }
}
```

**Benefits:**
- Tests run in milliseconds (no database startup)
- No external dependencies required for CI/CD
- 100% deterministic results
- Complete control over test data state
- Interface contract compliance verified by TypeScript compiler

### 10.2 Unit Test Coverage Areas

| Test Suite | File | Coverage |
|------------|------|----------|
| WalletService Transfer Success | `wallet.service.test.ts` | Successful transfers between two users |
| WalletService Insufficient Balance | `wallet.service.test.ts` | `InsufficientFundsException` thrown, transaction not committed |
| WalletService Input Validation | `wallet.service.test.ts` | Invalid user IDs, self-transfer, zero/negative amounts |
| WalletService Decimal Precision | `wallet.service.test.ts` | Micro-amount transfers, large amounts |
| WalletService Lock Ordering | `wallet.service.test.ts` | Deterministic ID ordering verified |
| Reconciliation Balanced | `wallet.service.test.ts` | Ledger sum matches cached balance |
| Reconciliation Mismatch | `wallet.service.test.ts` | CRITICAL log emitted on discrepancy |
| Interface Contract Compliance | `wallet.service.test.ts` | `IWalletRepository` and `ILedgerRepository` satisfied by in-memory doubles |

### 10.3 Integration Testing: Supertest HTTP Tests

Integration tests run against the live Express application (with mocked database layer) using `supertest`:

```typescript
const response = await request(app)
  .post('/api/v1/users/register')
  .set('Content-Type', 'application/json')
  .send(validUserPayload);

expect(response.status).toBe(201);
expect(response.body.status).toBe('success');
expect(response.body.data.userId).toBeDefined();
```

**Key Scenarios Covered:**
| Scenario | Expected Response |
|----------|-------------------|
| Clean user registration | `201 Created` |
| Blacklisted user (watch_list=true) | `403 Forbidden`, code: `USER_BLACKLISTED` |
| Blacklisted user (fraud_suspected=true) | `403 Forbidden`, code: `USER_BLACKLISTED` |
| Service unavailable (circuit breaker open) | `503 Service Unavailable`, code: `SERVICE_UNAVAILABLE` |
| Missing email field | `400 Bad Request`, code: `EMAIL_REQUIRED` |
| Invalid BVN format | `400 Bad Request`, code: `INVALID_BVN_FORMAT` |
| Short password | `400 Bad Request`, code: `PASSWORD_TOO_SHORT` |
| Invalid credentials on login | `401 Unauthorized`, code: `INVALID_CREDENTIALS` |

---

## 11. Scaling to One Million Users

The current architecture supports moderate throughput on a single instance. To reach **1 million active users** with sub-second response times and financial-grade integrity, the following additions are recommended in priority order.

### 11.1 Phase 1: Distributed Caching with Redis (10k–100k users)

| Component | What it replaces | Why |
|-----------|-----------------|-----|
| **Redis** | In-process `AntiSpamCache` | In-memory cache is lost on restart and doesn't scale across instances |
| **Redis Rate Limiter** | In-process token bucket | Rate-limit state must be shared across all app instances |
| **Redis Session Store** | JWT-only auth | Allows instant token revocation, refresh token rotation with atomic TTL |

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Instance 1  │     │  Instance 2  │     │  Instance N  │     │    Redis     │
│              │     │              │     │              │     │   Cluster    │
│ Verdict──────┼─────┤──────────── ┼─────┤──────────────┤     │              │
│ Cache Miss ──┼─────┤──────────── ┼─────┤──────────────┼────►│ AntiSpamCache│
│ Rate Check──┼─────┤──────────── ┼─────┤──────────────┼────►│ Rate Buckets │
│ Refresh─────┼─────┤──────────── ┼─────┤──────────────┼────►│ Token Store  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

**Key migrations:**
- `AntiSpamCache` backed by Redis with 5-min TTL (same semantics, persisted across restarts)
- Rate limiter uses Redis `INCR` + `EXPIRE` with sliding window
- Refresh tokens stored in Redis with auto-expiry for instant revocation

### 11.2 Phase 2: Horizontal Scaling with Load Balancer (100k–500k users)

```
                         ┌─────────────────┐
                         │   AWS ALB / NGINX │
                         │  (SSL termination) │
                         │  (Round-robin /    │
                         │   least-connections)│
                         └────────┬─────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
     ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
     │  App Instance 1 │ │  App Instance 2 │ │  App Instance N │
     │  Node.js:3000   │ │  Node.js:3000   │ │  Node.js:3000   │
     └────────┬───────┘ └────────┬────────┘ └────────┬───────┘
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  ProxySQL /      │
                         │  MySQL Router    │
                         │  (connection pool)│
                         └────────┬─────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
     ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
     │  MySQL Primary  │ │  MySQL Replica │ │  MySQL Replica │
     │  (write)        │ │  (read-only)   │ │  (read-only)   │
     └────────────────┘ └────────────────┘ └────────────────┘
```

**Config changes:**
- Add `DB_REPLICA_HOST`, `DB_REPLICA_USER`, `DB_REPLICA_PASSWORD` env vars
- `config/database.ts` exports separate read/write Knex instances
- Write queries (transfers, funding, registration) → primary
- Read queries (balance checks, ledger history, user lookup) → replicas
- ProxySQL in front of MySQL to handle connection pooling and query routing

### 11.3 Phase 3: Async Processing with Message Queue (500k–1M users)

Offload non-critical and audit-path work from the synchronous HTTP request cycle to background workers.

| Current (sync) | Future (async) | Benefit |
|----------------|---------------|---------|
| Ledger entries created in request transaction | Committed in transaction, then published to queue | Reduces transaction hold time |
| Reconciliation triggered on-demand | Scheduled background job via queue | Removes CPU-heavy audit from request path |
| Email notifications (future) | Dispatched via queue | Prevents external API latency from blocking wallet ops |
| Webhook delivery (future) | Queued delivery with retry | Reliable integration without blocking transfer |

```
HTTP Request ──► Controller ──► WalletService ──► Repository ──► MySQL
                                        │
                                        ▼
                                  ┌──────────┐
                                  │  RabbitMQ │
                                  │  / Redis  │
                                  │  Streams  │
                                  └────┬─────┘
                                       │
                          ┌────────────┼────────────┐
                          │            │            │
                          ▼            ▼            ▼
                    ┌──────────┐ ┌──────────┐ ┌──────────┐
                    │ Ledger   │ │ Recon-   │ │ Webhook  │
                    │ Worker   │ │ ciliation│ │ Worker   │
                    └──────────┘ └──────────┘ └──────────┘
```

**Implementation outline:**
```typescript
// After successful DB commit in processTransfer():
await this.eventBus.publish('wallet.transfer.completed', {
  transactionRef,
  senderWalletId,
  receiverWalletId,
  amount: normalizedAmount,
  debitEntryId,
  creditEntryId,
});
```

### 11.4 Phase 4: Database Optimizations for 1M Users

#### Read-Write Splitting

```typescript
// config/database.ts
const dbConfig = {
  writer: knex({ client: 'mysql2', connection: { host: DB_HOST, ... } }),
  reader: knex({ client: 'mysql2', connection: { host: DB_REPLICA_HOST, ... } }),
};
```

#### Sharding Strategy (if single-writer becomes bottleneck)

| Shard Key | Strategy | Partition Count |
|-----------|----------|----------------|
| `user_id` (UUID) | Consistent hashing modulo N | 4–8 shards initially |
| Wallet lookups | Routed by `user_id` shard key | Auto-rebalance via proxy |

#### Query Optimization Checklist

| Pattern | Optimization | Impact |
|---------|-------------|--------|
| Ledger pagination | Cursor-based (WHERE created_at < ?) instead of OFFSET | Eliminates full table scans on page N |
| Balance reads | Cached in Redis with 1s TTL, invalidated on write | 100x reduction in DB reads |
| User login | bcrypt cost factor tunable per `PASSWORD_SALT_ROUNDS` env var | Tune based on hardware (10–14) |
| Idempotency check | Covered index on (key, expires_at) with TTL-based partition pruning | Blazing-fast dedup lookups |

#### Index Additions for Scale

```sql
-- ledger_entries: wallet_id is already indexed, add created_at for cursor pagination
CREATE INDEX idx_ledger_wallet_created ON ledger_entries (wallet_id, created_at);

-- users: case-insensitive login
CREATE INDEX idx_users_email_lower ON users ((LOWER(email)));

-- idempotency_keys: fast lookup + auto-expire
CREATE INDEX idx_idempotency_lookup ON idempotency_keys (key, expires_at);
```

### 11.5 Phase 5: Observability at Scale

| Tool | Purpose | Why at 1M users |
|------|---------|-----------------|
| **Prometheus + Grafana** | Metrics dashboards | Spot bottlenecks before they become incidents |
| **OpenTelemetry traces** | Distributed tracing | Trace a single transfer across 5+ services |
| **Structured logging with correlation IDs** | Log aggregation (ELK/Loki) | `X-Request-ID` correlates every log line across instances |
| **Synthetic health checks** | External monitoring | Simulate user registration + transfer every 60s from outside the cluster |
| **PagerDuty/On-call** | Alert routing | Reconciliation CRITICALs must page a human |

### 11.6 Cost Estimate for 1M Users

| Tier | Monthly Cost (est.) | Setup |
|------|--------------------|-------|
| **Phase 1** (10k–100k) | $200–$500 | 2× app instances, 1× Redis, 1× MySQL db.r6g.large |
| **Phase 2** (100k–500k) | $1,000–$3,000 | 4–8× app instances, Redis cluster, MySQL primary + 2 replicas |
| **Phase 3** (500k–1M) | $3,000–$8,000 | 10–20× app instances, RabbitMQ cluster, MySQL sharded, CDN |

All costs estimated for AWS us-east-1 (on-demand, no reserved instances). Reserve instances for 30–50% savings.

---

*Document Version: 1.1.0 | Wallet Engine | Built with TypeScript + Node.js + Express + MySQL | Updated for production deployment on Render*