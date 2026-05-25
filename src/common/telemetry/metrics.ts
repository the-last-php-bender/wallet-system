import promClient from 'prom-client';

export const metricsRegistry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const activeRequestsGauge = new promClient.Gauge({
  name: 'http_requests_active_total',
  help: 'Number of active HTTP requests',
  labelNames: ['method'],
  registers: [metricsRegistry],
});

export const totalRequestsCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

export const walletBalanceGauge = new promClient.Gauge({
  name: 'wallet_balance',
  help: 'Current wallet balances',
  labelNames: ['wallet_id'],
  registers: [metricsRegistry],
});

export const transactionCounter = new promClient.Counter({
  name: 'wallet_transactions_total',
  help: 'Total number of wallet transactions',
  labelNames: ['type'], // fund, transfer, withdraw
  registers: [metricsRegistry],
});

export function createMetricsRegistry(): promClient.Registry {
  return metricsRegistry;
}
