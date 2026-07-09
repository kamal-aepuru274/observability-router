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
  BindAddressSource,
} from './types';
