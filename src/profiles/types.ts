import type { RuntimeOptions } from '@temporalio/worker';
import type { ObservabilityConfig, VendorProfile } from '../types';

/**
 * The metrics telemetry shape is DERIVED from the installed Temporal SDK type
 * rather than hardcoded, so we never invent option names. If the SDK changes,
 * this type follows it and the compiler flags mismatches.
 */
export type MetricsTelemetryOptions = NonNullable<
  NonNullable<RuntimeOptions['telemetryOptions']>['metrics']
>;

/**
 * Contract every backend must satisfy. Adding a new backend = adding one file
 * that implements this and registering it — no changes to the orchestrator.
 */
export interface VendorProfileModule<TResolved = unknown> {
  readonly id: VendorProfile;
  readonly implemented: boolean;
  /** Resolve runtime values (inline > env > default) and validate them. */
  resolve(config: ObservabilityConfig, env: NodeJS.ProcessEnv): TResolved;
  /** Map resolved values + common tags to Temporal SDK metrics telemetry options. */
  buildMetricsOptions(resolved: TResolved, commonTags: Record<string, string>): MetricsTelemetryOptions;
  /** Human-readable target for the startup report (endpoint/exporter target). */
  describeTarget(resolved: TResolved): string;
  /** Stable string used to detect duplicate vs conflicting runtime installs. */
  signature(resolved: TResolved, commonTags: Record<string, string>): string;
}
