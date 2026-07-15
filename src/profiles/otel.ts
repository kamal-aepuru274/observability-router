import { createHash } from 'node:crypto';
import { ObservabilityConfigError } from '../errors';
import type { ObservabilityConfig, OtlpProtocol, StartupReport } from '../types';
import type { MetricsTelemetryOptions, VendorProfileModule } from './types';

/** Library-specific env vars (take precedence over standard OTEL vars). */
export const OTLP_ENDPOINT_ENV = 'TEMPORAL_OBSERVABILITY_OTLP_ENDPOINT';
export const OTLP_PROTOCOL_ENV = 'TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL';
export const OTLP_HEADERS_ENV = 'TEMPORAL_OBSERVABILITY_OTLP_HEADERS';
export const METRICS_EXPORT_INTERVAL_ENV = 'TEMPORAL_OBSERVABILITY_METRICS_EXPORT_INTERVAL_MS';

export const SUMOLOGIC_OTLP_ENDPOINT_ENV = 'TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_ENDPOINT';
export const SUMOLOGIC_OTLP_PROTOCOL_ENV = 'TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_PROTOCOL';
export const SUMOLOGIC_OTLP_HEADERS_ENV = 'TEMPORAL_OBSERVABILITY_SUMOLOGIC_OTLP_HEADERS';
export const SUMOLOGIC_METRICS_EXPORT_INTERVAL_ENV = 'TEMPORAL_OBSERVABILITY_SUMOLOGIC_METRICS_EXPORT_INTERVAL_MS';

/** Standard OpenTelemetry env vars honored as fallbacks. */
export const STANDARD_OTLP_METRICS_ENDPOINT_ENV = 'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT';
export const STANDARD_OTLP_ENDPOINT_ENV = 'OTEL_EXPORTER_OTLP_ENDPOINT';
export const STANDARD_OTLP_PROTOCOL_ENV = 'OTEL_EXPORTER_OTLP_PROTOCOL';
export const STANDARD_OTLP_HEADERS_ENV = 'OTEL_EXPORTER_OTLP_HEADERS';
export const STANDARD_METRIC_EXPORT_INTERVAL_ENV = 'OTEL_METRIC_EXPORT_INTERVAL';

export const DEFAULT_OTLP_PROTOCOL: OtlpProtocol = 'http';
export const DEFAULT_METRICS_EXPORT_INTERVAL_MS = 10_000;

export interface ResolvedOtelConfig {
  endpoint: string;
  endpointSource: 'inline' | 'env';
  protocol: OtlpProtocol;
  /** Parsed headers. Kept internal; NEVER logged or reported. */
  headers: Record<string, string> | undefined;
  headersConfigured: boolean;
  metricsExportIntervalMs: number;
}

/** Set of environment variable names used for OTLP resolution, in precedence order. */
export interface OtelEnvNames {
  endpoint: string[];
  protocol: string[];
  headers: string[];
  interval: string[];
}

export const OTEL_ENV_NAMES: OtelEnvNames = {
  endpoint: [OTLP_ENDPOINT_ENV, STANDARD_OTLP_METRICS_ENDPOINT_ENV, STANDARD_OTLP_ENDPOINT_ENV],
  protocol: [OTLP_PROTOCOL_ENV, STANDARD_OTLP_PROTOCOL_ENV],
  headers: [OTLP_HEADERS_ENV, STANDARD_OTLP_HEADERS_ENV],
  interval: [METRICS_EXPORT_INTERVAL_ENV, STANDARD_METRIC_EXPORT_INTERVAL_ENV],
};

