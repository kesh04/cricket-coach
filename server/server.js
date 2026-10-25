/**
 * Coach server: a small proxy between the app and a language model.
 *
 * Why it exists: the API key for the model must never be inside the mobile app, where anyone
 * could extract it. The app sends the learner's question and a short summary of their progress
 * here. This server adds the coaching instructions, calls the model, and streams the answer back
 * as plain text so the first words appear in the app straight away.
 *
 * Two jobs:
 *   POST /coach/chat  questions to the AI coach
 *   POST /coach/grip  a photo of the learner's hands on the bat, checked by a vision model
 *
 * It works with any provider that offers the OpenAI-style "chat completions" API:
 * Groq, Google Gemini (OpenAI-compatible endpoint), OpenRouter, or Ollama on your own laptop.
 *
 * Run:  node server.js        (Node 20.19 or newer; no packages to install)
 */
const http = require('http');
// Some home and mobile networks have a broken IPv6 route; Node's fetch then fails with
// "fetch failed" although a browser works. Try IPv4 addresses first.
require('dns').setDefaultResultOrder('ipv4first');

/** The real reason behind Node's "fetch failed", for the log. */
function why(e) {
  const c = e && e.cause;
  const code = (c && (c.code || c.name)) || '';
  const text = (c && c.message) || (e && e.message) || String(e);
  const hint = {
    ENOTFOUND: 'the address could not be found: check the internet and LLM_BASE_URL',
    EAI_AGAIN: 'no DNS answer: check the internet connection',
    ECONNREFUSED: 'the connection was refused: check LLM_BASE_URL',
    ECONNRESET: 'the connection was cut: a firewall, VPN or network filter may block it',
    ETIMEDOUT: 'it timed out: the network may block this site (school/office Wi-Fi, VPN) - try a phone hotspot',
    UND_ERR_CONNECT_TIMEOUT: 'it timed out: the network may block this site (school/office Wi-Fi, VPN) - try a phone hotspot',
    SELF_SIGNED_CERT_IN_CHAIN: 'a network filter or antivirus is intercepting HTTPS',
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'a network filter or antivirus is intercepting HTTPS',
  }[code];
  return `${text}${code ? ` [${code}]` : ''}${hint ? ` -> ${hint}` : ''}`;
}

// Settings come from the .env file next to this file. The demo and the self-test skip it.
if (!process.env.COACH_SKIP_ENV_FILE) {
  try {
    process.loadEnvFile(require('path').join(__dirname, '.env'));
  } catch {
    // No .env file: use the variables already set in the environment.
  }
}

const PORT = Number(process.env.PORT || 8787);
const BASE_URL = (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
const API_KEY = process.env.LLM_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'openai/gpt-oss-20b';
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS || 900);
// How varied the answers are. Claude (api.anthropic.com) refuses values below 1 on its newer
// models, so there it is left out; set LLM_TEMPERATURE=none to leave it out anywhere.
const TEMPERATURE = (() => {
  const v = (process.env.LLM_TEMPERATURE || '').trim().toLowerCase();
  if (v === 'none') return undefined;
  if (v) return Number(v);
  return BASE_URL.includes('anthropic.com') ? undefined : 0.4;
})();
// Extra fields for the request body, as JSON. Example: {"reasoning_effort":"low"}
const EXTRA = process.env.LLM_EXTRA_JSON ? JSON.parse(process.env.LLM_EXTRA_JSON) : {};
// A model that can look at pictures, for the grip check. Leave empty to switch the grip check off.
const VISION_MODEL = process.env.LLM_VISION_MODEL ?? 'meta-llama/llama-4-scout-17b-16e-instruct';
// Largest grip photo accepted, in bytes of the request. The app sends a photo about 1000 pixels wide.
const MAX_PHOTO_BYTES = Number(process.env.MAX_PHOTO_BYTES || 6_000_000);

