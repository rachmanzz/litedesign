/**
 * Reconnect policy for the service-worker socket. Pure on purpose: the worker
 * itself cannot be unit tested, but the numbers behind it can.
 *
 * The socket is also the control channel: the MCP server asks the worker to
 * attach to the active tab over it. So the worker never stops trying. It backs
 * off instead, and switching tabs retries immediately.
 */

export const RECONNECT_MIN = 1000
export const RECONNECT_MAX = 30000

/** Failures before the icon admits the hub is not there. */
export const OFFLINE_AFTER = 3

/** Delay before the next attempt. `failures` counts the attempts already made. */
export function backoffDelay(failures: number): number {
  const step = Math.max(failures - 1, 0)
  return Math.min(RECONNECT_MIN * 2 ** step, RECONNECT_MAX)
}
