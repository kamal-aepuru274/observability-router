/**
 * Version 2 — OTEL/OTLP profile unit tests.
 *
 * All tests inject an isolated fake installer, so the real global
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
  parseHeaderString,
  RuntimeInstallConflictError,
  STANDARD_OTLP_ENDPOINT_ENV,
  STANDARD_OTLP_HEADERS_ENV,
  STANDARD_OTLP_METRICS_ENDPOINT_ENV,
  type ObservabilityConfig,
  type TelemetryInstallOptions,
} from '../src';

const COLLECTOR_HTTP = 'http://localhost:4318/v1/metrics';

function otelConfig(overrides: Partial<ObservabilityConfig> = {}): ObservabilityConfig {
  return {
    serviceName: 'payment-worker',
    environment: 'prod',
    namespace: 'payments',
    taskQueue: 'payment-tasks',
    vendorProfile: 'otel',
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

describe('otel endpoint resolution', () => {
  it('resolves the endpoint from inline input', () => {
    const { install, installer } = fakeInstaller();
    const handle = attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });

    const report = handle.startupReport();
    expect(report.exporter).toBe('otlp');
    expect(report.otlpEndpoint).toBe(COLLECTOR_HTTP);
    expect(report.metricsEndpoint).toBe(COLLECTOR_HTTP);

    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.otel.url).toBe(COLLECTOR_HTTP);
  });

  it('requires an OTLP endpoint', () => {
    const { installer } = fakeInstaller();
    expect(() => attachTemporalObservability(otelConfig(), { installer, env: {} })).toThrow(
      ObservabilityConfigError
    );
    expect(() => attachTemporalObservability(otelConfig(), { installer, env: {} })).toThrow(
      /requires an OTLP endpoint/
    );
  });

  it('library env var overrides standard OTEL env vars', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(otelConfig(), {
      installer,
      env: {
        [OTLP_ENDPOINT_ENV]: 'http://library:4318/v1/metrics',
        [STANDARD_OTLP_METRICS_ENDPOINT_ENV]: 'http://standard-metrics:4318/v1/metrics',
        [STANDARD_OTLP_ENDPOINT_ENV]: 'http://standard:4318',
      },
    });
    expect(handle.startupReport().otlpEndpoint).toBe('http://library:4318/v1/metrics');
  });

  it('OTEL_EXPORTER_OTLP_METRICS_ENDPOINT works and beats OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(otelConfig(), {
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
    const handle = attachTemporalObservability(otelConfig(), {
      installer,
      env: { [STANDARD_OTLP_ENDPOINT_ENV]: 'http://standard:4318' },
    });
    expect(handle.startupReport().otlpEndpoint).toBe('http://standard:4318');
  });

  it('inline endpoint overrides all env vars', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {
        [OTLP_ENDPOINT_ENV]: 'http://library:4318/v1/metrics',
        [STANDARD_OTLP_METRICS_ENDPOINT_ENV]: 'http://standard-metrics:4318/v1/metrics',
        [STANDARD_OTLP_ENDPOINT_ENV]: 'http://standard:4318',
      },
    });
    expect(handle.startupReport().otlpEndpoint).toBe(COLLECTOR_HTTP);
  });
});

describe('otel protocol resolution', () => {
  it('defaults to http', () => {
    const { install, installer } = fakeInstaller();
    const handle = attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    expect(handle.startupReport().otlpProtocol).toBe('http');
    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.otel.http).toBe(true);
  });

  it('grpc maps to http: false in SDK options', () => {
    const { install, installer } = fakeInstaller();
    attachTemporalObservability(
      otelConfig({ otlpEndpoint: 'http://localhost:4317', otlpProtocol: 'grpc' }),
      { installer, env: {} }
    );
    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.otel.http).toBe(false);
  });

  it('resolves protocol from env with library precedence', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: { [OTLP_PROTOCOL_ENV]: 'grpc', OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf' },
    });
    expect(handle.startupReport().otlpProtocol).toBe('grpc');
  });

  it('normalizes standard OTEL "http/protobuf" to http', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: { OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf' },
    });
    expect(handle.startupReport().otlpProtocol).toBe('http');
  });

  it('throws on an invalid protocol', () => {
    const { installer } = fakeInstaller();
    expect(() =>
      attachTemporalObservability(
        otelConfig({ otlpEndpoint: COLLECTOR_HTTP, otlpProtocol: 'tcp' as never }),
        { installer, env: {} }
      )
    ).toThrow(ObservabilityConfigError);
  });
});

describe('otel header resolution and parsing', () => {
  it('parses env header string format', () => {
    expect(parseHeaderString('Authorization=Bearer abc123,x-api-key=xyz')).toEqual({
      Authorization: 'Bearer abc123',
      'x-api-key': 'xyz',
    });
  });

  it('throws on a malformed header entry', () => {
    expect(() => parseHeaderString('not-a-header')).toThrow(ObservabilityConfigError);
  });

  it('env headers are parsed and passed to the SDK', () => {
    const { install, installer } = fakeInstaller();
    attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: { [OTLP_HEADERS_ENV]: 'Authorization=Bearer abc123,x-api-key=xyz' },
    });
    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.otel.headers).toEqual({
      Authorization: 'Bearer abc123',
      'x-api-key': 'xyz',
    });
  });

  it('inline headers override env headers', () => {
    const { install, installer } = fakeInstaller();
    attachTemporalObservability(
      otelConfig({ otlpEndpoint: COLLECTOR_HTTP, otlpHeaders: { 'x-inline': 'yes' } }),
      {
        installer,
        env: {
          [OTLP_HEADERS_ENV]: 'x-library-env=1',
          [STANDARD_OTLP_HEADERS_ENV]: 'x-standard-env=1',
        },
      }
    );
    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.otel.headers).toEqual({ 'x-inline': 'yes' });
  });

  it('startup report never exposes header values', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(
      otelConfig({
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
    const handle = attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    expect(handle.startupReport().headersConfigured).toBe(false);
  });
});

describe('otel export interval resolution', () => {
  it('defaults to 10000 ms', () => {
    const { install, installer } = fakeInstaller();
    const handle = attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    expect(handle.startupReport().metricsExportIntervalMs).toBe(
      DEFAULT_METRICS_EXPORT_INTERVAL_MS
    );
    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.otel.metricsExportInterval).toBe(10_000);
  });

  it('resolves interval from env vars with library precedence', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: { [METRICS_EXPORT_INTERVAL_ENV]: '5000', OTEL_METRIC_EXPORT_INTERVAL: '30000' },
    });
    expect(handle.startupReport().metricsExportIntervalMs).toBe(5000);
  });

  it.each([0, -1, Number.NaN])('throws on invalid inline interval %s', (interval) => {
    const { installer } = fakeInstaller();
    expect(() =>
      attachTemporalObservability(
        otelConfig({ otlpEndpoint: COLLECTOR_HTTP, metricsExportIntervalMs: interval }),
        { installer, env: {} }
      )
    ).toThrow(ObservabilityConfigError);
  });

  it('throws on a non-numeric env interval', () => {
    const { installer } = fakeInstaller();
    expect(() =>
      attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
        installer,
        env: { [METRICS_EXPORT_INTERVAL_ENV]: 'soon' },
      })
    ).toThrow(ObservabilityConfigError);
  });
});

describe('otel runtime install safety', () => {
  it('duplicate attach with the same resolved OTEL config is safe', () => {
    const { install, installer } = fakeInstaller();
    const first = attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    const second = attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });

    expect(install).toHaveBeenCalledTimes(1);
    expect(first.startupReport().runtimeInstallStatus).toBe('installed');
    expect(second.startupReport().runtimeInstallStatus).toBe('already_installed');
  });

  it('conflicting OTEL endpoint throws', () => {
    const { installer } = fakeInstaller();
    attachTemporalObservability(otelConfig({ otlpEndpoint: 'http://a:4318/v1/metrics' }), {
      installer,
      env: {},
    });
    expect(() =>
      attachTemporalObservability(otelConfig({ otlpEndpoint: 'http://b:4318/v1/metrics' }), {
        installer,
        env: {},
      })
    ).toThrow(RuntimeInstallConflictError);
  });

  it('conflicting OTEL headers throw', () => {
    const { installer } = fakeInstaller();
    attachTemporalObservability(
      otelConfig({ otlpEndpoint: COLLECTOR_HTTP, otlpHeaders: { Authorization: 'Bearer aaa' } }),
      { installer, env: {} }
    );
    expect(() =>
      attachTemporalObservability(
        otelConfig({ otlpEndpoint: COLLECTOR_HTTP, otlpHeaders: { Authorization: 'Bearer bbb' } }),
        { installer, env: {} }
      )
    ).toThrow(RuntimeInstallConflictError);
  });

  it('the conflict error never leaks header values', () => {
    const { installer } = fakeInstaller();
    attachTemporalObservability(
      otelConfig({ otlpEndpoint: COLLECTOR_HTTP, otlpHeaders: { Authorization: 'Bearer aaa' } }),
      { installer, env: {} }
    );
    try {
      attachTemporalObservability(
        otelConfig({ otlpEndpoint: COLLECTOR_HTTP, otlpHeaders: { Authorization: 'Bearer bbb' } }),
        { installer, env: {} }
      );
      expect.unreachable('expected RuntimeInstallConflictError');
    } catch (err) {
      expect((err as Error).message).not.toContain('Bearer');
      expect((err as Error).message).not.toContain('aaa');
      expect((err as Error).message).not.toContain('bbb');
    }
  });

  it('conflicting OTLP protocol throws', () => {
    const { installer } = fakeInstaller();
    attachTemporalObservability(
      otelConfig({ otlpEndpoint: 'http://localhost:4317', otlpProtocol: 'http' }),
      { installer, env: {} }
    );
    expect(() =>
      attachTemporalObservability(
        otelConfig({ otlpEndpoint: 'http://localhost:4317', otlpProtocol: 'grpc' }),
        { installer, env: {} }
      )
    ).toThrow(RuntimeInstallConflictError);
  });

  it('prometheus-then-otel conflict throws', () => {
    const { installer } = fakeInstaller();
    attachTemporalObservability(otelConfig({ vendorProfile: 'prometheus' }), {
      installer,
      env: {},
    });
    expect(() =>
      attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
        installer,
        env: {},
      })
    ).toThrow(RuntimeInstallConflictError);
  });
});

describe('otel telemetry options shape', () => {
  it('configures only real Temporal SDK fields and attaches common tags', () => {
    const { install, installer } = fakeInstaller();
    attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });

    const telemetry = install.mock.calls[0]![0] as any;
    expect(Object.keys(telemetry.metrics.otel).sort()).toEqual(
      ['http', 'metricsExportInterval', 'url'].sort()
    );
    expect(telemetry.metrics.globalTags).toEqual({
      service_name: 'payment-worker',
      environment: 'prod',
      namespace: 'payments',
      task_queue: 'payment-tasks',
      vendor_profile: 'otel',
      routing_mode: 'collector',
    });
  });

  it('workerOptions() still returns {}', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(otelConfig({ otlpEndpoint: COLLECTOR_HTTP }), {
      installer,
      env: {},
    });
    expect(handle.workerOptions()).toEqual({});
  });
});
