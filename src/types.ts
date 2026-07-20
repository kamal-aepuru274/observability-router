import type { WorkerOptions } from '@temporalio/worker';

/**
 * Metrics export profiles.
 * - `prometheus` — implemented in version 1.
 * - `otel`       — implemented in version 2 (generic OTLP export).
 * - The rest are declared so the public type is stable as backends are added.
 */
export type VendorProfile =
  | 'prometheus'
  | 'otel'
  | 'sumologic'
  | 'dynatrace'
  | 'dynatrace-oneagent';

/**
 * `direct`   = worker exports straight to the backend / scrape endpoint.
 * `collector` = worker exports to an OpenTelemetry Collector that forwards on.
 * Only meaningful for OTLP profiles; kept for forward compatibility.
 */
export type RoutingMode = 'direct' | 'collector';

/** Declares where the team intends runtime values to come from. Recorded in the report. */
export type ConfigSource = 'env' | 'inline';

export interface PrometheusInlineConfig {
  /** e.g. "0.0.0.0:9464". If omitted, resolved from env var, then default. */
  bindAddress?: string;
}

/** OTLP wire protocol. `http` = OTLP/HTTP, `grpc` = OTLP/gRPC. */
export type OtlpProtocol = 'http' | 'grpc';

export interface ObservabilityConfig {
  /** Required. Logical name of the worker service. */
  serviceName: string;
  /** Required. Deployment environment: dev / qa / staging / prod. */
  environment: string;
  /** Required. Temporal namespace the worker connects to. */
  namespace: string;
  /** Required. Temporal task queue the worker polls. */
  taskQueue: string;
  /** Required. Which export profile to configure. */
  vendorProfile: VendorProfile;
  /** Optional. Defaults to "direct". */
  routingMode?: RoutingMode;
  /** Optional. Defaults to "inline". */
  configSource?: ConfigSource;
  /** Optional. Prometheus-specific inline overrides. */
  prometheus?: PrometheusInlineConfig;

  /**
   * OTLP endpoint for `vendorProfile: 'otel'` or `vendorProfile: 'sumologic'`.
   * e.g. "http://localhost:4318/v1/metrics" (http) or "http://localhost:4317" (grpc).
   * Resolution: inline > profile-specific env var > TEMPORAL_OBSERVABILITY_OTLP_ENDPOINT >
   * OTEL_EXPORTER_OTLP_METRICS_ENDPOINT > OTEL_EXPORTER_OTLP_ENDPOINT.
   */
  otlpEndpoint?: string;
  /**
   * OTLP protocol. Resolution: inline > profile-specific env var >
   * TEMPORAL_OBSERVABILITY_OTLP_PROTOCOL > OTEL_EXPORTER_OTLP_PROTOCOL > default "http".
   */
  otlpProtocol?: OtlpProtocol;
  /**
   * OTLP request headers (e.g. auth). Never logged or included in reports.
   * Resolution: inline > profile-specific env var > TEMPORAL_OBSERVABILITY_OTLP_HEADERS >
   * OTEL_EXPORTER_OTLP_HEADERS.
   */
  otlpHeaders?: Record<string, string>;
  /**
   * Metrics export interval in milliseconds. Must be a positive number.
   * Resolution: inline > profile-specific env var > TEMPORAL_OBSERVABILITY_METRICS_EXPORT_INTERVAL_MS >
   * OTEL_METRIC_EXPORT_INTERVAL > default 10000.
   */
  metricsExportIntervalMs?: number;
}

export type BindAddressSource = 'inline' | 'env' | 'default';

/**
 * Human-readable summary of the active observability mode.
 * Intentionally contains NO secrets (no tokens, headers, or credentials).
 */
export interface StartupReport {
  serviceName: string;
  environment: string;
  namespace: string;
  taskQueue: string;
  vendorProfile: VendorProfile;
  routingMode: RoutingMode;
  configSource: ConfigSource;
  /** Which exporter is active. */
  exporter: 'prometheus' | 'otlp';
  /**
   * For Prometheus (and the `dynatrace-oneagent` preset): the scrape endpoint,
   * e.g. "http://0.0.0.0:9464/metrics". For OTEL: the resolved OTLP endpoint.
   */
  metricsEndpoint: string;
  /** OTEL only: resolved OTLP endpoint (same as metricsEndpoint for otel). */
  otlpEndpoint?: string;
  /** OTEL only: resolved OTLP protocol. */
  otlpProtocol?: OtlpProtocol;
  /** OTEL only: whether headers are configured. Values are NEVER included. */
  headersConfigured?: boolean;
  /** OTEL only: resolved metrics export interval in milliseconds. */
  metricsExportIntervalMs?: number;
  /** Low-cardinality tags applied to every metric. */
  commonTags: Readonly<Record<string, string>>;
  /** Whether this call installed the runtime or found it already installed. */
  runtimeInstallStatus: 'installed' | 'already_installed';

  /**
   * `dynatrace-oneagent` preset only: human-readable guidance on how Dynatrace is
   * expected to scrape the exposed Prometheus `/metrics` endpoint (VM vs K8s).
   */
  scrapeGuidance?: string;
}

export interface ObservabilityHandle {
  /**
   * Extra Worker options to spread into `Worker.create(...)`.
   * Empty for the metrics-only MVP (metrics are configured globally via Runtime),
   * but reserved for future per-worker interceptors / sinks.
   */
  workerOptions(): Partial<WorkerOptions>;
  /** Snapshot of what observability mode is active. Safe to log. */
  startupReport(): StartupReport;
}
