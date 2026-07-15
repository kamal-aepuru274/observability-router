/**
 * Starter script for the payment workflow.
 * Connects to Temporal Server and starts a `processPayment` workflow.
 *
 * Run:
 *   npx tsx examples/payment/starter.ts
 *
 * Then watch the workflow in the Temporal UI at http://localhost:8233
 */
import { Client } from '@temporalio/client';
import { processPayment } from './workflows.js';

async function run(): Promise<void> {
  const client = new Client();

  const orderId = `order-${Date.now()}`;
  const result = await client.workflow.execute(processPayment, {
    taskQueue: 'payment-tasks',
    workflowId: orderId,
    args: [
      {
        orderId,
        customerId: 'cust-123',
        amountCents: 1999,
        currency: 'USD',
      },
    ],
  });

  console.log('Workflow result:', result);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
