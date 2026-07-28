# @temporalio-observability/router

A small configuration facade that attaches **Temporal TypeScript Worker
metrics** to an observability backend consistently across services.

```
Temporal Worker emits SDK metrics
  -> this library configures Temporal Runtime telemetry
    -> Temporal SDK exports via Prometheus scrape endpoint or OTLP
      -> Prometheus / OpenTelemetry Collector / any OTLP-compatible backend
```

## What this library does

- Validates a tiny, beginner-friendly config.
- Configures the Temporal SDK's global Runtime telemetry (`Runtime.install(...)`)
  correctly, safely, and exactly once per process.
- Routes metrics to **Prometheus** (scrape) or any **OTLP** endpoint (push),
  including **Sumo Logic** and **Dynatrace OneAgent** as named vendor profiles.
- Attaches safe, low-cardinality common tags.
- Returns a secret-free startup report you can log.

## What this library does NOT do

- It does **not** reimplement OpenTelemetry.
- It does **not** collect or convert Temporal metrics itself — the Temporal SDK
  Core (Rust) does all metric emission and OTLP/Prometheus export.
- It does **not** build custom exporters or call vendor ingest APIs directly
  (Dynatrace, Sumo Logic, etc.) — everything travels over standard OTLP or a
  Prometheus scrape.

## Requirements

- Node.js `>=18`
- `@temporalio/worker` `>=1.9.0 <2.0.0` (peer dependency, installed by your worker service)
- Docker (optional — only needed to run a local OpenTelemetry Collector for the `otel` / `sumologic` profiles)

## Install

```bash
npm install @temporalio-observability/router
npm install @temporalio/worker   # peer dependency
```

## Quick start

Call `attachTemporalObservability()` **before** `Worker.create(...)`:

```ts
import { Worker } from '@temporalio/worker';
import { attachTemporalObservability } from '@temporalio-observability/router';

const obs = attachTemporalObservability({
  serviceName: 'payment-worker',
  environment: 'dev',
  namespace: 'default',
  taskQueue: 'payment-tasks',
  vendorProfile: 'prometheus', // or 'otel' | 'sumologic' | 'dynatrace-oneagent'
});

console.log(obs.startupReport()); // secret-free, safe to log

const worker = await Worker.create({
  namespace: 'default',
  taskQueue: 'payment-tasks',
  workflowsPath: require.resolve('./workflows'),
  ...obs.workerOptions(), // {} today; reserved for future interceptors/sinks
});
await worker.run();
```

Then verify: `curl http://localhost:9464/metrics`.

## Supported profiles

| Profile | Exporter | Status |
|---|---|---|
| `prometheus` | Prometheus scrape | ✅ implemented |
| `otel` | OTLP push | ✅ implemented (generic OTLP export) |
| `sumologic` | OTLP push | ✅ implemented (thin OTLP preset) |
| `dynatrace-oneagent` | Prometheus scrape | ✅ implemented (thin Prometheus preset) |
| `dynatrace` | OTLP push | declared, not implemented — use `otel` with the Dynatrace OTLP endpoint |

Unsupported profiles throw `UnsupportedVendorProfileError` with a clear message.

**Full usage examples for every profile** (Collector vs direct mode, env vars,
Dynatrace scrape models, etc.) are in **[docs/PROFILES.md](./docs/PROFILES.md)**.

## Documentation

| Guide | Contents |
|---|---|
| **[docs/PROFILES.md](./docs/PROFILES.md)** | Full usage code for every profile, why vendor APIs are never called directly, collector vs direct mode |
| **[docs/CONFIGURATION.md](./docs/CONFIGURATION.md)** | All config fields, env var resolution order, common tags, runtime install safety |
| **[docs/LOCAL_VERIFICATION.md](./docs/LOCAL_VERIFICATION.md)** | Step-by-step local testing for every profile, Docker Collector usage |

## Security

- Header values and tokens are **never** logged, never included in the startup
  report (`headersConfigured: true|false` only), and never embedded in error
  messages or install signatures (a SHA-256 fingerprint is used instead).
- Pass secrets via env vars (e.g. `TEMPORAL_OBSERVABILITY_OTLP_HEADERS`), not
  inline in code.

## Scripts

```bash
npm run typecheck  # tsc --noEmit (strict)
npm run build      # tsup -> ESM + CJS + d.ts in dist/
npm test           # vitest run
```

## Roadmap

`dynatrace` (OTLP push) is declared but not implemented — Dynatrace ingests
standard OTLP, so `vendorProfile: 'otel'` pointed at the Dynatrace OTLP
endpoint already works today. A dedicated profile would only add
endpoint/token conveniences and is deferred until needed.

## License

[MIT](./LICENSE)
