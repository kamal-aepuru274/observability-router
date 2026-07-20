/**
 * Dynatrace OneAgent — BASIC example.
 *
 * Dynatrace does not derive Temporal-specific metrics (task latency, workflow
 * failures, poller activity, ...) on its own — the Temporal SDK must emit them.
 * This profile is a thin preset over `prometheus`: it exposes the Temporal SDK
 * Prometheus `/metrics` endpoint so Dynatrace can scrape it.
 *
 *   VM:         Temporal Worker /metrics -> OneAgent Prometheus extension -> Dynatrace
 *   Kubernetes: Temporal Worker /metrics -> ActiveGate / OTel Collector    -> Dynatrace
 *
 * No standalone Prometheus server is required.
 *
 * Run:
 *   npx tsx examples/dynatrace-oneagent/worker-basic.ts
 * Then verify the endpoint:
 *   curl http://localhost:9464/metrics
 */
import 'dotenv/config';
import { URL, fileURLToPath } from 'url';
import { Worker } from '@temporalio/worker';
import { attachTemporalObservability } from '../../dist/index.js';
import type { StartupReport } from '../../dist/index.js';
import * as activities from '../payment/activities.js';

/** Render the informative startup report in a readable text format. */
function formatReport(r: StartupReport): string {
  const lines = [
    '[Temporal Observability Router]',
    '',
    `Vendor:                        ${r.vendorProfile}`,
    `Environment:                   ${r.environment}`,
    `Temporal SDK metrics exporter: ${r.exporter}`,
    `Scrape endpoint:               ${r.metricsEndpoint}`,
    `Runtime install:               ${r.runtimeInstallStatus}`,
  ];
  if (r.scrapeGuidance) {
    lines.push('', `Scrape model:                  ${r.scrapeGuidance}`);
  }
  return lines.join('\n');
}

async function run(): Promise<void> {
  const obs = attachTemporalObservability({
    serviceName: 'payment-worker',
    environment: process.env.NODE_ENV ?? 'production',
    namespace: 'default',
    taskQueue: 'payment-tasks',
    vendorProfile: 'dynatrace-oneagent',
    configSource: 'env',
    // Optional: override the scrape bind address (default 0.0.0.0:9464) inline or
    // via TEMPORAL_OBSERVABILITY_PROMETHEUS_BIND_ADDRESS.
    // prometheus: { bindAddress: '0.0.0.0:9464' },
  });

  console.log('\n=== Payment Worker Observability (Dynatrace OneAgent / Prometheus scrape) ===');
  console.log(formatReport(obs.startupReport()));

  const worker = await Worker.create({
    namespace: 'default',
    taskQueue: 'payment-tasks',
    workflowsPath: fileURLToPath(new URL('../payment/workflows.ts', import.meta.url)),
    activities,
    ...obs.workerOptions(),
  });

  console.log('\nPayment worker running. Press Ctrl+C to stop.');
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
