export { attachTemporalObservability } from './attachTemporalObservability';
export type { AttachDependencies } from './attachTemporalObservability';

export {
  createRuntimeInstaller,
  defaultRuntimeInstaller,
} from './runtime/installTemporalRuntime';
export type {
  RuntimeInstaller,
  InstallFn,
  TelemetryInstallOptions,
  EnsureInstalledInput,
  EnsureInstalledResult,
} from './runtime/installTemporalRuntime';

export {
  DEFAULT_PROMETHEUS_BIND_ADDRESS,
  PROMETHEUS_BIND_ADDRESS_ENV,
} from './profiles/prometheus';

export {
  OTLP_ENDPOINT_ENV,
  OTLP_PROTOCOL_ENV,
  OTLP_HEADERS_ENV,
  METRICS_EXPORT_INTERVAL_ENV,
  SUMOLOGIC_OTLP_ENDPOINT_ENV,
  SUMOLOGIC_OTLP_PROTOCOL_ENV,
  SUMOLOGIC_OTLP_HEADERS_ENV,
  SUMOLOGIC_METRICS_EXPORT_INTERVAL_ENV,
  STANDARD_OTLP_METRICS_ENDPOINT_ENV,
  STANDARD_OTLP_ENDPOINT_ENV,
  STANDARD_OTLP_PROTOCOL_ENV,
  STANDARD_OTLP_HEADERS_ENV,
  STANDARD_METRIC_EXPORT_INTERVAL_ENV,
  DEFAULT_OTLP_PROTOCOL,
  DEFAULT_METRICS_EXPORT_INTERVAL_MS,
  parseHeaderString,
} from './profiles/otel';

export {
  KNOWN_VENDOR_PROFILES,
  IMPLEMENTED_VENDOR_PROFILES,
} from './validation';

export {
  ObservabilityConfigError,
  UnsupportedVendorProfileError,
  RuntimeInstallConflictError,
} from './errors';

export type {
  ObservabilityConfig,
  ObservabilityHandle,
  StartupReport,
  VendorProfile,
  RoutingMode,
  ConfigSource,
  PrometheusInlineConfig,
  OtlpProtocol,
  BindAddressSource,
} from './types';
