// Tests for js/timing.js. Run in Node (`node receiver/test/run-node.mjs`) or open test/index.html in a browser.
import { LyricsClock, lineIndexAt, displayStateAt, GAP_MS } from '../js/timing.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e} but got ${a}`);
}
function near(actual, expected, tol, msg = '') {
  if (Math.abs(actual - expected) > tol) throw new Error(`${msg} expected ~${expected} but got ${actual}`);
}

function fakeNow() {
  let t = 0;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

const L = (s, text) => ({ timeMs: s * 1000, text });
const song = [L(2, 'one'), L(4, 'two'), L(6, 'three'), L(8, 'four'), L(30, 'after solo'), L(33, 'last')];

// --- Clock (spec: "Keep lyrics in time with the audio") ---

test('clock counts forward while playing', () => {
  const now = fakeNow(); const c = new LyricsClock(now);
  c.update({ positionMs: 10_000, playing: true });
  now.advance(2_500);
  eq(c.positionMs(), 12_500);
});

test('clock freezes while paused (pause and resume)', () => {
  const now = fakeNow(); const c = new LyricsClock(now);
  c.update({ positionMs: 10_000, playing: true });
  now.advance(1_000);
  c.update({ positionMs: 11_000, playing: false });   // pause
  now.advance(60_000);                                 // 1 minute paused
  eq(c.positionMs(), 11_000, 'during pause');
  c.update({ positionMs: 11_000, playing: true });    // resume
  now.advance(500);
  eq(c.positionMs(), 11_500, 'after resume');
});

test('clock jumps on seek', () => {
  const now = fakeNow(); const c = new LyricsClock(now);
  c.update({ positionMs: 10_000, playing: true });
  now.advance(1_000);
  c.update({ positionMs: 90_000, playing: true });
  eq(c.positionMs(), 90_000);
});

test('clock keeps time with no updates for 20 s (phone briefly silent)', () => {
  const now = fakeNow(); const c = new LyricsClock(now);
  c.update({ positionMs: 0, playing: true });
  now.advance(20_000);
  eq(c.positionMs(), 20_000);
  eq(lineIndexAt(song, c.positionMs()), 3);
});

// --- Line selection, nudge and lead ---

test('line changes exactly at its timestamp with nudge and lead at zero', () => {
  eq(lineIndexAt(song, 3_999), 0);
  eq(lineIndexAt(song, 4_000), 1);
});

test('before the first line nothing is highlighted', () => eq(lineIndexAt(song, 1_000), -1));

test('display lead lights lines up early', () => eq(lineIndexAt(song, 3_600, { leadMs: 400 }), 1));

test('positive nudge moves every line earlier (spec: lyrics running late)', () => {
  for (const line of song) eq(lineIndexAt(song, line.timeMs - 300, { nudgeMs: 300 }), song.indexOf(line));
});

test('negative nudge moves lines later', () => eq(lineIndexAt(song, 4_200, { nudgeMs: -300 }), 0));

// --- Display state: progress bar, gaps, end ---

test('progress bar is about half full halfway through a line (spec: four-second line)', () => {
  const lines = [L(0, 'a'), L(4, 'b')];
  const s = displayStateAt(lines, 2_000);
  eq(s.mode, 'line'); near(s.progress, 0.5, 0.001);
});

test('progress bar is full when the next line starts', () => {
  const lines = [L(0, 'a'), L(4, 'b'), L(8, 'c')];
  near(displayStateAt(lines, 3_999).progress, 1, 0.001);
  eq(displayStateAt(lines, 4_000).index, 1);
});

test('long silence after a line becomes a countdown with preview (spec: guitar solo)', () => {
  const s = displayStateAt(song, 14_000);           // "four" at 8s, next at 30s
  eq(s.mode, 'gap'); eq(s.nextIndex, 4); eq(s.msUntilNext, 16_000); eq(s.imminent, false);
});

test('the line stays highlighted for its first 5 s before a long silence', () => {
  const s = displayStateAt(song, 12_000);
  eq(s.mode, 'line'); eq(s.index, 3);
});

test('countdown turns imminent shortly before the next line', () => {
  const s = displayStateAt(song, 29_000);
  eq(s.mode, 'gap'); eq(s.imminent, true);
  eq(displayStateAt(song, 30_000).index, 4);
});

test('song intro longer than 5 s counts down to the first line (spec: song intro)', () => {
  const lines = [L(15, 'first'), L(18, 'second')];
  const s = displayStateAt(lines, 3_000);
  eq(s.mode, 'gap'); eq(s.nextIndex, 0); eq(s.msUntilNext, 12_000);
});

test('short intro shows no countdown', () => {
  eq(displayStateAt(song, 1_000), { mode: 'line', index: -1, progress: 0 });
});

test('explicit break line longer than 5 s is a countdown', () => {
  const lines = [L(0, 'a'), L(3, ''), L(20, 'b')];
  eq(displayStateAt(lines, 4_000).mode, 'gap');
});

test('short break line keeps the previous sung line up', () => {
  const lines = [L(0, 'a'), L(3, ''), L(5, 'b')];
  eq(displayStateAt(lines, 4_000), { mode: 'line', index: 0, progress: 1 });
});

test('after the last line has had 5 s the song is over', () => {
  eq(displayStateAt(song, 34_000).mode, 'line');
  eq(displayStateAt(song, 33_000 + GAP_MS + 1).mode, 'end');
});

test('lead and nudge apply to gaps too', () => {
  const s = displayStateAt(song, 14_000, { leadMs: 400, nudgeMs: 100 });
  eq(s.msUntilNext, 15_500);
});
