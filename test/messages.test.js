// Tests for js/messages.js. Run in Node (`node receiver/test/run-node.mjs`) or open test/index.html in a browser.
import { MessageRouter, NAMESPACE } from '../js/messages.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e} but got ${a}`);
}

function fakeNow(start = 1000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

test('namespace matches the design', () => eq(NAMESPACE, 'urn:x-cast:com.lyricomatic'));

test('routes each type to its handler', () => {
  const seen = [];
  const r = new MessageRouter({
    state: (m) => seen.push(['state', m.mode]),
    settings: (m) => seen.push(['settings', m.theme]),
    heartbeat: (m) => seen.push(['heartbeat', m.idleRemainingSec]),
  });
  eq(r.receive({ type: 'heartbeat', idleRemainingSec: 1800 }), { ok: true, type: 'heartbeat' });
  r.receive({ type: 'settings', theme: 'night' });
  r.receive({ type: 'state', mode: 'idle' });
  eq(seen, [['heartbeat', 1800], ['settings', 'night'], ['state', 'idle']]);
  eq(r.counts, { state: 1, settings: 1, heartbeat: 1 });
});

test('accepts a JSON string as well as an object', () => {
  const r = new MessageRouter();
  eq(r.receive('{"type":"heartbeat","idleRemainingSec":5}'), { ok: true, type: 'heartbeat' });
});

test('rejects bad messages without calling handlers', () => {
  let called = false;
  const r = new MessageRouter({ heartbeat: () => { called = true; } });
  eq(r.receive('not json').ok, false);
  eq(r.receive(null).ok, false);
  eq(r.receive([1, 2]).ok, false);
  eq(r.receive({ type: 'reboot' }), { ok: false, error: 'unknown type "reboot"' });
  eq(r.rejected, 4);
  eq(called, false);
});

test('a type with no handler is still accepted', () => {
  const r = new MessageRouter({});
  eq(r.receive({ type: 'state' }), { ok: true, type: 'state' });
});

test('tracks silence since the last message, counting rejected ones as contact', () => {
  const now = fakeNow();
  const r = new MessageRouter({}, now);
  eq(r.silenceMs(), null, 'before any message');
  r.receive({ type: 'heartbeat' });
  now.advance(20000);
  eq(r.silenceMs(), 20000);
  r.receive({ type: 'bogus' });
  eq(r.silenceMs(), 0);
});
