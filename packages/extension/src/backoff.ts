/**
 * Reconnect policy for the service-worker socket. Pure on purpose: the worker
 * itself cannot be unit tested, but the decision that produced the console
 * noise can.
 */

export const RECONNECT_MIN = 1000
export const RECONNECT_MAX = 30000
export const MAX_ATTEMPTS = 5

/** Delay before the next attempt. `failures` counts the attempts already made. */
export function backoffDelay(failures: number): number {
  const step = Math.max(failures - 1, 0)
  return Math.min(RECONNECT_MIN * 2 ** step, RECONNECT_MAX)
}

/**
 * False once the hub has been unreachable `MAX_ATTEMPTS` times in a row. A
 * retry loop that never gives up keeps waking the worker for nothing and fills
 * the console with network errors the user cannot act on.
 */
export function shouldRetry(failures: number): boolean {
  return failures < MAX_ATTEMPTS
}
