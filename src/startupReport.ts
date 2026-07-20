import type { NormalizedBaseConfig } from './config/resolveConfig';
import type { StartupReport } from './types';

export interface BuildStartupReportInput {
  base: NormalizedBaseConfig;
  exporter: StartupReport['exporter'];
  metricsEndpoint: string;
  runtimeInstallStatus: StartupReport['runtimeInstallStatus'];
  /** Profile-specific safe fields (e.g. otlpProtocol, headersConfigured). */
  extras?: Partial<StartupReport>;
}

/**
 * Builds the startup report from already-resolved, safe values.
 * By construction it only contains config identity + endpoint info — never
 * tokens, headers, or credentials.
 */
export function buildStartupReport(input: BuildStartupReportInput): StartupReport {
  const { base, exporter, metricsEndpoint, runtimeInstallStatus, extras } = input;
  return {
    serviceName: base.serviceName,
    environment: base.environment,
    namespace: base.namespace,
    taskQueue: base.taskQueue,
    vendorProfile: base.vendorProfile,
    routingMode: base.routingMode,
    configSource: base.configSource,
    exporter,
    metricsEndpoint,
    ...extras,
    commonTags: { ...base.commonTags },
    runtimeInstallStatus,
  };
}
