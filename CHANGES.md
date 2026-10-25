# Changes in this version (sixteenth round, 20 October 2026)

| Request | What changed | Files |
|---|---|---|
| The stance must be done before any other practice | Every camera practice except the stance is closed until the learner has held **10 good stances** with the camera (`STANCE_FIRST_REPS`, the first day of the stance plan). The practice page shows one card, "The stance comes first", that explains why (every shot starts from the stance), shows how many of the 10 are done and goes straight to the stance. The demonstrations of the shots can still be watched; only the practice is closed. This also holds with "All steps open" | `training.ts` (`STANCE_FIRST_REPS`, `stanceRepsDone`), `DataContext.tsx` (`needsStance`, `stanceReps`), `StanceFirst.tsx`, `practice.tsx`, `setup.tsx`, `demo/[skill].tsx` |
| Explain how batters get out, all of them | The lesson "How batters get out" now covers **all 11 ways**: bowled, caught, LBW, run out, stumped, hit wicket, hit the ball twice, obstructing the field, handled the ball (part of obstructing the field since 2017, so today's Laws list 10), timed out and retired out, each with how to avoid it, plus what can and cannot get you out off a no-ball or a free hit | `curriculum.ts` |
| More quiz questions | The dismissals quiz has **12 questions** (was 4) | `curriculum.ts` |
| Questions in the field set-up | New mode **"Read the field"** in the field trainer: 8 questions each time. The field is drawn for a batter whose hand is not given, with the slip and gully (or square leg and fine leg) marked, and the learner works out "What kind of batter is this?"; also which side is the off side, and which fielder stops a cover drive, an edge, a pull, a cut, a straight drive or a glance. Each answer is explained | `fieldQuestions.ts`, `tools/field.tsx` |

New: `scripts/check-content.ts` (in `npm run test:pose`): all 11 ways are in the lesson, every quiz answer is valid, the batter's hand in the field questions really follows from where the slip is drawn, and the stance-first rule.

---

# Changes in this version (fifteenth round, 19 October 2026)

Field test with the phone in front (screen recording, stance): the score jumped (22, 11, 91, 100, 29, 13, 4 on the same stance), the trained model said "Not quite right yet" on good stances, the joints shook, and hidden hands or bat gave wrong hand and bat messages.

| Problem seen | Fix | Files |
|---|---|---|
| Score and verdict jumped from frame to frame | Smoothing is now over **time**, not frames: at 40 to 60 frames a second the old smoothing followed every shake within 50 ms. Measures follow a real change in about 0.25 s, the model's probabilities in about 0.55 s, at any frame rate | `stanceAnalyzer.ts` (`StanceSmoother`, `MEASURE_TAU_MS`, `PROBS_TAU_MS`) |
| The model's verdict flipped at its threshold | **Hysteresis**: once the model accepts a position, it stays accepted until P(correct) is 0.12 below the threshold | `stanceAnalyzer.ts` (`judgeWithModel`, `MODEL_HYSTERESIS`) |
| Phone in front: the model called good stances faults | From the front the side-on body's shoulder and hip line points at the phone and comes from depth, the weakest part of the pose model, so the model's features are rough. From the front the model now stops a position only when fairly sure of a fault (P(correct) < 0.35), and the score is the mean of the model's and the rules' scores. From the side the model decides as before | `stanceAnalyzer.ts` (`FRONT_VETO`) |
| One shaky frame reset the hold bar | A not-good blip shorter than 0.4 s does not reset the hold | `live.tsx` (`HOLD_GRACE_MS`) |
| Joints shook; left and right legs swapped | Pose model **full** instead of lite, and the camera asks for 1280 x 720 instead of 640 x 480 (more pixels for the joints) | `poseHtml.ts` |
| Phone in front: "Lower your hands", "Hands and bat too high" for hands the camera could not see | From the front only clearly seen hands (visibility 0.65 or more) are judged | `stanceAnalyzer.ts` (`FRONT_HAND_VIS`) |
| Phone in front: "I cannot see your bat" stopped good stances | From the front the bat often hangs behind the front leg; not seeing it is a tip there, not a fault | `stanceAnalyzer.ts` (`refineMessages`) |

New: `scripts/check-steady.ts` (in `npm run test:pose`) and `scripts/replay.ts` (`npm run replay -- frames.json stance front`) to replay landmarks taken from a recording and measure how steady the score is. On the field-test recording: mean change of the score between frames 6.1 to 3.9, jumps of 30 or more 2 to 0.

**Train again with front-view clips.** The models in `src/lib/pose/models` were trained with the lite pose model; train them again with the notebook (POSE_MODEL = 'full', the same as the app now) and include correct and faulty clips filmed with the phone in front, so the model is as reliable from the front as from the side.

---

# Changes in this version (fourteenth round, 12 October 2026)

**Four new basic shots**, each with a 3D demonstration (step by step with the voice), a lesson with quiz, a practice plan, camera checks and a place in the training plan: **back-foot defence, pull, square cut, sweep**. With the forward defence and the front-foot drive, the app now teaches six shots.

| Part | What | Files |
|---|---|---|
| Model positions | Each shot has a model position built with real bone lengths (hips, shoulders, feet, hands), mirrored for left-handers; the figure moves from the stance into it | `shotPoses.ts` |
| Camera checks | New checks: back step, weight back, front leg light, back knee, hands up, arms out, low down, front knee (sweep), hands low. Starting values from the model positions: **tune with a coach** | `benchmarks.ts`, `stanceAnalyzer.ts` (`measureShot`) |
| Teaching | Watch-and-listen steps, common mistakes, practice plans, lessons and quizzes for each shot | `shotContent.ts`, `skills.ts`, `curriculum.ts` |
| Plan | Stages 4 to 7: back-foot defence, pull, cut, sweep (10 on day 1 up to 50 on day 5). All shots are open from the start for testing (`OPEN_FROM_START`) | `training.ts` |
| Every shot | Starts with the quick stance check, asks for room if the step is cut off, and does not need the hands or the bat to be seen | (shared) |
| Tests | `scripts/check-shots.ts` (model positions score 100, wrong positions are caught, content is complete); `npm run test:pose` runs all | `scripts/` |

Limits to tell the reader: the camera checks the held position of the shot, not the swing, and the bat is not judged for the new shots. The check values are textbook starting values.

---

# Changes in this version (thirteenth round, 12 October 2026)

| Problem seen | Fix | Files |
|---|---|---|
| Phone in front: *"I cannot see your hands"* although the batter was in position | With the phone in front, hands are no longer required (they hide behind the bat and body). In every view, one clearly seen hand is enough | `stanceAnalyzer.ts` (`missingPart`) |
| Evaluation against a coach | `tools/extract_landmarks.py`, `scripts/evaluate.ts`, `tools/EVALUATION.md`, `npm run evaluate` | `tools/`, `scripts/` |

---

# Changes in this version (twelfth round, 12 October 2026)

| Problem seen | Fix | Files |
|---|---|---|
| Phone at the side: the forward step goes sideways across the picture and was cut off at the edge, so the shot was not seen properly | New check **room**: if feet, knees, hips, shoulders or hands touch the left or right edge during a defence or drive, the app says *"Your step needs room. Move the phone back a little…"* instead of judging a cut-off shot. Set-up distance for the defence is now 4 m | `stanceAnalyzer.ts` (`noRoomSideways`), `benchmarks.ts`, `skills.ts` |

---

# Changes in this version (eleventh round, 12 October 2026)

| Problem seen | Fix | Files |
|---|---|---|
| While playing the forward defence the app kept saying *"Stand side-on to the phone"* and stopped judging | Shot positions turn the shoulders, so the "facing the phone" stop now applies to the **stance check only** (the gate), not to the shot | `stanceAnalyzer.ts` |
| Correct shots told *"Bend your front knee and lean into the shot"* (phone in front) | With the phone in front, front knee and lean are tips in the defence (they come from depth, which is weak); step, head, bat and elbow still count | `stanceAnalyzer.ts` |
| Too many steps | The defence has only **2 parts**: Footwork and Full forward defence (eyes, bat, knee are checked inside the full defence). Stance stays a quick gate | `training.ts`, texts, tests |

---

# Changes in this version (tenth round, 12 October 2026)

| Problem seen | Fix | Files |
|---|---|---|
| The forward defence made you do **Step 1: Stance** 10 times a day first | The stance is no longer a step. It is only a **quick check** before each repetition (held 0.8 s instead of 1.5 s): if it is good you go straight on. The defence now has **4 steps** (footwork, eyes, bat, full shot), 10 each on day 1 up to 50 on day 5 | `training.ts`, `live.tsx`, `how-to.tsx`, `skills.ts` |
| You could not choose steps | Today's practice and the step list let you start **any step, in any order**; nothing is locked behind another step | `practice.tsx`, `training.ts` |
| Standing close to the phone, feet cut off, the app said "Step forward" / "Bend your front knee" although you did it right | Feet and knees on or past the picture edge no longer count as seen (the model guesses them). The app now says *"I cannot see your feet. Step back, or tilt the phone down."* instead of judging guesses | `stanceAnalyzer.ts` (`inFrame`, `missingPart`) |

Checks: check-analyzer, check-training, check-bat all pass.

---

# Changes in this version (ninth round, 12 October 2026)

| Problem seen | Fix | Files |
|---|---|---|
| A good stance, leaning forward with the arms hanging down, was told *"Your hands are out away from your body"* | **Hands in** now measures the hands from the middle of the hips **or** the shoulders, whichever is nearer. Leaning forward, the hands hang under the shoulders (that screenshot now reads 0.02, good); hands pushed out with the bat up are far from both (0.55, still wrong). Good up to 0.35, wrong from 0.55. | `stanceAnalyzer.ts` (`handsFromBody`), `benchmarks.ts` |

Checks: `npm run test:pose` (all pass; new test "leaning forward, hands under the shoulders").

---

# Changes in this version (eighth round, 12 October 2026)

Fixes from two more screenshots (phone in front): a stance with the front foot turned towards the phone, and a stance bent over, half facing the phone with the bat between the legs (counted, score 95).

| Problem seen | Fix | Files |
|---|---|---|
| Half facing the phone still counted | The "facing the phone" limit is tighter: 0.38 instead of 0.45 (shoulder and hip width in the picture, in trunk lengths). Both new screenshots read 0.45 to 0.46 and are now stopped with *"Do not face the phone. Stand side-on…"*. A side-on stance reads about 0.3; the model stance turned up to 30° towards the phone reads 0.32 or less, so it still counts. | `stanceAnalyzer.ts` (`CHEST_ON_SPREAD`) |
| Front foot turned forward, towards the phone (the bowler), still counted | New stance check **Toes** (phone in front only): the angle of each foot across the picture. A foot pointing to the side lies across the picture (the model stance: 2°); a foot turned to the phone runs down the picture (screenshots: 68° to 82°) or looks very short. Over 45° is wrong, and the stance does not count: *"Turn your feet so your toes point to the side, not at the bowler. Both feet side by side on one line."* | `benchmarks.ts` (`toesSide`), `stanceAnalyzer.ts` (`toesInPicture`), `skills.ts`, `stance-guide.tsx` |

Checks: `npm run test:pose` (351 pass).

Still not possible: telling a bat resting down from a bat lifted a little when the bat itself cannot be seen (for example held in front of the legs). The hands are in the same place in both, so the body alone cannot tell them apart.

---

# Changes in this version (seventh round, 12 October 2026)

Fixes from two screenshots of the stance (phone in front).

| Problem seen | Fix | Files |
|---|---|---|
| Hands pushed out in front with the bat up in the air scored **100**: the bat was not seen and the hands were at hip height | New stance check **Hands in**: how far the hands are from the middle of the hips across the picture, in trunk lengths. Good up to 0.42 (the model stance reads about 0.29); the screenshot read 0.62. It is a real check, so the stance does not count until it is right: *"Your hands are out away from your body. Bring them in close, near your front thigh, and rest the bat down by your back toe."* | `benchmarks.ts` (`handsIn`), `stanceAnalyzer.ts` (`handsFromBody`), `skills.ts`, `stance-guide.tsx` |
| Phone in front, learner **facing the phone** with the bat between the legs scored **98** | The app worked out the phone position from the body and took a learner facing it as "phone at the side". Now, when **In front** is chosen in the set-up, a chest facing the phone is caught in the picture (shoulders and hips spread wide: about 0.5 trunk lengths facing, 0.3 side-on) and the app says *"Do not face the phone. Stand side-on, with your front shoulder pointing at the phone, like a batter facing the bowler."* Nothing is scored until the learner turns. With **At the side** chosen, facing the phone is still right. | `stanceAnalyzer.ts` (`chestOnInPicture`, `analyzePose`) |
| Old test expected the word "Lower" for hands held high | The message had changed to "Your hands and bat are too high…"; the test now accepts it. | `scripts/check-analyzer.ts` |

Both new checks were set from the two screenshots (run through the same pose model) and checked against the model stance turned to many angles. Checks: `npm run test:pose` (340 pass; new tests under "Field test, 12 October").

Not caught yet: hands pushed straight **towards** a phone in front (that is depth, which the pose model measures worst). Try it on the phone and tell me if it needs more.

---

# Changes in this version (sixth round, October 2026)

| Request | Change | Files |
|---|---|---|
| Do not talk about the bat all the time; only when it goes very high | The bat is corrected **only when it is held high, pointing up in the air** (more than 145° from straight down): *"Your bat is too high, up in the air. Bring it lower: rest it by your back toe, or lift it just a little behind you."* Resting down, or lifted a little behind like Virat Kohli's stance, is fine. "Your bat is not resting down…" and "I cannot see your bat" are removed; a bat the camera cannot see is not judged. | `benchmarks.ts`, `stanceAnalyzer.ts` |
| Knees marked wrong when they are fine | From the side the knees bend towards the phone, which the pose model measures worst. The range is forgiving again (130°–168°), and a "nearly" (orange) is spoken but no longer stops a stance from counting; only red faults do. | `benchmarks.ts`, `stanceAnalyzer.ts` (`blocks`) |
| Defence footwork: the foot must come forward; too far is wrong | Step range 1.5–2.8 shoulder widths. Too short: *"Step forward. Bring your front foot forward, towards the ball."* Too long: *"Your step is too long. Take a shorter step, so you stay balanced over your front foot."* Works from the front and the side (from the front the picture reading can show a step is long enough, but never on its own that it is too long). | `benchmarks.ts`, `stanceAnalyzer.ts` (`strideLength`), `training.ts` |
| Side view with the face turned to the bowler | The head counts as seen when the nose **or either ear** is seen, so a learner looking at the bowler (not the phone) is judged from the side. | `benchmarks.ts`, `stanceAnalyzer.ts` (`missingPart`) |
| Teaching | Lessons, the stance guide and the quiz now say: bat resting by the back toe or lifted a little behind, never high in the air; phone in front or at the side. | `skills.ts`, `curriculum.ts`, `stance-guide.tsx` |

---

# Changes in this version (fifth round, October 2026)

| Problem seen | Fix | Files |
|---|---|---|
| Stances with nearly straight knees, or the bat lifted, still counted | A repetition now counts only when **every real check is good** (a "nearly", shown as !, no longer counts). Tips (head, eyes, neck) still never block. Knees: the top of the range is now 162° (was 166°) and falls off faster, so nearly straight legs (about 170°) are told "Bend your knees a little". | `stanceAnalyzer.ts` (`blocks`), `benchmarks.ts` |
| Bat lifted far back over the shoulder, yet "Good stance" | When the picture cannot see the bat and the hands say it is lifted (not pointing down), the stance does not count and the app says *"Your bat is not resting down. In your stance, do not lift the bat or take it back behind you…"*. A bat seen in the picture pointing up was already corrected. | `stanceAnalyzer.ts` (`GUESS_DOWN`, `BAT_NOT_DOWN_MESSAGE`) |
| Forward defence: head up, yet "correct" | Two new defence checks that count: **Head down** (eyes over the ball by the front pad) and **Lean in** (trunk forward into the shot). They work from the side and from the front. Used in Step 3 and Step 5. | `benchmarks.ts`, `stanceAnalyzer.ts`, `training.ts`, `idealStance.ts` |
| Footwork step could not be passed with the phone in front | From the front the step points at the phone and looked short in 3D. The step is now also read from the picture (the front ankle stands lower than the back ankle) and the larger reading is used. | `stanceAnalyzer.ts` (`strideLength`) |
| No defence coaching video | Sikana's "How to play a front foot defence" is now the must-watch video before defence practice (if it will not play in the app, the animation is shown). | `videos.ts` |
| Teaching | Defence step "Head down, over the knee" and lesson text: head down over the front knee, eyes over the ball. | `skills.ts`, `curriculum.ts` |

---

# Changes in this version (fourth round, October 2026)

The **Both hands** check is removed: from the side the camera cannot see the far hand reliably, so it said "use both hands" even with both hands on the bat. The app no longer checks or says it. The lessons still teach holding the bat with both hands.

Files: `benchmarks.ts`, `stanceAnalyzer.ts`, `live.tsx`, `stance-guide.tsx`, `skills.ts`, `curriculum.ts`, `scripts/check-analyzer.ts`.

---

# Changes in this version (third round: fixes from the screen recording, October 2026)

| Problem in the recording | Cause | Fix | Main files |
|---|---|---|---|
| "Use both hands" said all the time, while both hands were on the bat | From the side, the far hand is hidden behind the bat. The pose model still guesses where it is (often far away) and the app judged that guess. | One hand off the bat is reported only on clear evidence: both wrists clearly seen (visibility ≥ 0.65), and the hands apart **both in 3D and in the picture** (the smaller is used; a picture never makes close hands look apart). A wrist that cannot be seen is not judged, and an old value is dropped. | `stanceAnalyzer.ts` (`handsApart`, `HAND_SEEN`, `SOMETIMES_MEASURED`), `poseHtml.ts` (picture `aspect`) |
| The yellow bat line pointed up while the real bat pointed down | When the picture and the hands disagreed, the guess from the hands won. And with the phone close, the blade runs out of the picture, so the picture search gave up (found in 3% of such frames). | The bat found in the picture now always wins. A bat partly out of the picture is judged on the part that is in it (now found in 57% of such frames, no extra wrong reports). The guess from the hands is no longer drawn or judged: it only shows that a bat is held ("Held"). The last picture bat is kept for a few blurred frames. | `batDetect.ts`, `poseHtml.ts` (`findBat`, `drawPose`), `stanceAnalyzer.ts` (`unsure`) |
| "Your right foot is ahead…" when the feet were cut off | Toes and heels half out of the picture. | Feet in line is judged only when toes, heels and ankles are all clearly seen. | `stanceAnalyzer.ts` (`feetInLine`) |

Stance teaching checked against coaching sources: bat grounded near the toes of the back foot (or between the feet), top hand resting near the front thigh, head still and level.

---

# Changes in this version (second round, October 2026)

| Request | What changed | Main files |
|---|---|---|
| Head and eyes should not count | **Head**, **Eyes** and the new **Neck** are now *tips*: shown (blue ⓘ, "Tip:") and spoken, but left out of the score and they never stop a repetition from counting. Real faults are always spoken first. Marked "tip" on the result screen. | `benchmarks.ts` (`advisory`), `stanceAnalyzer.ts` (`summarise`, `blocks`), `live.tsx`, `session/[id].tsx` |
| Looking up or the other way → "keep your neck straight" | New **Neck** tip (head tipped up or down, from ears to nose): *"Keep your neck straight. Do not look up…"*. Looking the other way (more than 100° from the bowler): *"Keep your neck straight. You are looking the other way: turn your head to the bowler…"* | `stanceAnalyzer.ts` (`neckAngle`, `LOOK_OTHER_WAY`) |
| Open the forward defence now | `OPEN_FROM_START = ['defence']`: the forward defence (all 5 steps) and its lesson are open from day 1. Set it to `[]` for the study. | `src/data/training.ts`, `src/state/DataContext.tsx` |
| One hand on the bat → "use both hands" | New **Both hands** check in the stance, forward defence and drive (wrists more than half a shoulder-width apart): *"Use both hands. Hold the bat with both hands together on the handle."* It must be right for a repetition to count. Between repetitions, lifting the bat with one hand is also spoken about: *"Use both hands on the bat, even when you lift it."* | `benchmarks.ts` (`twoHands`), `stanceAnalyzer.ts` (`handsApart`), `live.tsx` |
| Explain the teaching well | New demo steps **Common mistakes** (stance, defence, drive) and **What the camera checks** (stance). Steps on the head (neck), hands (both hands) and bat rewritten. Stance lesson: new sections *Feet on one line*, *The bat: what beginners get wrong*, *How the camera checks you*; 3 new quiz questions. Defence lesson: *Start from a good stance*, *Common mistakes*. | `src/data/skills.ts`, `src/data/curriculum.ts`, `stance-guide.tsx` |

---

# Changes in this version (field test fixes, October 2026)

| Problem seen in testing | What changed | Main files |
|---|---|---|
| The bat was "Not seen", yet the stance still counted as good | The stance now **needs the bat**. If the bat cannot be seen, the Bat check turns red, the wrists are ringed, the app says *"I cannot see your bat. Hold it with both hands together on the handle, and rest the toe on the ground just behind your back toe"*, and the repetition does not count. | `src/lib/pose/stanceAnalyzer.ts` (`refineMessages`, `REQUIRED_CHECKS`, `isGoodPosition`), `live.tsx`, `session/[id].tsx` |
| The bat was missed when held out towards the bowler (it looks short from the side) | The bat search also tries a shorter bat, in the direction the hands point. A bat resting down along the leg (the right stance) is now accepted when the hands agree. Seen with one hand hidden, the bat is still worked out from the other hand. A bat found a moment ago is kept for 5 frames, so a held stance is not reset by one missed frame. | `src/lib/pose/batDetect.ts`, `src/lib/pose/poseHtml.ts` (`findBat`, `handBat`) |
| Beginners hold the bat wrongly and are not told how | Each wrong bat gets its own correction: **up in the air**, **pointing at the bowler**, **sticking out behind**, **toe out in front**, **too far out from the body** ("bring it in close, toe just behind your back toe"). Result screen shows the same words. | `stanceAnalyzer.ts` (`batRestFault`, `batRestMessage`), `benchmarks.ts`, `skills.ts` |
| Feet marked wrong in every stance | Feet width is now scaled by shoulders **and** legs, so a shoulder line foreshortened by the camera angle no longer makes good feet look too wide or narrow. Range slightly wider (0.85–1.6). | `stanceAnalyzer.ts` (`bodyWidth`) |
| Feet must be on one line | New check **Feet in line**: both feet side by side on one line, neither ahead of the other, toes to the side. Messages name the foot that is ahead, or say "turn your toes to the side, not at the bowler". | `benchmarks.ts` (`feetLine`), `stanceAnalyzer.ts` (`feetInLine`, `toesTowardsBowler`) |
| "Look at the bowler, not at the phone" from the side even when not looking at the phone | The bowler is now always where the front shoulder and front hip point (before, a body that looked side-on to the phone made the phone itself count as the bowler, so looking away from the phone was marked wrong). "Not at the phone" is said only when the picture shows the face turned to the phone (both ears seen, nose between them); otherwise "turn your head towards the bowler, over your front shoulder". | `stanceAnalyzer.ts` (`lookAngle`, `facingPhone`) |
| Too dark: the app should turn the light on | The camera page measures brightness twice a second. When dark for 1.5 s the app **turns a light on by itself** and says so: the **torch** on the back camera (where the phone allows it), or the **screen as a light** on the front camera (full brightness, white frame round the picture). A light button in the top bar turns it on/off. In the dark, the picture is also brightened before the pose model and the bat search see it, and for the saved photo/video. If still too dark after 6 s, it asks for a room light. | `poseHtml.ts` (`LIGHT`, `measureLight`, `applyTorch`, `modelSource`), `live.tsx`, `PoseCamera*.tsx` |

New package: `expo-brightness` (run `npx expo install expo-brightness`, or `npm install`).
Checks: `npm run test:pose` (new tests under "Field test fixes" and a short-bat case in `check-bat.ts`).

---

# Earlier changes

| Request | What changed | Main files |
|---|---|---|
| Explain the grip well; the phone camera cannot check it | Longer grip lesson (top hand, bottom hand, Vs, fingers, pressure, common mistakes). New **Check my grip** screen: take or upload a photo of the hands on the bat; the AI coach checks it. Without the server, a checklist. | `src/data/skills.ts`, `src/app/(app)/grip-check.tsx`, `src/services/coach.ts`, backend `POST /coach/grip` |
| Front view, side view also OK | Choose the phone position before practice: **In front** (where the bowler would be, default) or **At the side** (sees the chest). New set-up steps and diagram. | `src/app/(app)/setup.tsx`, `src/components/SetupDiagram.tsx`, `src/lib/pose/stanceAnalyzer.ts` (`CameraView`, `chest-on`) |
| Stance plan: 5 days, 10 → 50 | Plan rebuilt as 5-day stages; day 1 = 10, +10 a day, day 5 = 50. | `src/data/training.ts`, Practise and Home tabs, result screen |
| Check knees bent, feet apart, etc. | All stance checks still run every repetition (feet, knees, lean, shoulders, head, eyes, hands, bat). | `src/lib/pose/benchmarks.ts` |
| Tell the learner when the bat is held the wrong way | `standingSide()` detects a right-hander standing as a left-hander (or the reverse). The app says so, shows how to fix it, and counts nothing until fixed. | `src/lib/pose/stanceAnalyzer.ts`, `src/app/(app)/live.tsx` |
| Voice too fast | Speech rate 0.78 everywhere, longer gaps between cues. | `src/lib/voice.ts` |
| Stumps were in the wrong place | Removed. | `src/app/(app)/live.tsx` |
| Head and eyes judged wrongly | The phone position is now found from the body (`detectView`). Eyes are judged against the front shoulder (side view) or the phone (front view); the head is measured in the picture from the side and not judged from the front. | `src/lib/pose/stanceAnalyzer.ts` |
| The bat was not shown | The bat is also worked out from the hands (little finger → first finger, top hand → bottom hand, in 3D), drawn in yellow and judged. | `src/lib/pose/poseHtml.ts` |
| Replay the stance video | Each repetition is recorded. "Watch the last one again" between repetitions; the best one is kept on the phone and plays on the result screen at 1×, ½×, ¼×. | `src/lib/pose/poseHtml.ts`, `src/services/clips.ts`, `src/components/ClipPlayer.tsx` |
| Defence day plan: 5 steps | Stage 2: stance, footwork (front foot forward), eye contact, bring the bat down, full defence. Each step 10 on day 1 … 50 on day 5. Each step is judged only on its own checks. | `src/data/training.ts` (`DRILLS`) |
| Landmarks shake when the camera is still | One Euro filter on every landmark in the camera page. | `src/lib/pose/poseHtml.ts` (`SMOOTHING`) |

New packages: `expo-image-picker`, `expo-image-manipulator`, `expo-file-system` (run `npm install`).
Checks: `npm run typecheck`, `npm run test:pose`, and in the backend `npm run check`.

## Seventeenth round: the field, powerplays, umpires, and a steadier camera picture

- **Skeleton only when the whole body is in the picture** (`poseHtml.ts`): the landmarks are drawn only
  while the nose, both shoulders, hips, knees and ankles are seen inside the frame (with a 300 ms
  debounce), so half a body no longer shows a shaking skeleton. Recordings follow the same rule.
- **New level 5, "The field and the umpire"**, three lessons with 8-question quizzes:
  - *Fielding positions*: every position, the words in the names, close catchers, left-handers.
  - *Setting a field and powerplays*: attacking and defensive fields, fast bowler v spinner,
    two behind square on the leg side, the 30-yard circle, ODI powerplays (overs 1–10: 2 outside,
    11–40: 4, 41–50: 5) and T20 (overs 1–6: 2, then 5).
  - *Umpires and appeals*: "How's that?" before the next ball's run-up, one appeal covers all,
    the finger, walking, reviews, and the signals for four, six, wide, no-ball, bye, leg bye, free hit.
  - Lessons can link to a tool (`lesson.tool`); the field lessons open the field trainer.
- **Field trainer, "Set the field"** (`fieldTasks.ts`): tap an empty field to place a slip, a gully,
  point, cover, mid-off, mid-on and fine leg; then a batter of the other hand comes in and the slip,
  gully and square leg go on the other side. Each tap is judged by distance, with the reason.
- **Read the field: powerplay questions**: count the fielders outside the circle and say whether the
  field is allowed in that over. Four boundary positions added (deep point, deep cover,
  deep mid-wicket, deep square leg).
- **3D model**: rounded shading on every limb, a helmet grille and shine, pad ribs and knee rolls,
  glove finger rolls, a bat grip and sticker, two bails; view buttons (bowler's view, off side, side on).
- `check-content.ts` covers the new lessons, the powerplay limits and the set-the-field judging.

## Eighteenth round: a calmer voice, no false "other way round", learners further back

- **Voice**: slower (`SPEECH_RATE` 0.78 → 0.65 in `src/lib/voice.ts`). A tip never cuts off
  another tip, and the next one waits 2.5 s after the voice has *finished*. Counts, the start and
  the end still speak at once. The same tip is repeated after 12 s instead of 9 s.
- **"You are holding the bat the other way round" only when it is sure**: the whole body
  (shoulders, hips, knees, ankles) must be seen, at least two clues must agree, the reading must
  be stronger (−0.6) and last 3 s. When the body leaves the picture the message is cleared at once.
  A face close to the camera can no longer trigger it.
- **Standing further back (front view)**: the pose model keeps a smaller person (detection 0.35,
  tracking 0.4), and the smoothing grows as the body gets smaller in the picture, so the
  skeleton of a learner standing back shakes less. The whole-body rule for drawing the skeleton
  accepts visibility 0.45.

## Nineteenth round: grip, a smarter coach, view switch and a still phone

- **Phone moving or lying flat** (`src/lib/steadiness.ts`, `phoneSteady.ts`, uses `expo-sensors`):
  the gyroscope and accelerometer tell when the phone turns, shakes or lies flat. The screen
  shows "The phone is moving" (or "lying flat"), the voice says so, and nothing is judged or
  counted until the phone is still again. A quick knock (under 0.8 s) is ignored.
- **Change the view during practice**: a button under the counter ("Phone at the side" /
  "Phone in front (bowler)") switches between the side view and the bowler's view without
  leaving the practice; the voice says where to put the phone.
- **The grip**:
  - A coaching video plays first in the grip demonstration ("Cricket batting basics: Grip",
    Cricket Mentoring, whose channel allows embedding). If it cannot play, the in-app pictures
    are shown. Two grip videos added to "Learn more from videos".
  - New "Spot the mistake" (`/grip-quiz`): six grips drawn with one mistake or none (wrong hand on
    top, hands apart, hands low, Vs at the inside edge, squeezing bottom hand); the mistake is
    ringed and explained. Linked from the grip lesson, the demonstration and the Practise tab.
  - The grip picture now shows finger rolls, knuckles and the thumb.
  - The grip lesson has five new sections (why it matters, how high, fingers not palm, five
    mistakes, the three-second check) and eight quiz questions.
- **AI coach**:
  - Knows much more about the learner: scores for every skill, stance-first progress, quizzes
    to retry, days practised, last practice.
  - New instructions on the server: diagnose, one fix, a drill with numbers and a way to check;
    a quiz mode ("Quiz me…"); the facts about powerplays, field rules, appeals and signals; and
    what each part of the app does.
  - Answers end with follow-up questions (buttons) and a button that opens the right lesson or
    screen (`NEXT:` and `OPEN:` lines, parsed in `src/services/coachReply.ts`; unknown screens
    are ignored).
  - Read an answer aloud (speaker button), a "Today" card, and starters that fit the learner.
  - The stored (offline) tips cover fielding, powerplays and umpires and have buttons too.

## Twentieth round: Expo SDK 58

- Expo Go on the App Store now runs SDK 58 only, so the project moved from SDK 57 to SDK 58:
  `expo` 58.0.19, React Native 0.88, React 19.3, and every Expo module at the version SDK 58
  lists (`bundledNativeModules.json` of expo 58.0.19). react-native-webview 14,
  react-native-gesture-handler 3, reanimated 4.7, worklets 0.13.
- Type changes in React Native 0.88: refs to views use `ComponentRef<typeof View>`.
- react-native-webview 14 types its component so that every prop reads as `never`;
  `src/components/AppWebView.ts` re-exports it with plain props (no change at run time).
- Checked: type check, all `test:pose` checks, a web build and a web run of the grip quiz and the coach.

## Twenty-first round: choose the AI, and answers in Sinhala

- The coach server works with Google Gemini, Claude (Anthropic) or Groq; `server/.env.example`
  has a ready block for each (Gemini recommended: free tier and good Sinhala).
- The coach answers in the learner's language: Sinhala script, Tamil or English; Singlish is
  answered in Sinhala script. Cricket words stay in English. Follow-up buttons come in the same
  language; the NEXT and OPEN keywords stay in English.
- `LLM_MAX_TOKENS` default 900 (Sinhala needs more tokens). `LLM_TEMPERATURE` setting; it is left
  out for Claude, whose newer models refuse values below 1.
- Groq's default in the example is now `openai/gpt-oss-120b` (the 20b model was weak).
- Reading an answer aloud uses a Sinhala or Tamil voice for Sinhala or Tamil text, if the phone has one.

## Twenty-second round: 50 good stances before the shots

- `STANCE_FIRST_REPS` is now 50 (was 10): every camera practice except the stance stays locked
  until 50 good stances have been held with the camera, over all days.
- The learner sees the progress everywhere: on the Practise tab (bar and "x of 50"), on each
  locked skill, during the stance practice ("Shots open at 50 good stances: 23 done, 27 to go"),
  and on the result screen. The fiftieth stance is announced by the voice, and the result screen
  says that all the shots are open.
- The coach server and `scripts/seed-test-users.mjs` (now 50 test stances) follow the new number.

## Twenty-third round: my matches

- After a real match the learner adds their own figures (`/matches/edit`): the day, the other
  team, the kind of match, the result; how the innings ended (all 11 ways out, not out, retired,
  did not bat), runs, balls faced, fours and sixes; overs, runs given and wickets; catches; notes.
  Impossible figures are caught (more runs in fours and sixes than the score, 4.6 overs...).
- "My matches" (`/matches`, also on the home screen) shows every figure, worked out the way
  cricket statistics are: matches, innings, not outs, runs, highest (140* for not out), average
  (runs per dismissal), strike rate, 50s and 100s, ducks, fours, sixes, matches won, the last five
  scores, how the learner gets out, wickets, best bowling, bowling average, economy, catches.
  Each match can be changed or deleted.
- The profile shows the headline: matches, runs, best and average, with "Add a match".
- Saved in Firestore under `users/{uid}/matches` (the existing rules already cover it); the
  backends gained `remove()` for deleting one record.
- The AI coach knows the match figures and links the way the learner gets out to what to practise.
- `check-content.ts` checks the figures (average, strike rate, best, 50s/100s, ducks, best
  bowling, economy, overs) and the checks on the form.

## Twenty-fourth round: say why the shots are open

- The Practise tab now always shows the stance-first count. Before 50: "The stance comes first"
  with the bar. After 50: "The shots are open: you have held N good stances (50 were needed)".
  (Field report, 25 October 2026: the shots looked open by mistake; the account already had more
  than 50 good stances from earlier testing, which was not shown anywhere.)
