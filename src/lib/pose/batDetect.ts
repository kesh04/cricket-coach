/**
 * Bat detection.
 *
 * The pose model finds the body, not the bat. To see the bat, the camera page looks for it in
 * the picture itself: a cricket bat is a long, straight strip with two parallel edges that starts
 * at the batter's hands. The detector:
 *
 *   1. turns a small copy of the frame (about 320 × 240) into grey and finds its edges (Sobel);
 *   2. from the point between the hands, tries every direction around the circle, 3 degrees apart;
 *   3. for each direction, walks along the line where the blade would be and checks for two
 *      parallel edges of opposite sign, one each side of the line, at a width that suits a bat;
 *   4. picks the direction where such a pair of edges runs along most of the bat's length,
 *      skipping the directions of the forearms (which are strips too).
 *
 * The bat's length in pixels is estimated from the size of the body in the picture. The result
 * is the direction of the bat from the hands towards the toe, with a confidence from 0 to 1.
 * When no direction is clearly better than the rest, nothing is reported, so a bat that cannot
 * be seen never produces a wrong correction.
 *
 * The code is kept as plain ES5 text so that the same code runs inside the camera page
 * (a WebView) and in the Node tests (scripts/check-bat.ts). Hermes does not keep the source of
 * compiled functions, so it cannot be written as a normal function and turned into text.
 */
