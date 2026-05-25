import type { Express, Request, Response, NextFunction } from 'express';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorMiddleware, ErrorLogger } from './common/filters/error.middleware';
import { ResponseHelper } from './common/response';
import { WalletModule } from './modules/wallet';
import { UserModule } from './modules/user';
import { blacklistModule } from './modules/blacklist/blacklist.module';
import { LogLevel, ErrorCode, HttpStatus, ReadinessStatus, HealthStatus, ServiceStatus } from './common/enums';
import { apiLimiter } from './common/guards/rate-limiter';
import { config } from '../config/environment';
import db from '../config/database';
import {
  metricsRegistry,
  httpRequestDuration,
  activeRequestsGauge,
  totalRequestsCounter,
} from './common/telemetry/metrics';

export class Application {
  public readonly app: Express;
  private readonly serviceName: string = 'WalletEngine';

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      const requestId = (req.headers as Record<string, string>)['x-request-id'] ?? `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      (req.headers as Record<string, string>)['x-request-id'] = requestId;
      (req as Request & { startTime: number }).startTime = Date.now();

      ErrorLogger.log(LogLevel.INFO, 'Incoming request', new Error('request_start'), {
        requestId,
        method: req.method,
        url: req.url,
        userAgent: (req.headers as Record<string, string>)['user-agent'],
      });

      next();
    });

    this.app.use((req: Request, res: Response, next: NextFunction) => {
      activeRequestsGauge.inc({ method: req.method });
      const start = process.hrtime();
      const route = (req as Request & { route?: { path?: string } }).route?.path ?? req.path ?? 'unknown';

      const recordMetrics = (): void => {
        const elapsed = process.hrtime(start);
        const durationInSeconds = elapsed[0] + elapsed[1] / 1e9;
        const statusCode = res.statusCode?.toString() ?? 'unknown';

        httpRequestDuration.observe({ method: req.method, route, status_code: statusCode }, durationInSeconds);
        totalRequestsCounter.inc({ method: req.method, route, status_code: statusCode });
        activeRequestsGauge.dec({ method: req.method });
      };

      res.once('finish', recordMetrics);
      res.once('close', recordMetrics);

      next();
    });

    this.app.use(helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          imgSrc: ["'none'"],
          connectSrc: ["'none'"],
          fontSrc: ["'none'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'none'"],
          frameSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      noSniff: true,
      xssFilter: true,
      hidePoweredBy: true,
      ieNoOpen: true,
    }));

    const allowedOrigins: string[] = config.cors.allowedOrigins ?? ['http://localhost:3000', 'http://localhost:8080'];
    this.app.use(cors({
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Idempotency-Key'],
      exposedHeaders: ['X-Request-ID'],
      credentials: true,
      maxAge: 86400,
    }));

    this.app.use(cookieParser());

    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    this.app.use(express.text({ type: 'text/*' }));
    this.app.use(express.raw({ type: 'application/octet-stream' }));

    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');

      const requestId = (req.headers as Record<string, string>)['x-request-id'];
      if (requestId) {
        res.setHeader('X-Request-ID', requestId);
      }

      next();
    });

    this.app.use(apiLimiter);
  }

  private setupRoutes(): void {
    const walletRouter = WalletModule.bootstrap();
    const userRouter = UserModule.bootstrap();

    this.app.use('/api/v1/wallet', walletRouter);
    this.app.use('/api/v1/users', userRouter);

    this.app.get('/metrics', async (_req: Request, res: Response) => {
      try {
        const metrics = await metricsRegistry.metrics();
        res.setHeader('Content-Type', metricsRegistry.contentType);
        res.send(metrics);
      } catch (error: unknown) {
        const err = error as Error;
        ErrorLogger.log(LogLevel.ERROR, 'Failed to collect metrics', err, {
          service: this.serviceName,
        });
        ResponseHelper.error(res, 'Unable to collect metrics at this time.', ErrorCode.UNHANDLED_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    });

    this.app.get('/health', (_req: Request, res: Response) => {
      const healthStatus = {
        status: HealthStatus.OK,
        timestamp: new Date().toISOString(),
        service: this.serviceName,
      };

      ResponseHelper.json(res, healthStatus);
    });

    this.app.get('/ready', async (_req: Request, res: Response) => {
      try {
        try {
          const dbClient = (db as unknown as { client?: { pool?: unknown } }).client;
          const pool = dbClient?.pool;
          if (pool) {
            const poolObj = pool as Record<string, unknown>;
            const stats = {
              used: typeof poolObj.numUsed === 'function' ? (poolObj.numUsed as () => number)() : undefined,
              free: typeof poolObj.numFree === 'function' ? (poolObj.numFree as () => number)() : undefined,
              pendingAcquires: typeof poolObj.numPendingAcquires === 'function' 
                ? (poolObj.numPendingAcquires as () => number)() 
                : (typeof poolObj.waitersCount === 'function' ? (poolObj.waitersCount as () => number)() : undefined),
            };
            ErrorLogger.log(LogLevel.INFO, 'DB pool stats (ready)', new Error('pool_stats'), { service: this.serviceName, pool: stats });
          }
        } catch {
          // ignore pool introspection errors
        }

        await db.raw('SELECT 1');
        const blacklistHealth = await blacklistModule.healthCheck();

        const readinessStatus = {
          status: ReadinessStatus.READY,
          timestamp: new Date().toISOString(),
          checks: {
            database: {
              status: ServiceStatus.CONNECTED,
              latency: 'ok',
            },
            blacklistService: {
              status: blacklistHealth.healthy ? 'healthy' : 'degraded',
              circuitState: blacklistHealth.breakerState,
              cacheSize: blacklistHealth.cacheSize,
            },
          },
        };

        ResponseHelper.json(res, readinessStatus);
      } catch (error: unknown) {
        const readinessStatus = {
          status: ReadinessStatus.NOT_READY,
          timestamp: new Date().toISOString(),
        };
        ErrorLogger.log(LogLevel.ERROR, 'Readiness check failed', error as Error, { service: this.serviceName });
        ResponseHelper.json(res, readinessStatus, HttpStatus.SERVICE_UNAVAILABLE);
      }
    });



    this.app.head('/health', (_req: Request, res: Response) => {
      res.status(200).end();
    });

    this.app.head('/ready', (_req: Request, res: Response) => {
      res.status(200).end();
    });

    this.app.use((_req: Request, res: Response) => {
      ResponseHelper.error(res, 'The requested resource endpoint does not exist on this server.', ErrorCode.ROUTE_NOT_FOUND, HttpStatus.NOT_FOUND);
    });
  }

  private setupErrorHandling(): void {
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      errorMiddleware(err, req, res, next);
    });

    this.app.use((err: SyntaxError | Error, req: Request, res: Response, _next: NextFunction) => {
      if ('type' in err && err.type === 'entity.parse.failed') {
        ResponseHelper.error(res, 'The request body contains malformed or unparseable JSON. Please check your payload format.', ErrorCode.INVALID_JSON_PAYLOAD, HttpStatus.BAD_REQUEST);
        return;
      }

      ErrorLogger.log(LogLevel.FATAL, 'Unhandled error in Express error chain', err as Error, {
        requestId: (req.headers as Record<string, string>)['x-request-id'],
        url: req.url,
        method: req.method,
      });

      ResponseHelper.error(res, 'An unexpected server error occurred. Our team has been notified.', ErrorCode.UNHANDLED_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
    });

    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
      ErrorLogger.log(LogLevel.FATAL, 'Unhandled Promise Rejection', new Error(String(reason)), {
        reason: String(reason),
        promise: String(promise),
      });
    });

    process.on('uncaughtException', (error: Error) => {
      ErrorLogger.log(LogLevel.FATAL, 'Uncaught Exception - process will terminate', error, {
        stack: error.stack,
      });
      process.exit(1);
    });
  }

  public getApp(): Express {
    return this.app;
  }
}

export function createApplication(): Application {
  return new Application();
}
