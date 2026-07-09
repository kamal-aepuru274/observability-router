import { normalizeBaseConfig } from './config/resolveConfig';
import { UnsupportedVendorProfileError } from './errors';
import { profileRegistry } from './profiles';
import {
  defaultRuntimeInstaller,
  type RuntimeInstaller,
} from './runtime/installTemporalRuntime';
import { buildStartupReport } from './startupReport';
import type { ObservabilityConfig, ObservabilityHandle } from './types';
import { IMPLEMENTED_VENDOR_PROFILES, validateConfig } from './validation';

/** Injectable collaborators. Real usage relies entirely on defaults. */
export interface AttachDependencies {
  /** Override the runtime installer (tests inject an isolated one). */
  installer?: RuntimeInstaller;
  /** Override the environment source (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Attach Temporal Worker observability. Call this BEFORE `Worker.create(...)`.
 *
 * Steps: validate -> select profile -> resolve runtime values ->
 * build telemetry options + common tags -> install runtime once ->
 * return a handle with worker options + startup report.
 */
export function attachTemporalObservability(
  config: ObservabilityConfig,
  deps: AttachDependencies = {}
): ObservabilityHandle {
  const env = deps.env ?? process.env;
  const installer = deps.installer ?? defaultRuntimeInstaller;

  validateConfig(config);

  const profile = profileRegistry[config.vendorProfile];
  if (!profile.implemented || !IMPLEMENTED_VENDOR_PROFILES.includes(config.vendorProfile)) {
    throw new UnsupportedVendorProfileError(config.vendorProfile);
  }

  const base = normalizeBaseConfig(config);
  const resolved = profile.resolve(config, env);
  const metrics = profile.buildMetricsOptions(resolved, base.commonTags);
  const signature = profile.signature(resolved, base.commonTags);

  const installResult = installer.ensureInstalled({
    telemetryOptions: { metrics },
    signature,
  });

  const report = buildStartupReport({
    base,
    metricsEndpoint: profile.describeTarget(resolved),
    runtimeInstallation: installResult.status,
  });

  return {
    // Empty for metrics-only MVP; reserved for future interceptors/sinks.
    workerOptions: () => ({}),
    startupReport: () => report,
  };
}
