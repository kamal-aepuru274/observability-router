import { ApplicationFailure, Context } from '@temporalio/activity';

export interface ChargeInput {
  orderId: string;
  customerId: string;
  amountCents: number;
  currency: string;
}

export interface ChargeResult {
  transactionId: string;
  status: 'SUCCESS' | 'DECLINED';
  amountCents: number;
}

export interface RefundInput {
  transactionId: string;
  orderId: string;
  amountCents: number;
}

export interface RefundResult {
  refundId: string;
  status: 'REFUNDED';
}

export interface NotifyInput {
  customerId: string;
  orderId: string;
  event: 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_REFUNDED';
  amountCents: number;
  currency: string;
}

export async function chargePayment(input: ChargeInput): Promise<ChargeResult> {
  Context.current().heartbeat('charging');

  if (input.amountCents <= 0) {
    throw ApplicationFailure.nonRetryable(
      `Invalid amount: ${input.amountCents}. Must be > 0.`,
      'InvalidAmount'
    );
  }

  // Simulate processing delay (50–150ms)
  await sleep(50 + Math.random() * 100);

  // Simulate a 10% decline rate for demonstration
  if (Math.random() < 0.1) {
    return {
      transactionId: '',
      status: 'DECLINED',
      amountCents: input.amountCents,
    };
  }

  return {
    transactionId: `txn_${Date.now()}_${input.orderId}`,
    status: 'SUCCESS',
    amountCents: input.amountCents,
  };
}

export async function refundPayment(input: RefundInput): Promise<RefundResult> {
  Context.current().heartbeat('refunding');

  if (!input.transactionId) {
    throw ApplicationFailure.nonRetryable('Cannot refund: no transactionId', 'MissingTransaction');
  }

  await sleep(30 + Math.random() * 70);

  return {
    refundId: `ref_${Date.now()}_${input.orderId}`,
    status: 'REFUNDED',
  };
}

export async function notifyCustomer(input: NotifyInput): Promise<void> {
  await sleep(10 + Math.random() * 40);
  // In production: call email/SMS service here
  console.log(
    `[notify] customer=${input.customerId} order=${input.orderId} event=${input.event} amount=${input.amountCents}${input.currency}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
