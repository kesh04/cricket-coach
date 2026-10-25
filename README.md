# Cricket Coach (mobile app)

AI powered mobile cricket coach for beginners. React Native with Expo (SDK 57), TypeScript.

This is the front end, plus a small server for the AI coach. It runs in **Expo Go** with no native build.

## What is in it

| Area | What it does |
|---|---|
| Sign-up | Email and password, age group, experience, guardian consent for under-18s, and **left- or right-handed** batting. |
| How to use the app | A six-step guide. It opens once after sign-up and can be read aloud. |
| Learn | 11 lessons in 4 levels. Pass the quiz to open the next lesson; fail it and you get remedial content first. Lesson text uses the learner's own left and right. |
| Practise | **A weekly training plan**: week 1 the stance, week 2 stance and forward defence, week 3 the front-foot drive, week 4 defence 20 and drive 20, then a little more each week. Today's plan is shown with counts. Every shot starts with a stance check; if the stance keeps failing, the learner is sent back to stance practice. |
| Today's practice | Before each practice the app explains what today's session is, what is needed, how much space, and what one repetition is (can be read aloud). |
| Watch and listen | For each step the whole skill is shown once, then a voice explains each part **and why it is done that way**, while the picture follows. Links to free coaching videos for extra learning. |
| Set up | A picture from above shows where to put the phone and where to stand, before every camera practice. |
| Camera practice | The camera finds 33 body landmarks, scores the stance (7 checks), the forward defence (6) or the front-foot drive (6) and tells the learner what to fix on screen and by voice, with no network call. It also says when the phone is in the wrong place or part of the body is out of view. |
| Result | **The learner's own photo** with the points to fix ringed in red, the score, the change from the last try, the one thing to fix first with a link back to that step of the demonstration, and (for the stance) a 3D replay over the model stance. |
| Coach | Chat with the AI coach. Answers stream in word by word. Falls back to tips stored in the app. |
| Progress | **A practice calendar** (green: the whole day's plan done, yellow: some practice, plain: none; tap a day to see what was done), days in a row, score over time for each skill, weakest parts, lessons passed. |
| Coach test | A tool for validating the app: a coach judges positions while the app records its own verdict; the app reports agreement and Cohen's kappa and exports the trials as CSV. |
| Tools | Score book and fielding-position trainer. |

## Run it

You need Node 22 (or 20.19.4 and newer) and the **Expo Go** app on your phone (the version for SDK 57).

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iPhone). The phone and the laptop must be on the same Wi-Fi.

With no `.env` file the app runs in **demo mode**: accounts and progress are kept on the phone only. That is enough to try every screen.

The first time the camera practice opens, the phone downloads the pose model (about 6 MB) and the MediaPipe library (about 12 MB). It needs the internet for that; afterwards they are cached.

## Connect Firebase (free)

The app uses Firebase **Authentication** and **Cloud Firestore**. Both are on the no-cost Spark plan and need no card.
Cloud Storage is **not** used, so the paid Blaze plan is not needed: video never leaves the phone, the photo of each saved try is kept on the phone only, and only scores and landmark numbers are saved to Firestore.

1. Go to the Firebase console and create a project.
2. **Authentication** > Sign-in method > enable **Email/Password**.
3. **Firestore Database** > Create database (production mode).
4. Firestore > **Rules**: paste the contents of `firestore.rules` and publish.
5. Project settings > Your apps > add a **Web app** and copy its config values.
6. Copy `.env.example` to `.env` and fill in the five `EXPO_PUBLIC_FIREBASE_...` values.
7. Restart with `npx expo start --clear`. The `--clear` matters: without it the old values stay cached.

Data layout: `users/{uid}` holds the profile; under it are `quizAttempts`, `practiceSessions`, `coachMessages` and `scorebook`.

## Connect the AI coach

The model's API key must never be inside the app, so the app talks to the small server in `server/`, and the server talks to the model.

```bash
cd server
cp .env.example .env      # then put your key in .env
node server.js
```

`server/.env.example` lists three ways to run the model:

