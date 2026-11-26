// Messages from the phone on our custom Cast namespace (design D5). No DOM or Cast SDK here, so it runs in tests.
//
// Every message is a JSON object with a `type`:
//   { type: 'state', mode, song, lyrics, positionMs, playing }
//   { type: 'settings', theme, nudgeMs, leadMs, idleTimeoutMin }
//   { type: 'heartbeat', idleRemainingSec }

export const NAMESPACE = 'urn:x-cast:com.lyricomatic';
export const MESSAGE_TYPES = ['state', 'settings', 'heartbeat'];

/**
 * Routes each incoming message to the handler for its type and remembers when the phone last
 * spoke. Any message counts as contact, including ones we can't use, because the backstop (task 3.4)
 * only cares whether the phone is still there.
 */
export class MessageRouter {
  constructor(handlers = {}, now = () => Date.now()) {
    this.handlers = handlers;
    this.now = now;
    this.lastMessageAt = null;
    this.counts = Object.fromEntries(MESSAGE_TYPES.map((t) => [t, 0]));
    this.rejected = 0;
  }

  /** data is what CAF hands us: already parsed for a JSON namespace, but a string is accepted too. */
  receive(data) {
    this.lastMessageAt = this.now();
    let msg = data;
    if (typeof data === 'string') {
      try { msg = JSON.parse(data); } catch { return this.#reject('not JSON'); }
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return this.#reject('not an object');
    if (!MESSAGE_TYPES.includes(msg.type)) return this.#reject(`unknown type ${JSON.stringify(msg.type)}`);
    this.counts[msg.type]++;
    this.handlers[msg.type]?.(msg);
    return { ok: true, type: msg.type };
  }

  /** Milliseconds since the last message, or null if none has arrived yet. */
  silenceMs() {
    return this.lastMessageAt === null ? null : this.now() - this.lastMessageAt;
  }

  #reject(error) {
    this.rejected++;
    return { ok: false, error };
  }
}

/**
 * Describes state messages for the on-screen log, and returns null for ones that are only a refresh:
 * same song, lyrics and play state, with the position where the receiver would expect it.
 */
export class StateLog {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.last = null;
  }

  describe(msg) {
    const lyrics = msg.lyrics
      ? msg.lyrics.type + (msg.lyrics.type === 'synced' ? ` ${msg.lyrics.lines.length} lines` : '')
      : 'looking up';
    const what = msg.mode === 'lyrics'
      ? `"${msg.song.title}" / ${msg.song.artist} · ${lyrics} · ${msg.playing ? 'playing' : 'stopped'}`
      : `idle${msg.noSpeakers ? ' (no speakers)' : ''}`;
    const at = this.now();
    const last = this.last;
    this.last = { what, at, positionMs: msg.positionMs, playing: msg.playing };
    const expected = last && last.positionMs + (last.playing ? at - last.at : 0);
    if (last && last.what === what && !(Math.abs(msg.positionMs - expected) > 2000)) return null;
    return msg.mode === 'lyrics' ? `${what} @ ${(msg.positionMs / 1000).toFixed(1)}s` : what;
  }
}
