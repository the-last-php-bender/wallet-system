import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';

export function createTelemetrySdk(): NodeSDK | null {
  if (!OTEL_ENABLED) {
    return null;
  }

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

  const prometheusExporter = new PrometheusExporter({
    port: 9464,
  });

  const sdk = new NodeSDK({
    metricReader: prometheusExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          requestHook: (span, request) => {
            const req = request as { method?: string; url?: string };
            span.setAttribute('http.method', req.method ?? 'unknown');
            span.setAttribute('http.url', req.url ?? 'unknown');
          },
        },
        '@opentelemetry/instrumentation-express': {
          requestHook: (span, info) => {
            const { request } = info as { request: { route?: { path?: string }; method?: string } };
            if (request.route?.path) {
              span.setAttribute('http.route', request.route.path);
            }
          },
        },
      }),
    ],
  });

  sdk.start();
  return sdk;
}
