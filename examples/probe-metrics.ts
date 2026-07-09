/**
 * Minimal script to verify the Prometheus metrics endpoint.
 * Does NOT connect to Temporal Server - just installs the Runtime
 * and keeps the process alive so you can curl http://localhost:9464/metrics.
 *
 * Run: npx tsx examples/probe-metrics.ts
 * Then in another terminal: curl http://localhost:9464/metrics
 * Press Ctrl+C to stop.
 */
import { Runtime } from '@temporalio/worker';
import { attachTemporalObservability } from '../dist/index.js';

const obs = attachTemporalObservability({
  serviceName: 'orders-worker',
  environment: process.env.NODE_ENV ?? 'dev',
  namespace: 'default',
  taskQueue: 'orders',
  vendorProfile: 'prometheus',
});

console.log('Startup report:', obs.startupReport());
console.log('\nMetrics endpoint is UP at: http://localhost:9464/metrics');
console.log('Run in another terminal: curl http://localhost:9464/metrics');
console.log('Press Ctrl+C to stop.\n');

// Keep the process alive
setInterval(() => {}, 60_000);
