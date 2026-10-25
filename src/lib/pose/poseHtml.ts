/**
 * The pose camera page.
 *
 * Pose estimation runs inside a WebView with MediaPipe Pose Landmarker (the BlazePose model,
 * executed through TensorFlow Lite compiled to WebAssembly, with GPU acceleration where the
 * phone supports it). This runs in Expo Go with no native build.
 *
 * The page opens the camera, finds 33 body landmarks in every frame, draws the skeleton
 * over the video itself, and posts the landmarks to React Native about 15 times a second.
 * The page also looks for the bat in the picture (see batDetect.ts) and reports its direction.
 * Video never leaves the phone. When the app asks, the page hands over one still picture of the
 * finished attempt and a short video of a repetition, which the app keeps on the phone so the
 * learner can see them again on the result screen.
 *
 * Steadiness: the raw landmarks from the model shake by a few pixels from frame to frame even
 * when the learner and the phone are still. Every landmark is passed through a One Euro filter
 * (Casiez et al., 2012), which smooths strongly when a point is nearly still and lets it follow
 * quickly when it really moves. The skeleton, the stumps and the numbers sent to the app all use
 * the filtered landmarks.
 *
 * Stumps: once the learner is in the picture, three stumps are drawn on the ground behind them,
 * behind the back foot, so they can see where their wicket is (needed for back-foot shots).
 * The app can lock the stumps where they are, so they stay put while the learner steps forward.
 *
 * The MediaPipe library and the model are downloaded the first time the page opens and are
 * then cached by the WebView, so the first run needs an internet connection.
 */
import { BAT_DETECT_SOURCE, BAT_TO_TRUNK, MIN_BAT_CONFIDENCE } from './batDetect';

export const VISION_VERSION = '1.0.1';

export type PoseAssets = {
  /** Folder that holds vision_bundle.mjs and the wasm folder. */
  visionBase: string;
  /** The pose_landmarker .task model file. */
  modelUrl: string;
};

// Both files can be hosted somewhere else (for example on your own server) by setting
// EXPO_PUBLIC_POSE_VISION_BASE and EXPO_PUBLIC_POSE_MODEL_URL in .env.
export const DEFAULT_POSE_ASSETS: PoseAssets = {
  visionBase: process.env.EXPO_PUBLIC_POSE_VISION_BASE || `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}`,
  modelUrl:
    process.env.EXPO_PUBLIC_POSE_MODEL_URL ||
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};
// The "full" pose model, not "lite" (field test, 19 October 2026: with the phone in front the lite
// model's joints shook and the left and right legs swapped, so the trained model's verdict jumped).
// Train with the same model: the notebook's POSE_MODEL setting is 'full' too.

export type PoseFacing = 'front' | 'back';

/**
 * One Euro filter settings. A smaller min cutoff removes more shake when still; a larger beta
 * follows fast movements with less lag. Image landmarks are 0..1 of the picture; world landmarks
 * are in metres.
 */
export const SMOOTHING = { imageMinCutoff: 0.4, imageBeta: 6, worldMinCutoff: 0.4, worldBeta: 3, dCutoff: 1.2 };

/**
 * Light levels: the mean brightness of the picture, 0 (black) to 255 (white).
 * Below `dark` the picture is too dark for a good reading (the app turns on a light and says so);
 * it counts as bright again above `bright`. Below `boostBelow` the frame is brightened before the
 * pose model and the bat search see it, by up to `maxGain` times.
 */
export const LIGHT = { dark: 55, bright: 75, boostBelow: 95, maxGain: 2.6 };

