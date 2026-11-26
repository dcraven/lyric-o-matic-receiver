// Receiver shell: starts CAF, keeps the app open without media, and listens on our namespace.
// Screens (idle, lyrics, fallbacks) come in section 6; the heartbeat backstop comes in task 3.4.
import { NAMESPACE, MessageRouter } from './messages.js';

const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
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

// EXPERIMENT (screensaver): ways to keep Google TV's Ambient Mode away, chosen by a
// { type: 'keepAwake', method: 'caf' | 'video' | 'wakelock' } message from tools/cast-debug/heartbeat.js.
// Nothing runs unless that message arrives. Remove or turn into a design decision after the experiment.
const MEDIA_URL = new URL('media/keepawake.mp4', location.href).href;
let wakeLock = null;

async function keepAwake(method) {
  logEvent('keepAwake', method, `wakeLock API ${'wakeLock' in navigator ? 'present' : 'missing'}`);
  try {
    if (method === 'caf') {
      // Play the silent loop through CAF, so the Cast runtime itself reports PLAYING media.
      const pm = context.getPlayerManager();
      const req = new cast.framework.messages.LoadRequestData();
      req.media = new cast.framework.messages.MediaInformation();
      req.media.contentId = MEDIA_URL;
      req.media.contentUrl = MEDIA_URL;
      req.media.contentType = 'video/mp4';
      req.media.streamType = cast.framework.messages.StreamType.BUFFERED;
      req.queueData = new cast.framework.messages.QueueData();
      req.queueData.repeatMode = cast.framework.messages.RepeatMode.REPEAT_SINGLE;
      req.autoplay = true;
      await pm.load(req);
      logEvent('caf load ok', pm.getPlayerState());
    } else if (method === 'video') {
      // Plain <video> element, outside CAF.
      const v = document.getElementById('keepawake-plain');
      v.src = MEDIA_URL;
      v.loop = true;
      await v.play();
      logEvent('video playing');
    } else if (method === 'wakelock') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => logEvent('wakelock released'));
      logEvent('wakelock acquired');
    } else {
      logEvent('keepAwake: unknown method', method);
    }
  } catch (e) {
    logEvent('keepAwake failed', method, e?.name, e?.message ?? String(e));
  }
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
    if (event.data?.type === 'keepAwake') return keepAwake(event.data.method);
    const result = router.receive(event.data);
    if (!result.ok) console.warn('Ignored message from', event.senderId, result.error);
    showStatus();
  });
  const pm = context.getPlayerManager();
  pm.setMediaElement(document.getElementById('keepawake-caf'));
  const P = cast.framework.events.EventType;
  for (const type of [P.PLAYING, P.PAUSE, P.ENDED, P.ERROR, P.MEDIA_FINISHED]) {
    pm.addEventListener(type, (e) => logEvent('player', type, e.detailedErrorCode ?? ''));
  }
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
