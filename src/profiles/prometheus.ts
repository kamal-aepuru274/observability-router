import { ObservabilityConfigError } from '../errors';
import type { MetricsTelemetryOptions, VendorProfileModule } from './types';

/** Env var used to resolve the Prometheus bind address when no inline value is given. */
export const PROMETHEUS_BIND_ADDRESS_ENV = 'TEMPORAL_OBSERVABILITY_PROMETHEUS_BIND_ADDRESS';

/** Default Prometheus bind address, per platform convention. */
export const DEFAULT_PROMETHEUS_BIND_ADDRESS = '0.0.0.0:9464';

export interface ResolvedPrometheusConfig {
  bindAddress: string;
  bindAddressSource: 'inline' | 'env' | 'default';
  metricsEndpoint: string;
}

function assertValidBindAddress(bindAddress: string): void {
  // Accept "host:port" or "[ipv6]:port".
  const match = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(bindAddress);
  if (!match) {
    throw new ObservabilityConfigError(
      `Invalid Prometheus bind address "${bindAddress}". Expected "host:port", e.g. "0.0.0.0:9464".`
    );
  }
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ObservabilityConfigError(
      `Invalid Prometheus port in "${bindAddress}". Port must be between 1 and 65535.`
    );
  }
}

/**
 * Attach global metric tags defensively.
 *
 * `globalTags` is a common Temporal telemetry option, but its exact presence is
 * version-dependent. We build the object and cast so the library compiles across
 * SDK versions; on versions that support it the tags apply, on versions that
 * don't the extra field is harmless. `prometheus.bindAddress` (the critical
 * option) is stable and always applies.
 */
function withGlobalTags(
  metrics: MetricsTelemetryOptions,
  commonTags: Record<string, string>
): MetricsTelemetryOptions {
  return { ...metrics, globalTags: commonTags } as MetricsTelemetryOptions;
}

export const prometheusProfile: VendorProfileModule<ResolvedPrometheusConfig> = {
  id: 'prometheus',
  implemented: true,

  resolve(config, env) {
    // Priority: inline > env var > default.
    const inline = config.prometheus?.bindAddress?.trim();
    let bindAddress: string;
    let bindAddressSource: ResolvedPrometheusConfig['bindAddressSource'];

    if (inline) {
      bindAddress = inline;
      bindAddressSource = 'inline';
    } else {
      const fromEnv = env[PROMETHEUS_BIND_ADDRESS_ENV]?.trim();
      if (fromEnv) {
        bindAddress = fromEnv;
        bindAddressSource = 'env';
      } else {
        bindAddress = DEFAULT_PROMETHEUS_BIND_ADDRESS;
        bindAddressSource = 'default';
      }
    }

    assertValidBindAddress(bindAddress);

    return {
      bindAddress,
      bindAddressSource,
      metricsEndpoint: `http://${bindAddress}/metrics`,
    };
  },

  buildMetricsOptions(resolved, commonTags) {
    // Cast the literal to the SDK-derived metrics union (safest across versions).
    const metrics = {
      prometheus: { bindAddress: resolved.bindAddress },
    } as MetricsTelemetryOptions;
    return withGlobalTags(metrics, commonTags);
  },

  describeTarget(resolved) {
    return resolved.metricsEndpoint;
  },

  signature(resolved, commonTags) {
    return JSON.stringify({
      profile: 'prometheus',
      bindAddress: resolved.bindAddress,
      commonTags,
    });
  },
};
