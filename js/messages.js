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
