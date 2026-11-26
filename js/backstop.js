// Heartbeat backstop (spec: "Close the receiver when the phone goes silent"; design D6).
// Pure logic, no DOM or Cast SDK, so it runs in tests.

export const LOST_AFTER_MS = 3 * 60_000;   // show "Lost connection to phone"
export const CLOSE_AFTER_MS = 4 * 60_000;  // close the receiver

/**
 * What the receiver should do after silenceMs with no message from the phone.
 * Before the first message, pass the time since the receiver started, so a phone that never
 * speaks can't leave the TV stuck either.
 *  { state: 'ok' }
 *  { state: 'lost', closesInMs }  show the lost-connection message with a countdown
 *  { state: 'close' }             stop the receiver
 * Any message brings silenceMs back to 0, so 'lost' recovers to 'ok' on its own.
 */
export function backstopState(silenceMs) {
  if (silenceMs < LOST_AFTER_MS) return { state: 'ok' };
  if (silenceMs < CLOSE_AFTER_MS) return { state: 'lost', closesInMs: CLOSE_AFTER_MS - silenceMs };
  return { state: 'close' };
}
