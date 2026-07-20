/**
 * Dynatrace OneAgent profile tests.
 *
 * `dynatrace-oneagent` is a thin preset over the `prometheus` profile: it
 * exposes a Temporal SDK Prometheus `/metrics` endpoint for Dynatrace to scrape
 * (VM: OneAgent Prometheus extension; K8s: ActiveGate / OTel Collector). The
 * library does NOT talk to OneAgent or push to a vendor API.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  attachTemporalObservability,
  createRuntimeInstaller,
  DEFAULT_PROMETHEUS_BIND_ADDRESS,
  ObservabilityConfigError,
  PROMETHEUS_BIND_ADDRESS_ENV,
  RuntimeInstallConflictError,
  type ObservabilityConfig,
  type TelemetryInstallOptions,
} from '../src';

function oneAgentConfig(overrides: Partial<ObservabilityConfig> = {}): ObservabilityConfig {
  return {
    serviceName: 'payment-worker',
    environment: 'production',
    namespace: 'default',
    taskQueue: 'payment-tasks',
    vendorProfile: 'dynatrace-oneagent',
    ...overrides,
  };
}

function fakeInstaller() {
  const install = vi.fn<[TelemetryInstallOptions], void>();
  return { install, installer: createRuntimeInstaller(install) };
}

describe('dynatrace-oneagent — Prometheus exporter preset', () => {
  it('configures the Temporal SDK Prometheus exporter (enabled)', () => {
    const { install, installer } = fakeInstaller();
    const handle = attachTemporalObservability(oneAgentConfig(), { installer, env: {} });

    expect(install).toHaveBeenCalledTimes(1);
    const telemetry = install.mock.calls[0]![0] as any;
    expect(telemetry.metrics.prometheus.bindAddress).toBe(DEFAULT_PROMETHEUS_BIND_ADDRESS);

    const report = handle.startupReport();
    expect(report.exporter).toBe('prometheus');
    expect(report.metricsEndpoint).toBe(`http://${DEFAULT_PROMETHEUS_BIND_ADDRESS}/metrics`);
    expect(report.runtimeInstallStatus).toBe('installed');
  });

  it('includes secret-safe scrape guidance in the startup report', () => {
    const { installer } = fakeInstaller();
    const report = attachTemporalObservability(oneAgentConfig(), { installer, env: {} }).startupReport();
    expect(report.scrapeGuidance).toBeTypeOf('string');
    expect(report.scrapeGuidance).toMatch(/Prometheus \/metrics/);
    expect(report.scrapeGuidance).toMatch(/OneAgent Prometheus extension/);
    expect(report.scrapeGuidance).toMatch(/ActiveGate|OpenTelemetry Collector/);
    // No secrets anywhere in the report.
    expect(JSON.stringify(report)).not.toMatch(/token/i);
  });

  it('resolves bind address inline > env > default', () => {
    // default
    const d = fakeInstaller();
    expect(
      attachTemporalObservability(oneAgentConfig(), { installer: d.installer, env: {} })
        .startupReport().metricsEndpoint
    ).toBe(`http://${DEFAULT_PROMETHEUS_BIND_ADDRESS}/metrics`);

    // env override
    const e = fakeInstaller();
    expect(
      attachTemporalObservability(oneAgentConfig(), {
        installer: e.installer,
        env: { [PROMETHEUS_BIND_ADDRESS_ENV]: '0.0.0.0:9500' },
      }).startupReport().metricsEndpoint
    ).toBe('http://0.0.0.0:9500/metrics');

    // inline wins over env
    const i = fakeInstaller();
    expect(
      attachTemporalObservability(oneAgentConfig({ prometheus: { bindAddress: '127.0.0.1:9600' } }), {
        installer: i.installer,
        env: { [PROMETHEUS_BIND_ADDRESS_ENV]: '0.0.0.0:9500' },
      }).startupReport().metricsEndpoint
    ).toBe('http://127.0.0.1:9600/metrics');
  });

  it('rejects an invalid bind address', () => {
    const { installer } = fakeInstaller();
    expect(() =>
      attachTemporalObservability(oneAgentConfig({ prometheus: { bindAddress: 'not-an-address' } }), {
        installer,
        env: {},
      })
    ).toThrow(ObservabilityConfigError);
  });

  it('reports the vendorProfile as dynatrace-oneagent', () => {
    const { installer } = fakeInstaller();
    const report = attachTemporalObservability(oneAgentConfig(), { installer, env: {} }).startupReport();
    expect(report.vendorProfile).toBe('dynatrace-oneagent');
  });

  it('workerOptions() returns {} (metrics configured via Runtime)', () => {
    const { installer } = fakeInstaller();
    const handle = attachTemporalObservability(oneAgentConfig(), { installer, env: {} });
    expect(handle.workerOptions()).toEqual({});
  });
});

describe('dynatrace-oneagent — runtime install safety', () => {
  it('same config twice is a no-op (already_installed)', () => {
    const { install, installer } = fakeInstaller();
    attachTemporalObservability(oneAgentConfig(), { installer, env: {} });
    const second = attachTemporalObservability(oneAgentConfig(), { installer, env: {} });
    expect(install).toHaveBeenCalledTimes(1);
    expect(second.startupReport().runtimeInstallStatus).toBe('already_installed');
  });

  it('has a distinct signature from the plain prometheus profile', () => {
    const { install, installer } = fakeInstaller();
    attachTemporalObservability(oneAgentConfig(), { installer, env: {} });
    // Same bind address but a different profile => conflicting install signature.
    expect(() =>
      attachTemporalObservability(
        { ...oneAgentConfig(), vendorProfile: 'prometheus' },
        { installer, env: {} }
      )
    ).toThrow(RuntimeInstallConflictError);
    expect(install).toHaveBeenCalledTimes(1);
  });
});
