import { Runtime } from '@temporalio/worker';
import type { RuntimeOptions } from '@temporalio/worker';
import { RuntimeInstallConflictError } from '../errors';

export type TelemetryInstallOptions = NonNullable<RuntimeOptions['telemetryOptions']>;

/** Low-level install side effect. Injectable so tests never touch the real global runtime. */
export type InstallFn = (telemetryOptions: TelemetryInstallOptions) => void;

export interface EnsureInstalledInput {
  telemetryOptions: TelemetryInstallOptions;
  /** Stable string describing the telemetry config; used for duplicate/conflict detection. */
  signature: string;
}

export interface EnsureInstalledResult {
  status: 'new' | 'existing';
}

export interface RuntimeInstaller {
  ensureInstalled(input: EnsureInstalledInput): EnsureInstalledResult;
  isInstalled(): boolean;
  /**
   * Clears THIS installer's tracking only. It cannot undo a real
   * `Runtime.install()`. Intended for tests using an injected install fn.
   */
  reset(): void;
}

const defaultInstallFn: InstallFn = (telemetryOptions) => {
  // The one and only real call into the Temporal SDK. Must run before Worker.create().
  Runtime.install({ telemetryOptions });
};

/**
 * Creates an installer with isolated state.
 *
 * - First call: installs and records the signature -> `new`.
 * - Same signature again: no-op, safe -> `existing`.
 * - Different signature: throws RuntimeInstallConflictError.
 *
 * This guards the process against duplicate/conflicting global installs, since
 * `Runtime.install()` can only be configured once.
 */
export function createRuntimeInstaller(install: InstallFn = defaultInstallFn): RuntimeInstaller {
  let installedSignature: string | null = null;

  return {
    ensureInstalled({ telemetryOptions, signature }) {
      if (installedSignature === null) {
        install(telemetryOptions);
        installedSignature = signature;
        return { status: 'new' };
      }
      if (installedSignature === signature) {
        return { status: 'existing' };
      }
      throw new RuntimeInstallConflictError(installedSignature, signature);
    },
    isInstalled() {
      return installedSignature !== null;
    },
    reset() {
      installedSignature = null;
    },
  };
}

/** Process-wide singleton used by `attachTemporalObservability` in real usage. */
export const defaultRuntimeInstaller = createRuntimeInstaller();
