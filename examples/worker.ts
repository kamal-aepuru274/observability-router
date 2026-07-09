/**
 * Illustrative Temporal Worker integration.
 *
 * Key rule: call attachTemporalObservability() BEFORE Worker.create(), because
 * Temporal telemetry is configured globally on the Runtime and must be set up
 * before the first Worker is created.
 *
 * In a real project, import from the published package name:
 *   import { attachTemporalObservability } from '@temporalio-observability/router';
 */
import { URL, fileURLToPath } from 'url';
import { Worker } from '@temporalio/worker';
import { attachTemporalObservability } from '../dist/index.js';

async function run(): Promise<void> {
  const observability = attachTemporalObservability({
    serviceName: 'orders-worker',
    environment: process.env.NODE_ENV ?? 'dev',
    namespace: 'default',
    taskQueue: 'orders',
    vendorProfile: 'prometheus',
    // Optional. Otherwise resolved from
    // TEMPORAL_OBSERVABILITY_PROMETHEUS_BIND_ADDRESS, then 0.0.0.0:9464.
    // prometheus: { bindAddress: '0.0.0.0:9464' },
  });

  // Safe to log: contains no secrets.
  // eslint-disable-next-line no-console
  console.log('Temporal observability:', observability.startupReport());

  const worker = await Worker.create({
    namespace: 'default',
    taskQueue: 'orders',
    workflowsPath: fileURLToPath(new URL('./workflows.ts', import.meta.url)),
    // Spread reserved worker options (empty today, future interceptors/sinks).
    ...observability.workerOptions(),
  });

  await worker.run();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