export const BAT_DETECT_SOURCE = String.raw`
function batSobel(gray, w, h) {
  var gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      var i = y * w + x;
      var a = gray[i - w - 1], b = gray[i - w], c = gray[i - w + 1];
      var d = gray[i - 1], f = gray[i + 1];
      var g = gray[i + w - 1], k = gray[i + w], l = gray[i + w + 1];
      gx[i] = (c + 2 * f + l) - (a + 2 * d + g);
      gy[i] = (g + 2 * k + l) - (a + 2 * b + c);
    }
  }
  return { gx: gx, gy: gy };
}

// gray: Float32Array or array of 0..255 values, row by row.
// o: { hx, hy: point between the hands in pixels; L: expected bat length in pixels;
//      exclude: directions in radians to skip (forearms);
//      avoid: body segments [x1, y1, x2, y2] (legs, trunk) that look like a bat; a direction that
//      runs along one of them is trusted less; avoidDist: how close counts as along, in pixels;
//      grad: optional result of batSobel;
//      hint: optional direction in radians where the hands say the bat points }
// Returns null, or { dx, dy, angle, conf, score, halfWidth, tipX, tipY }.
function detectBat(gray, w, h, o) {
  var L = o.L;
  if (!(L > 12)) return null;
  var G = o.grad || batSobel(gray, w, h);
  var gx = G.gx, gy = G.gy;

  // Edge threshold from the gradients around the hands.
  var mags = [];
  var R = Math.round(L), step = Math.max(1, Math.round(L / 40));
  for (var yy = Math.max(1, Math.round(o.hy - R)); yy < Math.min(h - 1, o.hy + R); yy += step) {
    for (var xx = Math.max(1, Math.round(o.hx - R)); xx < Math.min(w - 1, o.hx + R); xx += step) {
      var j = yy * w + xx;
      mags.push(Math.abs(gx[j]) + Math.abs(gy[j]));
    }
  }
  if (mags.length < 20) return null;
  mags.sort(function (a, b) { return a - b; });
  var thr = Math.max(24, 0.35 * mags[Math.floor(mags.length * 0.92)]);

  var exclude = o.exclude || [];
  var N = 22;
  var widths = [0.035, 0.05, 0.065, 0.085];

  // A bat that points towards or away from the phone looks shorter in the picture than it is
  // (for example a bat held out level towards the bowler, seen from the side). Each direction is
  // also tried with a shorter bat; the blade keeps its width, only its length shrinks. A shorter
  // match is trusted a little less, because short strips are more common in a room than long ones.
  // Short matches are only looked for near o.hint, the direction of the bat worked out from the
  // hands in 3D (see handBat in poseHtml.ts): without that, a forearm, a fold of a shirt or a
  // box on the wall would too often look like a short bat.
  var LENGTHS = [1, 0.62, 0.4], LENGTH_TRUST = [1, 0.9, 0.8];
  var hint = typeof o.hint === 'number' ? o.hint : null;
  function nearHint(th) {
    if (hint === null) return false;
    return Math.abs(Math.atan2(Math.sin(th - hint), Math.cos(th - hint))) < 0.45;
  }

  function scoreAt(th) {
    var best = 0, bestHw = 0, bestLen = 1;
    var tries = nearHint(th) ? LENGTHS.length : 1;
    for (var li = 0; li < tries; li++) {
      var r = scoreLen(th, LENGTHS[li] * L);
      var sc = r[0] * LENGTH_TRUST[li];
      if (sc > best + 1e-9) { best = sc; bestHw = r[1]; bestLen = LENGTHS[li]; }
    }
    return [best, bestHw, bestLen];
  }

  function scoreLen(th, Lb) {
    var dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx;
    var best = 0, bestHw = 0;
    for (var wi = 0; wi < widths.length; wi++) {
      var hw = Math.max(2, widths[wi] * L);
      // A short bat must still be clearly longer than it is wide.
      if (Lb < hw * 5) continue;
      var hits = 0, far = 0, inside = 0, farIn = 0;
      for (var s = 0; s < N; s++) {
        var t = (0.24 + 0.7 * s / (N - 1)) * Lb;
        var cx = o.hx + dx * t, cy = o.hy + dy * t;
        var lx = Math.round(cx + nx * hw), ly = Math.round(cy + ny * hw);
        var rx = Math.round(cx - nx * hw), ry = Math.round(cy - ny * hw);
        if (lx < 1 || ly < 1 || rx < 1 || ry < 1 || lx >= w - 1 || rx >= w - 1 || ly >= h - 1 || ry >= h - 1) continue;
        inside++;
        if (s >= N / 2) farIn++;
        // Best edge within one pixel of each expected edge line.
        var gl = 0, gr = 0, al = 0, ar = 0;
        for (var k = -1; k <= 1; k++) {
          var pl = (Math.round(cy + ny * (hw + k))) * w + Math.round(cx + nx * (hw + k));
          var pr = (Math.round(cy - ny * (hw + k))) * w + Math.round(cx - nx * (hw + k));
          var vl = gx[pl] * nx + gy[pl] * ny, vr = gx[pr] * nx + gy[pr] * ny;
          if (Math.abs(vl) > Math.abs(gl)) { gl = vl; al = Math.abs(gx[pl] * dx + gy[pl] * dy); }
          if (Math.abs(vr) > Math.abs(gr)) { gr = vr; ar = Math.abs(gx[pr] * dx + gy[pr] * dy); }
        }
        // A strip has edges of opposite sign on its two sides, both running along the line.
        if (gl * gr < 0 && Math.abs(gl) > thr && Math.abs(gr) > thr && al < Math.abs(gl) && ar < Math.abs(gr)) {
          hits++;
          if (s >= N / 2) far++;
        }
      }
      // With the phone close, the blade often runs out of the picture. The part that is in the
      // picture is judged, as long as at least 40% of the bat is in it; a bat seen only in part
      // is trusted a little less.
      if (inside < N * 0.4) continue;
      var sc = (hits / Math.max(inside, N * 0.6)) * (inside < N * 0.6 ? 0.92 : 1);
      // A bat reaches well away from the hands; a forearm or a hand does not.
      if (far < Math.min(N * 0.25, farIn * 0.5) || (farIn === 0 && hits < N * 0.35)) sc *= 0.5;
      if (sc > best) { best = sc; bestHw = hw; }
    }
    return [best, bestHw];
  }

  function excluded(th) {
    for (var e = 0; e < exclude.length; e++) {
      var d = Math.abs(Math.atan2(Math.sin(th - exclude[e]), Math.cos(th - exclude[e])));
      if (d < 0.42) return true;
    }
    return false;
  }

  // True when the line from the hands in this direction runs along a leg or the trunk.
  var avoid = o.avoid || [], avoidDist = o.avoidDist || L * 0.08;
  // lf: the share of the full length being tried (a short match is checked over its own length).
  function alongBody(th, lf) {
    var dx = Math.cos(th), dy = Math.sin(th), near = 0, Lb = L * (lf || 1);
    for (var q = 0; q < 7; q++) {
      var t = (0.3 + 0.1 * q) * Lb, px = o.hx + dx * t, py = o.hy + dy * t;
      for (var a = 0; a < avoid.length; a++) {
        var sg = avoid[a], sx = sg[2] - sg[0], sy = sg[3] - sg[1], sl = Math.sqrt(sx * sx + sy * sy) || 1;
        var par = Math.abs((sx * dx + sy * dy) / sl);
        if (par < 0.95) continue;
        var u = ((px - sg[0]) * sx + (py - sg[1]) * sy) / (sl * sl);
        if (u < -0.15 || u > 1.15) continue;
        var dist = Math.abs((px - sg[0]) * sy - (py - sg[1]) * sx) / sl;
        if (dist < avoidDist) { near++; break; }
      }
    }
    return near >= 4;
  }

  var scores = [], body = [];
  var STEPS = 120;
  var nonI = -1, nonS = 0, nonW = 0, nonL = 1, bodyI = -1, bodyS = 0, bodyW = 0, bodyL = 1;
  for (var i = 0; i < STEPS; i++) {
    var th = (i / STEPS) * Math.PI * 2;
    if (excluded(th)) { scores.push(0); body.push(false); continue; }
    var r = scoreAt(th);
    var onBody = alongBody(th, r[2]);
    scores.push(r[0]); body.push(onBody);
    if (onBody) { if (r[0] > bodyS) { bodyS = r[0]; bodyI = i; bodyW = r[1]; bodyL = r[2]; } }
    else if (r[0] > nonS) { nonS = r[0]; nonI = i; nonW = r[1]; nonL = r[2]; }
  }
  // A direction along a leg or the trunk is used only when nothing else looks like a bat.
  var bestBody = !(nonI >= 0 && (nonS >= 0.5 || nonS >= bodyS * 0.7));
  var bestI = bestBody ? bodyI : nonI, bestS = bestBody ? bodyS : nonS, bestW = bestBody ? bodyW : nonW, bestL = bestBody ? bodyL : nonL;
  if (bestI < 0) return null;

  // Refine around the best direction, one degree at a time.
  var bestTh = (bestI / STEPS) * Math.PI * 2;
  for (var dd = -2; dd <= 2; dd++) {
    if (!dd) continue;
    var t2 = bestTh + dd * Math.PI / 180;
    var r2 = scoreAt(t2);
    if (r2[0] > bestS && alongBody(t2, r2[2]) === bestBody) { bestS = r2[0]; bestTh = t2; bestW = r2[1]; bestL = r2[2]; }
  }

  // The best direction must stand out from other directions well away from it that are not
  // along the body.
  var other = 0;
  for (var m = 0; m < STEPS; m++) {
    if (body[m] && !bestBody) continue;
    var thm = (m / STEPS) * Math.PI * 2;
    var away = Math.abs(Math.atan2(Math.sin(thm - bestTh), Math.cos(thm - bestTh)));
    if (away > 0.35 && scores[m] > other) other = scores[m];
  }
  var conf = Math.max(0, Math.min(1, (bestS - 0.45) / 0.3)) * Math.max(0, Math.min(1, (bestS - other) / 0.25));
  // Along a leg or the trunk the bat and the body cannot be told apart. The result is still
  // returned, marked onBody, but the app does not judge the bat from it.
  var dxo = Math.cos(bestTh), dyo = Math.sin(bestTh);
  return {
    dx: dxo, dy: dyo, angle: bestTh, conf: conf, score: bestS, other: other, halfWidth: bestW, onBody: bestBody,
    length: bestL, tipX: o.hx + dxo * L * bestL * 0.94, tipY: o.hy + dyo * L * bestL * 0.94
  };
}
`;

