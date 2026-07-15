import { describe, expect, it, vi } from 'vitest';
import {
  attachTemporalObservability,
  createRuntimeInstaller,
  DEFAULT_PROMETHEUS_BIND_ADDRESS,
  ObservabilityConfigError,
  PROMETHEUS_BIND_ADDRESS_ENV,
  RuntimeInstallConflictError,
  UnsupportedVendorProfileError,
  type ObservabilityConfig,
  type TelemetryInstallOptions,
} from '../src';

function baseConfig(overrides: Partial<ObservabilityConfig> = {}): ObservabilityConfig {
  return {
    serviceName: 'orders-worker',
    environment: 'dev',
    namespace: 'default',
    taskQueue: 'orders',
    vendorProfile: 'prometheus',
    ...overrides,
  };
}

/** Isolated installer per test so global runtime state is never touched. */
function fakeInstaller() {
  const install = vi.fn<[TelemetryInstallOptions], void>();
  return { install, installer: createRuntimeInstaller(install) };
}

describe('prometheus bind address resolution', () => {
  it('defaults to 0.0.0.0:9464', () => {
    const { install, installer } = fakeInstaller();
    const handle = attachTemporalObservability(baseConfig(), { installer, env: {} });

    expect(handle.startupReport().metricsEndpoint).toBe(
      `http://${DEFAULT_PROMETHEUS_BIND_ADDRESS}/metrics`
    );
    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.prometheus.bindAddress).toBe(DEFAULT_PROMETHEUS_BIND_ADDRESS);
  });

  it('env var overrides the default', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(baseConfig(), {
      installer,
      env: { [PROMETHEUS_BIND_ADDRESS_ENV]: '0.0.0.0:9500' },
    });
    expect(handle.startupReport().metricsEndpoint).toBe('http://0.0.0.0:9500/metrics');
  });

  it('inline config overrides the env var', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(
      baseConfig({ prometheus: { bindAddress: '127.0.0.1:9600' } }),
      { installer, env: { [PROMETHEUS_BIND_ADDRESS_ENV]: '0.0.0.0:9500' } }
    );
    expect(handle.startupReport().metricsEndpoint).toBe('http://127.0.0.1:9600/metrics');
  });

  it('throws for a malformed bind address', () => {
    const { installer } = fakeInstaller();
    expect(() =>
      attachTemporalObservability(baseConfig({ prometheus: { bindAddress: 'not-an-address' } }), {
        installer,
        env: {},
      })
    ).toThrow(ObservabilityConfigError);
  });
});

describe('vendor profile handling', () => {
  it('throws a clear MVP error for declared-but-unimplemented profiles', () => {
    for (const profile of ['dynatrace', 'sumologic', 'dynatrace-oneagent'] as const) {
      const { installer } = fakeInstaller();
      expect(() =>
        attachTemporalObservability(baseConfig({ vendorProfile: profile }), { installer, env: {} })
      ).toThrow(UnsupportedVendorProfileError);
    }
  });

  it('throws a config error for an unknown profile', () => {
    const { installer } = fakeInstaller();
    expect(() =>
      attachTemporalObservability(baseConfig({ vendorProfile: 'datadog' as never }), {
        installer,
        env: {},
      })
    ).toThrow(ObservabilityConfigError);
  });
});

describe('validation of required fields', () => {
  it.each(['serviceName', 'environment', 'namespace', 'taskQueue'] as const)(
    'throws when %s is empty',
    (field) => {
      const { installer } = fakeInstaller();
      expect(() =>
        attachTemporalObservability(baseConfig({ [field]: '' }), { installer, env: {} })
      ).toThrow(ObservabilityConfigError);
    }
  );
});

describe('runtime install safety', () => {
  it('duplicate attach with identical config is safe (existing)', () => {
    const { install, installer } = fakeInstaller();
    const first = attachTemporalObservability(baseConfig(), { installer, env: {} });
    const second = attachTemporalObservability(baseConfig(), { installer, env: {} });

    expect(install).toHaveBeenCalledTimes(1);
    expect(first.startupReport().runtimeInstallation).toBe('new');
    expect(second.startupReport().runtimeInstallation).toBe('existing');
  });

  it('conflicting config throws RuntimeInstallConflictError', () => {
    const { installer } = fakeInstaller();
    attachTemporalObservability(baseConfig({ prometheus: { bindAddress: '0.0.0.0:9464' } }), {
      installer,
      env: {},
    });
    expect(() =>
      attachTemporalObservability(baseConfig({ prometheus: { bindAddress: '0.0.0.0:9999' } }), {
        installer,
        env: {},
      })
    ).toThrow(RuntimeInstallConflictError);
  });
});

describe('startup report and worker options', () => {
  it('contains exactly the expected fields and no secrets', () => {
    const { installer } = fakeInstaller();
    const report = attachTemporalObservability(baseConfig(), { installer, env: {} }).startupReport();

    expect(Object.keys(report).sort()).toEqual(
      [
        'commonTags',
        'configSource',
        'environment',
        'exporter',
        'metricsEndpoint',
        'namespace',
        'routingMode',
        'runtimeInstallation',
        'serviceName',
        'taskQueue',
        'vendorProfile',
      ].sort()
    );

    expect(report.exporter).toBe('prometheus');

    const serialized = JSON.stringify(report).toLowerCase();
    for (const forbidden of ['token', 'apikey', 'api_key', 'password', 'secret', 'authorization']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('attaches only low-cardinality common tags', () => {
    const { install, installer } = fakeInstaller();
    attachTemporalObservability(baseConfig(), { installer, env: {} });

    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.globalTags).toEqual({
      app_service_name: 'orders-worker',
      environment: 'dev',
      namespace: 'default',
      task_queue: 'orders',
      vendor_profile: 'prometheus',
      routing_mode: 'direct',
    });
  });

  it('workerOptions() returns {} for the metrics-only MVP', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(baseConfig(), { installer, env: {} });
    expect(handle.workerOptions()).toEqual({});
  });
});
