# Dynatrace OneAgent examples

The **`dynatrace-oneagent`** profile is a thin preset over the `prometheus`
profile. Dynatrace does not derive Temporal-specific metrics (task latency,
workflow failures, poller activity, ...) on its own — the **Temporal SDK must
emit them**. So this profile simply exposes the Temporal SDK Prometheus
`/metrics` endpoint, and Dynatrace scrapes it. **No standalone Prometheus server
is required.**

```
VM:         Temporal Worker /metrics -> OneAgent Prometheus extension -> Dynatrace
Kubernetes: Temporal Worker /metrics -> ActiveGate / OTel Collector    -> Dynatrace
```

The library does **not** talk to OneAgent, push to a vendor API, or reimplement
scraping — scraping is owned by Dynatrace infrastructure.

## Files

| File | Scenario |
| --- | --- |
| `worker-basic.ts` | Worker that exposes the Prometheus `/metrics` endpoint. |
| `vm-oneagent-prometheus-extension.md` | VM: configure the local OneAgent Prometheus extension to scrape it. |
| `k8s-deployment.yaml` | Kubernetes: Dynatrace scrape annotations (+ Service for ActiveGate/OTel Collector). |

## Quick start

```bash
npm run build
npx tsx examples/dynatrace-oneagent/worker-basic.ts

# verify the endpoint Dynatrace will scrape:
curl http://localhost:9464/metrics
```

Expected startup report:

```
Vendor:                        dynatrace-oneagent
Temporal SDK metrics exporter: prometheus
Scrape endpoint:               http://0.0.0.0:9464/metrics
Runtime install:               installed
Scrape model:                  Exposes a Prometheus /metrics endpoint for Dynatrace to scrape. ...
```

## Which scraper?

- **VM** — install a Dynatrace **Prometheus extension** and run it locally on the
  host's OneAgent (EEC). See `vm-oneagent-prometheus-extension.md`.
- **Kubernetes** — use **Dynatrace scrape annotations**, the **Dynatrace
  OpenTelemetry Collector** (Target Allocator, recommended for scale), or an
  **ActiveGate** remote extension. See `k8s-deployment.yaml`.

## Config

Bind address resolution is identical to the `prometheus` profile
(inline `prometheus.bindAddress` > `TEMPORAL_OBSERVABILITY_PROMETHEUS_BIND_ADDRESS`
> default `0.0.0.0:9464`). See the top-level `README.md`.
