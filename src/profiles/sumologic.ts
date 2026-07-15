import {
  SUMOLOGIC_ENV_NAMES,
  buildOtelMetricsOptions,
  buildOtelSignature,
  describeOtelTarget,
  reportOtelExtras,
  resolveOtelConfig,
  type ResolvedOtelConfig,
} from './otel';
import type { VendorProfileModule } from './types';

/**
 * Sumo Logic profile.
 *
 * This is a thin, high-level vendor preset. It does NOT call Sumo Logic APIs,
 * batch metrics, or implement custom upload logic. It simply resolves
 * Sumo-specific OTLP endpoint/protocol/headers and reuses the existing generic
 * OTLP telemetry builder. The Temporal SDK Core then exports metrics via OTLP
 * to an OpenTelemetry Collector or directly to a Sumo Logic OTLP HTTP source.
 */
export const sumologicProfile: VendorProfileModule<ResolvedOtelConfig> = {
  id: 'sumologic',
  implemented: true,
  exporter: 'otlp',

  resolve(config, env) {
    return resolveOtelConfig(config, env, SUMOLOGIC_ENV_NAMES, 'sumologic');
  },

  buildMetricsOptions: buildOtelMetricsOptions,

  describeTarget: describeOtelTarget,

  reportExtras: reportOtelExtras,

  signature(resolved, commonTags) {
    return buildOtelSignature(resolved, commonTags, 'sumologic');
  },
};
