import { createApplication, Application } from './app';
import { config } from '../config/environment';
import { ErrorLogger, logger } from './common/filters/error.middleware';
import { blacklistModule } from './modules/blacklist/blacklist.module';
import { LogLevel, ErrorCode } from './common/enums';
import db from '../config/database';
import http from 'http';
import net from 'net';

class Server {
  private application: Application | null = null;
  private server: http.Server | null = null;
  private readonly serviceName: string = 'WalletEngine';
  private readonly shutdownSignals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
  private isShuttingDown: boolean = false;
  private shutdownTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly SHUTDOWN_TIMEOUT_MS: number = 30_000;

  public async start(): Promise<void> {
    try {
      this.application = createApplication();
      const app = this.application.getApp();

      this.server = app.listen(config.port, () => {
        logger.info({
          service: this.serviceName,
          port: config.port,
          nodeEnv: config.nodeEnv,
          pid: process.pid,
          timestamp: new Date().toISOString(),
        }, `Wallet Engine started successfully and listening on port ${config.port}`);

        logger.info({
          service: this.serviceName,
          message: `Server is accepting connections at http://0.0.0.0:${config.port}`,
        }, 'HTTP server is ready');

        this.setupShutdownHandlers();
      });

      this.server.on('error', (error: Error) => {
        this.handleServerError(error);
      });

      this.server.on('timeout', () => {
        logger.warn({ service: this.serviceName }, 'Server socket timeout detected');
      });

      this.server.on('clientError', (error: Error, socket: net.Socket) => {
        logger.warn({ service: this.serviceName, error: error.message }, 'Client socket error');
        if (socket && !socket.destroyed) {
          socket.destroy();
        }
      });

    } catch (error: unknown) {
      const err = error as Error;
      ErrorLogger.log(LogLevel.FATAL, 'Failed to start server', err, {
        service: this.serviceName,
        port: config.port,
      });
      throw error;
    }
  }

  private setupShutdownHandlers(): void {
    this.shutdownSignals.forEach((signal) => {
      process.on(signal, () => {
        this.initiateGracefulShutdown(signal);
      });
    });

    process.on('exit', (code: number) => {
      logger.info({
        service: this.serviceName,
        exitCode: code,
      }, `Process exiting with code ${code}`);
    });
  }

  private async initiateGracefulShutdown(signal: NodeJS.Signals): Promise<void> {
    if (this.isShuttingDown) {
      ErrorLogger.log(LogLevel.WARN, `Received ${signal} but shutdown already in progress, ignoring`, new Error('duplicate_shutdown_signal'), {
        service: this.serviceName,
        signal,
      });
      return;
    }

    this.isShuttingDown = true;

    logger.info({
      service: this.serviceName,
      signal,
      timestamp: new Date().toISOString(),
    }, `Received ${signal} signal - initiating graceful shutdown`);

    ErrorLogger.log(LogLevel.INFO, 'Graceful shutdown initiated', new Error('shutdown_initiated'), {
      service: this.serviceName,
      signal,
    });

    this.shutdownTimeoutId = setTimeout(() => {
      ErrorLogger.log(LogLevel.ERROR, 'Graceful shutdown timed out after 30 seconds - forcing exit', new Error('shutdown_timeout'), {
        service: this.serviceName,
      });
      logger.error({
        service: this.serviceName,
        message: 'Forced shutdown due to timeout',
      }, 'Forced shutdown due to timeout');
      process.exit(1);
    }, this.SHUTDOWN_TIMEOUT_MS);

    try {
      await this.closeConnections();
      await this.closeDatabasePool();
      await this.shutdownModules();
      await this.closeServer();

      if (this.shutdownTimeoutId) {
        clearTimeout(this.shutdownTimeoutId);
        this.shutdownTimeoutId = null;
      }

      logger.info({
        service: this.serviceName,
        signal,
        exitCode: 0,
      }, 'Graceful shutdown completed successfully');

      ErrorLogger.log(LogLevel.INFO, 'Graceful shutdown completed', new Error('shutdown_complete'), {
        service: this.serviceName,
        signal,
      });

      process.exit(0);
    } catch (error: unknown) {
      const err = error as Error;
      ErrorLogger.log(LogLevel.ERROR, 'Error during graceful shutdown', err, {
        service: this.serviceName,
        signal,
      });

      if (this.shutdownTimeoutId) {
        clearTimeout(this.shutdownTimeoutId);
        this.shutdownTimeoutId = null;
      }

      logger.error({
        service: this.serviceName,
        error: err.message,
        stack: err.stack,
      }, 'Error during graceful shutdown');

      process.exit(1);
    }
  }

  private async closeConnections(): Promise<void> {
    logger.info({ service: this.serviceName }, 'Closing active server connections...');

    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err?: Error) => {
        if (err) {
          ErrorLogger.log(LogLevel.WARN, 'Error closing server connections', err, {
            service: this.serviceName,
          });
        } else {
          logger.info({ service: this.serviceName }, 'All server connections closed');
        }
        resolve();
      });
    });
  }

  private async closeDatabasePool(): Promise<void> {
    logger.info({ service: this.serviceName }, 'Closing database connection pool...');

    try {
      await db.destroy();
      logger.info({ service: this.serviceName }, 'Database connection pool closed');
    } catch (error: unknown) {
      const err = error as Error;
      ErrorLogger.log(LogLevel.ERROR, 'Error closing database pool', err, {
        service: this.serviceName,
      });
      throw error;
    }
  }

  private async shutdownModules(): Promise<void> {
    logger.info({ service: this.serviceName }, 'Shutting down modules...');

    try {
      await blacklistModule.shutdown();
      logger.info({ service: this.serviceName }, 'BlacklistModule shutdown complete');
    } catch (error: unknown) {
      const err = error as Error;
      ErrorLogger.log(LogLevel.ERROR, 'Error shutting down BlacklistModule', err, {
        service: this.serviceName,
      });
    }
  }

  private async closeServer(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err?: Error) => {
        if (err) {
          ErrorLogger.log(LogLevel.WARN, 'Final server close error', err, {
            service: this.serviceName,
          });
        }
        resolve();
      });
    });
  }

  private handleServerError(error: Error): void {
    ErrorLogger.log(LogLevel.FATAL, 'Server error occurred', error, {
      service: this.serviceName,
    });

    const errorWithCode = error as Error & { code?: string };
    if (errorWithCode.code === 'EADDRINUSE') {
      logger.error({
        service: this.serviceName,
        message: `Port ${config.port} is already in use. Please stop any other processes using this port and try again.`,
      });
      process.exit(1);
    }

    if (errorWithCode.code === 'EACCES') {
      logger.error({
        service: this.serviceName,
        message: `Permission denied to bind to port ${config.port}. Try using a port number above 1024 or run with elevated privileges.`,
      });
      process.exit(1);
    }

    throw error;
  }
}

const server = new Server();

server.start().catch((error: Error) => {
  ErrorLogger.log(LogLevel.FATAL, 'Unhandled startup error', error, {
    service: 'WalletEngine',
  });
  logger.fatal({
    service: 'WalletEngine',
    error: error.message,
    stack: error.stack,
  }, 'Failed to start server - exiting');
  process.exit(1);
});

export default server;