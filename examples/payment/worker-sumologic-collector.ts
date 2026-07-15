/**
 * Payment Worker — Sumo Logic via OpenTelemetry Collector.
 *
 * The worker pushes plain OTLP metrics to a local Collector. The Collector
 * forwards to Sumo Logic (or a debug exporter while you verify locally).
 *
 * 1. Start the Collector:
 *      docker compose -f examples/otel-collector/docker-compose.yaml up
 *
 * 2. Set env (or rely on env resolution):
 *      TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_ENDPOINT=http://localhost:4318/v1/metrics
 *      TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http
 *
 * 3. Run:
 *      npx tsx examples/payment/worker-sumologic-collector.ts
 *
 * 4. Verify metrics in the Collector's debug output first, then point the
 *    Collector at Sumo Logic for real ingestion.
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
    routingMode: 'collector',
    configSource: 'env',
  });

  console.log('\n=== Payment Worker Observability (Sumo Logic -> Collector) ===');
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
