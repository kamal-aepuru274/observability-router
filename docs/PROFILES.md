# Vendor Profiles — Full Usage Guide

Call `attachTemporalObservability()` **before** `Worker.create(...)`. All examples
below assume:

```ts
import { Worker } from '@temporalio/worker';
import { attachTemporalObservability } from '@temporalio-observability/router';
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
endpoint and set auth headers via env. `sumologic` is a thin vendor preset that
reuses the same OTLP implementation and adds Sumo-specific env var precedence.
Every future vendor profile (e.g. Dynatrace) can follow the same pattern: a
high-level profile that resolves vendor-specific values and delegates to the
proven OTLP builder.

### Why we never implement custom vendor APIs

The Temporal SDK Core already speaks OTLP natively. Calling vendor ingest APIs
ourselves would mean re-collecting and re-converting metrics — duplicated,
fragile machinery that OpenTelemetry already standardizes. `vendorProfile: 'sumologic'`
does not call Sumo Logic APIs, batch data, or build custom upload logic. It
only resolves Sumo-specific OTLP endpoint/protocol/headers and hands the rest
to the Temporal SDK Core, which exports standard OTLP.

---

## Prometheus (scrape)

```ts
const obs = attachTemporalObservability({
  serviceName: 'payment-worker',
  environment: 'dev',
  namespace: 'default',
  taskQueue: 'payment-tasks',
  vendorProfile: 'prometheus',
  routingMode: 'direct',
  configSource: 'env',
});

const worker = await Worker.create({
  namespace: 'default',
  taskQueue: 'payment-tasks',
  workflowsPath: require.resolve('./workflows'),
  ...obs.workerOptions(), // {} today; reserved for future interceptors/sinks
});
await worker.run();
```

Run the example: `npx tsx examples/payment/worker.ts` — see
[Local Verification](./LOCAL_VERIFICATION.md#prometheus) to confirm it works.

---

## Generic OTEL (push)

### Via an OpenTelemetry Collector (recommended)

```ts
const obs = attachTemporalObservability({
  serviceName: 'payment-worker',
  environment: 'prod',
  namespace: 'default',
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

Start the shared local Collector from the repository root (default pipeline
prints received metrics to console): `docker compose up`. See
[Docker & Local Verification](./LOCAL_VERIFICATION.md#otel-via-collector) for
the full walkthrough and vendor pipeline configs (Sumo Logic, Dynatrace).

### Direct to an OTLP-compatible backend

```ts
const obs = attachTemporalObservability({
  serviceName: 'payment-worker',
  environment: 'prod',
  namespace: 'default',
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

`prometheus` and `dynatrace-oneagent` do **not** use the OTLP Collector: they
expose `/metrics` for a Prometheus-compatible scraper to collect instead.

---

## Sumo Logic

### Via Collector

```ts
const obs = attachTemporalObservability({
  serviceName: 'payment-worker',
  environment: 'prod',
  namespace: 'default',
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

### Direct OTLP

```ts
const obs = attachTemporalObservability({
  serviceName: 'payment-worker',
  environment: 'prod',
  namespace: 'default',
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

See [Local Verification](./LOCAL_VERIFICATION.md#sumo-logic) for the full
Collector debug walkthrough.

---

## Dynatrace OneAgent (Prometheus scrape preset)

Dynatrace does **not** derive Temporal-specific metrics (task latency, workflow
failures, poller activity, ...) on its own — the **Temporal SDK must emit
them** via a Prometheus `/metrics` endpoint. `dynatrace-oneagent` is a thin
preset over the `prometheus` profile: it exposes that endpoint, and
**Dynatrace scrapes it**. No standalone Prometheus server is required. The
library does **not** talk to OneAgent, push to a vendor API, or implement
scraping.

```
VM:         Temporal Worker /metrics -> OneAgent Prometheus extension -> Dynatrace
Kubernetes: Temporal Worker /metrics -> ActiveGate / OTel Collector    -> Dynatrace
```

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
```

Bind address resolution is identical to the `prometheus` profile: inline
`prometheus.bindAddress` > `TEMPORAL_OBSERVABILITY_PROMETHEUS_BIND_ADDRESS` >
default `0.0.0.0:9464` (scrape path `/metrics`).

- **VM** — OneAgent Prometheus extension scrapes locally. See
  `examples/dynatrace-oneagent/vm-oneagent-prometheus-extension.md`.
- **Kubernetes** — use Dynatrace scrape annotations, the Dynatrace
  OpenTelemetry Collector, or an ActiveGate. See
  `examples/dynatrace-oneagent/k8s-deployment.yaml`.

Verify: `npx tsx examples/dynatrace-oneagent/worker-basic.ts` then
`curl http://localhost:9464/metrics`.

---

## Collector mode vs direct mode

- **`collector`** — worker pushes OTLP to an OpenTelemetry Collector, which
  handles fan-out, retries, and vendor auth. Recommended for production.
- **`direct`** — worker pushes OTLP straight to an OTLP-compatible backend.
  Auth headers are usually required. The wire format is still plain OTLP; the
  library never calls vendor APIs.