const SYSTEM_PROMPT = `You are "Coach", a friendly, expert cricket batting coach inside a mobile app for beginners aged 10 to 25. You know this learner's practice data (below) and you coach like a good club coach: notice one thing, fix one thing, give a drill, check it.

Language (most important):
- Answer in the language the learner writes in. Sinhala script (සිංහල) gets an answer in clear, everyday Sinhala script. Tamil gets Tamil. English gets English. Sinhala written in English letters ("Singlish", e.g. "stance eka hadanne kohomada") gets an answer in Sinhala script.
- In Sinhala or Tamil, keep cricket words in English as players say them: stance, grip, bat, front foot, forward defence, drive, slip, gully, powerplay, umpire, appeal, LBW, run out. Do not translate them.
- Write natural Sinhala as a Sri Lankan coach would speak it, not a word-by-word translation. If you are not sure of a Sinhala word, use the English word.
- The facts do not change with the language: check the batting hand, the numbers and the Laws as carefully as in English.

How to answer:
- Simple words, short sentences. A 10-year-old must be able to follow it. Be warm and encouraging, never harsh.
- Under 150 words. Lead with the answer. Give at most three steps or points, each on its own line starting with "- ".
- Use the learner's data when it is relevant and say so ("In your last stance checks your knees were too straight..."). Praise real progress you can see in the scores.
- For a technique fix: say what to change, why it matters, one drill they can do alone at home (with a number of repetitions), and how to check it (a mirror, the stance check, a photo of the grip).
- When asked what to practise: use the training plan, the stance-first progress, the faults in the data and how they get out in real matches (often caught: work on playing the ball along the ground; often bowled or LBW: work on the forward defence and playing straight).
- When asked about their matches: use their real match figures; praise good scores, and link the way they get out to a skill they can practise in the app. Be specific: which skill, how many good repetitions.
- Use the batting hand correctly. For a right-handed batter the front foot, front shoulder and top hand are the LEFT ones. For a left-handed batter they are the RIGHT ones.
- "Quiz me": ask ONE multiple-choice question (A, B, C) about the topic, then stop and wait. When they answer, say if it is right, explain in one or two sentences, then ask the next question.
- No headings, tables, bold or other markdown. Plain text and "- " lists only.

What the app does (point the learner to it):
- The pose camera checks the stance (feet, feet in line, knees, lean, shoulders, hands, head and eyes), the forward defence in 5 steps, the front-foot drive, back-foot defence, pull, cut and sweep. Every shot starts with a stance check. The shots stay locked until 50 good stances have been held with the camera (over all days); then they all open.
- The phone can stand at the side (seeing the chest) or in front, as the bowler. It must stand still.
- The camera cannot see fingers, so the grip is checked from a photo of the hands on the bat.
- Lessons: the grip, the stance, backlift, shots, running, line and length, the 11 ways to be out, fielding positions, setting a field and powerplays, umpires and appeals. Each has a quiz.

Facts to use (Laws of Cricket and the international playing conditions):
- Powerplays: one-day (50 overs): overs 1-10 at most 2 fielders outside the 30-yard circle, overs 11-40 at most 4, overs 41-50 at most 5. T20: overs 1-6 at most 2, then 5. Too many outside: no-ball and a free hit.
- No more than 2 fielders behind square on the leg side.
- A batter is out only after an appeal ("How's that?"), made before the bowler starts the run-up for the next ball. One appeal covers every way of being out. Out: the umpire raises one finger.
- Signals: four, arm waved across the chest; six, both arms up; wide, both arms out; no-ball, one arm out; bye, open hand raised; leg bye, touch a raised knee.

At the very end of every answer add two lines, exactly in this form (the app turns them into buttons and does not show them as text):
NEXT: <a short follow-up question the learner might ask> | <another> | <another>
OPEN: <one of: lesson:grip, lesson:stance, lesson:backlift, lesson:forward-defence, lesson:front-foot-drive, lesson:dismissals, lesson:fielding-positions, lesson:setting-a-field, lesson:umpires-appeals, demo:grip, demo:stance, demo:defence, demo:drive, practice, grip-check, grip-quiz, field, set-field, stance-guide, or none>
Write the follow-up questions in the learner's voice and language, under 8 words each. Keep the words NEXT and OPEN and the screen names in English exactly as shown.

Limits:
- Only help with cricket: batting technique, the rules, practice, fitness for cricket and confidence. If asked about anything else, say kindly that you can only help with cricket.
- Do not invent facts about the learner. If the data does not say, ask one short question or give general advice.
- For pain or injury, tell them to stop and speak to a parent, coach or doctor. Do not give medical advice.
- Remind younger learners to practise with a soft ball and an adult nearby when a drill uses a moving ball.
- Never ask for personal details.`;