export const SUMOLOGIC_ENV_NAMES: OtelEnvNames = {
  endpoint: [SUMOLOGIC_OTLP_ENDPOINT_ENV, OTLP_ENDPOINT_ENV, STANDARD_OTLP_METRICS_ENDPOINT_ENV, STANDARD_OTLP_ENDPOINT_ENV],
  protocol: [SUMOLOGIC_OTLP_PROTOCOL_ENV, OTLP_PROTOCOL_ENV, STANDARD_OTLP_PROTOCOL_ENV],
  headers: [SUMOLOGIC_OTLP_HEADERS_ENV, OTLP_HEADERS_ENV, STANDARD_OTLP_HEADERS_ENV],
  interval: [SUMOLOGIC_METRICS_EXPORT_INTERVAL_ENV, METRICS_EXPORT_INTERVAL_ENV, STANDARD_METRIC_EXPORT_INTERVAL_ENV],
};

/**
 * Parses the standard OTLP env header format:
 *   "Authorization=Bearer abc123,x-api-key=xyz"
 * into { Authorization: 'Bearer abc123', 'x-api-key': 'xyz' }.
 *
 * Values may contain '=' (only the first '=' per pair splits key/value).
 */
export function parseHeaderString(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const trimmed = pair.trim();
    if (trimmed === '') continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      throw new ObservabilityConfigError(
        `Invalid OTLP header entry "${trimmed}". Expected "Key=Value" pairs separated by commas.`
      );
    }
    headers[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return headers;
}

/**
 * Normalizes protocol values. Standard OTEL env allows "http/protobuf" and
 * "http/json"; the Temporal SDK only distinguishes HTTP vs gRPC, so both map
 * to "http".
 */
function normalizeProtocol(raw: string, source: string): OtlpProtocol {
  const value = raw.trim().toLowerCase();
  if (value === 'grpc') return 'grpc';
  if (value === 'http' || value === 'http/protobuf' || value === 'http/json') return 'http';
  throw new ObservabilityConfigError(
    `Invalid OTLP protocol "${raw}" (from ${source}). Supported values: "http", "grpc".`
  );
}

function resolveEndpoint(
  inline: string | undefined,
  env: NodeJS.ProcessEnv,
  envNames: OtelEnvNames,
  profile: string
): { endpoint: string; endpointSource: 'inline' | 'env' } {
  const inlineTrimmed = inline?.trim();
  if (inlineTrimmed) return { endpoint: inlineTrimmed, endpointSource: 'inline' };

  for (const envVar of envNames.endpoint) {
    const value = env[envVar]?.trim();
    if (value) return { endpoint: value, endpointSource: 'env' };
  }

  throw new ObservabilityConfigError(
    `vendorProfile "${profile}" requires an OTLP endpoint. Provide "otlpEndpoint" inline, or set one of: ` +
      `${envNames.endpoint.join(', ')}. ` +
      `Example: http://localhost:4318/v1/metrics`
  );
}

function resolveProtocol(inline: OtlpProtocol | undefined, env: NodeJS.ProcessEnv, envNames: OtelEnvNames): OtlpProtocol {
  if (inline !== undefined) return normalizeProtocol(inline, 'inline config "otlpProtocol"');
  for (const envVar of envNames.protocol) {
    const value = env[envVar]?.trim();
    if (value) return normalizeProtocol(value, `env var ${envVar}`);
  }
  return DEFAULT_OTLP_PROTOCOL;
}

function resolveHeaders(
  inline: Record<string, string> | undefined,
  env: NodeJS.ProcessEnv,
  envNames: OtelEnvNames
): Record<string, string> | undefined {
  if (inline !== undefined) {
    return Object.keys(inline).length > 0 ? { ...inline } : undefined;
  }
  for (const envVar of envNames.headers) {
    const value = env[envVar]?.trim();
    if (value) {
      const parsed = parseHeaderString(value);
      return Object.keys(parsed).length > 0 ? parsed : undefined;
    }
  }
  return undefined;
}

function assertPositiveInterval(value: number, source: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ObservabilityConfigError(
      `Invalid metrics export interval "${value}" (from ${source}). Must be a positive number of milliseconds.`
    );
  }
}

