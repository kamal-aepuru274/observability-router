/** Thrown when the high-level config is missing/invalid. */
export class ObservabilityConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObservabilityConfigError';
  }
}

/** Thrown for vendor profiles that are declared but not implemented in this version. */
export class UnsupportedVendorProfileError extends Error {
  constructor(profile: string) {
    super(
      `Vendor profile "${profile}" is declared but not implemented in version 1. ` +
        `Only "prometheus" is implemented. ` +
        `Planned profiles: dynatrace-otel, sumologic-otel, dynatrace-oneagent.`
    );
    this.name = 'UnsupportedVendorProfileError';
  }
}

/**
 * Thrown when the process already installed Temporal Runtime telemetry with a
 * DIFFERENT configuration. Runtime.install() is global and cannot be reconfigured.
 */
export class RuntimeInstallConflictError extends Error {
  constructor(existingSignature: string, incomingSignature: string) {
    super(
      'Temporal Runtime telemetry is already installed with a different configuration in this process. ' +
        'Runtime.install() is global/singleton-like and can only be configured once. ' +
        `Existing: ${existingSignature} | Incoming: ${incomingSignature}`
    );
    this.name = 'RuntimeInstallConflictError';
  }
}
