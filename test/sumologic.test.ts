/**
 * Sumo Logic profile unit tests.
 *
 * All tests inject an isolated fake installer so the real global
 * `Runtime.install()` is NEVER called here.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  attachTemporalObservability,
  createRuntimeInstaller,
  DEFAULT_METRICS_EXPORT_INTERVAL_MS,
  METRICS_EXPORT_INTERVAL_ENV,
  ObservabilityConfigError,
  OTLP_ENDPOINT_ENV,
  OTLP_HEADERS_ENV,
  OTLP_PROTOCOL_ENV,
  RuntimeInstallConflictError,
  STANDARD_OTLP_ENDPOINT_ENV,
  STANDARD_OTLP_HEADERS_ENV,
  STANDARD_OTLP_METRICS_ENDPOINT_ENV,
  STANDARD_OTLP_PROTOCOL_ENV,
  STANDARD_METRIC_EXPORT_INTERVAL_ENV,
  SUMOLOGIC_METRICS_EXPORT_INTERVAL_ENV,
  SUMOLOGIC_OTLP_ENDPOINT_ENV,
  SUMOLOGIC_OTLP_HEADERS_ENV,
  SUMOLOGIC_OTLP_PROTOCOL_ENV,
  UnsupportedVendorProfileError,
  type ObservabilityConfig,
  type TelemetryInstallOptions,
} from '../src';

const COLLECTOR_HTTP = 'http://localhost:4318/v1/metrics';

function sumoConfig(overrides: Partial<ObservabilityConfig> = {}): ObservabilityConfig {
  return {
    serviceName: 'payment-worker',
    environment: 'prod',
    namespace: 'payments',
    taskQueue: 'payment-tasks',
    vendorProfile: 'sumologic',
    routingMode: 'collector',
    configSource: 'env',
    ...overrides,
  };
}

/** Isolated installer per test so global runtime state is never touched. */
function fakeInstaller() {
  const install = vi.fn<[TelemetryInstallOptions], void>();
  return { install, installer: createRuntimeInstaller(install) };
}

describe('sumologic endpoint resolution', () => {
  it('resolves the endpoint from inline input', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    expect(handle.startupReport().otlpEndpoint).toBe(COLLECTOR_HTTP);
    expect(handle.startupReport().metricsEndpoint).toBe(COLLECTOR_HTTP);
  });

  it('requires an OTLP endpoint', () => {
    const { installer } = fakeInstaller();
    expect(() => attachTemporalObservability(sumoConfig(), { installer, env: {} })).toThrow(
      ObservabilityConfigError
    );
    expect(() => attachTemporalObservability(sumoConfig(), { installer, env: {} })).toThrow(
      /requires an OTLP endpoint/
    );
  });

  it('SUMOLOGIC_OTLP_ENDPOINT env var overrides generic OTLP env var', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig(), {
      installer,
      env: {
        [SUMOLOGIC_OTLP_ENDPOINT_ENV]: 'http://sumo:4318/v1/metrics',
        [OTLP_ENDPOINT_ENV]: 'http://generic:4318/v1/metrics',
      },
    });
    expect(handle.startupReport().otlpEndpoint).toBe('http://sumo:4318/v1/metrics');
  });

  it('generic OTLP_ENDPOINT env var overrides OTEL_EXPORTER_OTLP_METRICS_ENDPOINT', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig(), {
      installer,
      env: {
        [OTLP_ENDPOINT_ENV]: 'http://generic:4318/v1/metrics',
        [STANDARD_OTLP_METRICS_ENDPOINT_ENV]: 'http://standard-metrics:4318/v1/metrics',
      },
    });
    expect(handle.startupReport().otlpEndpoint).toBe('http://generic:4318/v1/metrics');
  });

  it('OTEL_EXPORTER_OTLP_METRICS_ENDPOINT works and beats OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig(), {
      installer,
      env: {
        [STANDARD_OTLP_METRICS_ENDPOINT_ENV]: 'http://standard-metrics:4318/v1/metrics',
        [STANDARD_OTLP_ENDPOINT_ENV]: 'http://standard:4318',
      },
    });
    expect(handle.startupReport().otlpEndpoint).toBe('http://standard-metrics:4318/v1/metrics');
  });

  it('falls back to OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig(), {
      installer,
      env: { [STANDARD_OTLP_ENDPOINT_ENV]: 'http://standard:4318' },
    });
    expect(handle.startupReport().otlpEndpoint).toBe('http://standard:4318');
  });

  it('inline endpoint overrides all env vars', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {
        [SUMOLOGIC_OTLP_ENDPOINT_ENV]: 'http://sumo:4318/v1/metrics',
        [OTLP_ENDPOINT_ENV]: 'http://generic:4318/v1/metrics',
        [STANDARD_OTLP_METRICS_ENDPOINT_ENV]: 'http://standard-metrics:4318/v1/metrics',
        [STANDARD_OTLP_ENDPOINT_ENV]: 'http://standard:4318',
      },
    });
    expect(handle.startupReport().otlpEndpoint).toBe(COLLECTOR_HTTP);
  });
});