/** Result of the bat detector, in the units of the picture it ran on. */
export type BatDetection = {
  dx: number;
  dy: number;
  angle: number;
  conf: number;
  score: number;
  other: number;
  halfWidth: number;
  onBody: boolean;
  /** How long the bat looks in the picture, as a share of its full length (1, 0.62 or 0.4). */
  length: number;
  tipX: number;
  tipY: number;
};

/**
 * The bat as the camera page reports it: the direction from the hands to the toe in picture
 * pixels (x to the right, y down, as a unit vector), where the hands and the toe are (0..1 of the
 * frame), and how sure the detector is.
 */
export type BatSeen = {
  dx: number;
  dy: number;
  hx: number;
  hy: number;
  tx: number;
  ty: number;
  conf: number;
  /** True when the bat lies along a leg or the trunk, where it cannot be told apart from the body. */
  onBody: boolean;
  /**
   * True when the bat was not found in the picture and is only worked out from the hands. It
   * shows that a bat is held, but its angle is a guess: it is not drawn and not judged.
   */
  est?: boolean;
};

/** Below this confidence the bat is treated as not seen. */
export const MIN_BAT_CONFIDENCE = 0.35;

/** Bat length as a multiple of the trunk length (shoulders to hips) in the picture. */
export const BAT_TO_TRUNK = 1.65;
