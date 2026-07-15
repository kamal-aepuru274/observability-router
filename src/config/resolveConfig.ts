import type { ConfigSource, ObservabilityConfig, RoutingMode, VendorProfile } from '../types';

export interface NormalizedBaseConfig {
  serviceName: string;
  environment: string;
  namespace: string;
  taskQueue: string;
  vendorProfile: VendorProfile;
  routingMode: RoutingMode;
  configSource: ConfigSource;
  commonTags: Record<string, string>;
}

/**
 * Low-cardinality tags applied to every metric.
 *
 * Deliberately fixed to safe, bounded dimensions. High-cardinality values
 * (workflowId, runId, orderId, userId, ...) are NEVER added here because they
 * explode metric series counts and can break the backend.
 */
export function buildCommonTags(config: ObservabilityConfig): Record<string, string> {
  return {
    service_name: config.serviceName,
    environment: config.environment,
    namespace: config.namespace,
    task_queue: config.taskQueue,
    vendor_profile: config.vendorProfile,
    routing_mode: config.routingMode ?? 'direct',
  };
}

/** Applies defaults for optional fields and precomputes common tags. */
export function normalizeBaseConfig(config: ObservabilityConfig): NormalizedBaseConfig {
  return {
    serviceName: config.serviceName,
    environment: config.environment,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    vendorProfile: config.vendorProfile,
    routingMode: config.routingMode ?? 'direct',
    configSource: config.configSource ?? 'inline',
    commonTags: buildCommonTags(config),
  };
}