describe('sumologic protocol resolution', () => {
  it('defaults to http', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    expect(handle.startupReport().otlpProtocol).toBe('http');
  });

  it('SUMOLOGIC_OTLP_PROTOCOL overrides generic OTLP_PROTOCOL and standard', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {
        [SUMOLOGIC_OTLP_PROTOCOL_ENV]: 'grpc',
        [OTLP_PROTOCOL_ENV]: 'http',
        [STANDARD_OTLP_PROTOCOL_ENV]: 'http/protobuf',
      },
    });
    expect(handle.startupReport().otlpProtocol).toBe('grpc');
  });

  it('inline protocol overrides all env vars', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(
      sumoConfig({ otlpEndpoint: COLLECTOR_HTTP, otlpProtocol: 'http' }),
      {
        installer,
        env: { [SUMOLOGIC_OTLP_PROTOCOL_ENV]: 'grpc' },
      }
    );
    expect(handle.startupReport().otlpProtocol).toBe('http');
  });

  it('throws on an invalid protocol', () => {
    const { installer } = fakeInstaller();
    expect(() =>
      attachTemporalObservability(
        sumoConfig({ otlpEndpoint: COLLECTOR_HTTP, otlpProtocol: 'tcp' as never }),
        { installer, env: {} }
      )
    ).toThrow(ObservabilityConfigError);
  });
});

describe('sumologic header resolution and parsing', () => {
  it('inline headers override sumo-specific env headers', () => {
    const { install, installer } = fakeInstaller();
    attachTemporalObservability(
      sumoConfig({
        otlpEndpoint: COLLECTOR_HTTP,
        otlpHeaders: { 'x-inline': 'yes' },
      }),
      {
        installer,
        env: { [SUMOLOGIC_OTLP_HEADERS_ENV]: 'x-sumologic-env=1' },
      }
    );
    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.otel.headers).toEqual({ 'x-inline': 'yes' });
  });

  it('sumo-specific env headers override generic OTLP env headers', () => {
    const { install, installer } = fakeInstaller();
    attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {
        [SUMOLOGIC_OTLP_HEADERS_ENV]: 'x-sumo-category=temporal-workers',
        [OTLP_HEADERS_ENV]: 'x-generic=1',
        [STANDARD_OTLP_HEADERS_ENV]: 'x-standard=1',
      },
    });
    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.otel.headers).toEqual({
      'x-sumo-category': 'temporal-workers',
    });
  });

  it('env headers parse correctly', () => {
    const { install, installer } = fakeInstaller();
    attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {
        [SUMOLOGIC_OTLP_HEADERS_ENV]: 'x-sumo-category=temporal-workers,Authorization=Bearer abc123',
      },
    });
    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.otel.headers).toEqual({
      'x-sumo-category': 'temporal-workers',
      Authorization: 'Bearer abc123',
    });
  });

  it('startup report never exposes header values', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(
      sumoConfig({
        otlpEndpoint: COLLECTOR_HTTP,
        otlpHeaders: { Authorization: 'Bearer super-secret-token-123' },
      }),
      { installer, env: {} }
    );
    const report = handle.startupReport();
    expect(report.headersConfigured).toBe(true);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('super-secret-token-123');
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('Authorization');
  });

  it('reports headersConfigured: false when no headers are set', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    expect(handle.startupReport().headersConfigured).toBe(false);
  });
});

