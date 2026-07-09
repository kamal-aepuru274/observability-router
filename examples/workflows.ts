import { defineSignal } from '@temporalio/workflow';

export const exampleSignal = defineSignal('example');

export async function exampleWorkflow(): Promise<string> {
  return 'done';
}
