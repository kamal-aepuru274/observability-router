# @temporalio-observability/router

A small configuration facade that attaches **Temporal TypeScript Worker metrics**
to an observability backend consistently across services.

## What this library does

- Validates a tiny, beginner-friendly config.
- Configures the Temporal SDK's global Runtime telemetry (`Runtime.install(...)`)
  correctly, safely, and exactly once per process.
- Routes metrics to **Prometheus** (scrape) or any **OTLP** endpoint (push).
- Attaches safe, low-cardinality common tags.
- Returns a secret-free startup report you can log.

## What this library does NOT do

- It does **not** reimplement OpenTelemetry.
- It does **not** collect or convert Temporal metrics itself — the Temporal SDK
  Core (Rust) does all metric emission and OTLP/Prometheus export.
- It does **not** build custom exporters.
- It does **not** call Dynatrace, Sumo Logic, or any other vendor API.

```
Temporal Worker emits SDK metrics
  -> this library configures Temporal Runtime telemetry
    -> Temporal SDK exports via Prometheus scrape endpoint or OTLP
      -> Prometheus / OpenTelemetry Collector / any OTLP-compatible backend
```

## Version 2 scope

| Profile | Status |
|---|---|
| `prometheus` | ✅ implemented (v1) |
| `otel` | ✅ implemented (v2, generic OTLP export) |
| `dynatrace` | declared, not implemented |
| `sumologic` | declared, not implemented |
| `dynatrace-oneagent` | declared, not implemented |

Unsupported profiles throw `UnsupportedVendorProfileError` with a clear message.

### Why `otel` before Dynatrace/Sumo profiles?

Dynatrace and Sumo Logic both ingest standard OTLP. A generic `otel` profile
already covers them today: point the worker (or your Collector) at their OTLP
ingest endpoint and set auth headers via env. Vendor-named profiles would only
add naming conveniences and vendor-specific validation — worth doing later, but
not required to ship metrics. Implementing OTLP once also means every future
vendor profile is a thin preset on top of a tested transport, instead of a
custom integration.

### Why we never implement custom vendor APIs

The Temporal SDK Core already speaks OTLP natively. Calling vendor ingest APIs
ourselves would mean re-collecting and re-converting metrics — duplicated,
fragile machinery that OpenTelemetry already standardizes. Anything
OTLP-compatible works with `vendorProfile: 'otel'` today.

## Install

```bash
npm install @temporalio-observability/router
# @temporalio/worker is a peer dependency provided by your worker service:
npm install @temporalio/worker
```

## Usage

Call `attachTemporalObservability()` **before** `Worker.create(...)`.

### Prometheus (scrape)

```ts
import { Worker } from '@temporalio/worker';
import { attachTemporalObservability } from '@temporalio-observability/router';

const obs = attachTemporalObservability({
  serviceName: 'payment-worker',
  environment: 'dev',
  namespace: 'default',
  taskQueue: 'payment-tasks',
  vendorProfile: 'prometheus',
  routingMode: 'direct',
  configSource: 'env',
});

console.log(obs.startupReport());
// {
//   ...,
//   exporter: 'prometheus',
//   metricsEndpoint: 'http://0.0.0.0:9464/metrics',
//   runtimeInstallation: 'new'
// }

const worker = await Worker.create({
  namespace: 'default',
  taskQueue: 'payment-tasks',
  workflowsPath: require.resolve('./workflows'),
  ...obs.workerOptions(), // {} today; reserved for future interceptors/sinks
});
await worker.run();
```

### Generic OTEL via Collector (push)

```ts
const obs = attachTemporalObservability({
  serviceName: 'payment-worker',
  environment: 'prod',
  namespace: 'payments',
  taskQueue: 'payment-tasks',
  vendorProfile: 'otel',
  routingMode: 'collector',
  configSource: 'env',
});
```

```bash
TEMPORAL_OBSERVABILITY_OTLP_ENDPOINT=http://localhost:4318/v1/metrics
TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http
```

### Generic OTEL direct to an OTLP-compatible backend

```ts
const obs = attachTemporalObservability({
  serviceName: 'payment-worker',
  environment: 'prod',
  namespace: 'payments',
  taskQueue: 'payment-tasks',
  vendorProfile: 'otel',
  routingMode: 'direct',
  configSource: 'env',
});
```

```bash
TEMPORAL_OBSERVABILITY_OTLP_ENDPOINT=https://your-otlp-compatible-endpoint/v1/metrics
TEMPORAL_OBSERVABILITY_OTLP_HEADERS="Authorization=Bearer <token>"
TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http
```

The OTEL startup report is secret-safe:

```
exporter: otlp
vendorProfile: otel
routingMode: collector
otlpEndpoint: http://localhost:4318/v1/metrics
otlpProtocol: http
headersConfigured: true
metricsExportIntervalMs: 10000
runtimeInstallation: new | existing
```

### Collector mode vs direct mode

- **`collector`** — worker pushes OTLP to an OpenTelemetry Collector
  (e.g. `http://localhost:4318/v1/metrics` or `http://localhost:4317`), which
  handles fan-out, retries, and vendor auth. Recommended for production.
- **`direct`** — worker pushes OTLP straight to an OTLP-compatible backend.
  Auth headers usually required. The wire format is still plain OTLP; the
  library never calls vendor APIs.

### Config fields

