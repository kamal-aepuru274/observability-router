import { UnsupportedVendorProfileError } from '../errors';
import type { VendorProfile } from '../types';
import { otelProfile } from './otel';
import { prometheusProfile } from './prometheus';
import type { VendorProfileModule } from './types';

/**
 * A profile that is declared in the public type but not implemented yet.
 * Every method fails loudly with a clear, actionable message.
 */
function declaredNotImplemented(id: VendorProfile): VendorProfileModule {
  const fail = (): never => {
    throw new UnsupportedVendorProfileError(id);
  };
  return {
    id,
    implemented: false,
    resolve: fail,
    buildMetricsOptions: fail,
    describeTarget: fail,
    signature: fail,
  };
}

/** Single source of truth mapping a profile id to its implementation. */
export const profileRegistry: Record<VendorProfile, VendorProfileModule> = {
  prometheus: prometheusProfile as VendorProfileModule,
  otel: otelProfile as VendorProfileModule,
  dynatrace: declaredNotImplemented('dynatrace'),
  sumologic: declaredNotImplemented('sumologic'),
  'dynatrace-oneagent': declaredNotImplemented('dynatrace-oneagent'),
};
