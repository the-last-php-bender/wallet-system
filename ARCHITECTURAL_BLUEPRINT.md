# Scientific Finance Wallet Engine
## Architectural Blueprint & Documentation Manual
### Version 1.2.0 | TypeScript + Node.js + Express + MySQL 8.0

---

## Table of Contents

1. [Architectural Overview](#1-architectural-overview)
2. [Core Architectural Philosophy](#2-core-architectural-philosophy)
3. [Advanced Caching Patterns](#3-advanced-caching-patterns)
4. [Rate Limiting Implementation](#4-rate-limiting-implementation)
5. [Process Lifecycle & Graceful Cleanup](#5-process-lifecycle--graceful-cleanup)
6. [Module Reference](#6-module-reference)
7. [Database Schema & Migrations](#7-database-schema--migrations)
8. [Security & Observability](#8-security--observability)
9. [Testing Strategy](#9-testing-strategy)

---

## 1. Architectural Overview

The Wallet Engine is a high-concurrency, financial-grade transactional system built on a **NestJS-inspired modular architecture** using pure Node.js. It implements a double-entry ledger system with deterministic pessimistic locking, fault-tolerant external service integration, and zero-floating-point monetary arithmetic.

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | ≥20.0.0 |
| Language | TypeScript | 5.5.3 |
| HTTP Framework | Express | 4.19.2 |
| Database | MySQL | 8.0 |
| Query Builder | Knex.js | 3.1.0 |
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
│   │   │   └── metrics.ts             # Prometheus metrics (prom-client)
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
│   ├── migrations/                    # MySQL DDL migration scripts
│   │   ├── 20250601000001_create_users_table.ts
│   │   ├── 20250601000002_create_wallets_table.ts
│   │   ├── 20250601000003_create_ledger_entries_table.ts
│   │   ├── 20250601000004_create_idempotency_keys_table.ts
│   │   └── 20250601000005_harden_db_constraints.ts
│   └── seeds/
│       └── 01_demo_data.ts
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
- JavaScript `bigint` is used for all monetary arithmetic — no floating-point, no decimal libraries, perfect precision.

```typescript
public async calculateAuditBalance(walletId: string): Promise<ReconciliationResult> {
  const ledgerSumResult = await this.ledgerRepository.sumByWalletId(walletId, mockTrx);
  const ledgerSum = BigInt(ledgerSumResult);
  const cachedBalance = BigInt(wallet.balance);
  const discrepancy = ledgerSum > cachedBalance 
    ? ledgerSum - cachedBalance 
    : cachedBalance - ledgerSum;
  const isBalanced = discrepancy === 0n;

  if (!isBalanced) {
    ErrorLogger.log('fatal', 'CRITICAL: Wallet balance mismatch detected - possible data corruption',
      new Error('RECONCILIATION_FAILURE'), {
        walletId,
        ledgerSum: ledgerSum.toString(),
        cachedBalance: cachedBalance.toString(),
        discrepancy: discrepancy.toString(),
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
- Ledger entries use a custom MySQL ENUM type `ledger_entry_type` with values `'DEBIT'` and `'CREDIT'`.
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
- `findByUserIdForUpdate()` wraps the wallet SELECT query with MySQL's `FOR UPDATE` clause, acquiring a row-level exclusive lock.
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

4. **Connection Pooling**: Knex.js manages a pool of database connections (min=2, max=10). Under heavy spike traffic (e.g., 10,000 concurrent transfer requests), the database-level `FOR UPDATE` locking serializes access to contended wallet rows, ensuring data integrity without overwhelming the database with active connections.

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
    │  // Returns connections to the database pool                │
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

## 6. Module Reference

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

Note: All primary and foreign keys use UUID (v4) instead of auto-incrementing integers (SERIAL). The `wallets.user_id` foreign key references `users.id` with `ON DELETE CASCADE`, and `ledger_entries.wallet_id` references `wallets.id` with `ON DELETE RESTRICT`.

---

### 🆔 Primary Key & ID Generation Strategy

**Key Design Decision:** All system IDs (User, Wallet, Ledger) are generated at the **application level** using a centralized `IdGenerator` utility wrapper (`src/common/utils/id-generator.ts`) executing Node's native `crypto.randomUUID()`, rather than relying on MySQL's native `DEFAULT (UUID())` database constraint.

#### Architectural Rationale (Why We Chose This)

| Risk Factor | Database-Level UUID | App-Level IdGenerator (Our Approach) |
| :--- | :--- | :--- |
| **Insert Record Retrieval** | ❌ **Broken.** MySQL's `LAST_INSERT_ID()` returns `0` for functional defaults. Knex cannot easily fetch the newly generated row. | ✅ **Perfect.** The ID is known *before* the insert query runs, allowing instant, clean `.where('id', walletId).first()` fetch queries. |
| **Framework Compatibility** | ❌ **Flawed.** Knex's built-in `table.uuid()` generates Postgres-specific syntax that causes compilation crashes on MySQL engines. | ✅ **Database Agnostic.** Perfectly compatible with MySQL, PostgreSQL, SQLite, or any future datastore without engine overrides. |
| **Testability & Mocking** | ❌ **Untestable.** Relies on database side-effects, making isolated unit testing or repository mocking impossible. | ✅ **Highly Testable.** Bound to an `IIdGenerator` interface, allowing us to swap in a `MockIdGenerator` for deterministic testing. |
| **System Visibility** | ❌ **Blind.** The ID is hidden until after a database write transaction completes. | ✅ **Transparent.** The unique ID can be attached to application logs and internal audit trails before the query hits the wire. |

#### Implementation

```typescript
// src/common/utils/id-generator.ts
import crypto from 'crypto';

export interface IIdGenerator {
  generate(): string;
}

export class IdGenerator implements IIdGenerator {
  public generate(): string {
    return crypto.randomUUID();
  }
}

export const idGenerator = new IdGenerator();
```

#### Usage Pattern (in all repositories)

```typescript
// Example from wallet.repository.ts
import { idGenerator } from '../../common/utils/id-generator';

public async createWallet(userId: string, trx: Knex.Transaction): Promise<WalletRecord> {
  const walletId = idGenerator.generate();  // Known BEFORE insert

  await trx<WalletRecord>('wallets').insert({
    id: walletId,
    user_id: userId,
    balance: '0',
  });

  // Direct lookup using the known ID:
  const insertedWallet = await trx<WalletRecord>('wallets')
    .where('id', walletId)
    .first();

  return insertedWallet as WalletRecord;
}
```

---

**Kobo-only Monetary Storage**: All monetary values (`wallets.balance`, `ledger_entries.amount`) are stored as `VARCHAR(64)` containing integer strings representing kobo (smallest Nigerian currency unit: 1 Naira = 100 kobo). No decimal types are used — all arithmetic is performed with JavaScript `bigint` for perfect precision. The frontend is responsible for converting kobo to/from any display format (e.g., dividing by 100 to show Naira).

### 7.2 Migration Scripts

#### Migration 1: `20250601000001_create_users_table.ts`

Creates the `users` table with email and BVN uniqueness constraints using UUID primary keys.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `VARCHAR(36)` | `PRIMARY KEY` | UUID v4 generated at **application level** via `IdGenerator` |
| `email` | `VARCHAR(255)` | `NOT NULL UNIQUE` | Case-insensitive via index |
| `bvn` | `VARCHAR(11)` | `NOT NULL UNIQUE` | Nigerian BVN (11 digits) |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` | bcrypt (12 rounds) |
| `created_at` | `DATETIME(6)` | `NOT NULL DEFAULT CURRENT_TIMESTAMP(6)` | Microsecond precision |
| `updated_at` | `DATETIME(6)` | `NOT NULL DEFAULT CURRENT_TIMESTAMP(6)` | Updated on modification |

**Indexes:**
- `idx_users_email ON users ((lower(email)))` — Case-insensitive email lookup
- `idx_users_bvn ON users (bvn)` — BVN direct lookup

#### Migration 2: `20250601000002_create_wallets_table.ts`

Creates the `wallets` table with 1:1 relationship to users using UUID foreign keys.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT UUID()` | UUID v4 generated by MySQL |
| `user_id` | `UUID` | `NOT NULL UNIQUE`, `REFERENCES users(id) ON DELETE CASCADE` | 1 wallet per user |
| `balance` | `VARCHAR(64)` | `NOT NULL DEFAULT '0'` | Kobo as integer string (e.g., "10000" = 100.00 Naira) |
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
| `amount` | `VARCHAR(64)` | `NOT NULL` | Kobo as integer string (e.g., "5000" = 50.00 Naira) |
| `type` | `ENUM('DEBIT', 'CREDIT')` | `NOT NULL` | DEBIT or CREDIT |
| `description` | `VARCHAR(255)` | `NOT NULL` | Audit description with transaction reference |
| `created_at` | `DATETIME(6)` | `NOT NULL DEFAULT CURRENT_TIMESTAMP(6)` | Immutable timestamp |

**Indexes:**
- `idx_ledger_entries_wallet_created ON ledger_entries (wallet_id, created_at)` — Composite index for paginated ledger history queries

**Key Design Decision**: `ON DELETE RESTRICT` on `wallet_id` prevents deletion of a wallet that still has ledger entries, enforcing the **Conservation of Value** law at the database level.

### 7.3 Kobo Storage & Precision

All monetary values are stored exclusively in **kobo** (the smallest Nigerian currency unit: 1 Naira = 100 kobo) as integer strings in `VARCHAR(64)` columns.

**Key Design Principles:**
- **No decimal types anywhere**: Database uses `VARCHAR(64)` to store integer strings (e.g., `"10000"`)
- **No floating-point arithmetic**: All calculations use JavaScript `bigint` for perfect precision
- **Frontend conversion only**: The frontend is responsible for converting kobo to/from any display format (e.g., divide by 100 to show Naira)
- **Unlimited precision**: `VARCHAR(64)` can handle extremely large integer values (up to 64 digits)

**Why strings?**
- `bigint` in JavaScript can handle arbitrarily large integers
- String storage ensures compatibility across databases and prevents precision loss during serialization
- MySQL arithmetic uses `CAST(amount AS DECIMAL(65,0))` for operations, casting back to string for storage

---

## 8. Security & Observability

### 9.1 Security Controls Matrix

| Control | Category | Implementation |
|---------|----------|---------------|
| Bearer Token Auth | Authentication | `authMiddleware` parses `Authorization: Bearer <user_id>` |
| Blacklist Compliance Gate | Compliance | `BlacklistModule.verify()` before user registration |
| bcrypt Password Hashing | Credential Storage | 12 rounds, prevents rainbow table attacks |
| CORS Restriction | Client Policy | Whitelist-based origin checking |
| Security Headers | Browser Protection | HSTS, X-Frame-Options, X-Content-Type-Options, CSP |
| SQL Injection Prevention | Data Access | Parameterized queries via Knex query builder |
| Kobo-only Integer Arithmetic | Financial Integrity | `bigint` — no floating-point, no decimals, perfect precision |
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

## 9. Testing Strategy

### 9.1 Unit Testing: Zero-Database Pattern

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

### 9.2 Unit Test Coverage Areas

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

### 9.3 Integration Testing: Supertest HTTP Tests

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

## 10. Scaling to One Million Users

### 10.1 Phase 1: Distributed Caching with Redis (10k–100k users)

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

### 10.2 Phase 2: Horizontal Scaling with Load Balancer (100k–500k users)

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

### 10.3 Phase 3: Async Processing with Message Queue (500k–1M users)

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

### 10.4 Phase 4: Database Optimizations for 1M Users

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

### 10.5 Phase 5: Observability at Scale

| Tool | Purpose | Why at 1M users |
|------|---------|-----------------|
| **Prometheus + Grafana** | Metrics dashboards | Spot bottlenecks before they become incidents |
| **Structured logging with correlation IDs** | Log aggregation (ELK/Loki) | `X-Request-ID` correlates every log line across instances |
| **Synthetic health checks** | External monitoring | Simulate user registration + transfer every 60s from outside the cluster |
| **PagerDuty/On-call** | Alert routing | Reconciliation CRITICALs must page a human |

### 10.6 Cost Estimate for 1M Users

| Tier | Monthly Cost (est.) | Setup |
|------|--------------------|-------|
| **Phase 1** (10k–100k) | $200–$500 | 2× app instances, 1× Redis, 1× MySQL db.r6g.large |
| **Phase 2** (100k–500k) | $1,000–$3,000 | 4–8× app instances, Redis cluster, MySQL primary + 2 replicas |
| **Phase 3** (500k–1M) | $3,000–$8,000 | 10–20× app instances, RabbitMQ cluster, MySQL sharded, CDN |

All costs estimated for AWS us-east-1 (on-demand, no reserved instances). Reserve instances for 30–50% savings.

---

*Document Version: 1.3.0 | Wallet Engine | Built with TypeScript + Node.js + Express + MySQL 8.0 | Updated for production deployment on Render with Aiven MySQL*

---

## 11. Recent Changes & Production Configuration

### 11.1 Removed Technologies

| Removed | Reason | Replacement |
|---------|--------|-------------|
| **Docker** | Unnecessary complexity for Render deployment | Native Node.js deployment |
| **OpenTelemetry** (`@opentelemetry/*`) | `prom-client` already provides working /metrics endpoint | `prom-client` (retained) |
| **PostgreSQL-specific UUID** (`DEFAULT UUID()`) | Not compatible with MySQL 8.0 | App-level `crypto.randomUUID()` |
| **DECIMAL(20,4)** for monetary values | Unnecessary complexity, frontend handles display | `VARCHAR(64)` with kobo integer strings |

### 11.2 Production Database: Aiven MySQL

The system is configured for **Aiven MySQL** (managed MySQL service) with the following configuration:

| Configuration | Value | Environment Variable |
|---------------|-------|----------------------|
| Host | Aiven-provided host | `DB_HOST` |
| Port | Aiven-provided port (typically 21997) | `DB_PORT` |
| Database | `wallet_engine` | `DB_NAME` |
| User | Aiven-provided username | `DB_USER` |
| Password | Aiven-provided password | `DB_PASSWORD` |
| SSL | **Required** | `DB_SSL=true` or `NODE_ENV=production` |

**SSL Enforcement**: When `NODE_ENV=production` or `DB_SSL=true`, the MySQL connection uses SSL with `rejectUnauthorized: false` (Aiven uses self-signed certificates by default).

### 11.3 Environment Variables Template

```bash
# Production (.env.production)
NODE_ENV=production
PORT=3000
JWT_SECRET=your-production-jwt-secret-key
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=your-production-refresh-secret-key
REFRESH_TOKEN_EXPIRES_IN=7d

# Aiven MySQL
DB_HOST=mysql-your-project.aivencloud.com
DB_PORT=21997
DB_NAME=wallet_engine
DB_USER=avnadmin
DB_PASSWORD=your-aiven-password
DB_SSL=true

# Adjutor Karma API (for BVN blacklist verification)
ADJUTOR_KARMA_API_BASE_URL=https://adjutor.lendsqr.com/v2
ADJUTOR_KARMA_API_KEY=your-adjutor-api-key
CIRCUIT_BREAKER_TIMEOUT=3000
CIRCUIT_BREAKER_ERROR_PERCENTAGE_THRESHOLD=50
CIRCUIT_BREAKER_VOLUME_THRESHOLD=5
BLACKLIST_CACHE_TTL_MS=300000
```

### 11.4 Deployment to Render

The system uses **native Node.js deployment** on Render (no Docker):

1. Connect your GitHub repository to Render
2. Configure environment variables in Render dashboard (matches `.env.production`)
3. Set **Build Command**: `npm install && npm run build`
4. Set **Start Command**: `npm start`
5. Ensure Aiven MySQL allows Render's IP addresses (or use `0.0.0.0/0` for testing)

**Key Files**:
- `package.json` - Contains `build` and `start` scripts
- `knexfile.ts` - Production config reads compiled JS from `./dist/`
- `config/database.ts` - SSL auto-enabled in production

---

## 12. Data Access Layer (DAL) Optimizations (v1.3.0+)

### 12.1 Creation Operation Refactor: Eliminating Redundant Database Round-Trips

**Problem Identified:** All three repository creation methods (`createUser()`, `createWallet()`, `createEntry()`) were performing a wasteful sequential pattern:

```
INSERT → SELECT (redundant) → Return fetched row
```

Since we control the `id` via app-level `IdGenerator`, we already know the complete row state **before** the database write. The post-insert `SELECT` query was a completely unnecessary network hop.

**Solution Applied:**

```typescript
// BEFORE (wasteful - 2 database round-trips)
public async createWallet(userId: string, trx: Knex.Transaction): Promise<WalletRecord> {
  const walletId = idGenerator.generate();
  
  await trx('wallets').insert({ id: walletId, user_id: userId, balance: '0' });
  
  // REDUNDANT NETWORK HOP ↓
  const inserted = await trx('wallets').where('id', walletId).first();
  if (!inserted) throw new RepositoryException(...);
  return inserted;
}

// AFTER (optimized - 1 database round-trip)
public async createWallet(userId: string, trx: Knex.Transaction): Promise<WalletRecord> {
  const walletId = idGenerator.generate();
  const now = new Date();       // In-memory timestamp sync
  const initialBalance = '0';
  
  await trx('wallets').insert({
    id: walletId,
    user_id: userId,
    balance: initialBalance,
    created_at: now,             // Explicit timestamp
    updated_at: now,             // Explicit timestamp
  });
  
  // Return directly from memory - NO DATABASE HOP
  return {
    id: walletId,
    user_id: userId,
    balance: initialBalance,
    created_at: now,
    updated_at: now,
  };
}
```

### 12.2 Tradeoff Analysis

| Dimension | Before (INSERT + SELECT) | After (INSERT + Memory Return) |
| :--- | :--- | :--- |
| **Network Round-Trips** | 2 per creation | 1 per creation |
| **Database Load** | Higher (2 queries) | Lower (1 query) |
| **Latency per Create** | Higher (2x network + query overhead) | Lower (single query) |
| **Error Detection** | Detected missing row via `if (!inserted)` | MySQL constraint violations throw naturally; transaction rolls back at service boundary |
| **Timestamp Accuracy** | Relied on MySQL's `CURRENT_TIMESTAMP(6)` | Application-level `new Date()` synchronized to transaction start |
| **Testability** | Required database-backed assertions | Fully mockable at repository interface level |

### 12.3 Key Architectural Principles Leveraged

1. **Application-Level ID Generation:** The `IdGenerator` utility makes this optimization possible. We control the primary key, so we know the complete row contract before the query executes.

2. **Transaction Propagation & Natural Error Handling:** No artificial `try/catch` blocks were added in the repository layer. MySQL constraint violations (e.g., duplicate `email`, duplicate `bvn`, foreign key violations) will:
   - Naturally throw a runtime exception from Knex
   - Short-circuit the execution thread
   - Trigger cascading transaction rollback at the service boundary (via `withTransaction` helper)

3. **In-Memory State Construction:** Timestamps are captured via `const now = new Date()` for deterministic synchronization. All column values are explicitly set, eliminating reliance on database `DEFAULT` clauses for returned records.

### 12.4 Performance Impact

| Metric | Estimated Improvement |
| :--- | :--- |
| Network hops reduced | **50%** (2 → 1 per create) |
| Database query count | **50%** reduction |
| Latency per creation | ~30-50% faster (eliminates network + query planning overhead) |
| Connection pool utilization | Improved (fewer queries = faster connection release) |

**Note:** This optimization is most impactful in:
- High-throughput transactional workloads
- Geographically distributed deployments (database in different AZ/region)
- Serverless environments where connection churn is expensive