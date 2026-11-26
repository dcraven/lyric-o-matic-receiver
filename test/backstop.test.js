// Tests for js/backstop.js. Run in Node (`node receiver/test/run-node.mjs`) or open test/index.html in a browser.
import { backstopState, LOST_AFTER_MS, CLOSE_AFTER_MS } from '../js/backstop.js';
import { MessageRouter } from '../js/messages.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e} but got ${a}`);
}

const MIN = 60_000;

test('thresholds match the spec: lost at 3 min, close at 4 min', () => {
  eq(LOST_AFTER_MS, 3 * MIN);
  eq(CLOSE_AFTER_MS, 4 * MIN);
});

test('regular heartbeats keep it ok', () => {
  eq(backstopState(0), { state: 'ok' });
  eq(backstopState(30_000), { state: 'ok' });
  eq(backstopState(3 * MIN - 1), { state: 'ok' });
});

// Spec scenario: "Phone leaves Wi-Fi"
test('shows lost connection at 3 min with a countdown, closes at 4 min', () => {
  eq(backstopState(3 * MIN), { state: 'lost', closesInMs: MIN });
  eq(backstopState(3.5 * MIN), { state: 'lost', closesInMs: 0.5 * MIN });
  eq(backstopState(4 * MIN), { state: 'close' });
  eq(backstopState(10 * MIN), { state: 'close' });
});

// Spec scenario: "Connection returns in time"
test('a message after the lost-connection message recovers', () => {
  let t = 0;
  const r = new MessageRouter({}, () => t);
  r.receive({ type: 'heartbeat' });
  t = 3.5 * MIN;
  eq(backstopState(r.silenceMs()).state, 'lost');
  r.receive({ type: 'heartbeat' });
  eq(backstopState(r.silenceMs()), { state: 'ok' });
});
