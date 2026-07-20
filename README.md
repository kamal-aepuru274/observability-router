# @temporalio-observability/router

A small configuration facade that attaches **Temporal TypeScript Worker metrics**
to an observability backend consistently across services.

## What this library does

- Validates a tiny, beginner-friendly config.
- Configures the Temporal SDK's global Runtime telemetry (`Runtime.install(...)`)
  correctly, safely, and exactly once per process.
- Routes metrics to **Prometheus** (scrape) or any **OTLP** endpoint (push),
  including **Sumo Logic** as a named vendor profile.
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

## Profile scope

| Profile | Exporter | Status |
|---|---|---|
| `prometheus` | Prometheus scrape | ✅ implemented (v1) |
| `otel` | OTLP push | ✅ implemented (v2, generic OTLP export) |
| `sumologic` | OTLP push | ✅ implemented (v4, uses OTLP internally) |
| `dynatrace-oneagent` | Prometheus scrape | ✅ implemented (v5, Prometheus preset scraped by Dynatrace) |
| `dynatrace` | OTLP push | declared, not implemented (use `otel` with the Dynatrace OTLP endpoint) |

Unsupported profiles throw `UnsupportedVendorProfileError` with a clear message.

### Why `otel` first, then `sumologic`?

Dynatrace and Sumo Logic both ingest standard OTLP. A generic `otel` profile
already covers them: point the worker (or your Collector) at their OTLP ingest
endpoint and set auth headers via env. `sumologic` is now a thin vendor preset
that reuses the same OTLP implementation and adds Sumo-specific env var
precedence. Every future vendor profile (e.g. Dynatrace) can follow the same
pattern: a high-level profile that resolves vendor-specific values and delegates
to the proven OTLP builder.

### Why we never implement custom vendor APIs

The Temporal SDK Core already speaks OTLP natively. Calling vendor ingest APIs
ourselves would mean re-collecting and re-converting metrics — duplicated,
fragile machinery that OpenTelemetry already standardizes. `vendorProfile: 'sumologic'`
does not call Sumo Logic APIs, batch data, or build custom upload logic. It
only resolves Sumo-specific OTLP endpoint/protocol/headers and hands the rest to
the Temporal SDK Core, which exports standard OTLP. Anything OTLP-compatible
works with `vendorProfile: 'otel'` or `vendorProfile: 'sumologic'` today.

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

Start the shared local Collector from the repository root. Its default pipeline
prints received metrics to the Collector logs:

```bash
docker compose up
```

Use the same stack for vendor pipelines by selecting a Collector config:

```bash
# Sumo Logic
COLLECTOR_CONFIG=./examples/sumologic/collector-config.yaml \
  SUMOLOGIC_HTTP_SOURCE_URL=https://... docker compose up

# Dynatrace OTLP
COLLECTOR_CONFIG=./examples/otel-collector/otel-collector-dynatrace.yaml \
  DT_OTLP_ENDPOINT=https://<environment>.live.dynatrace.com/api/v2/otlp \
  DT_AUTH_HEADER='Api-Token <token>' docker compose up
```

`prometheus` and `dynatrace-oneagent` do not use this OTLP Collector by default:
they expose `/metrics` for a Prometheus-compatible scraper to collect.

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

### Sumo Logic via Collector

```ts
const obs = attachTemporalObservability({
  serviceName: 'payment-worker',
  environment: 'prod',
  namespace: 'payments',
  taskQueue: 'payment-tasks',
  vendorProfile: 'sumologic',
  routingMode: 'collector',
  configSource: 'env',
});
```

```bash
TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_ENDPOINT=http://localhost:4318/v1/metrics
TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http
```

### Sumo Logic direct OTLP

```ts
const obs = attachTemporalObservability({
  serviceName: 'payment-worker',
  environment: 'prod',
  namespace: 'payments',
  taskQueue: 'payment-tasks',
  vendorProfile: 'sumologic',
  routingMode: 'direct',
  configSource: 'env',
});
```

```bash
TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_ENDPOINT=https://your-sumo-otlp-http-source-endpoint
TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_HEADERS="x-sumo-category=temporal-workers"
TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http
```

Never hardcode real URLs or tokens. The startup report is secret-safe:

```
exporter: otlp
vendorProfile: otel
routingMode: collector
otlpEndpoint: http://localhost:4318/v1/metrics
otlpProtocol: http
headersConfigured: true
metricsExportIntervalMs: 10000
runtimeInstallStatus: installed | already_installed
```

### Dynatrace OneAgent (Prometheus scrape preset)

Dynatrace does **not** derive Temporal-specific metrics (task latency, workflow
failures, poller activity, ...) on its own — the **Temporal SDK must emit them**
via a Prometheus `/metrics` endpoint. So `dynatrace-oneagent` is a thin preset
over the `prometheus` profile: it exposes that endpoint, and **Dynatrace scrapes
it**. No standalone Prometheus server is required.

