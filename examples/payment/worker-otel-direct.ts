/**
 * Payment Worker — OTEL direct to an OTLP-compatible backend.
 *
 * The library never calls vendor APIs: the Temporal SDK exports plain OTLP
 * straight to the backend's OTLP ingest endpoint. Auth goes in headers via env.
 *
 * Env (never hardcode tokens):
 *   TEMPORAL_OBSERVABILITY_OTLP_ENDPOINT=https://your-otlp-compatible-endpoint/v1/metrics
 *   TEMPORAL_OBSERVABILITY_OTLP_HEADERS="Authorization=Bearer <token>"
 *   TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http
 *
 * Run:
 *   npx tsx examples/payment/worker-otel-direct.ts
 */
import 'dotenv/config';
import { URL, fileURLToPath } from 'url';
import { Worker } from '@temporalio/worker';
import { attachTemporalObservability } from '../../dist/index.js';
import * as activities from './activities.js';

async function run(): Promise<void> {
  const obs = attachTemporalObservability({
    serviceName: 'payment-worker',
    environment: process.env.NODE_ENV ?? 'prod',
    namespace: 'payments',
    taskQueue: 'payment-tasks',
    vendorProfile: 'otel',
    routingMode: 'direct',
    configSource: 'env',
  });

  // Safe to log: contains headersConfigured (boolean) but never header values.
  console.log('\n=== Payment Worker Observability (OTEL direct) ===');
  console.log(JSON.stringify(obs.startupReport(), null, 2));

  const worker = await Worker.create({
    namespace: 'payments',
    taskQueue: 'payment-tasks',
    workflowsPath: fileURLToPath(new URL('./workflows.ts', import.meta.url)),
    activities,
    ...obs.workerOptions(),
  });

  console.log('Payment worker running. Press Ctrl+C to stop.');
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
