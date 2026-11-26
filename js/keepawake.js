// Keeps the Google TV awake for the whole session (design D11): plays a silent, dark video on repeat
// through the CAF player, so the Cast runtime reports media as playing and the screensaver stays away.
// Needs the Cast SDK, so it isn't covered by the Node tests; it is checked on the TV (task 3.7).

const MEDIA_URL = new URL('../media/keepawake.mp4', import.meta.url).href;
const WATCHDOG_MS = 30_000;

/**
 * Call before context.start(). Starts the loop once the receiver is ready.
 * log(...parts) reports what happens (the receiver's on-screen event log).
 */
export function setUpKeepAwake(context, mediaElement, log = () => {}) {
  const { messages, events } = cast.framework;
  const pm = context.getPlayerManager();
  pm.setMediaElement(mediaElement);

  // Pause, stop and seek can come from the TV remote, a phone's Cast controls or Google Home.
  // There is no real media to control, so drop them and keep the loop going.
  // Ending the session still works: that stops the receiver app, not the media.
  for (const type of [messages.MessageType.PAUSE, messages.MessageType.STOP, messages.MessageType.SEEK]) {
    pm.setMessageInterceptor(type, () => {
      log('keep-awake: ignored', type);
      return null;
    });
  }

  const load = () => {
    const req = new messages.LoadRequestData();
    req.media = new messages.MediaInformation();
    req.media.contentId = MEDIA_URL;
    req.media.contentUrl = MEDIA_URL;
    req.media.contentType = 'video/mp4';
    req.media.streamType = messages.StreamType.BUFFERED;
    req.queueData = new messages.QueueData();
    req.queueData.repeatMode = messages.RepeatMode.REPEAT_SINGLE;
    req.autoplay = true;
    return pm.load(req)
      .then(() => log('keep-awake: playing'))
      .catch((e) => log('keep-awake: load failed', e?.message ?? String(e)));
  };

  pm.addEventListener(events.EventType.ERROR, (e) => log('keep-awake: player error', e.detailedErrorCode ?? ''));

  // If the loop ever stops anyway (an error, or a command we didn't catch), start it again.
  const watchdog = () => {
    const state = pm.getPlayerState();
    if (state === messages.PlayerState.IDLE) {
      log('keep-awake: restarting');
      load();
    } else if (state === messages.PlayerState.PAUSED) {
      log('keep-awake: resuming');
      pm.play();
    }
  };

  context.addEventListener(cast.framework.system.EventType.READY, () => {
    load();
    setInterval(watchdog, WATCHDOG_MS);
  });
}