- **Groq** (free tier, very fast): get a key at console.groq.com.
- **Google Gemini** (free tier): get a key at aistudio.google.com.
- **Ollama on your laptop** (no key, no cost, works offline, slower).

Then in the app's `.env` set `EXPO_PUBLIC_COACH_API_URL` to the server address, for example `http://192.168.1.20:8787` (your laptop's Wi-Fi address, not `localhost`), and restart with `npx expo start --clear`.

Check the server from a browser: `http://<address>:8787/health`.

For the user study the server has to be reachable from anywhere, so put it on a host that keeps it awake. A host that puts the server to sleep makes the first answer slow.

### Why the feedback is not delayed

There are two kinds of feedback, and only one uses the language model.

1. **Technique feedback (camera practice).** Pose estimation, the measurements and the comparison with the benchmarks all run on the phone. Nothing is sent anywhere, so the cue changes within a fraction of a second of the learner moving. A language model is never in this loop.
2. **Coach chat.** This does call the model. To keep it quick: answers are streamed, limited to about 120 words, only the last few messages are sent, and the learner summary is short. Use a small, fast model.

## The training plan

The app gives the learner a plan for every day (`src/data/training.ts`). The plan is made of **stages of 5 days** (`DAYS_PER_STAGE`). Each day adds 10 more good repetitions (`REPS_PER_DAY_STEP`): 10 on day 1, 20 on day 2, 30, 40 and 50 on day 5.

| Stage | Every day (day 1 → day 5) | Notes |
|---|---|---|
| 1. The stance | Stance × 10 → 50 | A coaching video (cannot be skipped) comes before the first stance practice. |
| 2. The forward defence, step by step | Each of 5 steps × 10 → 50 | 1 stance · 2 footwork (front foot forward) · 3 eyes on the ball (head over the front knee) · 4 bring the bat down beside the pad · 5 the full forward defence |
| 3. The front-foot drive | Drive × 10 → 50 | |
| 4 and on: keep sharp | Full forward defence × 20, drive × 20 | |

Each defence step is a "drill" (`DRILLS` in `training.ts`): it names the checks that count for that step (for example footwork is judged only on `stride`, `frontKnee` and `backLeg`) and whether it starts with a stance check. A set of a step is saved as a `defence` session with a `drill` field, and counts towards that step of the day's plan.

A day counts only when the whole day's plan was done, so a missed day does not push the learner on: the plan waits. Every defence step after the stance, and every drive, begins with a stance check (`STANCE_GATE_HOLD_MS` 1500, `STANCE_GATE_TIMEOUT_MS` 25000); after `STANCE_FAILS_TO_SEND_BACK` (2) failed stance checks in a set, the learner is sent back to stance practice.

A repetition counts when a good position (score 85 or more, no check marked poor) is held for `REP_HOLD_MS` (2500 ms; shots 2000 ms). Between repetitions the learner must come out of position for `RELAX_MS` (800 ms). Each set is saved with the time of every repetition (`reps`), so the plan, the calendar and the streak all come from real timestamps. Practice of something that is not in today's plan is saved as extra practice.

## During camera practice

