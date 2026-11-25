// Lyric timing for the receiver. Pure functions + a small clock; no DOM, so it runs in tests too.
// All times are milliseconds. A lyric line is { timeMs, text }; empty text marks an instrumental break.
//
// nudgeMs: positive = lyrics earlier (corrects real audio offset, e.g. group buffering).
// leadMs:  how early each line lights up so people can read before singing (default 400).

export const GAP_MS = 5000;        // silences longer than this get a countdown (spec: "Count down during instrumental gaps")
export const IMMINENT_MS = 1500;   // within this of the next line, the countdown gives way to the line itself

/**
 * Keeps the song position moving between updates from the phone: counts forward while playing,
 * freezes while paused, jumps on every update (seek, resume, track change).
 */
export class LyricsClock {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.anchorPos = 0;
    this.anchorAt = now();
    this.playing = false;
  }

  /** positionMs is accurate as of the moment this update is received. */
  update({ positionMs, playing }) {
    this.anchorPos = positionMs;
    this.anchorAt = this.now();
    this.playing = !!playing;
  }

  positionMs() {
    return this.playing ? this.anchorPos + (this.now() - this.anchorAt) : this.anchorPos;
  }
}

/** Index of the line active at positionMs (after nudge + lead), or -1 before the first line. */
export function lineIndexAt(lines, positionMs, { nudgeMs = 0, leadMs = 0 } = {}) {
  const t = positionMs + nudgeMs + leadMs;
  let lo = 0, hi = lines.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= t) { found = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return found;
}

const sung = (line) => line.text.trim() !== '';

function nextSungIndex(lines, from) {
  for (let i = from; i < lines.length; i++) if (sung(lines[i])) return i;
  return -1;
}

function prevSungIndex(lines, from) {
  for (let i = from; i >= 0; i--) if (sung(lines[i])) return i;
  return -1;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * What the display should show at positionMs:
 *  { mode: 'line', index, progress }                 highlight lines[index]; progress 0..1 until the next line
 *  { mode: 'gap', nextIndex, msUntilNext, imminent } countdown + preview of lines[nextIndex]
 *  { mode: 'end' }                                   the last sung line has had its time
 * index -1 in 'line' mode means "nothing highlighted yet" (short intro).
 */
export function displayStateAt(lines, positionMs, opts = {}) {
  const t = positionMs + (opts.nudgeMs ?? 0) + (opts.leadMs ?? 0);
  const index = lineIndexAt(lines, positionMs, opts);
  const nextIndex = nextSungIndex(lines, index + 1);
  const gap = (from) => {
    const msUntilNext = lines[nextIndex].timeMs - t;
    return { mode: 'gap', nextIndex, msUntilNext, imminent: msUntilNext <= IMMINENT_MS, from };
  };

  // Intro: count down if the first line is more than GAP_MS into the song
  if (index < 0) {
    if (nextIndex >= 0 && lines[nextIndex].timeMs > GAP_MS) return gap('intro');
    return { mode: 'line', index: -1, progress: 0 };
  }

  const current = lines[index];
  const elapsed = t - current.timeMs;

  // After the last sung line
  if (nextIndex < 0) {
    if (!sung(current) || elapsed > GAP_MS) return { mode: 'end' };
    return { mode: 'line', index, progress: clamp01(elapsed / GAP_MS) };
  }

  // Long silence: an explicit break line, or a sung line that has been up for GAP_MS with more silence to come
  const silence = lines[nextIndex].timeMs - current.timeMs;
  if (silence > GAP_MS && (!sung(current) || elapsed > GAP_MS)) return gap('break');

  // Short break line: keep the previous sung line up
  if (!sung(current)) return { mode: 'line', index: prevSungIndex(lines, index), progress: 1 };

  const end = lines[index + 1].timeMs;
  return { mode: 'line', index, progress: clamp01(elapsed / (end - current.timeMs)) };
}
