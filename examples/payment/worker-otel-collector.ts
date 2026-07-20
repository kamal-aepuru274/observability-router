/**
 * Payment Worker — OTEL via local OpenTelemetry Collector.
 *
 * 1. Start the Collector:
 *      docker compose up
 *
 * 2. Set env (or rely on the inline-free env resolution):
 *      TEMPORAL_OBSERVABILITY_OTLP_ENDPOINT=http://localhost:4318/v1/metrics
 *      TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http
 *
 * 3. Run:
 *      npx tsx examples/payment/worker-otel-collector.ts
 *
 * 4. Watch Temporal SDK metrics appear in the Collector's debug output.
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
    namespace: 'default',
    taskQueue: 'payment-tasks',
    vendorProfile: 'otel',
    routingMode: 'collector',
    configSource: 'env',
  });

  console.log('\n=== Payment Worker Observability (OTEL -> Collector) ===');
  console.log(JSON.stringify(obs.startupReport(), null, 2));

  const worker = await Worker.create({
    namespace: 'default',
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