- **Phone in front or at the side.** Before practice the learner chooses where the phone goes (remembered on the phone). *In front*: where the bowler would be, 3–4 m away; the learner stands side-on with the front shoulder pointing at it. *At the side*: the original set-up, on the off side where the chest points. Both are judged with the same 3D measures; from the front, feet width and knee bend point towards the phone, so they are less exact. From the front, a learner who faces the phone is told to stand side-on (`chest-on`).
- **Bat held the other way round.** `standingSide()` in `stanceAnalyzer.ts` guesses whether the learner stands as a right- or left-hander from the top hand on the handle, the way the head turns, and (from the front) which shoulder is nearer the phone. If it disagrees with the learner's batting hand for about 2 seconds, the app says so, shows how to fix it, and counts nothing until the learner turns round.
- **The phone position is found from the body.** `detectView()` decides from the shoulders and hips whether the learner is side-on to the phone (phone in front) or shows the chest (phone at the side), so a wrong choice in the set-up does not spoil the checks. Eyes: from the side, the head must turn towards the front shoulder (the bowler); from the front, it must look at the phone. Head over the feet: from the side it is measured in the picture (exact); from the front it is not judged, because the line of the feet points at the phone.
- **The bat from the hands.** The picture search for the bat (`batDetect.ts`) missed the bat in real indoor frames, so the camera page now also works the bat out from the hands: the handle runs through each fist from the little finger to the first finger and from the top hand to the bottom hand. When the picture search finds a bat that agrees with the hands it is used; otherwise the bat from the hands is drawn and judged. The stumps overlay was removed.
- **Video replay.** Each repetition is recorded (picture and skeleton) inside the camera page with `MediaRecorder`. Between repetitions the learner can tap *Watch the last one again*. When the set is saved, the video of the best repetition is kept on the phone (`src/services/clips.ts`, newest 8) and plays on the result screen at normal, ½ or ¼ speed. Videos are never uploaded.
- **Steadier skeleton.** Every landmark goes through a One Euro filter in the camera page (`SMOOTHING` in `poseHtml.ts`), so the skeleton does not shake when the learner and the phone are still, but still follows a quick movement.
- **Slower voice.** All speech uses `SPEECH_RATE` (0.78) from `src/lib/voice.ts`, with longer gaps between cues.

## The grip: lesson and photo check

The grip lesson explains the top hand, bottom hand, the Vs, the pressure and the common mistakes. Pose estimation gives wrists, not fingers, so the camera cannot judge a grip. Instead the learner takes or uploads one photo of their hands on the bat (`src/app/(app)/grip-check.tsx`); the app makes it 1000 px wide and sends it to the coach server's `POST /coach/grip`, which asks a vision model to check it against the rules of a good grip for the learner's batting hand. Without the coach server the learner gets a checklist instead. The photo is only sent when the learner presses the button and is not stored.

## Checking the app against a coach (for Chapter 5)

Do not claim the checks are correct without evidence. Measure it instead, with **Profile > Coach test**:

1. A qualified coach stands where they can see the learner. The phone is set up as for practice.
2. Choose the skill and keep "Hide the app's score" on, so the coach is not influenced.
3. The learner takes positions, some good and some with one fault on purpose. For each, the coach presses **Good** or **Not good**. The app stores its own verdict at that moment (good = score 85 or more with no check marked poor, the same rule that counts a repetition).
4. Aim for at least 40 positions per skill, from more than one learner if possible.
5. **Coach test results** shows agreement, Cohen's kappa and the 2×2 table, and exports every trial as CSV for the appendix.

Report what you get, whatever it is. If agreement is low for one check, use the CSV to see which check, and adjust its range in `benchmarks.ts` with the coach.

## How a skill is taught

Every skill on the practice path goes through the same five stages, in this order:

| Stage | Screen | What happens |
|---|---|---|
| 1. Watch | `/demo/[skill]` | The whole skill is shown once, without talking: the 3D batter moves from standing into the stance or plays the shot (for the stance, the coaching video plays instead). |
| 2. Listen | `/demo/[skill]` | A voice explains one step at a time (expo-speech). The picture moves to match, the caption shows the same words, and the learner can pause or go back. Camera practice opens when the explanation has been heard to the end. |
| 3. Set up | `/setup` | Where to put the phone, drawn from above, for the learner's batting hand. |
| 4. Practise | `/live` | Live feedback from the camera, by voice and on screen. A good position held for 2.5 seconds saves itself. |
| 5. Review | `/session/[id]` | The learner's photo, the score, what to fix first and what to do next. |

The steps, the words the voice says and the setup instructions are all in `src/data/skills.ts`.

**What to do next is chosen from the learner's own results** (`session/[id].tsx`): a pass opens the next skill; a fail names the weakest check and links to the step of the demonstration that teaches it; the same weakest check three tries in a row suggests a different approach. `Profile > Practice order` lets a coach open every step for a learner the camera cannot judge well.

### Coaching video that must be watched (stance)

Before the first stance practice the learner must watch a YouTube coaching video inside the app. The YouTube controls are hidden and taps on the player are blocked, so it cannot be skipped forward or opened in YouTube; it can only be played and paused. Only time really played counts, and at least 85% must be watched before the voice explanation and the camera practice open. The privacy-enhanced player (youtube-nocookie.com) is used.

