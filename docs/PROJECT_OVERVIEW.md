# Project Overview — @temporalio-observability/router

---

## 1. What Is This Project?

`@temporalio-observability/router` is an internal **npm package (library)**, not
a standalone application. It is meant to be installed into our **Temporal
Worker services** (the backend processes that run our business workflows —
e.g. payment processing) to make sure each one reports its health and
performance data ("metrics") to our monitoring tools **consistently**.

Think of it as a **standardized adapter plug**: every worker service, no
matter who builds it or which monitoring tool the team prefers, plugs into
this library the same way and gets correctly wired up to Prometheus,
Dynatrace, Sumo Logic, or any OpenTelemetry-compatible tool.

## 2. Why Does It Exist? (The Business Problem)

Our backend runs on **Temporal**, a workflow engine that processes critical
business operations (e.g. payments) reliably in the background. To operate
this in production, engineering and SRE teams need answers to questions like:

- *Is the payment worker healthy right now?*
- *Are tasks piling up (a sign of overload)?*
- *Are workflows failing more than usual?*

Temporal's underlying engine already has the ability to answer these
questions — it just needs to be **configured correctly** to send that data
somewhere useful. Without this library, every engineer configuring a new
worker service would have to:

1. Learn the low-level configuration API of the Temporal SDK.
2. Get the configuration exactly right (a single mistake can crash the
   process or silently produce no metrics).
3. Avoid accidentally leaking secrets (API tokens, auth headers) into logs.
4. Repeat all of this for every new worker service and every monitoring
   vendor the company decides to use.

This library removes that repeated, error-prone work. A developer calls
**one function** with a small, validated configuration object, and
everything is wired up correctly and safely.

## 3. What Does It NOT Do?

This is important for setting the right expectations:

- It does **not** build a monitoring dashboard, alerting system, or UI.
- It does **not** collect application-level business metrics (e.g. "number of
  orders placed") — only Temporal's own operational metrics (task speed,
  failures, queue health).
- It does **not** talk to Dynatrace, Sumo Logic, or any vendor's API directly.
  It relies entirely on **industry-standard protocols** (Prometheus scraping
  and OpenTelemetry/OTLP) that these vendors already support out of the box.
- It is **not** a replacement for the OpenTelemetry ecosystem — it configures
  the exporters that already ship inside Temporal's SDK.

## 4. Current Status

| Monitoring Target | Status | Notes |
|---|---|---|
| Prometheus | ✅ Ready | Exposes a standard scrape endpoint |
| Generic OpenTelemetry (OTLP) | ✅ Ready | Works with any OTLP-compatible backend |
| Sumo Logic | ✅ Ready | Built on the same OTLP mechanism as above |
| Dynatrace (via OneAgent scraping) | ✅ Ready | Dynatrace scrapes the Prometheus endpoint |
| Dynatrace (direct push) | 🔜 Not built | Not needed yet — the generic OTLP option already works for Dynatrace's OTLP ingest |

**Test coverage**: All four ready integrations have automated unit tests
covering configuration validation, correct behavior, and safe secret handling.
No test ever touches a real monitoring backend — they run fully offline.

**Build & release status**: The library builds cleanly with strict type
checking and produces a standard npm package (works with both modern and
legacy JavaScript import styles).

## 5. How It Fits Into the Bigger Picture

```
 ┌────────────────────┐        ┌───────────────────────────┐        ┌──────────────────────┐
 │  Our Worker Service │  uses  │  This Library              │ configures │  Temporal Engine      │
 │  (e.g. payment-     │───────▶│  (@temporalio-observability│───────────▶│  (built-in metrics    │
 │   worker)           │        │   /router)                 │            │   exporter)           │
 └────────────────────┘        └───────────────────────────┘        └──────────┬────────────┘
                                                                                 │
                                                                                 ▼
                                                              ┌───────────────────────────────────┐
                                                              │  Monitoring Backend                 │
                                                              │  Prometheus / Dynatrace / Sumo Logic │
                                                              │  / any OpenTelemetry-compatible tool │
                                                              └───────────────────────────────────┘
```

A developer building a new worker service adds this library, tells it which
monitoring tool the team uses (one word: `prometheus`, `otel`, `sumologic`, or
`dynatrace-oneagent`), and the rest is automatic.

## 6. Two Ways Metrics Reach a Monitoring Tool

There are exactly two industry-standard delivery models this library supports:

1. **Scrape (pull)** — the monitoring tool visits the worker on a schedule and
   reads its current stats. Used by Prometheus and Dynatrace OneAgent.
2. **Push** — the worker actively sends its stats out at a regular interval
   (e.g. every 10 seconds). Used for generic OpenTelemetry and Sumo Logic.

Either model can go **directly** to the final destination, or **via a small
relay service** (an "OpenTelemetry Collector") that batches and forwards data
— recommended for production because it adds retry and buffering.

