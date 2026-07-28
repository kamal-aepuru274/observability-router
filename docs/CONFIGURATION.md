# Configuration Reference

## Config fields

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

## Prometheus bind address resolution

Priority: **inline → env var → default**.

- Env var: `TEMPORAL_OBSERVABILITY_PROMETHEUS_BIND_ADDRESS`
- Default: `0.0.0.0:9464`
- Scrape endpoint: `/metrics`

## OTLP resolution (`vendorProfile: 'otel'`)

| Value | Priority (highest first) | Default |
|---|---|---|
| endpoint | `otlpEndpoint` → `TEMPORAL_OBSERVABILITY_OTLP_ENDPOINT` → `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` → `OTEL_EXPORTER_OTLP_ENDPOINT` | **required** |
| protocol | `otlpProtocol` → `TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL` → `OTEL_EXPORTER_OTLP_PROTOCOL` | `http` |
| headers | `otlpHeaders` → `TEMPORAL_OBSERVABILITY_OTLP_HEADERS` → `OTEL_EXPORTER_OTLP_HEADERS` | none |
| export interval | `metricsExportIntervalMs` → `TEMPORAL_OBSERVABILITY_METRICS_EXPORT_INTERVAL_MS` → `OTEL_METRIC_EXPORT_INTERVAL` | `10000` ms |

## OTLP resolution (`vendorProfile: 'sumologic'`)

| Value | Priority (highest first) | Default |
|---|---|---|
| endpoint | `otlpEndpoint` → `TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_ENDPOINT` → `TEMPORAL_OBSERVABILITY_OTLP_ENDPOINT` → `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` → `OTEL_EXPORTER_OTLP_ENDPOINT` | **required** |
| protocol | `otlpProtocol` → `TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_PROTOCOL` → `TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL` → `OTEL_EXPORTER_OTLP_PROTOCOL` | `http` |
| headers | `otlpHeaders` → `TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_HEADERS` → `TEMPORAL_OBSERVABILITY_OTLP_HEADERS` → `OTEL_EXPORTER_OTLP_HEADERS` | none |
| export interval | `metricsExportIntervalMs` → `TEMPORAL_OBSERVABILITY_SUMOLOGIC_METRICS_EXPORT_INTERVAL_MS` → `TEMPORAL_OBSERVABILITY_METRICS_EXPORT_INTERVAL_MS` → `OTEL_METRIC_EXPORT_INTERVAL` | `10000` ms |

**Notes:**

- Env header format: `Authorization=Bearer abc123,x-api-key=xyz` or `x-sumo-category=temporal-workers,Authorization=Bearer abc123`.
- Standard OTEL protocol values `http/protobuf` and `http/json` normalize to `http`.
- The Temporal SDK notes that if `OTEL_EXPORTER_OTLP_ENDPOINT` is set, SDK Core
  itself may honor it over the configured URL — keep env and inline values
  consistent to avoid surprises.

## Common metric tags

These low-cardinality tags are attached to every metric:
`service_name`, `environment`, `namespace`, `task_queue`, `vendor_profile`, `routing_mode`.

High-cardinality values (workflowId, runId, orderId, userId, ...) are never added.

> The Temporal SDK also adds a `service_name` tag by default (value
> `temporal-core-sdk`). The library disables that default (`attachServiceName: false`)
> so the `service_name` tag matches the configured `serviceName` instead. The
> `globalTags` option is version-dependent; the library attaches it defensively
> so it compiles on all supported SDK versions.

## Runtime install safety

`Runtime.install()` is global/singleton-like. The library tracks installation
per process:

- Same config again (prometheus, otel, or sumologic) → no-op, report shows
  `runtimeInstallStatus: 'already_installed'`.
- Different config (different profile, endpoint, protocol, or headers) → throws
  `RuntimeInstallConflictError` saying the Temporal Runtime telemetry is
  already installed with a different observability config.

Header differences are detected via a **hash fingerprint**, so conflict errors
never contain header values.
