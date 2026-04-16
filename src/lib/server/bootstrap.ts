import { runMigrations } from './migrations';

let bootstrapped = false;

export function ensureBootstrapped(): void {
  if (bootstrapped) {
    return;
  }

  runMigrations();
  bootstrapped = true;
}
