import type { ConfigSource, ObservabilityConfig, RoutingMode, VendorProfile } from './types';
import { ObservabilityConfigError } from './errors';

/** Every profile the type system knows about. */
export const KNOWN_VENDOR_PROFILES: readonly VendorProfile[] = [
  'prometheus',
  'otel',
  'dynatrace',
  'sumologic',
  'dynatrace-oneagent',
];

/** Profiles that are actually implemented in this version. */
export const IMPLEMENTED_VENDOR_PROFILES: readonly VendorProfile[] = ['prometheus', 'otel'];

const ROUTING_MODES: readonly RoutingMode[] = ['direct', 'collector'];
const CONFIG_SOURCES: readonly ConfigSource[] = ['env', 'inline'];

/**
 * Cheap, dependency-free validation. A schema library would be overkill here:
 * the config is small, flat, and fully covered by a handful of checks.
 */
export function validateConfig(config: ObservabilityConfig): void {
  if (config === null || typeof config !== 'object') {
    throw new ObservabilityConfigError('Observability config must be an object.');
  }

  const requiredStringFields: (keyof ObservabilityConfig)[] = [
    'serviceName',
    'environment',
    'namespace',
    'taskQueue',
    'vendorProfile',
  ];
  for (const field of requiredStringFields) {
    const value = config[field];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ObservabilityConfigError(
        `"${String(field)}" is required and must be a non-empty string.`
      );
    }
  }

  if (!KNOWN_VENDOR_PROFILES.includes(config.vendorProfile)) {
    throw new ObservabilityConfigError(
      `Unknown vendorProfile "${config.vendorProfile}". Supported values: ${KNOWN_VENDOR_PROFILES.join(', ')}.`
    );
  }

  const routingMode = config.routingMode ?? 'direct';
  if (!ROUTING_MODES.includes(routingMode)) {
    throw new ObservabilityConfigError(
      `Invalid routingMode "${routingMode}". Expected one of: ${ROUTING_MODES.join(', ')}.`
    );
  }

  const configSource = config.configSource ?? 'inline';
  if (!CONFIG_SOURCES.includes(configSource)) {
    throw new ObservabilityConfigError(
      `Invalid configSource "${configSource}". Expected one of: ${CONFIG_SOURCES.join(', ')}.`
    );
  }
}
