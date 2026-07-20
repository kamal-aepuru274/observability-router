# VM: Temporal Worker → OneAgent Prometheus extension → Dynatrace

On a VM/host with **OneAgent installed**, you do **not** need a Prometheus server.
The worker exposes a Prometheus `/metrics` endpoint and the local OneAgent's
**Prometheus extension** (Extensions 2.0, run by the Extension Execution
Controller) scrapes it directly and enriches the metrics with host context.

```
Temporal Worker  --/metrics-->  OneAgent (Prometheus extension)  -->  Dynatrace
```

## 1. Run the worker (exposes /metrics)

```bash
npm run build
npx tsx examples/dynatrace-oneagent/worker-basic.ts
# verify:
curl http://localhost:9464/metrics
```

The `dynatrace-oneagent` profile configures the Temporal SDK Prometheus exporter
on `0.0.0.0:9464` (override via `prometheus.bindAddress` or
`TEMPORAL_OBSERVABILITY_PROMETHEUS_BIND_ADDRESS`).

## 2. Enable the Dynatrace Prometheus extension

1. In **Dynatrace Hub**, search for and install a **Prometheus** extension.
2. Add a **monitoring configuration**:
   - Choose the host running OneAgent (must be enabled to run extensions / EEC).
   - Select **Monitor locally** (recommended) — OneAgent connects to the
     Prometheus interface automatically.
   - Add the endpoint: `http://localhost:9464/metrics`.
3. Define which metrics to collect in the extension YAML (the Prometheus data
   source pulls from the `/metrics` endpoint). Prefix metric keys with the
   extension name per Dynatrace best practice.

Docs: *Manage Prometheus extensions* and *Prometheus data source* on
docs.dynatrace.com.

## Notes

- **No Prometheus server** is involved — the OneAgent extension is the scraper.
- OneAgent still provides infra/APM context for the host; Temporal-specific
  metrics come only from the SDK `/metrics` endpoint this library exposes.
- If OneAgent cannot be installed on the box, the same extension can run
  **remotely on an ActiveGate** instead.
