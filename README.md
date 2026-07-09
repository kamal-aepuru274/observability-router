# @temporalio-observability/router

A small configuration facade that attaches **Temporal TypeScript Worker metrics**
to an observability backend consistently across services.

It is **not** a telemetry pipeline, **not** an OpenTelemetry reimplementation,
and **not** a metrics engine. It configures the Temporal SDK's global Runtime
telemetry (`Runtime.install(...)`) correctly and safely, then gets out of the way.

```
Temporal Worker emits SDK metrics
  -> this library configures Temporal Runtime telemetry
    -> metrics go to Prometheus (v1) or OTLP (future)
      -> Prometheus / Dynatrace / Sumo Logic consume them
```

## Version 1 scope

| Profile | Status |
|---|---|
| `prometheus` | ✅ implemented |
| `dynatrace-otel` | declared, not implemented |
| `sumologic-otel` | declared, not implemented |
| `dynatrace-oneagent` | declared, not implemented |

Unsupported profiles throw `UnsupportedVendorProfileError` with a clear message.

## Install

```bash
npm install @temporalio-observability/router
# @temporalio/worker is a peer dependency provided by your worker service:
npm install @temporalio/worker
```

## Usage

Call `attachTemporalObservability()` **before** `Worker.create(...)`.

```ts
import { Worker } from '@temporalio/worker';
import { attachTemporalObservability } from '@temporalio-observability/router';

const obs = attachTemporalObservability({
  serviceName: 'orders-worker',
  environment: process.env.NODE_ENV ?? 'dev',
  namespace: 'default',
  taskQueue: 'orders',
  vendorProfile: 'prometheus',
});

console.log(obs.startupReport());
// {
//   serviceName: 'orders-worker',
//   ...,
//   metricsEndpoint: 'http://0.0.0.0:9464/metrics',
//   commonTags: { service_name: 'orders-worker', environment: 'dev', ... },
//   runtimeInstallation: 'new'
// }

const worker = await Worker.create({
  namespace: 'default',
  taskQueue: 'orders',
  workflowsPath: require.resolve('./workflows'),
  ...obs.workerOptions(), // {} today; reserved for future interceptors/sinks
});
await worker.run();
```

### Config fields

| Field | Required | Default | Meaning |
|---|---|---|---|
| `serviceName` | yes | – | logical worker service name |
| `environment` | yes | – | dev / qa / staging / prod |
| `namespace` | yes | – | Temporal namespace |
| `taskQueue` | yes | – | Temporal task queue |
| `vendorProfile` | yes | – | export profile |
| `routingMode` | no | `direct` | `direct` or `collector` (OTLP-only, future) |
| `configSource` | no | `inline` | `env` or `inline` (recorded in report) |
| `prometheus.bindAddress` | no | see below | inline Prometheus bind address |

### Prometheus bind address resolution

Priority: **inline → env var → default**.

- Env var: `TEMPORAL_OBSERVABILITY_PROMETHEUS_BIND_ADDRESS`
- Default: `0.0.0.0:9464`
- Scrape endpoint: `/metrics`

### Common metric tags

These low-cardinality tags are attached to every metric:
`service_name`, `environment`, `namespace`, `task_queue`, `vendor_profile`.

High-cardinality values (workflowId, runId, orderId, userId, ...) are never added.

> Note: the SDK option for global tags (`globalTags`) is version-dependent. The
> library attaches it defensively so it compiles on all supported SDK versions;
> the critical `prometheus.bindAddress` option is stable and always applies.

### Runtime install safety

`Runtime.install()` is global/singleton-like. The library tracks installation
per process:

- Same config again → no-op, report shows `runtimeInstallation: 'existing'`.
- Different config → throws `RuntimeInstallConflictError`.

## Scripts

```bash
npm install        # install deps
npm run typecheck  # tsc --noEmit (strict)
npm run build      # tsup -> ESM + CJS + d.ts in dist/
npm test           # vitest run
```

## Verify Prometheus locally

Start your worker, then:

```bash
curl http://0.0.0.0:9464/metrics
# or
curl http://localhost:9464/metrics
```

You should see Temporal SDK metrics (e.g. `temporal_worker_task_slots_available`)
tagged with `service_name`, `environment`, `namespace`, `task_queue`, `vendor_profile`.

## Roadmap

### `dynatrace-otel` (next)

Add `src/profiles/dynatraceOtel.ts` implementing `VendorProfileModule`:
resolve OTLP endpoint + `Api-Token` from env, `routingMode` picks direct vs
Collector, and `buildMetricsOptions` returns `{ otel: { url, headers } }`.
Keep the token OUT of the startup report.

### `sumologic-otel` (next)

Same pattern with a Sumo Logic OTLP source endpoint (typically Collector via
`routingMode: 'collector'`). Register in `profileRegistry` and flip
`IMPLEMENTED_VENDOR_PROFILES`.

### `dynatrace-oneagent` (later)

OneAgent auto-instrumentation depends on host/infrastructure setup (agent
presence, ingest paths) that the worker cannot self-configure. It should wait
for platform/infra clarification on how the agent is deployed and how the SDK
should hand off metrics — otherwise the library would encode assumptions it
cannot validate.
