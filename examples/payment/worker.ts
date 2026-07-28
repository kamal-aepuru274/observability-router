/**
 * Payment Worker
 *
 * Wires up Temporal observability (Prometheus on :9464) then starts the worker
 * polling the `payment-tasks` task queue.
 *
 * Run:
 *   npx tsx examples/payment/worker.ts
 *
 * Check metrics:
 *   PowerShell: (Invoke-WebRequest -UseBasicParsing http://localhost:9464/metrics).Content
 *   curl:       curl http://localhost:9464/metrics
 */
import { URL, fileURLToPath } from 'url';
import { Worker } from '@temporalio/worker';
import { attachTemporalObservability } from '../../dist/index.js';
import * as activities from './activities.js';

async function run(): Promise<void> {
  const obs = attachTemporalObservability({
    serviceName: 'payment-worker',
    environment: process.env.NODE_ENV ?? 'dev',
    namespace: 'default',
    taskQueue: 'payment-tasks',
    vendorProfile: 'prometheus',
  });

  console.log('\n=== Payment Worker Observability ===');
  console.log(JSON.stringify(obs.startupReport(), null, 2));
  console.log('\nMetrics: http://localhost:9464/metrics\n');

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