| Field | Required | Default | Meaning |
|---|---|---|---|
| `serviceName` | yes | – | logical worker service name |
| `environment` | yes | – | dev / qa / staging / prod |
| `namespace` | yes | – | Temporal namespace |
| `taskQueue` | yes | – | Temporal task queue |
| `vendorProfile` | yes | – | `prometheus`, `otel`, or a declared future profile |
| `routingMode` | no | `direct` | `direct` or `collector` |
| `configSource` | no | `inline` | `env` or `inline` (recorded in report) |
| `prometheus.bindAddress` | no | see below | inline Prometheus bind address |
| `otlpEndpoint` | otel: yes* | – | OTLP endpoint (inline or via env, see below) |
| `otlpProtocol` | no | `http` | `http` or `grpc` |
| `otlpHeaders` | no | – | OTLP request headers (never logged) |
| `metricsExportIntervalMs` | no | `10000` | positive number of milliseconds |

\* required for `vendorProfile: 'otel'`, but may come from env vars instead of inline.

### Prometheus bind address resolution

Priority: **inline → env var → default**.

- Env var: `TEMPORAL_OBSERVABILITY_PROMETHEUS_BIND_ADDRESS`
- Default: `0.0.0.0:9464`
- Scrape endpoint: `/metrics`

### OTLP resolution (vendorProfile: 'otel')

| Value | Priority (highest first) | Default |
|---|---|---|
| endpoint | `otlpEndpoint` → `TEMPORAL_OBSERVABILITY_OTLP_ENDPOINT` → `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` → `OTEL_EXPORTER_OTLP_ENDPOINT` | **required** |
| protocol | `otlpProtocol` → `TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL` → `OTEL_EXPORTER_OTLP_PROTOCOL` | `http` |
| headers | `otlpHeaders` → `TEMPORAL_OBSERVABILITY_OTLP_HEADERS` → `OTEL_EXPORTER_OTLP_HEADERS` | none |
| export interval | `metricsExportIntervalMs` → `TEMPORAL_OBSERVABILITY_METRICS_EXPORT_INTERVAL_MS` → `OTEL_METRIC_EXPORT_INTERVAL` | `10000` ms |

Notes:

- Env header format: `Authorization=Bearer abc123,x-api-key=xyz`.
- Standard OTEL protocol values `http/protobuf` and `http/json` normalize to `http`.
- The Temporal SDK notes that if `OTEL_EXPORTER_OTLP_ENDPOINT` is set, SDK Core
  itself may honor it over the configured URL — keep env and inline values
  consistent to avoid surprises.

### Common metric tags

These low-cardinality tags are attached to every metric:
`app_service_name`, `environment`, `namespace`, `task_queue`, `vendor_profile`, `routing_mode`.

High-cardinality values (workflowId, runId, orderId, userId, ...) are never added.

> Note: the SDK option for global tags (`globalTags`) is version-dependent. The
> library attaches it defensively so it compiles on all supported SDK versions;
> the critical `prometheus.bindAddress` option is stable and always applies.

### Runtime install safety

`Runtime.install()` is global/singleton-like. The library tracks installation
per process:

- Same config again (prometheus or otel) → no-op, report shows
  `runtimeInstallation: 'existing'`.
- Different config (different profile, endpoint, protocol, or headers) → throws
  `RuntimeInstallConflictError` saying the Temporal Runtime telemetry is
  already installed with a different observability config.

Header differences are detected via a **hash fingerprint**, so conflict errors
never contain header values.

## Security

- Header values and tokens are **never** logged, never included in the startup
  report (`headersConfigured: true|false` only), and never embedded in error
  messages or install signatures.
- Pass secrets via env vars (`TEMPORAL_OBSERVABILITY_OTLP_HEADERS`), not inline
  in code.

## Scripts

```bash
npm install        # install deps
npm run typecheck  # tsc --noEmit (strict)
npm run build      # tsup -> ESM + CJS + d.ts in dist/
npm test           # vitest run
```

## Verify Prometheus locally

Start your worker (`npx tsx examples/payment/worker.ts`), then:

```bash
curl http://localhost:9464/metrics
```

You should see Temporal SDK metrics (e.g. `temporal_worker_task_slots_available`)
tagged with `app_service_name`, `environment`, `namespace`, `task_queue`,
`vendor_profile`, `routing_mode`.

## Verify OTEL locally (Collector debug exporter)

1. Start a local OpenTelemetry Collector with the provided debug config:

   ```bash
   docker compose -f examples/otel-collector/docker-compose.yaml up
   # or plain Docker:
   docker run --rm -p 4317:4317 -p 4318:4318 \
     -v "$(pwd)/examples/otel-collector/collector-config.yaml:/etc/otelcol-contrib/config.yaml" \
     otel/opentelemetry-collector-contrib:latest
   ```

2. Start the worker pointing at it:

   ```bash
   TEMPORAL_OBSERVABILITY_OTLP_ENDPOINT=http://localhost:4318/v1/metrics \
   TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http \
   npx tsx examples/payment/worker-otel-collector.ts
   ```

3. Watch Temporal SDK metrics appear in the Collector's console (debug) output.

## Roadmap

### `dynatrace` (not implemented yet)

Dynatrace ingests standard OTLP, so `vendorProfile: 'otel'` pointed at the
Dynatrace OTLP endpoint (with an `Authorization: Api-Token …` header via env)
works today. A dedicated profile would only add endpoint/token conveniences and
validation, so it is deferred until teams need it.

### `sumologic` (not implemented yet)

Same reasoning: Sumo Logic accepts OTLP (typically via a Collector, i.e.
`routingMode: 'collector'`). Generic `otel` covers it; a named profile would be
a thin preset and is deferred.

### `dynatrace-oneagent` (not implemented yet)

OneAgent auto-instrumentation depends on host/infrastructure setup (agent
presence, ingest paths) that the worker cannot self-configure. It should wait
for platform/infra clarification on how the agent is deployed and how the SDK
should hand off metrics — otherwise the library would encode assumptions it
cannot validate.