```
VM:         Temporal Worker /metrics -> OneAgent Prometheus extension -> Dynatrace
Kubernetes: Temporal Worker /metrics -> ActiveGate / OTel Collector    -> Dynatrace
```

The library does **not** talk to OneAgent, push to a vendor API, or implement
scraping — the scrape is owned by Dynatrace infrastructure.

```ts
const obs = attachTemporalObservability({
  serviceName: 'payment-worker',
  environment: 'production',
  namespace: 'default',
  taskQueue: 'payment-tasks',
  vendorProfile: 'dynatrace-oneagent',
  // Optional: override the scrape bind address (default 0.0.0.0:9464).
  // prometheus: { bindAddress: '0.0.0.0:9464' },
});

console.log(obs.startupReport());
// {
//   ...,
//   vendorProfile: 'dynatrace-oneagent',
//   exporter: 'prometheus',
//   metricsEndpoint: 'http://0.0.0.0:9464/metrics',
//   runtimeInstallStatus: 'installed',
//   scrapeGuidance: 'Exposes a Prometheus /metrics endpoint for Dynatrace to scrape. ...'
// }
```

Bind address resolution is identical to the `prometheus` profile: inline
`prometheus.bindAddress` > `TEMPORAL_OBSERVABILITY_PROMETHEUS_BIND_ADDRESS` >
default `0.0.0.0:9464` (scrape path `/metrics`).

#### VM — OneAgent Prometheus extension

On a VM with OneAgent installed, no Prometheus server is needed. Install a
**Prometheus extension** from Dynatrace Hub and add a monitoring configuration
that scrapes `http://localhost:9464/metrics` **locally** on the host's OneAgent
(Extension Execution Controller). Metrics are enriched with host context. See
`examples/dynatrace-oneagent/vm-oneagent-prometheus-extension.md`.

#### Kubernetes — ActiveGate / OTel Collector / annotations

On Kubernetes, OneAgent alone is **not** the recommended scraper. Use one of:

- **Dynatrace scrape annotations** (`metrics.dynatrace.com/scrape: 'true'`,
  `.../port`, `.../path`) so Dynatrace scrapes the pod's OpenMetrics endpoint.
- The **Dynatrace OpenTelemetry Collector** (Target Allocator) — recommended for
  high-volume / new deployments; scrapes Prometheus targets and ingests via OTLP.
- An **ActiveGate** remote Prometheus extension.

See `examples/dynatrace-oneagent/k8s-deployment.yaml`.

#### Verify

```bash
npm run build
npx tsx examples/dynatrace-oneagent/worker-basic.ts
curl http://localhost:9464/metrics
```

### Collector mode vs direct mode

- **`collector`** — worker pushes OTLP to an OpenTelemetry Collector
  (e.g. `http://localhost:4318/v1/metrics` or `http://localhost:4317`), which
  handles fan-out, retries, and vendor auth. Recommended for production.
- **`direct`** — worker pushes OTLP straight to an OTLP-compatible backend.
  Auth headers are usually required. The wire format is still plain OTLP; the
  library never calls vendor APIs.
  - For `sumologic` direct mode, the worker pushes to a Sumo Logic OTLP HTTP
    Source and headers such as `x-sumo-category` can be used.

### Config fields

| Field | Required | Default | Meaning |
|---|---|---|---|
| `serviceName` | yes | – | logical worker service name |
| `environment` | yes | – | dev / qa / staging / prod |
| `namespace` | yes | – | Temporal namespace |
| `taskQueue` | yes | – | Temporal task queue |
| `vendorProfile` | yes | – | `prometheus`, `otel`, `sumologic`, or a declared future profile |
| `routingMode` | no | `direct` | `direct` or `collector` |
| `configSource` | no | `inline` | `env` or `inline` (recorded in report) |
| `prometheus.bindAddress` | no | see below | inline Prometheus bind address |
| `otlpEndpoint` | otel/sumologic: yes* | – | OTLP endpoint (inline or via env, see below) |
| `otlpProtocol` | no | `http` | `http` or `grpc` |
| `otlpHeaders` | no | – | OTLP request headers (never logged) |
| `metricsExportIntervalMs` | no | `10000` | positive number of milliseconds |

\* required for `vendorProfile: 'otel'` or `vendorProfile: 'sumologic'`, but may come from env vars instead of inline.

`vendorProfile: 'dynatrace-oneagent'` uses the same fields as `prometheus`
(`prometheus.bindAddress` and the bind-address env var); OTLP fields do not apply.

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

### OTLP resolution (vendorProfile: 'sumologic')

