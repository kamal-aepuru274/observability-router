import type { NormalizedBaseConfig } from './config/resolveConfig';
import type { StartupReport } from './types';

export interface BuildStartupReportInput {
  base: NormalizedBaseConfig;
  metricsEndpoint: string;
  runtimeInstallation: 'new' | 'existing';
}

/**
 * Builds the startup report from already-resolved, safe values.
 * By construction it only contains config identity + endpoint info — never
 * tokens, headers, or credentials.
 */
export function buildStartupReport(input: BuildStartupReportInput): StartupReport {
  const { base, metricsEndpoint, runtimeInstallation } = input;
  return {
    serviceName: base.serviceName,
    environment: base.environment,
    namespace: base.namespace,
    taskQueue: base.taskQueue,
    vendorProfile: base.vendorProfile,
    routingMode: base.routingMode,
    configSource: base.configSource,
    metricsEndpoint,
    commonTags: { ...base.commonTags },
    runtimeInstallation,
  };
}