## 7. Risk & Security Posture

- **No secrets ever leave the process in logs.** Authentication tokens and
  headers used to talk to vendors are deliberately excluded from every log
  line, startup summary, and error message this library produces.
- **Safe against misconfiguration.** If the same worker process is
  accidentally configured twice with conflicting settings, the library fails
  loudly with a clear error instead of silently misreporting data.
- **No new attack surface.** The library does not open new network listeners
  beyond what Temporal's SDK already provides (the Prometheus scrape port),
  and does not call any vendor API directly.

## 8. Each Supported Monitoring Tool, Explained

### Prometheus

A widely-used open-source monitoring system. It works by periodically
"visiting" the worker at a known web address and reading its current stats.
This library makes the worker expose that address (`/metrics`) automatically.
Nothing needs to be pushed anywhere — Prometheus does the pulling.

### Generic OpenTelemetry (OTLP)

OpenTelemetry is the modern industry standard for sending metrics, and OTLP
is its wire format. Instead of waiting to be visited, the worker actively
sends its stats out every few seconds to whatever address is configured. This
works with virtually any modern monitoring backend, because OTLP is an open,
vendor-neutral standard.

### Sumo Logic

Sumo Logic is a monitoring/log analytics vendor that accepts data over OTLP.
This option is functionally identical to the generic OpenTelemetry option
above, with one difference: it recognizes Sumo Logic-specific configuration
names so teams can set a `SUMOLOGIC_...` value without it being confused with
a different OTLP destination elsewhere in the same environment.

### Dynatrace (via OneAgent)

Dynatrace is an application-monitoring platform. Rather than the worker
pushing data to Dynatrace, this option exposes the same kind of address
Prometheus uses, and Dynatrace's own agent (OneAgent) or gateway
(ActiveGate) visits it and pulls the data in. This is the recommended way to
get Temporal-specific metrics into Dynatrace today.

### Dynatrace (direct push) — not yet built

Dynatrace also accepts data pushed directly over OTLP, the same way Sumo
Logic does. This has not been built as a separate, named option yet because
the existing generic OpenTelemetry option already works for this purpose —
someone just needs to point it at Dynatrace's OTLP web address and provide
an access token. A dedicated option would only add convenience, not new
capability.

## 9. Two Delivery Routes: Direct vs. Through a Relay

For the push-based options (OpenTelemetry, Sumo Logic), there are two ways
data can travel:

- **Direct** — the worker sends data straight to the final monitoring tool.
  Simple, but if the tool is briefly unreachable, that batch of data can be
  lost.
- **Through a relay ("Collector")** — the worker sends data to a small local
  relay service first, which buffers, retries, and forwards it onward. This
  is the recommended approach for production because it adds resilience and
  lets one relay serve multiple destinations without changing worker code.

## 10. Configuration Model (How Settings Are Decided)

Every setting this library needs (which monitoring tool, what web address,
what access token, etc.) can be provided in one of three ways, checked in
this order until one is found:

1. **Explicitly in code** — set directly when the worker starts up.
2. **Environment variable** — set outside the code, typically via deployment
   configuration (e.g. Kubernetes secrets, `.env` files). This is the
   recommended way to provide anything sensitive, like access tokens.
3. **Built-in default** — a sensible fallback value used if nothing else is
   provided (for example, Prometheus defaults to a standard, well-known
   network address).

This means the same worker code can run in development, staging, and
production without modification — only the environment variables change.

## 11. Every Metric Is Consistently Labeled

Regardless of which monitoring tool is used, every metric reported by a
worker is automatically tagged with the same set of identifying labels:
which service it came from, which environment (dev/staging/production),
which Temporal namespace and task queue it belongs to, and which monitoring
profile is active. This makes it possible to filter and compare metrics
across many worker services in one dashboard, without each team inventing
their own labeling scheme.

Labels that could explode in number (such as a specific order ID or customer
ID) are deliberately never attached to metrics, because monitoring systems
are not designed to handle that kind of high-volume, ever-changing label and
doing so can degrade or break them.

## 12. Reliability Safeguard

The underlying Temporal engine only allows this kind of configuration to be
set **once** per running worker process. This library actively protects
against the two ways that could go wrong:

- If the same worker accidentally tries to configure itself twice with the
  exact same settings, it is treated as a harmless no-op.
- If it tries to configure itself twice with **different, conflicting**
  settings, the library stops the process immediately with a clear error
  rather than allowing metrics to be silently wrong or missing.

## 13. Summary

This project is a small, focused piece of shared infrastructure. Its entire
job is to make sure every Temporal worker service in the company reports its
operational health to whichever monitoring tool is in use — correctly,
securely, and without every team having to solve the same problem
independently. It currently supports Prometheus, generic OpenTelemetry,
Sumo Logic, and Dynatrace (via scraping), with full automated test coverage
and no reliance on any vendor-specific, non-standard integration code.