Set the video in `src/data/videos.ts` (`MUST_WATCH`). It ships with Sikana's free "grip and stance" lesson (id `gusv3BsHd3g`, taken from sikana.tv; check that it plays).

**The grip is not practised with the camera.** Pose estimation gives wrists, not fingers, so it cannot judge a grip; the grip stays as a lesson (Learn tab) only.

**Eyes on the bowler.** In the stance the head is turned to the bowler, so the learner does not watch the phone; the voice gives every correction and counts each good one. A seventh stance check, `look`, measures the way the head faces (ears to nose, seen from above) against the line of the feet, and says "Look at the bowler, not at the phone" when the learner turns to the screen. Some videos do not allow playing inside other apps; then choose another, ideally one your coach recommends. Set `MUST_WATCH_EVERY_DAY = true` to require it before the first practice of every day. If the video cannot load (no internet), the learner can watch the in-app demonstration instead.

### Filmed demonstrations (optional)

Stage 1 plays an animation by default. To play your own video of a coach or player instead, put the file in `assets/demo` and switch it on in `src/data/demoVideos.ts`. The voice explanation then follows the video.

## The trained model (our own classifier)

Whether a position is good, or which fault it shows, is decided by a classifier **trained on our
own labelled clips** in Google Colab (`training/Cricket_Coach_Training.ipynb`; see `training/README.md`).
The pose model (MediaPipe) only finds the body points. The coaching-range checks below explain the
model's verdict ("bend your knees a little"). Put the exported `<skill>_model.json` files in
`src/lib/pose/models/`, switch them on in `src/lib/pose/models/index.ts`, and run `npm run test:model`.
A skill without a model file is judged by the checks alone.

## How the camera checks work

`src/lib/pose/poseHtml.ts` is a web page shown in a WebView. It opens the camera and runs MediaPipe Pose Landmarker (BlazePose, GPU where available). It draws the skeleton itself and posts the landmarks to React Native about 15 times a second.

`src/lib/pose/stanceAnalyzer.ts` then does four steps for every frame (`analyzePose`):

1. **Camera position**: is the phone where it can judge the learner? With the phone at the side: if the body is side-on to the phone or has its back to it, the app says so instead of scoring. With the phone in front: if the learner faces the phone instead of standing side-on, the app says so.
2. **Visibility filter**: is every part that is needed in view? If not, the app names the part ("I cannot see your feet"). In a real stance one side of the body is partly hidden by the other, so for each pair of joints only the clearer one has to be fully visible.
3. **Feature extraction** from the 3D world landmarks.
   Stance, six measures: feet width, knee angle, forward lean, shoulder tilt, head position, hand height.
   Grip, three measures: distance between the wrists, which wrist is higher, and how low the bat is held.
4. **Benchmark comparison**: each measure against its ideal range in `src/lib/pose/benchmarks.ts`, giving a score and a message.

`src/app/(app)/live.tsx` smooths the result, shows the worst fault, marks the joints in red, speaks the cue, and saves the attempt when a good position is held for 2.5 seconds. When it saves, the camera page hands over one still picture with the skeleton drawn on it; `src/services/snapshots.ts` keeps the last 12 on the phone and removes them at sign-out.

**The bat check.** The pose model sees the body, not the bat, so the camera page also looks for the bat in the picture (`src/lib/pose/batDetect.ts`). On every other frame it makes a small grey copy of the image (320 px wide), finds its edges, and from the point between the hands tries every direction around the circle, looking for a long strip with two parallel edges, the shape of a bat. Directions along a leg, the trunk or an arm are not trusted, because a body part looks like a bat too. When a bat is found clearly, a yellow line is drawn over it and the analyser adds one check per skill:

| Skill | Check | Good range | Message when wrong |
|---|---|---|---|
| Stance | `batRest`: bat angle from straight down | 0–35° | Rest the bat down, next to your back foot. |
| Forward defence | `batTilt`: tilt from straight down, + when the toe is behind the hands | −8–28° | Keep the bat straight… / Keep your hands ahead of the bat… |
| Front-foot drive | `batFinish`: bat angle from straight up at the finish | 0–110° | Swing through and finish with the bat high… |