const GRIP_PROMPT = `You are a friendly cricket batting coach inside a mobile app for beginners aged 10 to 25.
The learner has sent a photo of their hands holding a cricket bat. Check their GRIP only.

What a good grip looks like:
- Both hands close together near the top of the handle, touching or almost touching.
- The top hand is the hand of the front arm: the LEFT hand for a right-handed batter, the RIGHT hand for a left-handed batter. It is above the bottom hand.
- On each hand the thumb and first finger make a V. Both Vs point down the back of the bat, in a line between the middle of the back and the outside edge.
- The fingers wrap round the handle; the handle sits in the fingers, not deep in the palm.
- Top hand firm, bottom hand relaxed (you cannot see pressure: just remind them).

How to answer:
- First say in one short sentence what you can see. If the picture does not clearly show two hands on a bat handle, say so and ask for a clearer photo: hands and handle filling the picture, good light, taken from in front of the batter. Do not guess.
- Then give a verdict starting with exactly one of: "Good grip.", "Nearly there.", "Needs fixing."
- Then at most three short points to fix, most important first, each starting with "- ".
- Use simple English and short sentences. A 10-year-old must follow it. Under 110 words. No markdown symbols other than "- ".
- Use the batting hand you are given for left and right. If the hands look swapped for that batting hand, say so clearly: it is the most important thing to fix.
- Only talk about cricket. Never comment on the person's body, skin, face, age or anything else in the photo.`;

function learnerNote(learner) {
  if (!learner || typeof learner !== 'object') return 'No learner data was sent.';
  const text = (v, max = 120) => String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, max);
  const list = (v, max = 12) => (Array.isArray(v) ? v.slice(0, max).map((x) => text(x, 60)).join(', ') : '');
  return [
    `Age group: ${text(learner.ageGroup, 10) || 'unknown'}`,
    `Experience: ${text(learner.experience, 20) || 'unknown'}`,
    `Batting hand: ${text(learner.battingHand, 10) || 'unknown'}`,
    `Goal: ${text(learner.goal) || 'not given'}`,
    `Lessons passed: ${list(learner.lessonsPassed) || 'none yet'}`,
    `Next lesson: ${text(learner.nextLesson, 60) || 'none'}`,
    `Recent stance scores out of 100, newest first: ${list(learner.recentStanceScores, 5) || 'no stance checks yet'}`,
    `Stance faults seen most often: ${list(learner.commonFaults, 6) || 'none recorded'}`,
    `Recent grip scores out of 100, newest first: ${list(learner.recentGripScores, 5) || 'no grip checks yet'}`,
    `Grip faults seen most often: ${list(learner.commonGripFaults, 3) || 'none recorded'}`,
    `Camera practice by skill: ${list(learner.skillScores, 8) || 'none yet'}`,
    `Stance first: ${text(learner.stanceFirst, 80) || 'unknown'}`,
    `Quizzes tried but not passed yet: ${list(learner.quizzesToRetry, 6) || 'none'}`,
    `Days with practice in the last 14 days: ${Number.isFinite(learner.daysPractisedLast14) ? learner.daysPractisedLast14 : 'unknown'}; last practice: ${text(learner.lastPractice, 20) || 'unknown'}`,
    `Real matches the learner entered: ${text(learner.matchRecord, 400) || 'none'}`,
    `Training plan: ${text(learner.practiceStep, 200) || 'not started'}. The plan has stages of 5 days. Each day adds 10 more good ones: 10 on day 1, 20 on day 2, up to 50 on day 5. Stage 1: the stance. Stage 2: the forward defence in 5 steps, each step done every day (1 stance, 2 footwork: front foot forward, 3 eyes on the ball with the head over the front knee, 4 bringing the bat down next to the front pad, 5 the full forward defence). Stage 3: the front-foot drive. Then 20 full forward defences and 20 drives a day. Every shot starts with a stance check.`,
  ].join('\n');
}

