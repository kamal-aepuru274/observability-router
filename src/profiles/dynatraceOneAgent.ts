import type { StartupReport } from '../types';
import { prometheusProfile, type ResolvedPrometheusConfig } from './prometheus';
import type { VendorProfileModule } from './types';

const PROFILE_ID = 'dynatrace-oneagent' as const;

/**
 * How Dynatrace is expected to scrape the worker's Prometheus `/metrics`
 * endpoint. This library only EXPOSES the endpoint — the scrape is performed by
 * Dynatrace infrastructure, which differs by deployment:
 *
 *   VM:         Temporal Worker /metrics -> OneAgent Prometheus extension -> Dynatrace
 *   Kubernetes: Temporal Worker /metrics -> ActiveGate / OTel Collector    -> Dynatrace
 *
 * On VMs the local OneAgent runs the Prometheus extension (EEC) and scrapes the
 * endpoint directly, enriching metrics with host context — no Prometheus server
 * required. On Kubernetes, OneAgent alone is not the recommended scraper; use an
 * ActiveGate, the Dynatrace OpenTelemetry Collector, or Dynatrace scrape
 * annotations. Either way the library's job is identical: emit Temporal SDK
 * metrics on a Prometheus scrape endpoint.
 */
const SCRAPE_GUIDANCE =
  'Exposes a Prometheus /metrics endpoint for Dynatrace to scrape. ' +
  'VM: OneAgent Prometheus extension scrapes it locally. ' +
  'Kubernetes: use ActiveGate, the Dynatrace OpenTelemetry Collector, or ' +
  'Dynatrace scrape annotations. No standalone Prometheus server is required.';

/**
 * Dynatrace OneAgent profile.
 *
 * Dynatrace does not derive Temporal-specific metrics (task latency, workflow
 * failures, poller activity, ...) on its own — the Temporal SDK must emit them.
 * This profile is a thin preset over the `prometheus` profile: it configures the
 * Temporal SDK's built-in Prometheus scrape endpoint so Dynatrace can ingest the
 * metrics via its documented Prometheus-scraping mechanisms.
 *
 * It does NOT talk to OneAgent, push to a vendor API, or reimplement scraping —
 * scraping is owned by Dynatrace infrastructure (see SCRAPE_GUIDANCE).
 */
export const dynatraceOneAgentProfile: VendorProfileModule<ResolvedPrometheusConfig> = {
  id: PROFILE_ID,
  implemented: true,
  exporter: 'prometheus',

  resolve(config, env) {
    // Reuse the proven Prometheus bind-address resolution (inline > env > default).
    return prometheusProfile.resolve(config, env) as ResolvedPrometheusConfig;
  },

  buildMetricsOptions(resolved, commonTags) {
    return prometheusProfile.buildMetricsOptions(resolved, commonTags);
  },

  describeTarget(resolved) {
    return resolved.metricsEndpoint;
  },

  signature(resolved, commonTags) {
    return JSON.stringify({
      profile: PROFILE_ID,
      bindAddress: resolved.bindAddress,
      commonTags,
    });
  },

  reportExtras(): Partial<StartupReport> {
    return { scrapeGuidance: SCRAPE_GUIDANCE };
  },
};
