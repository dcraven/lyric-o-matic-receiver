// Receiver shell: starts CAF, keeps the TV awake (keepawake.js), and listens on our namespace.
// Screens (idle, lyrics, fallbacks) come in section 6.
import { NAMESPACE, MessageRouter } from './messages.js';
import { setUpKeepAwake } from './keepawake.js';
import { backstopState } from './backstop.js';

const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const lostEl = document.getElementById('lost');
const lostCountdownEl = document.getElementById('lost-countdown');
const t0 = Date.now();
let context = null;

function logEvent(...parts) {
  const text = `${((Date.now() - t0) / 1000).toFixed(0)}s ${parts.filter(Boolean).join(' ')}`;
  const line = document.createElement('div');
  line.textContent = text;
  logEl.append(line);
  while (logEl.childElementCount > 12) logEl.firstElementChild.remove();
  // Also send it to connected senders so a test script can see it without watching the TV.
  try { context?.sendCustomMessage(NAMESPACE, undefined, { type: 'log', text }); } catch {}
}

document.addEventListener('visibilitychange', () => logEvent('document', document.visibilityState));

const router = new MessageRouter({
  heartbeat: () => {},
  settings: () => {},
  state: () => {},
});

function showStatus() {
  const silence = router.silenceMs();
  const { heartbeat, state, settings } = router.counts;
  statusEl.textContent = silence === null
    ? 'Waiting for the phone…'
    : `Last message ${Math.round(silence / 1000)} s ago · heartbeats ${heartbeat} · state ${state} · settings ${settings}`;
}

// If the phone goes quiet (left the Wi-Fi, app killed), say so at 3 min and close at 4 min,
// so the TV never sits on a stale screen. Any message from the phone clears the warning.
let lastBackstop = 'ok';
function checkBackstop() {
  const b = backstopState(router.silenceMs() ?? Date.now() - t0);
  if (b.state !== lastBackstop) logEvent('backstop', b.state);
  lastBackstop = b.state;
  lostEl.hidden = b.state !== 'lost';
  if (b.state === 'lost') lostCountdownEl.textContent = `Closing in ${Math.ceil(b.closesInMs / 1000)} s`;
  if (b.state === 'close') context.stop();
}

// Only start CAF on a Cast device; in a normal browser the page just shows the placeholder.
const onCastDevice = window.cast?.framework && /CrKey|Android|AFT|TV/.test(navigator.userAgent);
if (onCastDevice) {
  context = cast.framework.CastReceiverContext.getInstance();
  // Temporary on-screen event log for debugging the shell on the TV (no devtools there).
  const T = cast.framework.system.EventType;
  for (const type of [T.READY, T.SENDER_CONNECTED, T.SENDER_DISCONNECTED, T.SHUTDOWN, T.ERROR, T.STANDBY_CHANGED, T.VISIBILITY_CHANGED]) {
    context.addEventListener(type, (e) => logEvent(type, e.senderId ?? '', e.reason ?? '', e.userAgent ?? ''));
  }
  context.addCustomMessageListener(NAMESPACE, (event) => {
    logEvent('message', event.senderId, JSON.stringify(event.data).slice(0, 60));
    const result = router.receive(event.data);
    if (!result.ok) console.warn('Ignored message from', event.senderId, result.error);
    showStatus();
  });
  setUpKeepAwake(context, document.getElementById('keepawake'), logEvent);
  const options = new cast.framework.CastReceiverOptions();
  // A safeguard: the keep-awake loop also stops CAF from treating the app as idle (design D6, D11).
  options.disableIdleTimeout = true;
  options.customNamespaces = { [NAMESPACE]: cast.framework.system.MessageType.JSON };
  context.start(options);
  showStatus();
  setInterval(showStatus, 1000);
  setInterval(checkBackstop, 1000);
} else {
  statusEl.textContent = 'Not on a Cast device';
}