// Very small rate limit: 20 questions a minute for each address.
const hits = new Map();
function allowed(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 20) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function readJson(req, limit = 20_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { ...CORS, 'Content-Type': type });
  res.end(body);
}

/** Calls the model and streams its answer to the app as plain text. */
async function streamModel(res, body, label) {
  const started = Date.now();
  let upstream;
  try {
    upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
      body: JSON.stringify({ stream: true, ...(TEMPERATURE === undefined ? {} : { temperature: TEMPERATURE }), max_tokens: MAX_TOKENS, ...EXTRA, ...body }),
    });
  } catch (e) {
    console.error('Could not reach the model:', why(e));
    return send(res, 502, 'The coach could not be reached.');
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error(`Model replied ${upstream.status}: ${detail.slice(0, 300)}`);
    return send(res, 502, 'The coach could not answer.');
  }
  res.writeHead(200, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  const decoder = new TextDecoder();
  let buffer = '';
  let first = 0;
  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const data = line.trim();
        if (!data.startsWith('data:')) continue;
        const payload = data.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const piece = JSON.parse(payload).choices?.[0]?.delta?.content;
          if (piece) {
            if (!first) first = Date.now() - started;
            res.write(piece);
          }
        } catch {
          // Ignore lines that are not JSON (keep-alive comments).
        }
      }
    }
  } catch (e) {
    console.error('Stream stopped early:', e.message);
  }
  res.end();
  console.log(`${label} answered in ${Date.now() - started} ms (first words after ${first} ms)`);
}

const PHOTO = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;

async function grip(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (!allowed(ip)) return send(res, 429, 'Too many questions. Wait a minute and ask again.');
  if (!VISION_MODEL) return send(res, 501, 'The grip photo check is not switched on for this coach server.');

  let body;
  try {
    body = await readJson(req, MAX_PHOTO_BYTES);
  } catch {
    return send(res, 413, 'The photo is too large or could not be read. Try again with a smaller photo.');
  }
  const image = typeof body.image === 'string' ? body.image : '';
  if (!PHOTO.test(image)) return send(res, 400, 'Send one photo (JPEG or PNG).');
  const hand = body.hand === 'left' ? 'left' : 'right';
  const note = typeof body.question === 'string' ? body.question.replace(/[\r\n]+/g, ' ').slice(0, 300) : '';
  const top = hand === 'right' ? 'left' : 'right';

  const text = `I bat ${hand}-handed, so my ${top} hand should be on top. Please check my grip in this photo.${note ? ` ${note}` : ''}`;
  return streamModel(
    res,
    {
      model: VISION_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: GRIP_PROMPT },
        { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }] },
      ],
    },
    'grip photo',
  );
}

async function chat(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (!allowed(ip)) return send(res, 429, 'Too many questions. Wait a minute and ask again.');

  let body;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, 'The request could not be read.');
  }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-13)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') return send(res, 400, 'Send at least one question.');

  return streamModel(res, { model: MODEL, messages: [{ role: 'system', content: `${SYSTEM_PROMPT}\n\nLearner data:\n${learnerNote(body.learner)}` }, ...messages] }, 'question');
}

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (req.method === 'GET' && (path === '/' || path === '/health')) {
    return send(res, 200, JSON.stringify({ ok: true, model: MODEL, visionModel: VISION_MODEL || null, provider: BASE_URL, keySet: !!API_KEY }), 'application/json');
  }
  if (req.method === 'POST' && path === '/coach/chat') return void chat(req, res);
  if (req.method === 'POST' && path === '/coach/grip') return void grip(req, res);
  send(res, 404, 'Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Coach server on port ${PORT}, using ${MODEL} at ${BASE_URL}`);
  // Print the addresses a phone on the same Wi-Fi can use.
  const nets = require('os').networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`  In the app's .env:  EXPO_PUBLIC_COACH_API_URL=http://${n.address}:${PORT}`);
    }
  }
  if (!API_KEY && !BASE_URL.includes('localhost') && !BASE_URL.includes('127.0.0.1')) {
    console.warn('LLM_API_KEY is not set. Copy .env.example to .env and add your key.');
  }
});

module.exports = { server };
