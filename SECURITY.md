# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

Contact the security team at security@wallet-engine.local.
Do NOT file a public GitHub issue for security vulnerabilities.

## Pentest Checklist

### Token Fuzzing
- [ ] Send malformed JWT tokens (expired, wrong secret, alg=none)
- [ ] Test token replay with old tokens after password change
- [ ] Verify token claims cannot be tampered with

### Rate-Limit Bypass
- [ ] Send requests with spoofed X-Forwarded-For headers
- [ ] Test concurrent bursts to verify sliding window behaviour
- [ ] Verify rate-limit headers are present (X-RateLimit-*)

### SQL Injection
- [ ] Inject `' OR 1=1 --` into email/BVN fields
- [ ] Inject into amount fields (`0.01; DROP TABLE wallets`)
- [ ] Verify parameterized queries via Knex are not vulnerable

### Idempotency
- [ ] Replay the same idempotency key with different bodies → must reject
- [ ] Send concurrent requests with same key → must get 409
- [ ] Use expired key → must be treated as new

### JWT
- [ ] Token without expiry → must be rejected
- [ ] Token signed with wrong secret → must be rejected
- [ ] Refresh token reuse → must invalidate entire family

### Business Logic
- [ ] Transfer to non-existent user → must fail gracefully
- [ ] Withdraw more than balance → must fail with insufficient funds
- [ ] Negative amounts → must be rejected at schema + service level