| Value | Priority (highest first) | Default |
|---|---|---|
| endpoint | `otlpEndpoint` → `TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_ENDPOINT` → `TEMPORAL_OBSERVABILITY_OTLP_ENDPOINT` → `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` → `OTEL_EXPORTER_OTLP_ENDPOINT` | **required** |
| protocol | `otlpProtocol` → `TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_PROTOCOL` → `TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL` → `OTEL_EXPORTER_OTLP_PROTOCOL` | `http` |
| headers | `otlpHeaders` → `TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_HEADERS` → `TEMPORAL_OBSERVABILITY_OTLP_HEADERS` → `OTEL_EXPORTER_OTLP_HEADERS` | none |
| export interval | `metricsExportIntervalMs` → `TEMPORAL_OBSERVABILITY_SUMOLOGIC_METRICS_EXPORT_INTERVAL_MS` → `TEMPORAL_OBSERVABILITY_METRICS_EXPORT_INTERVAL_MS` → `OTEL_METRIC_EXPORT_INTERVAL` | `10000` ms |

Notes:

- Env header format: `Authorization=Bearer abc123,x-api-key=xyz` or `x-sumo-category=temporal-workers,Authorization=Bearer abc123`.
- Standard OTEL protocol values `http/protobuf` and `http/json` normalize to `http`.
- The Temporal SDK notes that if `OTEL_EXPORTER_OTLP_ENDPOINT` is set, SDK Core
  itself may honor it over the configured URL — keep env and inline values
  consistent to avoid surprises.

### Common metric tags

These low-cardinality tags are attached to every metric:
`service_name`, `environment`, `namespace`, `task_queue`, `vendor_profile`, `routing_mode`.

High-cardinality values (workflowId, runId, orderId, userId, ...) are never added.

> Note: the Temporal SDK also adds a `service_name` tag by default (value
> `temporal-core-sdk`). The library disables that default (`attachServiceName: false`)
> so the `service_name` tag matches the configured `serviceName` instead.
> The `globalTags` option is version-dependent; the library attaches it defensively
> so it compiles on all supported SDK versions.

### Runtime install safety

`Runtime.install()` is global/singleton-like. The library tracks installation
per process:

- Same config again (prometheus, otel, or sumologic) → no-op, report shows
  `runtimeInstallStatus: 'already_installed'`.
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
tagged with `service_name`, `environment`, `namespace`, `task_queue`,
`vendor_profile`, `routing_mode`.

## Verify OTEL locally (Collector debug exporter)

1. Start a local OpenTelemetry Collector with the provided debug config:

   ```bash
   docker compose up
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

## Verify Sumo Logic locally (OTEL Collector debug exporter)

1. Start the debug OpenTelemetry Collector:

   ```bash
   docker compose up
   ```

2. Run the Sumo Logic collector-mode example:

   ```bash
   TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_ENDPOINT=http://localhost:4318/v1/metrics \
   TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http \
   npx tsx examples/payment/worker-sumologic-collector.ts
   ```

3. Confirm metrics appear in the Collector's console (debug) output. This proves
   the worker is emitting OTLP correctly and the only remaining step is to point
   the Collector at Sumo Logic.

## Verify Sumo Logic direct OTLP export

1. Create a Sumo Logic OTLP HTTP Source and obtain the endpoint URL.
2. Set the endpoint in env (never inline):

   ```bash
   TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_ENDPOINT=https://your-sumo-otlp-http-source-endpoint
   TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_HEADERS="x-sumo-category=temporal-workers"
   TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http
   ```

3. Run the direct-mode example:

   ```bash
   npx tsx examples/payment/worker-sumologic-direct.ts
   ```

4. Verify metrics appear in Sumo Logic. The library does not call Sumo Logic
   APIs; the Temporal SDK Core pushes plain OTLP to the configured endpoint.

## Roadmap

### `dynatrace` (not implemented yet)

Dynatrace ingests standard OTLP, so `vendorProfile: 'otel'` pointed at the
Dynatrace OTLP endpoint (with an `Authorization: Api-Token …` header via env)
works today. A dedicated profile would only add endpoint/token conveniences and
validation, so it is deferred until teams need it.

### `sumologic` (implemented)

Implemented as a thin OTLP preset. See `vendorProfile: 'sumologic'` and the
Sumo-specific env var precedence above.

### `dynatrace-oneagent` (implemented, v5)

Implemented as a thin **Prometheus scrape preset**. Dynatrace does not derive
Temporal-specific metrics on its own, so the worker must expose a Prometheus
`/metrics` endpoint; Dynatrace scrapes it (VM: OneAgent Prometheus extension;
K8s: ActiveGate / OTel Collector / scrape annotations). See the "Dynatrace
OneAgent (Prometheus scrape preset)" section above and `examples/dynatrace-oneagent/`.
