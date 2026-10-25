/**
 * A small web page that plays one YouTube video with the YouTube IFrame Player API and reports
 * how much of it has really been watched.
 *
 * The YouTube controls are hidden and the keyboard is off, so the video cannot be skipped
 * forward. Watched time only grows while the video plays at normal speed, so jumping ahead
 * would not count. The page posts these messages:
 *   { type: 'ready', duration }
 *   { type: 'progress', time, duration, watched, playing }
 *   { type: 'ended', watched, duration }
 *   { type: 'error', code }   code: YouTube error number, or 'timeout' when nothing loaded
 * and takes the commands { play: true }, { pause: true } and { restart: true }.
 *
 * The privacy-enhanced player (youtube-nocookie.com) is used, as the learners can be children.
 */
export const YOUTUBE_ORIGIN = 'https://localhost';

export function buildYouTubeHtml(videoId: string): string {
  const id = JSON.stringify(videoId);
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;height:100%;background:#0A1612;overflow:hidden}#p{position:absolute;inset:0;width:100%;height:100%}</style>
</head><body>
<div id="p"></div>
<script>
(function () {
  function send(m) {
    var s = JSON.stringify(m);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else parent.postMessage(JSON.stringify(Object.assign({ __yt: true }, m)), '*');
  }
  var player = null, watched = 0, last = null, duration = 0, ready = false, done = false;
  var timeout = setTimeout(function () { if (!ready) send({ type: 'error', code: 'timeout' }); }, 20000);

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('p', {
      host: 'https://www.youtube-nocookie.com',
      videoId: ${id},
      width: '100%',
      height: '100%',
      playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, origin: ${JSON.stringify(YOUTUBE_ORIGIN)} },
      events: {
        onReady: function () {
          ready = true;
          clearTimeout(timeout);
          duration = player.getDuration() || 0;
          send({ type: 'ready', duration: duration });
          try { player.unMute(); player.setVolume(100); } catch (e) {}
          try { player.playVideo(); } catch (e) {}
        },
        onError: function (e) { send({ type: 'error', code: e.data }); },
        onStateChange: function (e) {
          // Make sure the sound is on whenever the video plays.
          if (e.data === YT.PlayerState.PLAYING) { try { if (player.isMuted && player.isMuted()) player.unMute(); player.setVolume(100); } catch (err) {} }
          if (e.data === YT.PlayerState.ENDED && !done) {
            done = true;
            send({ type: 'ended', watched: watched, duration: duration || player.getDuration() });
          }
        }
      }
    });
  };

  // Count only time that was really played, a little at a time.
  setInterval(function () {
    if (!player || !ready || !player.getCurrentTime) return;
    var t = player.getCurrentTime();
    var playing = player.getPlayerState && player.getPlayerState() === 1;
    if (!duration) duration = player.getDuration() || 0;
    if (playing && last !== null && t > last && t - last < 1.6) watched += t - last;
    last = t;
    send({ type: 'progress', time: t, duration: duration, watched: watched, playing: playing });
  }, 500);

  window.__cmd = function (c) {
    if (!player || !ready) return;
    if (c.play) { try { player.unMute(); player.setVolume(100); } catch (e) {} player.playVideo(); }
    if (c.pause) player.pauseVideo();
    if (c.restart) { watched = 0; last = null; done = false; player.seekTo(0, true); player.playVideo(); }
  };
  window.addEventListener('message', function (e) {
    var c = e.data;
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch (err) { return; } }
    if (c && c.__ytcmd) window.__cmd(c);
  });

  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.onerror = function () { send({ type: 'error', code: 'offline' }); };
  document.head.appendChild(tag);
})();
</script>
</body></html>`;
}

export type YouTubeMessage =
  | { type: 'ready'; duration: number }
  | { type: 'progress'; time: number; duration: number; watched: number; playing: boolean }
  | { type: 'ended'; watched: number; duration: number }
  | { type: 'error'; code: number | string };
