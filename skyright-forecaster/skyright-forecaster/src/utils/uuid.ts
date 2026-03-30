import { randomUUID } from 'crypto';

export async function getUUID(): Promise<string> {
  return randomUUID();
}
