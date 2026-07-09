import type { WorkerOptions } from '@temporalio/worker';

/**
 * Metrics export profiles. Only `prometheus` is implemented in version 1.
 * The rest are declared so the public type is stable as backends are added.
 */
export type VendorProfile =
  | 'prometheus'
  | 'dynatrace-otel'
  | 'sumologic-otel'
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
  /** For Prometheus: the scrape endpoint, e.g. "http://0.0.0.0:9464/metrics". */
  metricsEndpoint: string;
  /** Low-cardinality tags applied to every metric. */
  commonTags: Readonly<Record<string, string>>;
  /** Whether this call installed the runtime or found it already installed. */
  runtimeInstallation: 'new' | 'existing';
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
