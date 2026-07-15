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
      `vendorProfile "${profile}" is declared but not implemented in this version. ` +
        `Use "otel" for generic OTLP export, or "prometheus" for a scrape endpoint. ` +
        `The "${profile}" profile may be implemented in a later version.`
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
