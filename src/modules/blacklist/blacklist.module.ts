import type { IdentityVerificationRequest, AdjutorBvnVerificationResult } from './providers/adjutor.provider';
import { AdjutorProvider } from './providers/adjutor.provider';
import CircuitBreaker from 'opossum';
import { ServiceUnavailableException } from '../../common/exceptions/http.exception';
import { ErrorLogger } from '../../common/filters/error.middleware';
import { LogLevel, CircuitBreakerState } from '../../common/enums';

interface CacheEntry {
  result: AdjutorBvnVerificationResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

class AntiSpamCache {
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly ttl: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ttlMs: number = CACHE_TTL_MS) {
    this.ttl = ttlMs;
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      for (const [key, entry] of this.cache.entries()) {
        if (entry.expiresAt <= now) {
          this.cache.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        ErrorLogger.log(
          LogLevel.INFO,
          `AntiSpamCache cleaned ${cleaned} expired entries`,
          new Error('cache_cleanup'),
          {}
        );
      }
    }, 60_000);
  }

  private generateCacheKey(request: IdentityVerificationRequest): string {
    return request.bvn;
  }

  public get(request: IdentityVerificationRequest): AdjutorBvnVerificationResult | null {
    const key = this.generateCacheKey(request);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  public set(request: IdentityVerificationRequest, result: AdjutorBvnVerificationResult): void {
    if (result.isBlacklisted) {
      return;
    }

    const key = this.generateCacheKey(request);
    const entry: CacheEntry = {
      result,
      expiresAt: Date.now() + this.ttl,
    };
    this.cache.set(key, entry);
  }

  public has(request: IdentityVerificationRequest): boolean {
    return this.get(request) !== null;
  }

  public invalidate(request: IdentityVerificationRequest): boolean {
    const key = this.generateCacheKey(request);
    return this.cache.delete(key);
  }

  public destroy(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

export interface CircuitBreakerEvents {
  open: () => void;
  close: () => void;
  halfOpen: () => void;
  fallback: (error: Error) => void;
  timeout: (error: Error) => void;
  reject: (error: Error) => void;
  success: () => void;
  failure: () => void;
}

export interface BlacklistModuleConfig {
  timeout?: number;
  errorPercentageThreshold?: number;
  volumeThreshold?: number;
  resetTimeout?: number;
  cacheTtlMs?: number;
}

interface BreakerOptions {
  timeout: number;
  errorPercentageThreshold: number;
  volumeThreshold: number;
  resetTimeout: number;
}

const DEFAULT_TIMEOUT = 3000;
const DEFAULT_ERROR_PERCENTAGE_THRESHOLD = 50;
const DEFAULT_VOLUME_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT = 60000;
const DEFAULT_CACHE_TTL_MS = CACHE_TTL_MS;

interface BreakerStats {
  enabled: boolean;
  name: string;
  circuit: CircuitBreakerState;
  stats: {
    fires: number;
    successes: number;
    failures: number;
    timeouts: number;
    cacheHits: number;
    cacheMisses: number;
    opens: number;
    fallbacks: number;
    rejects: number;
  };
}

export class BlacklistModule {
  private readonly provider: AdjutorProvider;
  private readonly cache: AntiSpamCache;
  private readonly breaker: CircuitBreaker<[IdentityVerificationRequest], AdjutorBvnVerificationResult>;
  private readonly serviceName: string = 'AdjutorKarmaAPI';
  private readonly resetTimeout: number;
  private readonly breakerStats: BreakerStats = {
    enabled: true,
    name: 'AdjutorKarmaCircuitBreaker',
    circuit: CircuitBreakerState.CLOSED,
    stats: {
      fires: 0,
      successes: 0,
      failures: 0,
      timeouts: 0,
      cacheHits: 0,
      cacheMisses: 0,
      opens: 0,
      fallbacks: 0,
      rejects: 0,
    },
  };

  constructor(userConfig: BlacklistModuleConfig = {}) {
    const timeout = userConfig.timeout ?? DEFAULT_TIMEOUT;
    const errorPercentageThreshold = userConfig.errorPercentageThreshold ?? DEFAULT_ERROR_PERCENTAGE_THRESHOLD;
    const volumeThreshold = userConfig.volumeThreshold ?? DEFAULT_VOLUME_THRESHOLD;
    this.resetTimeout = userConfig.resetTimeout ?? DEFAULT_RESET_TIMEOUT;
    const cacheTtlMs = userConfig.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

    this.provider = new AdjutorProvider();
    this.cache = new AntiSpamCache(cacheTtlMs);

    const breakerOptions: BreakerOptions = {
      timeout,
      errorPercentageThreshold,
      volumeThreshold,
      resetTimeout: this.resetTimeout,
    };

    this.breaker = new CircuitBreaker(
      (request: IdentityVerificationRequest) => this.provider.verifyBvn(request),
      breakerOptions
    );

    this.setupBreakerEvents();
    this.setupBreakerFallback();
  }

  private setupBreakerEvents(): void {
    this.breaker.on('open', () => {
      this.breakerStats.circuit = CircuitBreakerState.OPEN;
      this.breakerStats.stats.opens++;
      ErrorLogger.log(
        LogLevel.ERROR,
        'Circuit breaker OPEN - Adjutor Karma API is failing',
        new Error('circuit_breaker_open'),
        { service: this.serviceName }
      );
    });

    this.breaker.on('close', () => {
      this.breakerStats.circuit = CircuitBreakerState.CLOSED;
      ErrorLogger.log(
        LogLevel.INFO,
        'Circuit breaker CLOSED - Adjutor Karma API is healthy again',
        new Error('circuit_breaker_close'),
        { service: this.serviceName }
      );
    });

    this.breaker.on('halfOpen', () => {
      this.breakerStats.circuit = CircuitBreakerState.HALF_OPEN;
      ErrorLogger.log(
        LogLevel.WARN,
        'Circuit breaker HALF-OPEN - Testing Adjutor Karma API',
        new Error('circuit_breaker_half_open'),
        { service: this.serviceName }
      );
    });

    this.breaker.on('timeout', (error: Error) => {
      this.breakerStats.stats.timeouts++;
      ErrorLogger.log(
        LogLevel.ERROR,
        'Circuit breaker timeout on Adjutor Karma API',
        error,
        { service: this.serviceName }
      );
    });

    this.breaker.on('success', () => {
      this.breakerStats.stats.successes++;
      ErrorLogger.log(
        LogLevel.INFO,
        'Adjutor Karma API call succeeded',
        new Error('circuit_breaker_success'),
        { service: this.serviceName }
      );
    });

    this.breaker.on('failure', (error: Error) => {
      this.breakerStats.stats.failures++;
      ErrorLogger.log(
        LogLevel.ERROR,
        'Adjutor Karma API call failed',
        error,
        { service: this.serviceName }
      );
    });

    this.breaker.on('reject', (error: Error) => {
      this.breakerStats.stats.rejects++;
      ErrorLogger.log(
        LogLevel.WARN,
        'Adjutor Karma API request rejected by circuit breaker',
        error,
        { service: this.serviceName }
      );
    });
  }

  private setupBreakerFallback(): void {
    this.breaker.fallback(() => {
      this.breakerStats.stats.fallbacks++;
      ErrorLogger.log(
        LogLevel.ERROR,
        'Circuit breaker fallback triggered - throwing ServiceUnavailableException',
        new Error('circuit_breaker_fallback'),
        { service: this.serviceName }
      );
      throw new ServiceUnavailableException(
        'Identity verification service is temporarily unavailable due to high error rates. Please try again in a few moments.',
        this.serviceName,
        this.resetTimeout
      );
    });
  }

  public async verify(request: IdentityVerificationRequest): Promise<AdjutorBvnVerificationResult> {
    const cached = this.cache.get(request);
    if (cached !== null) {
      this.breakerStats.stats.cacheHits++;
      ErrorLogger.log(LogLevel.INFO, 'AntiSpamCache hit for BVN verification', new Error('cache_hit'), {
        service: this.serviceName,
        bvn: request.bvn,
      });
      return cached;
    }

    this.breakerStats.stats.cacheMisses++;

    try {
      this.breakerStats.stats.fires++;
      const result = await this.breaker.fire(request);

      this.cache.set(request, result);

      return result;
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      const err = error as Error;
      ErrorLogger.log(
        LogLevel.ERROR,
        'BlacklistModule.verify caught unexpected error',
        err,
        { service: this.serviceName, bvn: request.bvn }
      );

      throw new ServiceUnavailableException(
        'Identity verification service temporarily unavailable.',
        this.serviceName,
        this.resetTimeout
      );
    }
  }

  public getCacheSize(): number {
    return this.cache.size();
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public isBreakerOpen(): boolean {
    return this.breakerStats.circuit === CircuitBreakerState.OPEN;
  }

  public getBreakerStats(): BreakerStats {
    return { ...this.breakerStats };
  }

  public async healthCheck(): Promise<{ healthy: boolean; breakerState: CircuitBreakerState; cacheSize: number }> {
    const breakerState = this.breakerStats.circuit;
    const healthy = breakerState !== CircuitBreakerState.OPEN;
    return {
      healthy,
      breakerState,
      cacheSize: this.cache.size(),
    };
  }

  public async shutdown(): Promise<void> {
    this.breaker.close();
    this.cache.destroy();
    this.cache.clear();
    ErrorLogger.log(LogLevel.INFO, 'BlacklistModule shutdown complete', new Error('shutdown'), {
      service: this.serviceName,
    });
  }
}

export const blacklistModule = new BlacklistModule();

export { AntiSpamCache };