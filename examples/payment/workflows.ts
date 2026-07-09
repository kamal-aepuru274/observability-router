import { proxyActivities, defineSignal, setHandler, condition, sleep } from '@temporalio/workflow';
import type { ChargeInput, ChargeResult, RefundInput, RefundResult, NotifyInput } from './activities';

const { chargePayment, refundPayment, notifyCustomer } = proxyActivities<{
  chargePayment(input: ChargeInput): Promise<ChargeResult>;
  refundPayment(input: RefundInput): Promise<RefundResult>;
  notifyCustomer(input: NotifyInput): Promise<void>;
}>({
  startToCloseTimeout: '30 seconds',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
    backoffCoefficient: 2,
  },
});

export interface PaymentWorkflowInput {
  orderId: string;
  customerId: string;
  amountCents: number;
  currency: string;
}

export interface PaymentWorkflowResult {
  orderId: string;
  transactionId: string;
  status: 'COMPLETED' | 'DECLINED' | 'REFUNDED';
}

export const refundSignal = defineSignal<[{ reason: string }]>('requestRefund');

export async function processPayment(input: PaymentWorkflowInput): Promise<PaymentWorkflowResult> {
  let refundRequested = false;
  let refundReason = '';

  setHandler(refundSignal, ({ reason }) => {
    refundRequested = true;
    refundReason = reason;
  });

  // Step 1: Charge
  const charge = await chargePayment({
    orderId: input.orderId,
    customerId: input.customerId,
    amountCents: input.amountCents,
    currency: input.currency,
  });

  if (charge.status === 'DECLINED') {
    await notifyCustomer({
      customerId: input.customerId,
      orderId: input.orderId,
      event: 'PAYMENT_FAILED',
      amountCents: input.amountCents,
      currency: input.currency,
    });
    return { orderId: input.orderId, transactionId: '', status: 'DECLINED' };
  }

  // Step 2: Notify success
  await notifyCustomer({
    customerId: input.customerId,
    orderId: input.orderId,
    event: 'PAYMENT_SUCCESS',
    amountCents: charge.amountCents,
    currency: input.currency,
  });

  // Step 3: Wait up to 5 seconds for a refund signal (demo window)
  const gotRefund = await condition(() => refundRequested, '5 seconds');

  if (gotRefund) {
    const refund = await refundPayment({
      transactionId: charge.transactionId,
      orderId: input.orderId,
      amountCents: charge.amountCents,
    });

    await notifyCustomer({
      customerId: input.customerId,
      orderId: input.orderId,
      event: 'PAYMENT_REFUNDED',
      amountCents: charge.amountCents,
      currency: input.currency,
    });

    console.log(`[workflow] refund completed: ${refund.refundId} reason="${refundReason}"`);
    return { orderId: input.orderId, transactionId: charge.transactionId, status: 'REFUNDED' };
  }

  return { orderId: input.orderId, transactionId: charge.transactionId, status: 'COMPLETED' };
}