When the bat is not found, or lies along a leg (in a good defence the bat is right in front of the pad), the bat check is left out and the rest of the score is unchanged, so an unseen bat never causes a wrong correction. The detector is tested on synthetic frames with `npx tsx scripts/check-bat.ts` (part of `npm run test:pose`); it has **not** been tested on real video yet, so try it on a phone with a real bat and tune the ranges in `benchmarks.ts` with a coach. It works best with a bat that stands out from the background.

**Why the grip is checked from a photo.** Pose estimation gives wrists, not fingers, so it cannot judge a grip reliably. The grip is taught as a lesson and checked from a photo by the AI coach (see above). Say this plainly in the report: the photo check is an AI opinion, not a measurement.

If the camera struggles to find the learner, try the larger pose model: set `EXPO_PUBLIC_POSE_MODEL_URL` (see `.env.example`). It is more accurate and slower.

### Tune the benchmarks with a coach

The ranges in `benchmarks.ts` are **starting values**, not coach-approved figures. Record some good and bad stances, read the measured values on the result screen, and adjust `min`, `max` and `tolerance`. Run `npm run test:pose` afterwards: it checks that the model stance, defence and drive still score 100, that each fault still gives the right cue, and that a wrong camera position and a hidden body part are reported.

### Camera position

In front: phone upright on a support, about waist high, 3–4 metres away, where the bowler would be. The learner stands side-on to it.

At the side (the default): phone upright, about waist high, 3 metres away, on the batter's off side so it sees the chest (where point would field). This sees both shoulders, hands and feet, so feet width and knee bend are measured most exactly.

If the phone is tilted, the lean and shoulder measures will be off.

Grip: the learner faces the phone from about 2 metres and holds the bat upright in front, toe on the ground.

## Show a real player in the stance guide

The stance guide has two views: **Real player** (photos) and **3D model** (drawn).
The app ships with eight numbered sample pictures. To show a real person:

1. Photograph your player in the stance from eight places around them. The steps are at the top of `src/data/stancePhotos.ts`.
2. Save the photos as `1.jpg` to `8.jpg` in `assets/stance`, replacing the samples.
3. In `src/data/stancePhotos.ts` set `PHOTOS_ARE_REAL = true` and set `PHOTOGRAPHED_HAND`.

One player is enough: for a learner who bats with the other hand the photos are mirrored. Use photos you took yourself and have the player's written permission.

## Project layout

```
src/app/(auth)/        welcome, login, register (3 steps, hand choice with the 3D figure)
src/app/(app)/(tabs)/  Home, Learn, Practise, Coach, Progress
src/app/(app)/         how-to, demo/[skill], setup, live, session result, lesson, quiz, stance-guide, profile, tools
src/components/        StanceFigure (3D), GripDiagram, SetupDiagram, DemoVideo, StancePhotos, PoseCamera (WebView), LineChart, ui
src/lib/pose/          landmarks, geometry, benchmarks, stanceAnalyzer, idealStance, poseHtml
src/lib/narrate.ts     speaks one step of a demonstration and reports when it has finished
src/data/              skills (demonstration steps, setup, messages), demoVideos, curriculum (lessons and quizzes), fieldPositions
src/services/          snapshots (photos, on the phone only), flags (guide seen, demonstrations watched)
src/services/backend/  Firebase backend and local demo backend behind one interface
src/services/coach.ts  AI coach client with streaming and stored tips
src/state/             AuthContext, DataContext
server/                coach server (Node, no packages)
scripts/               check-analyzer.ts
```

## Checks

```bash
npm run typecheck    # TypeScript
npm run test:pose    # pose analyser: model stance, defence and drive, faults, camera position, hidden body parts, training plan, coach-test statistics
```

## Not built yet

- **Shot check** (drive and defence classification). The Practise tab shows it as not available. It needs the FastAPI service with the trained classifier: the app would record a short landmark sequence and post it.
- Sinhala and Tamil text.
- An app icon and splash image of your own (the Expo defaults are still in `assets/images`).
