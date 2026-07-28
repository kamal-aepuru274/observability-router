/**
 * Payment Worker — Sumo Logic direct OTLP export.
 *
 * The worker pushes plain OTLP metrics directly to a Sumo Logic OTLP HTTP
 * Source. The library does not call Sumo Logic APIs; the Temporal SDK Core
 * sends the OTLP payload.
 *
 * Env (never hardcode tokens or URLs):
 *   TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_ENDPOINT=https://your-sumo-otlp-http-source-endpoint
 *   TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_HEADERS="x-sumo-category=temporal-workers"
 *   TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http
 *
 * Run:
 *   npx tsx examples/payment/worker-sumologic-direct.ts
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
    vendorProfile: 'sumologic',
    routingMode: 'direct',
    configSource: 'env',
  });

  console.log('\n=== Payment Worker Observability (Sumo Logic direct) ===');
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
