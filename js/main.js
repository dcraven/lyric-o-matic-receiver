// Receiver shell: starts CAF, keeps the app open without media, and listens on our namespace.
// Screens (idle, lyrics, fallbacks) come in section 6; the heartbeat backstop comes in task 3.4.
import { NAMESPACE, MessageRouter } from './messages.js';

const statusEl = document.getElementById('status');

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

// Only start CAF on a Cast device; in a normal browser the page just shows the placeholder.
const onCastDevice = window.cast?.framework && /CrKey|Android|AFT|TV/.test(navigator.userAgent);
if (onCastDevice) {
  const context = cast.framework.CastReceiverContext.getInstance();
  context.addCustomMessageListener(NAMESPACE, (event) => {
    const result = router.receive(event.data);
    if (!result.ok) console.warn('Ignored message from', event.senderId, result.error);
    showStatus();
  });
  const options = new cast.framework.CastReceiverOptions();
  // Without this CAF closes an app that plays no media after a few minutes (design D6).
  options.disableIdleTimeout = true;
  options.customNamespaces = { [NAMESPACE]: cast.framework.system.MessageType.JSON };
  context.start(options);
  showStatus();
  setInterval(showStatus, 1000);
} else {
  statusEl.textContent = 'Not on a Cast device';
}