describe('sumologic export interval resolution', () => {
  it('defaults to 10000 ms', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    expect(handle.startupReport().metricsExportIntervalMs).toBe(DEFAULT_METRICS_EXPORT_INTERVAL_MS);
  });

  it('SUMOLOGIC_METRICS_EXPORT_INTERVAL_MS overrides generic and standard vars', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {
        [SUMOLOGIC_METRICS_EXPORT_INTERVAL_ENV]: '5000',
        [METRICS_EXPORT_INTERVAL_ENV]: '30000',
        [STANDARD_METRIC_EXPORT_INTERVAL_ENV]: '60000',
      },
    });
    expect(handle.startupReport().metricsExportIntervalMs).toBe(5000);
  });

  it('generic METRICS_EXPORT_INTERVAL overrides standard OTEL interval', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {
        [METRICS_EXPORT_INTERVAL_ENV]: '30000',
        [STANDARD_METRIC_EXPORT_INTERVAL_ENV]: '60000',
      },
    });
    expect(handle.startupReport().metricsExportIntervalMs).toBe(30000);
  });

  it('throws on invalid inline interval', () => {
    const { installer } = fakeInstaller();
    expect(() =>
      attachTemporalObservability(
        sumoConfig({ otlpEndpoint: COLLECTOR_HTTP, metricsExportIntervalMs: 0 }),
        { installer, env: {} }
      )
    ).toThrow(ObservabilityConfigError);
  });
});

describe('sumologic runtime install safety', () => {
  it('duplicate attach with the same resolved Sumo config is safe', () => {
    const { install, installer } = fakeInstaller();
    const first = attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    const second = attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    expect(install).toHaveBeenCalledTimes(1);
    expect(first.startupReport().runtimeInstallStatus).toBe('installed');
    expect(second.startupReport().runtimeInstallStatus).toBe('already_installed');
  });

  it('conflicting Sumo endpoint throws', () => {
    const { installer } = fakeInstaller();
    attachTemporalObservability(sumoConfig({ otlpEndpoint: 'http://a:4318/v1/metrics' }), {
      installer,
      env: {},
    });
    expect(() =>
      attachTemporalObservability(sumoConfig({ otlpEndpoint: 'http://b:4318/v1/metrics' }), {
        installer,
        env: {},
      })
    ).toThrow(RuntimeInstallConflictError);
  });

  it('prometheus-then-sumo conflict throws', () => {
    const { installer } = fakeInstaller();
    attachTemporalObservability(
      { ...sumoConfig({}), vendorProfile: 'prometheus' },
      { installer, env: {} }
    );
    expect(() =>
      attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
        installer,
        env: {},
      })
    ).toThrow(RuntimeInstallConflictError);
  });

  it('otel-then-sumo conflict throws', () => {
    const { installer } = fakeInstaller();
    attachTemporalObservability(
      { ...sumoConfig({}), vendorProfile: 'otel', otlpEndpoint: COLLECTOR_HTTP },
      { installer, env: {} }
    );
    expect(() =>
      attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
        installer,
        env: {},
      })
    ).toThrow(RuntimeInstallConflictError);
  });
});

describe('sumologic startup report and telemetry options', () => {
  it('reports the expected Sumo Logic fields and no secrets', () => {
    const { installer } = fakeInstaller();
    const report = attachTemporalObservability(
      sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }),
      { installer, env: {} }
    ).startupReport();

    expect(report.exporter).toBe('otlp');
    expect(report.vendorProfile).toBe('sumologic');
    expect(report.routingMode).toBe('collector');
    expect(report.otlpEndpoint).toBe(COLLECTOR_HTTP);
    expect(report.otlpProtocol).toBe('http');
    expect(report.headersConfigured).toBe(false);
    expect(report.metricsExportIntervalMs).toBe(DEFAULT_METRICS_EXPORT_INTERVAL_MS);
    expect(report.runtimeInstallStatus).toBe('installed');
    expect(report.commonTags).toEqual({
      service_name: 'payment-worker',
      environment: 'prod',
      namespace: 'payments',
      task_queue: 'payment-tasks',
      vendor_profile: 'sumologic',
      routing_mode: 'collector',
    });
  });

  it('configures real Temporal SDK OTLP fields and common tags', () => {
    const { install, installer } = fakeInstaller();
    attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.otel).toEqual({
      url: COLLECTOR_HTTP,
      http: true,
      metricsExportInterval: DEFAULT_METRICS_EXPORT_INTERVAL_MS,
    });
    expect(telemetry.metrics.globalTags).toEqual({
      service_name: 'payment-worker',
      environment: 'prod',
      namespace: 'payments',
      task_queue: 'payment-tasks',
      vendor_profile: 'sumologic',
      routing_mode: 'collector',
    });
  });

  it('workerOptions() returns {}', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(sumoConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    expect(handle.workerOptions()).toEqual({});
  });
});

describe('unimplemented profiles', () => {
  it('dynatrace-oneagent still throws not implemented', () => {
    const { installer } = fakeInstaller();
    expect(() =>
      attachTemporalObservability(
        sumoConfig({ vendorProfile: 'dynatrace-oneagent' as any }),
        { installer, env: {} }
      )
    ).toThrow(UnsupportedVendorProfileError);
  });
});