export function buildPoseHtml(facing: PoseFacing, assets: PoseAssets = DEFAULT_POSE_ASSETS, postEveryMs = 66): string {
  const cfg = JSON.stringify({ facing, postEveryMs, batToTrunk: BAT_TO_TRUNK, minBat: MIN_BAT_CONFIDENCE, smooth: SMOOTHING, light: LIGHT, ...assets });
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body { margin: 0; height: 100%; background: #0A1612; overflow: hidden; }
  video, canvas { position: fixed; left: 0; top: 0; width: 100%; height: 100%; }
  video { object-fit: cover; }
  .mirror { transform: scaleX(-1); }
  #replay { position: fixed; left: 0; top: 0; width: 100%; height: 100%; object-fit: contain; background: #0A1612; display: none; z-index: 5; }
</style>
</head>
<body>
<video id="v" playsinline webkit-playsinline muted autoplay></video>
<canvas id="c"></canvas>
<video id="replay" playsinline webkit-playsinline muted loop></video>
<script>
${BAT_DETECT_SOURCE}
(function () {
  var CFG = ${cfg};
  var video = document.getElementById('v');
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var facing = CFG.facing;
  var paused = false;
  var highlights = [];
  var tone = 'idle';
  var landmarker = null;
  var stream = null;
  var lastVideoTime = -1;
  var lastLms = null;
  var lastPost = 0;
  var frames = 0;
  var fpsFrom = performance.now();
  var lastBat = null;
  var batTurn = false;
  var hand = 'right';
  var camView = 'front'; // 'front': the phone is where the bowler would be; 'side': at the batter's side
  // The person's outline, so the stumps can be drawn behind them in the front view.
  var maskCanvas = document.createElement('canvas');
  var maskCtx = maskCanvas.getContext('2d');
  var maskImage = null, maskReady = false, segOn = false;
  var layers = {};
  // Stumps: 'off', 'show' (follow the learner) or 'lock' (stay where they are).
  var stumpsMode = 'off';
  var stumps = null; // { x, y, h, dir } in picture coordinates (0..1), smoothed
  // Recording of repetitions.
  var recCanvas = document.createElement('canvas');
  var recCtx = recCanvas.getContext('2d');
  var recorder = null, recChunks = [], recStarted = 0, recType = '';
  var clips = {}; // slot name -> Blob
  var replayEl = document.getElementById('replay');
  var replaying = false;
  var batCanvas = document.createElement('canvas');
  var batCtx = batCanvas.getContext('2d', { willReadFrequently: true });

  // ---- Light. The page measures how bright the picture is twice a second and tells the app.
  // In the dark it can switch on the phone's torch (back camera, where the phone allows it), and
  // it brightens the picture the pose model and the bat search look at.
  var lightCanvas = document.createElement('canvas');
  lightCanvas.width = 32; lightCanvas.height = 24;
  var lightCtx = lightCanvas.getContext('2d', { willReadFrequently: true });
  var lightLevel = -1, lastLight = 0, dark = false, wantTorch = false, torchOn = false, torchBusy = false, torchFailed = false;
  var enhCanvas = document.createElement('canvas');
  var enhCtx = enhCanvas.getContext('2d');
  var canFilter = !!enhCtx && 'filter' in enhCtx;
  var gain = 1; // how much the picture is brightened before the model sees it
  function measureLight() {
    try {
      lightCtx.drawImage(video, 0, 0, 32, 24);
      var d = lightCtx.getImageData(0, 0, 32, 24).data, sum = 0;
      for (var i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      var level = sum / (d.length / 4);
      lightLevel = lightLevel < 0 ? level : lightLevel + 0.4 * (level - lightLevel);
      // Two thresholds, so the state does not flicker around one value.
      if (!dark && lightLevel < CFG.light.dark) dark = true;
      else if (dark && lightLevel > CFG.light.bright) dark = false;
      gain = lightLevel < CFG.light.boostBelow ? Math.min(CFG.light.maxGain, CFG.light.boostBelow / Math.max(lightLevel, 8)) : 1;
    } catch (e) {}
  }
  function track() { return stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null; }
  // 'none' when this camera has no torch the page can use (most front cameras).
  function torchState() {
    var t = track();
    try {
      var caps = t && t.getCapabilities ? t.getCapabilities() : null;
      if (!caps || !caps.torch || torchFailed) return 'none';
    } catch (e) { return 'none'; }
    return torchOn ? 'on' : 'off';
  }
  function applyTorch() {
    var t = track();
    if (!t || torchState() === 'none') { torchOn = false; return; }
    if (torchOn === wantTorch || torchBusy) return;
    var want = wantTorch;
    torchBusy = true;
    try {
      t.applyConstraints({ advanced: [{ torch: want }] })
        .then(function () { torchOn = want; torchBusy = false; postLight(); })
        .catch(function () { torchOn = false; torchBusy = false; torchFailed = true; postLight(); });
    } catch (e) { torchOn = false; torchBusy = false; torchFailed = true; }
  }
  function postLight() {
    post({ type: 'light', level: Math.round(lightLevel), dark: dark, torch: torchState(), boosted: gain > 1.05 && canFilter });
  }
  // The frame the model looks at: the video itself, or a brightened copy of it in the dark.
  function modelSource() {
    if (gain <= 1.05 || !canFilter) return video;
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return video;
    if (enhCanvas.width !== vw || enhCanvas.height !== vh) { enhCanvas.width = vw; enhCanvas.height = vh; }
    enhCtx.filter = 'brightness(' + gain.toFixed(2) + ') contrast(1.15)';
    enhCtx.drawImage(video, 0, 0, vw, vh);
    return enhCanvas;
  }
  var source = null; // what the model saw in this frame

  // Looks for the bat in a small grey copy of the frame, starting from the hands.
  // The bat from the hands. When both hands hold the handle, the handle runs through each fist
  // from the little finger to the first finger, and from the top hand to the bottom hand, towards
  // the blade. The 3D landmarks give that direction; the bat (about 85 cm) is then drawn from the
  // hands in that direction, shortened as much as it points towards or away from the phone.
  function handBat(lms, world) {
    if (!lms || !world) return null;
    function ok(k) { return lms[k] && lms[k].visibility >= 0.4; }
    // From the side one hand is often half hidden behind the other; one clear hand is enough.
    var bothSeen = ok(15) && ok(16);
    if (!ok(15) && !ok(16)) return null;
    function W3(k) { return [world[k].x, world[k].y, world[k].z]; }
    function d3(a, b) { var u = W3(a), v = W3(b); return [v[0] - u[0], v[1] - u[1], v[2] - u[2]]; }
    function n3(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
    var top = hand === 'right' ? 15 : 16, bottom = hand === 'right' ? 16 : 15;
    var apart = n3(d3(15, 16)), shoulders = n3(d3(11, 12)) || 0.35;
    if (bothSeen && apart > 0.6 * shoulders) return null; // the hands are not together on the handle
    var dir = [0, 0, 0];
    var pairs = [[17, 19], [18, 20]]; // little finger -> first finger, each hand
    for (var i = 0; i < pairs.length; i++) {
      if (!ok(pairs[i][0]) || !ok(pairs[i][1])) continue;
      var f = d3(pairs[i][0], pairs[i][1]), fl = n3(f) || 1;
      dir[0] += f[0] / fl; dir[1] += f[1] / fl; dir[2] += f[2] / fl;
    }
    var th = d3(top, bottom), tl = n3(th);
    if (bothSeen && tl > 0.03) { dir[0] += 1.5 * th[0] / tl; dir[1] += 1.5 * th[1] / tl; dir[2] += 1.5 * th[2] / tl; }
    var dl = n3(dir);
    if (dl < 0.5) return null;
    dir = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
    // Picture size of one metre, from the trunk.
    var vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    function px(k) { return [lms[k].x * vw, lms[k].y * vh]; }
    var shm = [(px(11)[0] + px(12)[0]) / 2, (px(11)[1] + px(12)[1]) / 2], hpm = [(px(23)[0] + px(24)[0]) / 2, (px(23)[1] + px(24)[1]) / 2];
    var trunkPx = Math.hypot(shm[0] - hpm[0], shm[1] - hpm[1]);
    var wsm = [(world[11].x + world[12].x) / 2, (world[11].y + world[12].y) / 2], whm = [(world[23].x + world[24].x) / 2, (world[23].y + world[24].y) / 2];
    var trunkM = Math.hypot(wsm[0] - whm[0], wsm[1] - whm[1]) || 0.5;
    var perM = trunkPx / trunkM;
    var hk = bothSeen ? [15, 16] : [ok(15) ? 15 : 16];
    var hx = 0, hy = 0;
    for (var h = 0; h < hk.length; h++) { hx += px(hk[h])[0] / hk.length; hy += px(hk[h])[1] / hk.length; }
    var tx = hx + dir[0] * 0.85 * perM, ty = hy + dir[1] * 0.85 * perM;
    var flat = Math.hypot(dir[0], dir[1]) || 1;
    return { dx: dir[0] / flat, dy: dir[1] / flat, hx: hx / vw, hy: hy / vh, tx: tx / vw, ty: ty / vh, conf: 0.5, onBody: false, est: true };
  }

  // Smooths the bat between frames so it does not jump.
  var batSm = null;
  function smoothBat(b) {
    if (!b) { batSm = null; return null; }
    if (!batSm || !!batSm.est !== !!b.est) { batSm = b; missStreak = 0; return b; }
    missStreak = 0;
    var a = 0.3, o = {};
    for (var k in b) o[k] = typeof b[k] === 'number' ? batSm[k] + a * (b[k] - batSm[k]) : b[k];
    var l = Math.hypot(o.dx, o.dy) || 1; o.dx /= l; o.dy /= l;
    batSm = o;
    return o;
  }

  // The bat: the picture is searched for it (batDetect.ts), helped by the direction the hands
  // give; when that finds nothing clear, or something that does not agree with the hands, the bat
  // is taken from the hands. A bat resting down along a leg (the right stance, seen from the side)
  // cannot be told apart from the leg in the picture alone, but when the hands point the same
  // way it is the bat.
  //
  // Field test (October 2026): the direction from the hands was often wrong (from the side, one
  // hand hides the other and the finger landmarks are guesses), and it used to win whenever it
  // disagreed with the picture, so the yellow line pointed up while the real bat pointed down.
  // Now the bat found in the picture always wins. The hands only say that a bat is held: such a
  // bat is marked est, is not drawn, and its angle is not judged.
  function findBat(lms, world) {
    var fromHands = handBat(lms, world);
    var seen = imageBat(lms, fromHands);
    if (seen && seen.conf >= CFG.minBat) {
      var agrees = fromHands && seen.dx * fromHands.dx + seen.dy * fromHands.dy > 0.87;
      if (seen.onBody && agrees) seen.onBody = false;
      if (!seen.onBody) return smoothBat(seen);
    }
    // Keep the last bat from the picture for a moment (a blurred frame), rather than drop it or
    // switch to a guess.
    if (batSm && !batSm.est && missStreak++ < 4) return batSm;
    missStreak = 0;
    batSm = null; // do not blend a guess with an old picture bat
    return smoothBat(fromHands);
  }
  var missStreak = 0;

  function imageBat(lms, fromHands) {
    try {
      var vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh || !lms) return null;
      function seen(k) { return lms[k] && (lms[k].visibility || 0) >= 0.4; }
      if (!seen(15) && !seen(16)) return null;
      var W = 320, H = Math.round(vh * W / vw);
      if (batCanvas.width !== W || batCanvas.height !== H) { batCanvas.width = W; batCanvas.height = H; }
      batCtx.drawImage(source || video, 0, 0, W, H);
      var d = batCtx.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
      for (var i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
      function P(k) { return [lms[k].x * W, lms[k].y * H]; }
      var hx = 0, hy = 0, n = 0, hk = [15, 16, 19, 20];
      for (var h = 0; h < hk.length; h++) if (seen(hk[h])) { var p = P(hk[h]); hx += p[0]; hy += p[1]; n++; }
      hx /= n; hy /= n;
      var sh = [(lms[11].x + lms[12].x) / 2 * W, (lms[11].y + lms[12].y) / 2 * H];
      var hip = [(lms[23].x + lms[24].x) / 2 * W, (lms[23].y + lms[24].y) / 2 * H];
      var trunk = Math.sqrt((sh[0] - hip[0]) * (sh[0] - hip[0]) + (sh[1] - hip[1]) * (sh[1] - hip[1]));
      var L = CFG.batToTrunk * trunk;
      function seg(a, b) { var pa = P(a), pb = P(b); return [pa[0], pa[1], pb[0], pb[1]]; }
      var avoid = [seg(23, 25), seg(25, 27), seg(24, 26), seg(26, 28), [hip[0], hip[1], sh[0], sh[1]],
        seg(15, 13), seg(13, 11), seg(16, 14), seg(14, 12)];
      var hint = fromHands ? Math.atan2(fromHands.dy, fromHands.dx) : undefined;
      var b = detectBat(g, W, H, { hx: hx, hy: hy, L: L, avoid: avoid, hint: hint });
      if (!b) return null;
      function q(v) { return Math.round(v * 1000) / 1000; }
      return { dx: q(b.dx), dy: q(b.dy), hx: q(hx / W), hy: q(hy / H), tx: q(b.tipX / W), ty: q(b.tipY / H), conf: q(b.conf), onBody: !!b.onBody };
    } catch (e) { return null; }
  }

  // ---- One Euro filter, one per coordinate.
  function alphaFor(cutoff, dt) { var tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  function OneEuro(minCutoff, beta, dCutoff) { this.mc = minCutoff; this.b = beta; this.dc = dCutoff; this.x = null; this.dx = 0; }
  OneEuro.prototype.f = function (v, dt) {
    if (this.x === null) { this.x = v; this.dx = 0; return v; }
    var d = (v - this.x) / dt;
    this.dx = this.dx + alphaFor(this.dc, dt) * (d - this.dx);
    var cutoff = this.mc + this.b * Math.abs(this.dx);
    this.x = this.x + alphaFor(cutoff, dt) * (v - this.x);
    return this.x;
  };
  var S = CFG.smooth;
  var imgF = [], wldF = [], visF = [], lastT = 0;
  for (var fi = 0; fi < 33; fi++) {
    imgF.push([new OneEuro(S.imageMinCutoff, S.imageBeta, S.dCutoff), new OneEuro(S.imageMinCutoff, S.imageBeta, S.dCutoff), new OneEuro(S.imageMinCutoff, S.imageBeta, S.dCutoff)]);
    wldF.push([new OneEuro(S.worldMinCutoff, S.worldBeta, S.dCutoff), new OneEuro(S.worldMinCutoff, S.worldBeta, S.dCutoff), new OneEuro(S.worldMinCutoff, S.worldBeta, S.dCutoff)]);
    visF.push(null);
  }
  function resetFilters() {
    for (var i = 0; i < 33; i++) { for (var k = 0; k < 3; k++) { imgF[i][k].x = null; wldF[i][k].x = null; } visF[i] = null; }
    lastT = 0;
  }
  // A learner further from the phone is small in the picture, so each joint is a few pixels and
  // shakes more for the same pixel noise (field test, 24 October 2026). The smoothing grows as the
  // body gets smaller: the cutoff falls with the body's height in the picture, and the speed term
  // grows, so real movements are still followed.
  var bodySize = 0;
  function sizeFactor(lms) {
    var top = (lms[11].y + lms[12].y) / 2, bottom = (lms[27].y + lms[28].y) / 2;
    var h = Math.abs(bottom - top);
    if (!(h > 0.02 && h < 2)) return bodySize ? Math.max(0.35, Math.min(1, bodySize / 0.55)) : 1;
    bodySize = bodySize ? bodySize + 0.1 * (h - bodySize) : h;
    return Math.max(0.35, Math.min(1, bodySize / 0.55));
  }
  // Returns smoothed copies of the image and world landmarks.
  function smooth(lms, world, t) {
    var dt = lastT ? Math.max(0.008, Math.min(0.25, (t - lastT) / 1000)) : 1 / 30;
    if (lastT && t - lastT > 600) { resetFilters(); bodySize = 0; }
    lastT = t;
    var fac = sizeFactor(lms);
    for (var q = 0; q < 33; q++) for (var c = 0; c < 3; c++) {
      imgF[q][c].mc = S.imageMinCutoff * fac; imgF[q][c].b = S.imageBeta / fac;
      wldF[q][c].mc = S.worldMinCutoff * fac;
    }
    var outL = new Array(33), outW = new Array(33);
    for (var i = 0; i < 33; i++) {
      var p = lms[i], w = world[i];
      var vis = p.visibility || 0;
      visF[i] = visF[i] === null ? vis : visF[i] + 0.35 * (vis - visF[i]);
      outL[i] = { x: imgF[i][0].f(p.x, dt), y: imgF[i][1].f(p.y, dt), z: imgF[i][2].f(p.z, dt), visibility: visF[i] };
      outW[i] = { x: wldF[i][0].f(w.x, dt), y: wldF[i][1].f(w.y, dt), z: wldF[i][2].f(w.z, dt) };
    }
    return [outL, outW];
  }

  // ---- Steadying the limbs before smoothing.
  // When the arms cross the body or the bat hides a hand (a defence seen from the side, field test
  // 18 October 2026), the pose model sometimes swaps the left and right elbow, wrist, knee or ankle
  // for a frame or two, or throws one joint far away. The skeleton then jumps. Here each arm and
  // leg is compared with the previous frame: if the left and right lower limbs fit the previous
  // frame much better the other way round, they are swapped back; and a poorly seen joint that
  // jumps much further than a body can move in one frame keeps its last place for a few frames.
  var LIMBS = [
    [[13, 15, 17, 19, 21], [14, 16, 18, 20, 22]],
    [[25, 27, 29, 31], [26, 28, 30, 32]]
  ];
  var prevRaw = null, prevRawW = null, heldFor = [];
  for (var hi = 0; hi < 33; hi++) heldFor.push(0);
  function copyPts(a) { var o = new Array(a.length); for (var i = 0; i < a.length; i++) o[i] = { x: a[i].x, y: a[i].y, z: a[i].z, visibility: a[i].visibility }; return o; }
  function d2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function steady(lms, world) {
    lms = copyPts(lms); world = copyPts(world);
    if (prevRaw) {
      var size = d2(prevRaw[11], prevRaw[23]) + d2(prevRaw[12], prevRaw[24]);
      size = Math.max(0.05, size / 2);
      for (var li = 0; li < LIMBS.length; li++) {
        var L = LIMBS[li][0], R = LIMBS[li][1];
        var keep = d2(lms[L[0]], prevRaw[L[0]]) + d2(lms[R[0]], prevRaw[R[0]]) + d2(lms[L[1]], prevRaw[L[1]]) + d2(lms[R[1]], prevRaw[R[1]]);
        var swap = d2(lms[L[0]], prevRaw[R[0]]) + d2(lms[R[0]], prevRaw[L[0]]) + d2(lms[L[1]], prevRaw[R[1]]) + d2(lms[R[1]], prevRaw[L[1]]);
        if (keep > 0.6 * size && swap < 0.5 * keep) {
          for (var k = 0; k < L.length; k++) {
            var t = lms[L[k]]; lms[L[k]] = lms[R[k]]; lms[R[k]] = t;
            var u = world[L[k]]; world[L[k]] = world[R[k]]; world[R[k]] = u;
          }
        }
      }
      for (var j = 11; j < 33; j++) {
        var jump = d2(lms[j], prevRaw[j]);
        if (jump > 0.9 * size && (lms[j].visibility || 0) < 0.7 && heldFor[j] < 4) {
          lms[j] = { x: prevRaw[j].x, y: prevRaw[j].y, z: prevRaw[j].z, visibility: lms[j].visibility };
          world[j] = { x: prevRawW[j].x, y: prevRawW[j].y, z: prevRawW[j].z };
          heldFor[j]++;
        } else heldFor[j] = 0;
      }
    }
    prevRaw = lms; prevRawW = world;
    return [lms, world];
  }

  // ---- Stumps behind the back foot.
  // A stump is 71 cm high and the three together are 23 cm wide. The lower leg (knee to ankle)
  // is about 45 cm, so it gives the scale. The batter stands about 75 cm in front of the stumps.
  function updateStumps(lms) {
    if (stumpsMode === 'off' || !lms) return;
    if (stumpsMode === 'lock' && stumps) return;
    function ok(k) { return lms[k] && lms[k].visibility >= 0.4; }
    if (!ok(27) || !ok(28) || !(ok(25) || ok(26))) return;
    var vw = video.videoWidth || 4, vh = video.videoHeight || 3, ar = vh / vw; // y units to x units
    var back = hand === 'right' ? 28 : 27, front = hand === 'right' ? 27 : 28;
    function shin(k, a) { var dx = lms[k].x - lms[a].x, dy = (lms[k].y - lms[a].y) * ar; return Math.sqrt(dx * dx + dy * dy); }
    var sh = 0, n = 0;
    if (ok(25)) { sh += shin(25, 27); n++; }
    if (ok(26)) { sh += shin(26, 28); n++; }
    sh /= n; // lower leg length, in x units of the picture
    var dir = Math.sign(lms[back].x - lms[front].x) || (hand === 'right' ? 1 : -1);
    var ground = Math.max(lms[27].y, lms[28].y);
    var target = camView === 'front'
      // Seen from the bowler's end the stumps are straight behind the batter, a little further
      // away, so they look a little smaller and stand a little higher in the picture.
      // The batter stands a little to the off side of them, so they show beside the legs on the leg side.
      ? { x: (lms[27].x + lms[28].x) / 2 + (hand === 'right' ? 1 : -1) * sh * 0.32, y: ground - sh * 0.12 / ar, h: sh * 1.58 * 0.82 / ar, w: sh * 0.5 * 0.82, dir: dir }
      // Seen from the side, they are behind the back foot (drawn a little closer than the real
      // 75 cm, so they stay in the picture on a narrow phone screen).
      : { x: lms[back].x + dir * sh * 1.1, y: ground + 0.01, h: sh * 1.58 / ar, w: sh * 0.5, dir: dir };
    if (!stumps) { stumps = target; return; }
    var a = 0.08; // slow, so the stumps stay still
    stumps.x += a * (target.x - stumps.x); stumps.y += a * (target.y - stumps.y);
    stumps.h += a * (target.h - stumps.h); stumps.w += a * (target.w - stumps.w); stumps.dir = dir;
  }
  // Draws the stumps with a point-mapping function (picture 0..1 -> pixels). In the front view
  // they are behind the batter, so the batter's outline is cut out of them.
  // maskRect(w, h) gives where the picture sits on the target: [x, y, width, height].
  function drawStumps(target, map, unit, maskRect) {
    if (stumpsMode === 'off' || !stumps) return;
    var W = target.canvas.width, H = target.canvas.height;
    var occlude = camView === 'front' && maskReady && maskRect;
    var g = target;
    if (occlude) {
      var key = W + 'x' + H;
      if (!layers[key]) { var lc = document.createElement('canvas'); lc.width = W; lc.height = H; layers[key] = lc.getContext('2d'); }
      g = layers[key];
      g.clearRect(0, 0, W, H);
    }
    var s = stumps;
    g.save();
    // Shadow on the ground.
    var c0 = map(s.x - s.w * 0.9, s.y), c1 = map(s.x + s.w * 0.9, s.y);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.ellipse((c0[0] + c1[0]) / 2, c0[1], Math.abs(c1[0] - c0[0]) / 2, 5 * unit, 0, 0, Math.PI * 2); g.fill();
    var tops = [];
    for (var i = -1; i <= 1; i++) {
      var x = s.x + i * s.w / 2;
      var b = map(x, s.y), t = map(x, s.y - s.h);
      tops.push(t);
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(60,40,20,0.55)'; g.lineWidth = 8 * unit;
      g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(t[0], t[1]); g.stroke();
      g.strokeStyle = 'rgba(250,236,200,0.96)'; g.lineWidth = 5.5 * unit;
      g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(t[0], t[1]); g.stroke();
    }
    // Bails.
    g.strokeStyle = 'rgba(250,236,200,0.96)'; g.lineWidth = 3.5 * unit;
    g.beginPath(); g.moveTo(tops[0][0], tops[0][1] - 3 * unit); g.lineTo(tops[1][0], tops[1][1] - 3 * unit); g.stroke();
    g.beginPath(); g.moveTo(tops[1][0], tops[1][1] - 3 * unit); g.lineTo(tops[2][0], tops[2][1] - 3 * unit); g.stroke();
    g.restore();
    if (occlude) {
      var r = maskRect(W, H);
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = 0.75; // a faint trace stays, so the learner still sees where the stumps are
      if (facing === 'front') { g.translate(W, 0); g.scale(-1, 1); }
      g.drawImage(maskCanvas, r[0], r[1], r[2], r[3]);
      g.restore();
      target.drawImage(g.canvas, 0, 0);
    }
  }
  // Where the picture sits on the screen canvas (object-fit: cover).
  function coverRect(W, H) {
    var vw = video.videoWidth || 1, vh = video.videoHeight || 1;
    var scale = Math.max(W / vw, H / vh);
    return [(W - vw * scale) / 2, (H - vh * scale) / 2, vw * scale, vh * scale];
  }
  function fullRect(W, H) { return [0, 0, W, H]; }
  // Copies the person's outline from the model into maskCanvas.
  function readMask(res) {
    var masks = res && res.segmentationMasks;
    if (!masks || !masks.length) { maskReady = false; return; }
    try {
      var m = masks[0], mw = m.width, mh = m.height, data = m.getAsFloat32Array();
      if (maskCanvas.width !== mw || maskCanvas.height !== mh || !maskImage) {
        maskCanvas.width = mw; maskCanvas.height = mh; maskImage = maskCtx.createImageData(mw, mh);
      }
      var px = maskImage.data;
      for (var i = 0, j = 3; i < data.length; i++, j += 4) px[j] = data[i] > 0.5 ? 255 : 0;
      maskCtx.putImageData(maskImage, 0, 0);
      maskReady = true;
    } catch (e) { maskReady = false; }
    for (var k = 0; k < masks.length; k++) { try { masks[k].close(); } catch (e) {} }
  }
  // The outline is only needed while stumps are shown in the front view.
  function wantMask() {
    var want = stumpsMode !== 'off' && camView === 'front';
    if (!landmarker || want === segOn) return;
    segOn = want;
    if (!want) maskReady = false;
    try {
      var p = landmarker.setOptions({ outputSegmentationMasks: want });
      if (p && p.catch) p.catch(function () { segOn = false; });
    } catch (e) { segOn = false; }
  }

  var BONES = [[11,12],[11,23],[12,24],[23,24],[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32],[27,29],[28,30]];
  var JOINTS = [0,11,12,13,14,15,16,23,24,25,26,27,28];

  function post(message) {
    var text = JSON.stringify(message);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
    else if (window.parent && window.parent !== window) window.parent.postMessage(text, '*');
  }
  function status(name, message) { post({ type: 'status', status: name, message: message || null }); }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // Maps a landmark (0..1 in the video frame) to canvas pixels, matching object-fit: cover.
  function place(x, y) {
    var vw = video.videoWidth || 1, vh = video.videoHeight || 1;
    var scale = Math.max(canvas.width / vw, canvas.height / vh);
    var px = x * vw * scale + (canvas.width - vw * scale) / 2;
    var py = y * vh * scale + (canvas.height - vh * scale) / 2;
    if (facing === 'front') px = canvas.width - px;
    return [px, py];
  }

  // Draws the bat, the skeleton and the red rings with a point-mapping function.
  function drawPose(g, lms, map, unit, base) {
    g.lineCap = 'round';
    if (lastBat && lastBat.conf >= CFG.minBat && !lastBat.onBody && !lastBat.est) {
      var b0 = map(lastBat.hx, lastBat.hy), b1 = map(lastBat.tx, lastBat.ty);
      g.lineWidth = 6 * unit;
      g.strokeStyle = 'rgba(255,212,59,0.95)';
      g.beginPath(); g.moveTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.stroke();
    }
    g.lineWidth = 4 * unit;
    g.strokeStyle = base;
    for (var i = 0; i < BONES.length; i++) {
      var a = lms[BONES[i][0]], b = lms[BONES[i][1]];
      if (!a || !b || a.visibility < 0.4 || b.visibility < 0.4) continue;
      var pa = map(a.x, a.y), pb = map(b.x, b.y);
      g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
    }
    for (var j = 0; j < JOINTS.length; j++) {
      var k = JOINTS[j], p = lms[k];
      if (!p || p.visibility < 0.4) continue;
      var pp = map(p.x, p.y);
      var bad = highlights.indexOf(k) >= 0;
      g.beginPath();
      g.arc(pp[0], pp[1], (bad ? 9 : 5) * unit, 0, Math.PI * 2);
      g.fillStyle = bad ? '#FF5A5F' : base;
      g.fill();
      if (bad) {
        g.beginPath();
        g.arc(pp[0], pp[1], 15 * unit, 0, Math.PI * 2);
        g.strokeStyle = '#FF5A5F';
        g.lineWidth = 3 * unit;
        g.stroke();
        g.strokeStyle = base;
        g.lineWidth = 4 * unit;
      }
    }
  }

  // ---- The skeleton is drawn only while the whole body is in the picture.
  // Field test (21 October 2026): with the feet or the head out of the picture, the pose model
  // guesses the missing joints and the drawn skeleton shook and jumped. Now nothing is drawn until
  // the head, shoulders, hips, knees and ankles are all clearly seen and inside the picture; it
  // appears after 0.3 s of a whole body and goes away after 0.3 s without one, so it does not flicker.
  var FULL_PAIRS = [[11, 12], [23, 24], [25, 26], [27, 28]];
  var bodyShown = false, bodyChange = 0;
  function wholeBody(lms) {
    if (!lms) return false;
    if ((lms[0].visibility || 0) < 0.45) return false;
    for (var i = 0; i < FULL_PAIRS.length; i++) {
      var a = lms[FULL_PAIRS[i][0]], b = lms[FULL_PAIRS[i][1]];
      var best = (a.visibility || 0) >= (b.visibility || 0) ? a : b;
      if ((best.visibility || 0) < 0.45) return false;
      if (best.x < 0.01 || best.x > 0.99 || best.y < 0.01 || best.y > 0.99) return false;
    }
    return true;
  }
  function showBody(lms) {
    var full = wholeBody(lms), now = performance.now();
    if (full === bodyShown) { bodyChange = 0; return bodyShown; }
    if (!bodyChange) bodyChange = now;
    if (now - bodyChange >= 300) { bodyShown = full; bodyChange = 0; }
    return bodyShown;
  }
  var drawBody = false;

  function draw(lms) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    drawStumps(ctx, place, dpr, coverRect);
    drawBody = showBody(lms);
    if (!lms || !drawBody) return;
    drawPose(ctx, lms, place, dpr, tone === 'good' ? '#5BE49B' : 'rgba(255,255,255,0.95)');
  }

  // ---- Recording a repetition: the picture with the stumps and skeleton drawn on it.
  function pickType() {
    var types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'];
    if (typeof MediaRecorder === 'undefined') return null;
    for (var i = 0; i < types.length; i++) { try { if (MediaRecorder.isTypeSupported(types[i])) return types[i]; } catch (e) {} }
    return '';
  }
  function recFrame(lms) {
    if (!recorder) return;
    var w = recCanvas.width, h = recCanvas.height;
    recCtx.save();
    if (facing === 'front') { recCtx.translate(w, 0); recCtx.scale(-1, 1); }
    recCtx.drawImage(source || video, 0, 0, w, h);
    recCtx.restore();
    var map = function (x, y) { return [(facing === 'front' ? 1 - x : x) * w, y * h]; };
    drawStumps(recCtx, map, w / 480, fullRect);
    if (lms && drawBody) drawPose(recCtx, lms, map, w / 480, tone === 'good' ? '#5BE49B' : 'rgba(255,255,255,0.95)');
  }
  function recStart() {
    recStop(null);
    var type = pickType();
    if (type === null || !recCanvas.captureStream) return;
    var vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    var scale = Math.min(1, 480 / vw);
    recCanvas.width = Math.round(vw * scale); recCanvas.height = Math.round(vh * scale);
    try {
      var stream = recCanvas.captureStream(24);
      recorder = type ? new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1200000 }) : new MediaRecorder(stream);
      recType = recorder.mimeType || type || 'video/webm';
      recChunks = [];
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) recChunks.push(e.data); };
      recorder.start(500);
      recStarted = performance.now();
    } catch (e) { recorder = null; }
  }
  // Stops recording; keeps the video in the named slot(s), or throws it away when slots is null.
  function recStop(slots) {
    if (!recorder) return;
    var r = recorder, chunks = recChunks, type = recType;
    recorder = null;
    r.onstop = function () {
      if (!slots || !chunks.length) return;
      var blob = new Blob(chunks, { type: type.split(';')[0] });
      for (var i = 0; i < slots.length; i++) clips[slots[i]] = blob;
      post({ type: 'clip-ready', slots: slots });
    };
    try { r.stop(); } catch (e) {}
  }
  function sendClip(slot) {
    var blob = clips[slot];
    if (!blob) { post({ type: 'clip', slot: slot, data: null }); return; }
    var reader = new FileReader();
    reader.onload = function () { post({ type: 'clip', slot: slot, data: reader.result }); };
    reader.onerror = function () { post({ type: 'clip', slot: slot, data: null }); };
    reader.readAsDataURL(blob);
  }
  function replay(slot) {
    if (!slot || !clips[slot]) {
      replaying = false;
      replayEl.pause();
      replayEl.style.display = 'none';
      if (replayEl.src) { URL.revokeObjectURL(replayEl.src); replayEl.removeAttribute('src'); }
      return;
    }
    replaying = true;
    replayEl.src = URL.createObjectURL(clips[slot]);
    replayEl.playbackRate = 1;
    replayEl.style.display = 'block';
    replayEl.play().catch(function () {});
  }

  function startCamera() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('NO_CAMERA_API'));
    }
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: facing === 'front' ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
    }).then(function (s) {
      stream = s;
      video.srcObject = s;
      video.classList.toggle('mirror', facing === 'front');
      return video.play();
    });
  }

  function loadModel() {
    return import(CFG.visionBase + '/vision_bundle.mjs').then(function (vision) {
      return vision.FilesetResolver.forVisionTasks(CFG.visionBase + '/wasm').then(function (files) {
        function make(delegate) {
          return vision.PoseLandmarker.createFromOptions(files, {
            baseOptions: { modelAssetPath: CFG.modelUrl, delegate: delegate },
            runningMode: 'VIDEO',
            numPoses: 1,
            // Lower than the default 0.5 so a learner standing further back (small in the
            // picture) is still found and kept (field test, 24 October 2026).
            minPoseDetectionConfidence: 0.35,
            minPosePresenceConfidence: 0.35,
            minTrackingConfidence: 0.4
          });
        }
        return make('GPU').catch(function () { return make('CPU'); });
      });
    }).then(function (lm) { landmarker = lm; wantMask(); });
  }

  function r(v, n) { var m = Math.pow(10, n); return Math.round(v * m) / m; }

  function loop() {
    requestAnimationFrame(loop);
    if (paused || replaying || !landmarker || video.readyState < 2) return;
    if (video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    var tNow = performance.now();
    if (tNow - lastLight > 500) {
      lastLight = tNow;
      measureLight();
      applyTorch();
      postLight();
    }
    source = modelSource();
    var res;
    try { res = landmarker.detectForVideo(source, performance.now()); } catch (e) { return; }
    var lms = res.landmarks && res.landmarks[0];
    var world = res.worldLandmarks && res.worldLandmarks[0];
    if (segOn) readMask(res);
    if (!lms || !world) prevRaw = null;
    if (lms && world) {
      var st = steady(lms, world);
      lms = st[0]; world = st[1];
      var sm = smooth(lms, world, performance.now());
      lms = sm[0]; world = sm[1];
    }
    lastLms = lms || null;
    updateStumps(lms);
    draw(lms);
    recFrame(lms);
    // Keep a repetition's video short: start again after a while, so it holds the last part.
    if (recorder && performance.now() - recStarted > 15000) recStart();

    var now = performance.now();
    frames++;
    if (now - fpsFrom > 2000) { post({ type: 'fps', fps: Math.round(frames * 1000 / (now - fpsFrom)) }); frames = 0; fpsFrom = now; }
    if (now - lastPost < CFG.postEveryMs) return;
    lastPost = now;
    if (!lms || !world) { lastBat = null; if (stumpsMode !== 'lock') stumps = null; post({ type: 'nopose' }); return; }
    // The bat search costs more than the pose, so it runs on every other posted frame.
    batTurn = !batTurn;
    if (batTurn) lastBat = findBat(lms, world);
    var a = new Array(132), w = new Array(99);
    for (var i = 0; i < 33; i++) {
      a[i * 4] = r(lms[i].x, 4); a[i * 4 + 1] = r(lms[i].y, 4); a[i * 4 + 2] = r(lms[i].z, 3); a[i * 4 + 3] = r(lms[i].visibility || 0, 2);
      w[i * 3] = r(world[i].x, 3); w[i * 3 + 1] = r(world[i].y, 3); w[i * 3 + 2] = r(world[i].z, 3);
    }
    post({ type: 'pose', t: Date.now(), lm: a, world: w, bat: lastBat, aspect: video.videoWidth && video.videoHeight ? r(video.videoWidth / video.videoHeight, 3) : null });
  }

  function explain(error) {
    var name = (error && error.name) || '';
    var text = (error && error.message) || String(error);
    if (name === 'NotAllowedError' || name === 'SecurityError') return ['camera-denied', 'Camera access was not allowed.'];
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || text === 'NO_CAMERA_API') return ['camera-missing', 'No camera could be opened on this device.'];
    if (name === 'NotReadableError') return ['camera-busy', 'The camera is being used by another app.'];
    return ['model-failed', 'The pose model could not be loaded. Check your internet connection and try again.'];
  }

  // Takes a still picture of the learner with the skeleton drawn on it, as a small JPEG.
  // The picture is handed to the app, which keeps it on the phone only.
  function snapshot() {
    try {
      var vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) { post({ type: 'snapshot', image: null }); return; }
      var scale = Math.min(1, 480 / vw);
      var w = Math.round(vw * scale), h = Math.round(vh * scale);
      var shot = document.createElement('canvas');
      shot.width = w; shot.height = h;
      var g = shot.getContext('2d');
      g.save();
      if (facing === 'front') { g.translate(w, 0); g.scale(-1, 1); }
      g.drawImage(source || video, 0, 0, w, h);
      g.restore();
      var map = function (x, y) { return [(facing === 'front' ? 1 - x : x) * w, y * h]; };
      drawStumps(g, map, w / 480, fullRect);
      if (lastLms) drawPose(g, lastLms, map, w / 480, 'rgba(255,255,255,0.95)');
      post({ type: 'snapshot', image: shot.toDataURL('image/jpeg', 0.72) });
    } catch (e) {
      post({ type: 'snapshot', image: null });
    }
  }

  // Commands from the app: highlight joints, change tone, pause, switch camera, take a picture.
  window.__cmd = function (c) {
    if (!c) return;
    if (c.highlights) highlights = c.highlights;
    if (c.tone) tone = c.tone;
    if (c.snapshot) snapshot();
    if (c.hand) hand = c.hand;
    if (c.view && c.view !== camView) { camView = c.view; stumps = null; }
    if (c.stumps) { if (c.stumps === 'off' || (c.stumps === 'show' && stumpsMode === 'off')) stumps = null; stumpsMode = c.stumps; }
    if (typeof c.torch === 'boolean') { wantTorch = c.torch; applyTorch(); postLight(); }
    if (c.rec === 'start') recStart();
    if (c.rec === 'stop') recStop(c.keep || null);
    if (c.sendClip) sendClip(c.sendClip);
    if ('replay' in c) replay(c.replay);
    wantMask();
    if (typeof c.paused === 'boolean') paused = c.paused;
    if (c.facing && c.facing !== facing) {
      facing = c.facing;
      resetFilters();
      stumps = null;
      torchOn = false; torchFailed = false;
      startCamera().then(function () { applyTorch(); postLight(); }).catch(function (e) { var x = explain(e); status(x[0], x[1]); });
    }
  };
  window.addEventListener('message', function (e) {
    try {
      var c = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (c && c.__pose) window.__cmd(c);
    } catch (_) {}
  });

  status('starting');
  Promise.all([startCamera(), loadModel()]).then(function () {
    status('ready');
    requestAnimationFrame(loop);
  }).catch(function (e) {
    var x = explain(e);
    status(x[0], x[1]);
  });
})();
</script>
</body>
</html>`;
}
