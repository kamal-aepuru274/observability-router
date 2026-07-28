# Local Verification Guide

## Scripts

```bash
npm install        # install deps
npm run typecheck  # tsc --noEmit (strict)
npm run build      # tsup -> ESM + CJS + d.ts in dist/
npm test           # vitest run
```

## Prometheus

Start your worker, then curl the scrape endpoint:

```bash
npx tsx examples/payment/worker.ts
curl http://localhost:9464/metrics
```

You should see Temporal SDK metrics (e.g. `temporal_worker_task_slots_available`)
tagged with `service_name`, `environment`, `namespace`, `task_queue`,
`vendor_profile`, `routing_mode`.

## OTEL via Collector

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

### Vendor pipelines through the same Collector stack

```bash
# Sumo Logic
COLLECTOR_CONFIG=./examples/sumologic/collector-config.yaml \
  SUMOLOGIC_HTTP_SOURCE_URL=https://... docker compose up

# Dynatrace OTLP
COLLECTOR_CONFIG=./examples/otel-collector/otel-collector-dynatrace.yaml \
  DT_OTLP_ENDPOINT=https://<environment>.live.dynatrace.com/api/v2/otlp \
  DT_AUTH_HEADER='Api-Token <token>' docker compose up
```

## Sumo Logic

### Via Collector (debug exporter)

```bash
docker compose up
```

```bash
TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_ENDPOINT=http://localhost:4318/v1/metrics \
TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http \
npx tsx examples/payment/worker-sumologic-collector.ts
```

Confirm metrics appear in the Collector's console (debug) output. This proves
the worker is emitting OTLP correctly and the only remaining step is to point
the Collector at Sumo Logic.

### Direct OTLP

1. Create a Sumo Logic OTLP HTTP Source and obtain the endpoint URL.
2. Set the endpoint in env (never inline):

   ```bash
   TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_ENDPOINT=https://your-sumo-otlp-http-source-endpoint
   TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_HEADERS="x-sumo-category=temporal-workers"
   TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL=http
   ```

3. Run: `npx tsx examples/payment/worker-sumologic-direct.ts`
4. Verify metrics appear in Sumo Logic. The library does not call Sumo Logic
   APIs; the Temporal SDK Core pushes plain OTLP to the configured endpoint.

## Dynatrace OneAgent

```bash
npm run build
npx tsx examples/dynatrace-oneagent/worker-basic.ts
curl http://localhost:9464/metrics
```

See `examples/dynatrace-oneagent/vm-oneagent-prometheus-extension.md` (VM) and
`examples/dynatrace-oneagent/k8s-deployment.yaml` (Kubernetes) for how
Dynatrace scrapes the exposed endpoint.