function resolveExportInterval(inline: number | undefined, env: NodeJS.ProcessEnv, envNames: OtelEnvNames): number {
  if (inline !== undefined) {
    assertPositiveInterval(inline, 'inline config "metricsExportIntervalMs"');
    return inline;
  }
  for (const envVar of envNames.interval) {
    const raw = env[envVar]?.trim();
    if (raw) {
      const value = Number(raw);
      assertPositiveInterval(value, `env var ${envVar}`);
      return value;
    }
  }
  return DEFAULT_METRICS_EXPORT_INTERVAL_MS;
}

/**
 * Fingerprints headers for duplicate/conflict detection WITHOUT ever exposing
 * values. The conflict error message includes signatures, so raw header values
 * must never appear in a signature.
 */
function fingerprintHeaders(headers: Record<string, string> | undefined): string {
  if (!headers) return 'none';
  const canonical = Object.keys(headers)
    .sort()
    .map((key) => `${key}=${headers[key]}`)
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function resolveOtelConfig(
  config: ObservabilityConfig,
  env: NodeJS.ProcessEnv,
  envNames: OtelEnvNames,
  profile: string
): ResolvedOtelConfig {
  const { endpoint, endpointSource } = resolveEndpoint(config.otlpEndpoint, env, envNames, profile);
  const protocol = resolveProtocol(config.otlpProtocol, env, envNames);
  const headers = resolveHeaders(config.otlpHeaders, env, envNames);
  const metricsExportIntervalMs = resolveExportInterval(config.metricsExportIntervalMs, env, envNames);

  return {
    endpoint,
    endpointSource,
    protocol,
    headers,
    headersConfigured: headers !== undefined,
    metricsExportIntervalMs,
  };
}

export function buildOtelMetricsOptions(
  resolved: ResolvedOtelConfig,
  commonTags: Record<string, string>
): MetricsTelemetryOptions {
  const metrics = {
    otel: {
      url: resolved.endpoint,
      http: resolved.protocol === 'http',
      ...(resolved.headers ? { headers: resolved.headers } : {}),
      metricsExportInterval: resolved.metricsExportIntervalMs,
    },
    globalTags: commonTags,
    attachServiceName: false,
  } as MetricsTelemetryOptions;
  return metrics;
}

export function describeOtelTarget(resolved: ResolvedOtelConfig): string {
  return resolved.endpoint;
}

export function reportOtelExtras(resolved: ResolvedOtelConfig): Partial<StartupReport> {
  return {
    otlpEndpoint: resolved.endpoint,
    otlpProtocol: resolved.protocol,
    headersConfigured: resolved.headersConfigured,
    metricsExportIntervalMs: resolved.metricsExportIntervalMs,
  };
}

export function buildOtelSignature(
  resolved: ResolvedOtelConfig,
  commonTags: Record<string, string>,
  profile: string
): string {
  return JSON.stringify({
    profile,
    endpoint: resolved.endpoint,
    protocol: resolved.protocol,
    headersFingerprint: fingerprintHeaders(resolved.headers),
    metricsExportIntervalMs: resolved.metricsExportIntervalMs,
    commonTags,
  });
}

/**
 * Generic OTLP profile. Configures the Temporal SDK's built-in OTLP exporter
 * (`telemetryOptions.metrics.otel`) — the SDK Core does the actual export.
 * This library performs no metric collection, conversion, or vendor API calls.
 */
export const otelProfile: VendorProfileModule<ResolvedOtelConfig> = {
  id: 'otel',
  implemented: true,
  exporter: 'otlp',

  resolve(config, env) {
    return resolveOtelConfig(config, env, OTEL_ENV_NAMES, 'otel');
  },

  buildMetricsOptions: buildOtelMetricsOptions,

  describeTarget: describeOtelTarget,

  reportExtras: reportOtelExtras,

  signature(resolved, commonTags) {
    return buildOtelSignature(resolved, commonTags, 'otel');
  },
};
