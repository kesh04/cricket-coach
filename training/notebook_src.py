# %% [markdown]
# # Cricket Coach: labelling and training the position classifier
#
# This notebook builds the app's own technique model from **our own labelled clips** of beginner
# batters. It is the "Model Training Notebook" of the report (Appendix E).
#
# | Step | What it does | Output (in Google Drive) |
# |---|---|---|
# | 1 | Install, download the pose model, connect Google Drive | |
# | 2 | Settings: skills, classes, and which rule check explains each fault | |
# | 3 | **Labelling tool**: watch each clip, press its class | `dataset/<skill>/<class>/…`, `labels_log.csv` |
# | 4 | Second rater / re-label 20 % of the clips, Cohen's kappa | `labels_<rater>.csv`, `results/label_agreement.csv` |
# | 5 | Landmark extraction (MediaPipe Pose Landmarker, the same model as the app), 10 frames a second | `landmarks/…json` |
# | 6 | Features (138 per frame, the same code as the app) | `results/features.csv` |
# | 7 | Dataset table and plots | `results/dataset_summary.csv`, `dataset_<skill>.png` |
# | 8 | Train Random Forest, MLP, Logistic Regression, XGBoost and SVM with **person-wise** 5-fold cross-validation | `results/results.csv` |
# | 9 | Per-class precision / recall / F1, confusion matrices, McNemar's test | `results/per_class.csv`, `confusion_<skill>.png` |
# | 10 | Random Forest feature importance | `importance_<skill>.png` |
# | 11 | Speed and size of each model | `results/speed_size.csv` |
# | 12 | Train the chosen model on all data and **export it for the app** | `export/<skill>_model.json` |
# | 13 | Classify a new, unseen clip | |
# | 13–15 | Experiment 1A (four classes), 1C (drive tuning), 1D (drive finish as one example) | `results_4class.csv`, `experiment_drive_*.csv` |
#
# **Pose estimation vs. our model.** MediaPipe only finds the 33 body points (where the knees,
# hips, wrists… are). It does not know anything about cricket. Deciding whether a stance or a shot
# is correct, and which fault it shows, is done by the classifier trained here on our labelled data.
#
# Run the cells from top to bottom (Runtime → Run all works after the labelling is done).
# If Colab asks you to **restart the session** after the first cell installs MediaPipe, press
# Restart and run the cells again from the top (the install is then already done).

# %%
# 1. Install, pose model, Google Drive
import os, sys, json, math, re, time, shutil, random, glob
IN_COLAB = 'google.colab' in sys.modules
TEST_MODE = os.environ.get('CC_TEST_MODE') == '1'   # used only to test this notebook without Colab

if IN_COLAB:
    !pip -q install mediapipe
    from google.colab import drive
    drive.mount('/content/drive')

MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
MODEL_FILE = 'pose_landmarker_lite.task'  # the same model the app runs on the phone
if not TEST_MODE and not os.path.exists(MODEL_FILE):
    import urllib.request
    urllib.request.urlretrieve(MODEL_URL, MODEL_FILE)
print('ready')

# %% [markdown]
# ## 2. Settings
#
# * `ROOT` is the project folder in your Google Drive. Inside it:
#   * `unlabelled/<skill>/` – put new clips (or photos) here; the labelling tool moves them out.
#   * `dataset/<skill>/<class>/` – labelled clips. You may also copy clips straight into these
#     folders if they are already sorted.
# * **File names**: `p01_R_side_01.mp4` = participant `p01`, right-handed (`R`, or `L`), phone at the
#   `side` (or `front`), take 1. The labelling tool renames clips to this pattern for you.
#   The participant number is important: frames of one person are never in both the training and
#   the test data.
# * Clips: 3–6 s, one held position each. Photos (`.jpg`, `.png`) count as a one-frame clip.
# * Film with the **back camera**, or turn off "mirror front camera". A mirrored clip swaps left
#   and right; if a clip is mirrored, put `_mir` in its name and it is flipped back.
# * `FAULTS` links each fault class to the app's rule check (in `src/lib/pose/benchmarks.ts`) whose
#   correction is spoken when the model finds that fault: `('feet', 'low')` → the `feet` check's
#   "too low" message, "Move your feet a little wider."

# %%
ROOT = os.environ.get('CC_ROOT', '/content/drive/MyDrive/CricketCoach')

# Every camera skill of the app. Remove a skill (or a class) you have no clips for yet: a skill
# needs at least two classes with clips to be trained. Class names must match the folder names.
SKILLS = {
    'stance':      ['correct', 'feet_too_close', 'too_upright', 'hands_out'],
    'defence':     ['correct', 'no_step', 'front_knee_straight', 'head_back'],
    'drive':       ['correct', 'no_step', 'low_finish', 'head_back'],
    'backdefence': ['correct', 'no_back_step', 'weight_forward', 'elbow_low'],
    'pull':        ['correct', 'no_back_step', 'weight_forward', 'hands_low'],
    'cut':         ['correct', 'no_back_step', 'weight_forward', 'arms_bent'],
    'sweep':       ['correct', 'no_step', 'not_low', 'front_knee_straight'],
}
CORRECT = 'correct'

# Which rule check (src/lib/pose/benchmarks.ts) explains each fault, and whether the measure is
# too low or too high. Its correction is what the app says when the model finds the fault.
FAULTS = {
    'stance':      {'feet_too_close': ('feet', 'low'), 'too_upright': ('knees', 'high'), 'hands_out': ('handsIn', 'high')},
    'defence':     {'no_step': ('stride', 'low'), 'front_knee_straight': ('frontKnee', 'high'), 'head_back': ('headOver', 'low')},
    'drive':       {'no_step': ('stride', 'low'), 'low_finish': ('finish', 'low'), 'head_back': ('headOver', 'low')},
    'backdefence': {'no_back_step': ('shortStep', 'low'), 'weight_forward': ('weightBack', 'high'), 'elbow_low': ('elbow', 'low')},
    'pull':        {'no_back_step': ('shortStep', 'low'), 'weight_forward': ('weightBack', 'high'), 'hands_low': ('highHands', 'low')},
    'cut':         {'no_back_step': ('shortStep', 'low'), 'weight_forward': ('weightBack', 'high'), 'arms_bent': ('reach', 'low')},
    'sweep':       {'no_step': ('stride', 'low'), 'not_low': ('crouch', 'high'), 'front_knee_straight': ('sweepKnee', 'high')},
}

LABEL_CRITERIA = {  # shown in the labelling tool (Appendix C of the report)
    'stance/correct': 'Feet about shoulder-width apart, side-on; knees slightly bent; head level, eyes on the bowler; hands close to the front thigh.',
    'stance/feet_too_close': 'Feet clearly less than shoulder-width apart.',
    'stance/too_upright': 'Knees straight and trunk upright, no flex at the hips or knees.',
    'stance/hands_out': 'Hands and bat held clearly out in front of the body, away from the thighs.',
    'defence/correct': 'Comfortable step forward, front knee bent with the head over it, back leg nearly straight, bat close to the front pad.',
    'defence/no_step': 'Front foot stays close to the back foot; little or no step towards the ball.',
    'defence/front_knee_straight': 'A step is taken but the front knee stays straight.',
    'defence/head_back': 'The head stays behind the front knee instead of over it.',
    'drive/correct': 'Step to the ball, front knee bent, head over it, high finish with the bat over the front shoulder.',
    'drive/no_step': 'Little or no step towards the ball.',
    'drive/low_finish': 'The hands and bat finish low, not over the front shoulder.',
    'drive/head_back': 'The head stays behind the front knee at the finish.',
    'backdefence/correct': 'Short step back and across with the back foot, weight and head over the back foot, front leg light, front elbow high, bat straight.',
    'backdefence/no_back_step': 'The back foot does not move back; the feet stay where they were in the stance.',
    'backdefence/weight_forward': 'A step back is taken but the head and weight stay forward, over the front foot.',
    'backdefence/elbow_low': 'Position on the back foot, but the front elbow is low (below the hands).',
    'pull/correct': 'Step back, weight and head over the back foot, hands about shoulder height or higher at the finish, front elbow up.',
    'pull/no_back_step': 'The back foot does not move back.',
    'pull/weight_forward': 'The head and weight stay forward, over the front foot.',
    'pull/hands_low': 'The hands finish low, below the shoulders.',
    'cut/correct': 'Step back and across, weight on the back foot, arms reaching out towards the off side, hands high at the finish.',
    'cut/no_back_step': 'The back foot does not move back and across.',
    'cut/weight_forward': 'The head and weight stay forward, over the front foot.',
    'cut/arms_bent': 'The arms stay bent and close to the body instead of reaching out to the ball.',
    'sweep/correct': 'Long step forward, front knee deeply bent, hips low, head over the front knee, hands and bat low near the ground.',
    'sweep/no_step': 'Little or no step forward.',
    'sweep/not_low': 'The hips stay high; the batter does not get down into the shot.',
    'sweep/front_knee_straight': 'A step is taken but the front knee is not bent deeply.',
}

# With only a few clips of each fault, a model cannot learn the faults apart. 'auto' merges the
# faults of a skill into one class, 'fault', when any of its fault classes has fewer than
# MIN_FAULT_CLIPS clips: the model then decides correct or not, and the app's rule checks say
# which part to fix. True: always merge. False: never merge.
MERGE_FAULTS = True        # the app's models decide correct / fault; Experiment 1A (section 13) compares four classes
MIN_FAULT_CLIPS = 10
FAULT = 'fault'

# Shots the app judges at their held finish: only the last part of each clip is used for them
# (0.6 = the last 40 % of the usable frames). Earlier frames of a correct drive (before the step)
# look like a fault and would teach the model the wrong thing. Other skills use every frame.
FINISH_FROM = {'drive': 0.6, 'pull': 0.6}

DEFAULT_HAND = 'right'      # used when a file name has no _R_ / _L_
DEFAULT_VIEW = 'side'
SAMPLE_FPS = 10             # frames per second taken from each clip
TRIM = 0.15                 # drop the first and last 15 % (moving into and out of position)
N_FOLDS = 5
GOOD_PROB = 0.6             # the app counts a position as good when P(correct) >= this
MAX_MODEL_KB = 2048         # largest model file the app should carry
SEED = 42

VIDEO_EXT = ('.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm', '.3gp')
IMAGE_EXT = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')
D = lambda *p: os.path.join(ROOT, *p)
for skill, classes in SKILLS.items():
    os.makedirs(D('unlabelled', skill), exist_ok=True)
    for c in classes:
        os.makedirs(D('dataset', skill, c), exist_ok=True)
for sub in ('landmarks', 'results', 'export', 'excluded'):
    os.makedirs(D(sub), exist_ok=True)
random.seed(SEED)
print('Project folder:', ROOT)
for skill in SKILLS:
    n_in = len([f for f in os.listdir(D('unlabelled', skill)) if f.lower().endswith(VIDEO_EXT + IMAGE_EXT)])
    n_ds = {c: len([f for f in os.listdir(D('dataset', skill, c)) if f.lower().endswith(VIDEO_EXT + IMAGE_EXT)]) for c in SKILLS[skill]}
    print(f'  {skill:8s} unlabelled: {n_in:4d}   labelled: {n_ds}')

# %% [markdown]
# ### Features: the same code as the app
# The next cell writes `features.py`. It is a copy of `training/features.py` in the app project,
# the twin of `src/lib/pose/features.ts`. Do not edit one without the other.

# %%
# @@FEATURES@@
from features import extract_features, FEATURE_NAMES, FEATURE_COUNT, FEATURE_VERSION
print(FEATURE_COUNT, 'features, version', FEATURE_VERSION)

# %% [markdown]
# ## 3. Labelling tool
# Choose the skill, then for each clip: watch it, check the participant / hand / phone position,
# and press the class that matches the labelling criteria. The clip is renamed
# (`p01_R_side_03.mp4`) and moved into `dataset/<skill>/<class>/`. **Exclude** moves a clip that
# cannot be used (body out of view, two positions in one clip…) to `excluded/`. Every decision is
# written to `labels_log.csv`.

# %%
import cv2, base64, csv, datetime
import numpy as np

NAME_RE = re.compile(r'(?i)^(p\d+)[_-]([RL])[_-](side|front)(?:[_-](\d+))?')

def parse_name(fname):
    """participant, hand, view from a file name like p01_R_side_01.mp4."""
    m = NAME_RE.match(os.path.basename(fname))
    if not m:
        return None, DEFAULT_HAND, DEFAULT_VIEW
    return m.group(1).lower(), 'right' if m.group(2).upper() == 'R' else 'left', m.group(3).lower()

def read_frames_for_preview(path, n=3, height=240):
    """n frames from 25 %…75 % of a clip, side by side, as PNG bytes."""
    if path.lower().endswith(IMAGE_EXT):
        img = cv2.imread(path)
        frames = [img] if img is not None else []
    else:
        cap = cv2.VideoCapture(path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        frames = []
        for k in range(n):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * (0.25 + 0.5 * k / max(1, n - 1))))
            ok, f = cap.read()
            if ok:
                frames.append(f)
        cap.release()
    if not frames:
        return None
    frames = [cv2.resize(f, (int(f.shape[1] * height / f.shape[0]), height)) for f in frames]
    ok, png = cv2.imencode('.png', np.hstack(frames))
    return png.tobytes() if ok else None

def next_name(skill, participant, hand, view, ext):
    """A file name not used yet in any class folder of the skill (so every clip name is unique)."""
    h = 'R' if hand == 'right' else 'L'
    used = {os.path.splitext(f)[0].replace('_mir', '') for c in SKILLS[skill] for f in os.listdir(D('dataset', skill, c))}
    take = 1
    while f'{participant}_{h}_{view}_{take:02d}' in used:
        take += 1
    return f'{participant}_{h}_{view}_{take:02d}{ext.lower()}'

def log_label(row):
    path = D('labels_log.csv')
    new = not os.path.exists(path)
    with open(path, 'a', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['time', 'rater', 'skill', 'class', 'original', 'file'])
        if new:
            w.writeheader()
        w.writerow(row)

def labelling_tool(skill, rater='researcher'):
    import ipywidgets as W
    from IPython.display import display, HTML
    files = sorted(f for f in os.listdir(D('unlabelled', skill)) if f.lower().endswith(VIDEO_EXT + IMAGE_EXT))
    state = {'i': 0, 'participant': 'p01', 'hand': DEFAULT_HAND, 'view': DEFAULT_VIEW}
    title = W.HTML()
    strip = W.Image(format='png', layout=W.Layout(max_width='100%'))
    player = W.Output()
    criteria = W.HTML('<br>'.join(f'<b>{c}</b>: {LABEL_CRITERIA.get(f"{skill}/{c}", "")}' for c in SKILLS[skill]))
    participant = W.Text(description='Participant', layout=W.Layout(width='220px'))
    hand = W.ToggleButtons(options=[('Right-handed', 'right'), ('Left-handed', 'left')], description='Hand')
    view = W.ToggleButtons(options=[('Phone at the side', 'side'), ('Phone in front', 'front')], description='Phone')
    msg = W.HTML()
    buttons = [W.Button(description=c, button_style='success' if c == CORRECT else 'warning', layout=W.Layout(width='190px')) for c in SKILLS[skill]]
    exclude = W.Button(description='Exclude (not usable)', button_style='danger', layout=W.Layout(width='190px'))
    skip = W.Button(description='Skip for now', layout=W.Layout(width='140px'))

    def show():
        if state['i'] >= len(files):
            title.value = f'<h3>{skill}: no more clips in unlabelled/{skill}/ </h3>'
            strip.value = b''
            player.clear_output()
            return
        f = files[state['i']]
        p, h, v = parse_name(f)
        participant.value = p or state['participant']
        hand.value = h if p else state['hand']
        view.value = v if p else state['view']
        title.value = f'<h3>{skill} – clip {state["i"] + 1} of {len(files)}: {f}</h3>'
        png = read_frames_for_preview(D('unlabelled', skill, f))
        strip.value = png or b''
        player.clear_output()
        if f.lower().endswith(VIDEO_EXT) and os.path.getsize(D('unlabelled', skill, f)) < 25e6:
            data = base64.b64encode(open(D('unlabelled', skill, f), 'rb').read()).decode()
            with player:
                display(HTML(f'<video src="data:video/mp4;base64,{data}" controls autoplay loop muted style="max-height:360px"></video>'))

    def decide(cls):
        if state['i'] >= len(files):          # no clip left (a button pressed twice, or the list is done)
            show()
            return
        f = files[state['i']]
        if not os.path.exists(D('unlabelled', skill, f)):   # already moved (a double click)
            state['i'] += 1
            show()
            return
        state.update(participant=participant.value.strip().lower() or 'p00', hand=hand.value, view=view.value)
        src = D('unlabelled', skill, f)
        ext = os.path.splitext(f)[1]
        if cls is None:
            dest_dir = D('excluded', skill)
            os.makedirs(dest_dir, exist_ok=True)
            name = f
        else:
            dest_dir = D('dataset', skill, cls)
            name = next_name(skill, state['participant'], state['hand'], state['view'], ext)
            if '_mir' in f.lower():
                name = name.replace(ext.lower(), '_mir' + ext.lower())
        shutil.move(src, os.path.join(dest_dir, name))
        log_label({'time': datetime.datetime.now().isoformat(timespec='seconds'), 'rater': rater, 'skill': skill,
                   'class': cls or 'EXCLUDED', 'original': f, 'file': name})
        msg.value = f'✔ {f} → {"excluded" if cls is None else cls + "/" + name}'
        state['i'] += 1
        show()

    for b in buttons:
        b.on_click(lambda _, c=b.description: decide(c))
    exclude.on_click(lambda _: decide(None))
    skip.on_click(lambda _: (state.update(i=min(state['i'] + 1, len(files))), show()))
    display(W.VBox([title, strip, player, W.HBox([participant]), hand, view, criteria, W.HBox(buttons), W.HBox([exclude, skip]), msg]))
    show()

if IN_COLAB:
    import ipywidgets as W
    from IPython.display import display
    pick = W.Dropdown(options=list(SKILLS), description='Skill')
    go = W.Button(description='Start labelling', button_style='primary')
    out = W.Output()
    def _start(_):
        out.clear_output()
        with out:
            labelling_tool(pick.value)
    go.on_click(_start)
    display(W.HBox([pick, go]), out)

# %% [markdown]
# ## 4. Label agreement (second rater, and the researcher again after two weeks)
# A second rater (a qualified coach) labels a random 20 % of the clips without seeing the first
# label. Two weeks later the researcher re-labels another 20 %. Each run writes
# `labels_<rater>.csv`. The next cell compares them with the folder labels (Cohen's kappa;
# 0.61 or more is "substantial" agreement).

# %%
def all_clips():
    rows = []
    for skill, classes in SKILLS.items():
        for c in classes:
            for f in sorted(os.listdir(D('dataset', skill, c))):
                if f.lower().endswith(VIDEO_EXT + IMAGE_EXT):
                    rows.append({'skill': skill, 'label': c, 'file': f, 'path': D('dataset', skill, c, f)})
    return rows

def relabel_tool(rater, fraction=0.2, seed=None):
    """Blind re-labelling of a random share of the labelled clips (the label is not shown)."""
    import ipywidgets as W
    from IPython.display import display, HTML
    out_path = D(f'labels_{rater}.csv')
    done = set()
    if os.path.exists(out_path):
        done = {(r['skill'], r['file']) for r in csv.DictReader(open(out_path))}
    clips = all_clips()
    rng = random.Random(seed if seed is not None else sum(ord(ch) for ch in rater))
    sample = [c for c in rng.sample(clips, max(1, int(len(clips) * fraction))) if (c['skill'], c['file']) not in done] if clips else []
    state = {'i': 0}
    title, strip, player, msg = W.HTML(), W.Image(format='png'), W.Output(), W.HTML()
    row = W.HBox()

    def show():
        if state['i'] >= len(sample):
            title.value = f'<h3>Done: {len(done) + state["i"]} clips labelled by {rater}</h3>'
            strip.value = b''
            row.children = []
            player.clear_output()
            return
        c = sample[state['i']]
        title.value = f'<h3>{rater}: clip {state["i"] + 1} of {len(sample)} – skill: {c["skill"]}</h3>'
        strip.value = read_frames_for_preview(c['path']) or b''
        player.clear_output()
        if c['path'].lower().endswith(VIDEO_EXT) and os.path.getsize(c['path']) < 25e6:
            data = base64.b64encode(open(c['path'], 'rb').read()).decode()
            with player:
                display(HTML(f'<video src="data:video/mp4;base64,{data}" controls autoplay loop muted style="max-height:360px"></video>'))
        btns = []
        for cls in SKILLS[c['skill']]:
            b = W.Button(description=cls, layout=W.Layout(width='190px'))
            b.on_click(lambda _, cls=cls: choose(cls))
            btns.append(b)
        row.children = btns

    def choose(cls):
        if state['i'] >= len(sample):
            show()
            return
        c = sample[state['i']]
        new = not os.path.exists(out_path)
        with open(out_path, 'a', newline='') as f:
            w = csv.DictWriter(f, fieldnames=['skill', 'file', 'label', 'rater', 'time'])
            if new:
                w.writeheader()
            w.writerow({'skill': c['skill'], 'file': c['file'], 'label': cls, 'rater': rater, 'time': datetime.datetime.now().isoformat(timespec='seconds')})
        msg.value = f'saved {c["file"]}'
        state['i'] += 1
        show()

    display(W.VBox([title, strip, player, row, msg]))
    show()

# Run ONE of these, by the person named (uncomment):
# relabel_tool('coach', fraction=0.2)          # second rater
# relabel_tool('researcher_week2', fraction=0.2, seed=7)   # the researcher again, two weeks later

# %%
import pandas as pd
from sklearn.metrics import cohen_kappa_score

def label_agreement():
    truth = {(c['skill'], c['file']): c['label'] for c in all_clips()}
    rows = []
    for path in sorted(glob.glob(D('labels_*.csv'))):
        if path.endswith('labels_log.csv'):
            continue
        df = pd.read_csv(path)
        df = df[[(s, f) in truth for s, f in zip(df.skill, df.file)]]
        if df.empty:
            continue
        rater = os.path.basename(path)[7:-4]
        for skill in ['all'] + list(SKILLS):
            d = df if skill == 'all' else df[df.skill == skill]
            if len(d) < 2:
                continue
            a = [truth[(s, f)] for s, f in zip(d.skill, d.file)]
            b = list(d.label)
            rows.append({'rater': rater, 'skill': skill, 'clips': len(d), 'agreement': np.mean([x == y for x, y in zip(a, b)]),
                         'kappa': cohen_kappa_score(a, b) if len(set(a) | set(b)) > 1 else float('nan')})
    out = pd.DataFrame(rows)
    if len(out):
        out.to_csv(D('results', 'label_agreement.csv'), index=False)
    return out

label_agreement()

# %% [markdown]
# ## 5. Landmark extraction
# Every clip is sampled at 10 frames per second; the first and last 15 % are dropped; frames in
# which the shoulders, hips, knees and feet are not clearly seen are dropped (the same rule the
# app uses before it judges). Landmarks are saved next to the project (`landmarks/…json`), so this
# runs only once per clip. The JSON is the same format as the app's `tools/extract_landmarks.py`.

# %%
REQUIRED = [(11, 12), (23, 24), (25, 26), (27, 28)]   # shoulders, hips, knees, ankles

def usable(lm):
    vis = lambda j: lm[j * 4 + 3]
    if max(vis(0), vis(7), vis(8)) < 0.5:                    # head: nose or an ear
        return False
    for a, b in REQUIRED:
        if max(vis(a), vis(b)) < 0.5 or min(vis(a), vis(b)) < 0.2:
            return False
    return True

def make_landmarker(video):
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision
    opts = vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=MODEL_FILE),
        running_mode=vision.RunningMode.VIDEO if video else vision.RunningMode.IMAGE,
        num_poses=1, min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5)
    return vision.PoseLandmarker.create_from_options(opts)

def to_lists(result):
    lm, world = [], []
    for p in result.pose_landmarks[0]:
        lm += [p.x, p.y, p.z, p.visibility]
    for p in result.pose_world_landmarks[0]:
        world += [p.x, p.y, p.z]
    return lm, world

def prepare(bgr, mirrored):
    h, w = bgr.shape[:2]
    if h > 960:
        bgr = cv2.resize(bgr, (int(w * 960 / h), 960))
    if mirrored:
        bgr = cv2.flip(bgr, 1)
    return bgr

def extract_clip(path):
    import mediapipe as mp
    mirrored = '_mir' in os.path.basename(path).lower()
    if path.lower().endswith(IMAGE_EXT):
        bgr = cv2.imread(path)
        if bgr is None:
            return {'fps': 0, 'aspect': None, 'frames': [], 'sampled': 0}
        bgr = prepare(bgr, mirrored)
        with make_landmarker(False) as lmk:
            res = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
        frames = []
        if res.pose_landmarks:
            lm, world = to_lists(res)
            frames.append({'t': 0, 'lm': lm, 'world': world})
        return {'fps': 0, 'aspect': bgr.shape[1] / bgr.shape[0], 'frames': frames, 'sampled': 1}
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:                                      # some phones do not store the count
        total = 0
        while cap.grab():
            total += 1
        cap.release()
        cap = cv2.VideoCapture(path)
    start, end = total * TRIM, total * (1 - TRIM)
    step = max(1.0, fps / SAMPLE_FPS)
    frames, aspect, n, next_take, sampled = [], None, 0, start, 0
    with make_landmarker(True) as lmk:
        while True:
            ok, bgr = cap.read()
            if not ok or n > end:
                break
            if n >= next_take:
                next_take += step
                bgr = prepare(bgr, mirrored)
                aspect = bgr.shape[1] / bgr.shape[0]
                t = int(n * 1000 / fps)
                res = lmk.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)), t)
                sampled += 1
                if res.pose_landmarks:
                    lm, world = to_lists(res)
                    frames.append({'t': t, 'lm': lm, 'world': world})
            n += 1
    cap.release()
    return {'fps': fps, 'aspect': aspect, 'frames': frames, 'sampled': sampled}

def cache_path(skill, label, f):
    return D('landmarks', skill, label, os.path.splitext(f)[0] + '.json')

clips = all_clips()
todo = [c for c in clips if not os.path.exists(cache_path(c['skill'], c['label'], c['file']))]
print(f'{len(clips)} labelled clips, {len(todo)} to extract')
for k, c in enumerate(todo):
    data = extract_clip(c['path'])
    os.makedirs(os.path.dirname(cache_path(c['skill'], c['label'], c['file'])), exist_ok=True)
    with open(cache_path(c['skill'], c['label'], c['file']), 'w') as fh:
        json.dump(data, fh)
    print(f'[{k + 1}/{len(todo)}] {c["skill"]}/{c["label"]}/{c["file"]}: {len(data["frames"])} of {data["sampled"]} frames with a body')

# %% [markdown]
# ## 6. Features
# Each usable frame becomes one example, labelled with its clip's class, or "fault" when the faults
# are merged (`MERGE_FAULTS`, used by the app). For the drive and the pull only the finish of each clip
# is kept (`FINISH_FROM`). Every frame, with its four-class label, is also saved in `features_all.csv`
# for Experiments 1A, 1C and 1D. Left-handed batters are
# handled inside the features (left and right are swapped and the body mirrored), so one model
# serves both.

# %%
MERGED = set()
for skill_, classes_ in SKILLS.items():
    counts = {c: len([f for f in os.listdir(D('dataset', skill_, c)) if f.lower().endswith(VIDEO_EXT + IMAGE_EXT)]) for c in classes_}
    faults = {c: n for c, n in counts.items() if c != CORRECT and n > 0}
    if MERGE_FAULTS is True or (MERGE_FAULTS == 'auto' and faults and min(faults.values()) < MIN_FAULT_CLIPS):
        MERGED.add(skill_)
        print(f'{skill_}: faults merged into one class "{FAULT}" ({sum(faults.values())} clips: {faults}); correct: {counts.get(CORRECT, 0)} clips')

rows, RAW, clip_info = [], [], []
for c in all_clips():
    p = cache_path(c['skill'], c['label'], c['file'])
    if not os.path.exists(p):
        continue
    data = json.load(open(p))
    participant, hand, view = parse_name(c['file'])
    participant = participant or os.path.splitext(c['file'])[0]
    kept = [fr for fr in data['frames'] if usable(fr['lm'])]
    clip_info.append({**{k: c[k] for k in ('skill', 'label', 'file')}, 'participant': participant, 'hand': hand, 'view': view,
                      'sampled': data.get('sampled', len(data['frames'])), 'with_body': len(data['frames']), 'usable_frames': len(kept)})
    for i, fr in enumerate(kept):
        feats = extract_features(fr['world'], fr['lm'], hand, data.get('aspect'))
        label = FAULT if c['skill'] in MERGED and c['label'] != CORRECT else c['label']
        rows.append([c['skill'], label, c['label'], f"{c['label']}/{c['file']}", participant, hand, view, fr['t'], (i + 1) / len(kept)] + feats)
        RAW.append({'world': fr['world'], 'lm': fr['lm'], 'hand': hand, 'aspect': data.get('aspect')})

META = ['skill', 'label', 'label_4class', 'clip', 'participant', 'hand', 'view', 't', 'pos']
df_all = pd.DataFrame(rows, columns=META + FEATURE_NAMES)
df_all.to_csv(D('results', 'features_all.csv'), index=False)        # every usable frame (Experiments 1A, 1C, 1D)
# Temporal frame selection: the finish of the drive and the pull only (FINISH_FROM)
keep = (df_all.pos >= df_all.skill.map(FINISH_FROM).fillna(0)).values
RAW = [r for r, k in zip(RAW, keep) if k]
df = df_all[keep].reset_index(drop=True)
clips_df = pd.DataFrame(clip_info)
df.to_csv(D('results', 'features.csv'), index=False)
print(df.groupby('skill').size().rename('frames used').to_string())
print(dict(df.label.value_counts()))
print(df.shape[0], 'frames,', len(clips_df), 'clips,', df.participant.nunique() if len(df) else 0, 'participants')

# %% [markdown]
# ## 7. Dataset table and plots (Table 5.5 and Figure 5.1 of the report)

# %%
import matplotlib
if not IN_COLAB:
    matplotlib.use('Agg')
import matplotlib.pyplot as plt

def dataset_summary():
    out = []
    for skill, classes in SKILLS.items():
        for c in classes:
            d = clips_df[(clips_df.skill == skill) & (clips_df.label == c)] if len(clips_df) else clips_df
            recorded = len([f for f in os.listdir(D('dataset', skill, c)) if f.lower().endswith(VIDEO_EXT + IMAGE_EXT)])
            usable_clips = int((d.usable_frames > 0).sum()) if len(d) else 0
            out.append({'skill': skill, 'class': c, 'clips_recorded': recorded, 'usable_clips': usable_clips,
                        'frames': int(d.usable_frames.sum()) if len(d) else 0,
                        'participants': int(d[d.usable_frames > 0].participant.nunique()) if len(d) else 0})
    s = pd.DataFrame(out)
    tot = {'skill': 'Total', 'class': '', 'clips_recorded': s.clips_recorded.sum(), 'usable_clips': s.usable_clips.sum(),
           'frames': s.frames.sum(), 'participants': clips_df[clips_df.usable_frames > 0].participant.nunique() if len(clips_df) else 0}
    s = pd.concat([s, pd.DataFrame([tot])], ignore_index=True)
    s.to_csv(D('results', 'dataset_summary.csv'), index=False)
    return s

summary = dataset_summary()
excluded = {k: len(os.listdir(D('excluded', k))) if os.path.isdir(D('excluded', k)) else 0 for k in SKILLS}
print('Clips excluded while labelling:', excluded)
display(summary) if IN_COLAB else print(summary.to_string())

for skill, classes in SKILLS.items():
    d = summary[summary.skill == skill]
    if d.frames.sum() == 0:
        continue
    fig, ax = plt.subplots(1, 2, figsize=(10, 3.2))
    ax[0].bar(d['class'], d.usable_clips, color='#2a7f62'); ax[0].set_title(f'{skill}: usable clips per class')
    ax[1].bar(d['class'], d.frames, color='#3b6ea5'); ax[1].set_title(f'{skill}: frames per class')
    for a in ax:
        a.tick_params(axis='x', rotation=20)
    plt.tight_layout(); plt.savefig(D('results', f'dataset_{skill}.png'), dpi=150); plt.show() if IN_COLAB else plt.close()

# %% [markdown]
# ## 8. Training and person-wise cross-validation (Table 5.6)
# Five models get the **same features** and the **same five folds**: Random Forest, MLP,
# Logistic Regression, XGBoost and SVM. The SVM is compared only: it is not exported to the app
# (an RBF-kernel SVM has to compare every frame with all its support vectors, too slow and large
# for a phone, and it gives no probabilities without extra calibration). To keep training quick,
# the SVM is trained on at most `SVM_MAX_FRAMES` frames per fold (a stratified sample). The folds are made by
# participant (`StratifiedGroupKFold`), so a person's frames are never in both the training and the
# test part. Reported: frame accuracy, macro F1-score (each class counts equally), and clip
# accuracy (the class most frames of a clip were given).

# %%
from sklearn.model_selection import StratifiedGroupKFold, GroupKFold
from sklearn.ensemble import RandomForestClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import accuracy_score, f1_score, classification_report, confusion_matrix, ConfusionMatrixDisplay
from sklearn.base import clone

from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.svm import SVC
from sklearn.model_selection import train_test_split
try:
    import xgboost as xgb
except ImportError:
    xgb = None
    print('xgboost is not installed: XGBoost is left out (in Colab it is installed already).')

SVM_MAX_FRAMES = 4000

class TextMLP(MLPClassifier):
    """MLPClassifier that takes text labels with early stopping (avoids a scikit-learn error in new Colab versions)."""
    def fit(self, X, y):
        self.le_ = LabelEncoder().fit(y)
        super().fit(X, self.le_.transform(y))
        self.classes_ = self.le_.classes_
        return self

    def predict(self, X):
        return self.classes_[np.argmax(self.predict_proba(X), axis=1)]

class XGBModel(BaseEstimator, ClassifierMixin):
    """XGBoost with text labels and balanced class weights, like the other models."""
    def __init__(self, n_estimators=150, max_depth=4, learning_rate=0.1, subsample=0.8, colsample_bytree=0.5, random_state=0):
        self.n_estimators, self.max_depth, self.learning_rate = n_estimators, max_depth, learning_rate
        self.subsample, self.colsample_bytree, self.random_state = subsample, colsample_bytree, random_state

    def fit(self, X, y):
        self.le_ = LabelEncoder().fit(y)
        self.classes_ = self.le_.classes_
        yi = self.le_.transform(y)
        self.model_ = xgb.XGBClassifier(n_estimators=self.n_estimators, max_depth=self.max_depth, learning_rate=self.learning_rate,
                                        subsample=self.subsample, colsample_bytree=self.colsample_bytree, tree_method='hist',
                                        n_jobs=-1, random_state=self.random_state)
        self.model_.fit(np.asarray(X, dtype=np.float32), yi, sample_weight=compute_sample_weight('balanced', yi))
        return self

    def predict_proba(self, X):
        p = self.model_.predict_proba(np.asarray(X, dtype=np.float32))
        return p if p.ndim == 2 else np.column_stack([1 - p, p])

    def predict(self, X):
        return self.classes_[np.argmax(self.predict_proba(X), axis=1)]

class SVMModel(BaseEstimator, ClassifierMixin):
    """RBF-kernel SVM on standardised features, trained on at most max_frames frames (stratified sample)."""
    def __init__(self, C=3.0, max_frames=SVM_MAX_FRAMES, random_state=0):
        self.C, self.max_frames, self.random_state = C, max_frames, random_state

    def fit(self, X, y):
        X, y = np.asarray(X), np.asarray(y)
        if len(X) > self.max_frames:
            try:
                X, _, y, _ = train_test_split(X, y, train_size=self.max_frames, stratify=y, random_state=self.random_state)
            except ValueError:
                idx = np.random.default_rng(self.random_state).choice(len(X), self.max_frames, replace=False)
                X, y = X[idx], y[idx]
        self.model_ = make_pipeline(StandardScaler(), SVC(C=self.C, kernel='rbf', gamma='scale', class_weight='balanced')).fit(X, y)
        self.classes_ = self.model_.classes_
        return self

    def predict(self, X):
        return self.model_.predict(X)

MODELS = {
    'Random Forest': RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight='balanced', n_jobs=-1, random_state=SEED),
    'MLP': make_pipeline(StandardScaler(), TextMLP(hidden_layer_sizes=(64, 32), alpha=1e-3, early_stopping=True, max_iter=600, random_state=SEED)),
    'Logistic Regression': make_pipeline(StandardScaler(), LogisticRegression(max_iter=3000, class_weight='balanced')),
}
if xgb is not None:
    MODELS['XGBoost'] = XGBModel(random_state=SEED)
MODELS['SVM'] = SVMModel(random_state=SEED)
NOT_FOR_APP = {'SVM'}      # compared, never exported

def folds_for(d):
    groups = d.participant.values
    n_groups = len(set(groups))
    if n_groups >= 2:
        k = min(N_FOLDS, n_groups)
        if k < N_FOLDS:
            print(f'  only {n_groups} participants: {k} folds')
        try:
            return list(StratifiedGroupKFold(n_splits=k, shuffle=True, random_state=SEED).split(d, d.label, groups))
        except ValueError:
            return list(GroupKFold(n_splits=k).split(d, d.label, groups))
    print('  WARNING: one participant only. Folds are made by clip, so the scores will be optimistic.')
    clips = d['clip'].values
    return list(GroupKFold(n_splits=min(N_FOLDS, len(set(clips)))).split(d, d.label, clips))

def clip_accuracy(d, pred):
    t = pd.DataFrame({'clip': d['clip'].values, 'true': d.label.values, 'pred': pred})
    votes = t.groupby('clip').agg(true=('true', 'first'), pred=('pred', lambda s: s.value_counts().index[0]))
    return (votes.true == votes.pred).mean()

OOF, RESULTS = {}, []
for skill in SKILLS:
    d = df[df.skill == skill].reset_index(drop=True)
    if d.label.nunique() < 2:
        print(f'{skill}: needs at least two classes with data, skipped')
        continue
    X, y = d[FEATURE_NAMES].values, d.label.values
    folds = folds_for(d)
    print(f'{skill}: {len(d)} frames, {d['clip'].nunique()} clips, {d.participant.nunique()} participants, {len(folds)} folds')
    for name, proto in MODELS.items():
        pred = np.empty(len(d), dtype=object)
        fold_f1 = []
        t_start = time.time()
        for tr, te in folds:
            m = clone(proto).fit(X[tr], y[tr])
            pred[te] = m.predict(X[te])
            fold_f1.append(f1_score(y[te], pred[te], average='macro'))
        OOF[(skill, name)] = pred
        r = {'skill': skill, 'model': name, 'accuracy': accuracy_score(y, pred), 'macro_f1': f1_score(y, pred, average='macro'),
             'macro_f1_sd': float(np.std(fold_f1)), 'clip_accuracy': clip_accuracy(d, pred), 'train_s': round(time.time() - t_start, 1)}
        RESULTS.append(r)
        print(f'   {name:20s} accuracy {r["accuracy"]:.3f}  macro F1 {r["macro_f1"]:.3f} (±{r["macro_f1_sd"]:.3f})  clip accuracy {r["clip_accuracy"]:.3f}  ({r["train_s"]} s)')
results = pd.DataFrame(RESULTS, columns=['skill', 'model', 'accuracy', 'macro_f1', 'macro_f1_sd', 'clip_accuracy', 'train_s'])
results.to_csv(D('results', 'results.csv'), index=False)

# %% [markdown]
# ## 9. Per-class results, confusion matrices and McNemar's test (Table 5.7, Figure 5.2)

# %%
from scipy.stats import binomtest

PER_CLASS, MCNEMAR = [], []
for skill in SKILLS:
    d = df[df.skill == skill].reset_index(drop=True)
    names = [n for n in MODELS if (skill, n) in OOF]
    if not names:
        continue
    y = d.label.values
    classes = [c for c in SKILLS[skill] + [FAULT] if c in set(y)]
    fig, axes = plt.subplots(1, len(names), figsize=(5.2 * len(names), 4.4))
    for ax, name in zip(np.atleast_1d(axes), names):
        pred = OOF[(skill, name)]
        rep = classification_report(y, pred, labels=classes, output_dict=True, zero_division=0)
        for c in classes:
            PER_CLASS.append({'skill': skill, 'model': name, 'class': c, 'precision': rep[c]['precision'], 'recall': rep[c]['recall'],
                              'f1': rep[c]['f1-score'], 'test_frames': int(rep[c]['support'])})
        ConfusionMatrixDisplay(confusion_matrix(y, pred, labels=classes), display_labels=classes).plot(ax=ax, colorbar=False, xticks_rotation=30)
        ax.set_title(f'{skill}: {name}')
    plt.tight_layout(); plt.savefig(D('results', f'confusion_{skill}.png'), dpi=150); plt.show() if IN_COLAB else plt.close()
    # McNemar's exact test between every pair of models (on the same frames)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a = OOF[(skill, names[i])] == y
            b = OOF[(skill, names[j])] == y
            n01, n10 = int((a & ~b).sum()), int((~a & b).sum())
            p = binomtest(n01, n01 + n10, 0.5).pvalue if n01 + n10 else 1.0
            MCNEMAR.append({'skill': skill, 'model_a': names[i], 'model_b': names[j], 'a_right_b_wrong': n01, 'b_right_a_wrong': n10, 'p_value': p})
per_class = pd.DataFrame(PER_CLASS)
per_class.to_csv(D('results', 'per_class.csv'), index=False)
mcnemar = pd.DataFrame(MCNEMAR)
mcnemar.to_csv(D('results', 'mcnemar.csv'), index=False)
print(mcnemar.to_string() if len(mcnemar) else 'no comparisons')

# %% [markdown]
# ## 10. Which features the Random Forest relies on (Figure 5.3)

# %%
for skill in SKILLS:
    d = df[df.skill == skill]
    if d.label.nunique() < 2:
        continue
    rf = clone(MODELS['Random Forest']).fit(d[FEATURE_NAMES].values, d.label.values)
    imp = pd.Series(rf.feature_importances_, index=FEATURE_NAMES).sort_values(ascending=False).head(15)
    imp.to_csv(D('results', f'importance_{skill}.csv'))
    plt.figure(figsize=(7, 4.5)); imp[::-1].plot.barh(color='#2a7f62'); plt.title(f'{skill}: 15 most important features (Random Forest)')
    plt.tight_layout(); plt.savefig(D('results', f'importance_{skill}.png'), dpi=150); plt.show() if IN_COLAB else plt.close()

# %% [markdown]
# ## 11. Speed and size, and export for the app
# Speed: time to compute the features **and** classify one frame in Python here (the app does
# this about 15 times a second; the time on the phone's JavaScript is printed by
# `npm run test:model`). Size: the model's weights as the app stores them (the exported file is a
# little larger, because it also carries 40 test frames for the parity check). The model chosen for
# each skill is the one with the highest macro F1-score whose size is at most `MAX_MODEL_KB`; on a
# tie, the smaller one. The SVM is listed for comparison only (`for_app` is False). Before a model
# is exported, its app version (the same maths as the phone, `py_predict`) is checked against the
# trained model on 40 frames; if they differ, the next best model is exported instead.

# %%
def _xgb_trees(est):
    """The XGBoost trees as arrays: a node goes left when float32(x) < threshold; leaves have left = -1."""
    tdf = est.model_.get_booster().trees_to_dataframe()
    k = len(est.classes_)
    per_round = 1 if k == 2 else k
    trees, tree_class = [], []
    for t, g in tdf.groupby('Tree', sort=True):
        g = g.sort_values('Node')
        index = {node_id: i for i, node_id in enumerate(g.ID)}
        tree = {'feature': [], 'threshold': [], 'left': [], 'right': [], 'leaf': []}
        for row in g.itertuples():
            if row.Feature == 'Leaf':
                tree['feature'].append(-1); tree['threshold'].append(0.0); tree['left'].append(-1); tree['right'].append(-1)
                tree['leaf'].append(float(row.Gain))
            else:
                name = str(row.Feature)
                fi = int(name[1:]) if name[0] == 'f' and name[1:].isdigit() else FEATURE_NAMES.index(name)
                tree['feature'].append(fi); tree['threshold'].append(float(np.float32(row.Split)))
                tree['left'].append(index[row.Yes]); tree['right'].append(index[row.No]); tree['leaf'].append(0.0)
        trees.append(tree)
        tree_class.append(int(t) % per_round)
    return trees, tree_class, per_round

def _boost_margin(boost, x, n_out):
    xf = np.asarray(x, dtype=np.float32)
    m = np.array(boost['base'], dtype=float) if 'base' in boost else np.zeros(n_out)
    for t, c in zip(boost['trees'], boost['tree_class']):
        n = 0
        while t['left'][n] != -1:
            n = t['left'][n] if xf[t['feature'][n]] < t['threshold'][n] else t['right'][n]
        m[c] += t['leaf'][n]
    return m

def py_predict(model, x):
    """The app's classifier (src/lib/pose/classifier.ts) in Python, to check an exported model before it is used."""
    def softmax(z):
        e = np.exp(z - np.max(z)); return e / e.sum()
    if model['type'] == 'forest':
        tot = np.zeros(len(model['classes']))
        for t in model['trees']:
            n = 0
            while t['left'][n] != -1:
                n = t['left'][n] if x[t['feature'][n]] <= t['threshold'][n] else t['right'][n]
            tot += np.array(t['value'][n])
        return tot / len(model['trees'])
    if model['type'] == 'boosted':
        m = _boost_margin(model['boost'], x, len(model['boost']['base']))
    else:
        a = (np.asarray(x) - np.array(model['scaler']['mean'])) / np.where(np.array(model['scaler']['scale']) == 0, 1, model['scaler']['scale'])
        for i, layer in enumerate(model['layers']):
            a = a @ np.array(layer['W']) + np.array(layer['b'])
            if i < len(model['layers']) - 1:
                a = np.maximum(a, 0)
        m = a
    if model.get('output') == 'logistic' or len(m) == 1:
        p = 1 / (1 + np.exp(-m[0])); return np.array([1 - p, p])
    return softmax(m)

def export_dict(est, skill, X=None):
    classes = [str(c) for c in est.classes_]
    out = {'format': 'cricket-coach-model', 'feature_version': FEATURE_VERSION, 'skill': skill, 'classes': classes,
           'correct_class': CORRECT, 'good_prob': GOOD_PROB,
           'faults': {f: {'check': chk, 'dir': dr} for f, (chk, dr) in FAULTS.get(skill, {}).items() if f in classes}}
    if isinstance(est, RandomForestClassifier):
        trees = []
        for t in est.estimators_:
            tr = t.tree_
            val = tr.value[:, 0, :]
            val = val / np.maximum(val.sum(axis=1, keepdims=True), 1e-12)
            trees.append({'feature': tr.feature.tolist(), 'threshold': tr.threshold.tolist(), 'left': tr.children_left.tolist(),
                          'right': tr.children_right.tolist(), 'value': np.round(val, 6).tolist()})
        out.update(type='forest', trees=trees)
        return out
    if isinstance(est, XGBModel):
        trees, tree_class, n_out = _xgb_trees(est)
        boost = {'trees': trees, 'tree_class': tree_class}
        # The starting score of each class (XGBoost's base score), measured on a few frames.
        Xs = np.asarray(X[: min(50, len(X))], dtype=np.float32)
        margin = est.model_.get_booster().predict(xgb.DMatrix(Xs), output_margin=True).reshape(len(Xs), -1)
        sums = np.array([_boost_margin(boost, x, n_out) for x in Xs])
        boost['base'] = np.median(margin - sums, axis=0).tolist()
        out.update(type='boosted', boost=boost, output='logistic' if n_out == 1 else 'softmax')
        return out
    if isinstance(est, SVMModel):
        raise ValueError('The SVM is compared only; it is not exported to the app.')
    scaler, clf = est.steps[0][1], est.steps[-1][1]
    out['scaler'] = {'mean': scaler.mean_.tolist(), 'scale': scaler.scale_.tolist()}
    if isinstance(clf, MLPClassifier):
        out.update(type='mlp', layers=[{'W': W.tolist(), 'b': b.tolist()} for W, b in zip(clf.coefs_, clf.intercepts_)],
                   output='logistic' if clf.out_activation_ == 'logistic' else 'softmax')
    else:
        out.update(type='logreg', layers=[{'W': clf.coef_.T.tolist(), 'b': clf.intercept_.tolist()}],
                   output='logistic' if clf.coef_.shape[0] == 1 else 'softmax')
    return out

SPEED, CHOSEN = [], {}
for skill in SKILLS:
    d = df[df.skill == skill].reset_index(drop=True)
    if d.label.nunique() < 2:
        continue
    X, y = d[FEATURE_NAMES].values, d.label.values
    raw_rows = [RAW[i] for i in df.index[df.skill == skill]]
    sample = raw_rows[: min(200, len(raw_rows))]
    fitted, exported = {}, {}
    for name, proto in MODELS.items():
        m = clone(proto).fit(X, y)
        fitted[name] = m
        if hasattr(m, 'n_jobs'):
            m.n_jobs = 1          # one frame at a time, as on the phone
        if isinstance(m, XGBModel):
            m.model_.set_params(n_jobs=1)
        one = (lambda f: m.predict(f)) if name in NOT_FOR_APP else (lambda f: m.predict_proba(f))
        t0 = time.perf_counter()
        for s_ in sample:
            one(np.array([extract_features(s_['world'], s_['lm'], s_['hand'], s_['aspect'])]))
        ms = (time.perf_counter() - t0) * 1000 / len(sample)
        if name in NOT_FOR_APP:
            n_sv = int(m.model_.steps[-1][1].support_vectors_.shape[0])
            kb = n_sv * len(FEATURE_NAMES) * 12 / 1024      # about what its support vectors would take as JSON
        else:
            exported[name] = export_dict(m, skill, X)
            kb = len(json.dumps(exported[name])) / 1024
        r = results[(results.skill == skill) & (results.model == name)].iloc[0]
        SPEED.append({'skill': skill, 'model': name, 'time_ms': ms, 'size_kb': kb, 'macro_f1': r.macro_f1, 'for_app': name not in NOT_FOR_APP})
    sp = pd.DataFrame([s_ for s_ in SPEED if s_['skill'] == skill])
    sp['f1_rounded'] = sp.macro_f1.round(3)
    ok = sp[sp.for_app & (sp.size_kb <= MAX_MODEL_KB)].sort_values(['f1_rounded', 'size_kb'], ascending=[False, True])
    candidates = list(ok.model) + [m_ for m_ in sp[sp.for_app].sort_values('size_kb').model if m_ not in set(ok.model)]
    # Export the best model whose app version (py_predict, the same maths as the phone) gives the
    # same probabilities as the trained model on 40 frames, with those frames saved for the app's check.
    rng = np.random.default_rng(SEED)
    pick = rng.choice(len(raw_rows), size=min(40, len(raw_rows)), replace=False)
    best = None
    for name in candidates:
        est, model = fitted[name], exported[name]
        model['parity'] = []
        worst = 0.0
        for i in pick:
            s_ = raw_rows[int(i)]
            f = extract_features(s_['world'], s_['lm'], s_['hand'], s_['aspect'])
            p = est.predict_proba(np.array([f]))[0]
            worst = max(worst, float(np.max(np.abs(py_predict(model, f) - p))))
            model['parity'].append({**s_, 'features': f, 'probs': p.tolist()})
        if worst < 1e-4:
            best = name
            break
        print(f'  {skill}: {name} skipped: its app version differs from Python by {worst:.2g}')
    if best is None:
        print(f'{skill}: no model could be exported')
        continue
    CHOSEN[skill] = best
    model = exported[best]
    r = results[(results.skill == skill) & (results.model == best)].iloc[0]
    model['metrics'] = {'model': best, 'cv_accuracy': round(float(r.accuracy), 4), 'cv_macro_f1': round(float(r.macro_f1), 4),
                        'cv_clip_accuracy': round(float(r.clip_accuracy), 4), 'frames': int(len(d)), 'clips': int(d['clip'].nunique()),
                        'participants': int(d.participant.nunique())}
    model['trained_at'] = datetime.datetime.now().isoformat(timespec='seconds')
    path = D('export', f'{skill}_model.json')
    with open(path, 'w') as fh:
        json.dump(model, fh)
    print(f'{skill}: chose {best} → {path} ({os.path.getsize(path) / 1024:.0f} KB)')
speed = pd.DataFrame(SPEED, columns=['skill', 'model', 'time_ms', 'size_kb', 'macro_f1', 'for_app'])
speed['chosen'] = [CHOSEN.get(s) == m for s, m in zip(speed.skill, speed.model)]
speed.to_csv(D('results', 'speed_size.csv'), index=False)
print(speed.to_string())

if IN_COLAB:
    from google.colab import files
    for skill in CHOSEN:
        files.download(D('export', f'{skill}_model.json'))

# %% [markdown]
# **Put the model in the app:** copy each `<skill>_model.json` into `src/lib/pose/models/` of the
# app, remove the `//` in front of its line in `src/lib/pose/models/index.ts`, and run
# `npm run test:model`. It checks that the phone gives the same answers as this notebook
# (the "parity" frames saved in the file) and prints the time per frame.

# %% [markdown]
# ## 12. Classify a new, unseen clip
# Upload a clip of someone who is **not** in the dataset (or set `NEW_CLIP` to a Drive path).

# %%
NEW_CLIP = None            # e.g. D('test', 'p20_R_side_01.mp4')
NEW_SKILL = 'stance'
ASK_UPLOAD = False         # True: choose a clip from your computer when this cell runs
if IN_COLAB and NEW_CLIP is None and ASK_UPLOAD:
    from google.colab import files
    up = files.upload()
    NEW_CLIP = next(iter(up)) if up else None
if NEW_CLIP and NEW_SKILL in CHOSEN:
    model_json = json.load(open(D('export', f'{NEW_SKILL}_model.json')))
    est = clone(MODELS[CHOSEN[NEW_SKILL]]).fit(df[df.skill == NEW_SKILL][FEATURE_NAMES].values, df[df.skill == NEW_SKILL].label.values)
    data = extract_clip(NEW_CLIP)
    _, hand, _ = parse_name(NEW_CLIP)
    frames = [fr for fr in data['frames'] if usable(fr['lm'])]
    if not frames:
        print('No usable frames: is the whole body in view?')
    else:
        P = est.predict_proba(np.array([extract_features(fr['world'], fr['lm'], hand, data['aspect']) for fr in frames]))
        mean = P.mean(axis=0)
        for c, p in sorted(zip(est.classes_, mean), key=lambda t: -t[1]):
            print(f'{c:22s} {p:.2f}')
        print('Verdict:', est.classes_[int(np.argmax(mean))])
        plt.figure(figsize=(8, 3))
        for k, c in enumerate(est.classes_):
            plt.plot([fr['t'] / 1000 for fr in frames], P[:, k], label=c)
        plt.xlabel('seconds'); plt.ylabel('probability'); plt.legend(); plt.tight_layout()
        plt.show() if IN_COLAB else plt.close()

# %% [markdown]
# ## 13. Experiment 1A: naming each fault (four classes)
# The same five models and the same person-wise folds, but each skill has four classes (correct and
# three named faults) instead of correct / fault. This shows why the app's models only decide
# correct / fault. Uses `features_all.csv`; nothing is exported.

# %%
d4_all = df_all[(df_all.pos >= df_all.skill.map(FINISH_FROM).fillna(0)).values].copy()
d4_all['label'] = d4_all['label_4class']
R4, P4, M4 = [], [], []
for skill in SKILLS:
    d = d4_all[d4_all.skill == skill].reset_index(drop=True)
    if d.label.nunique() < 2 or d.label.value_counts().min() < 1:
        continue
    X, y = d[FEATURE_NAMES].values, d.label.values
    folds = folds_for(d)
    print(f'{skill}: {len(d)} frames, {d["clip"].nunique()} clips, classes {dict(d.label.value_counts())}')
    oof = {}
    for name, proto in MODELS.items():
        pred = np.empty(len(d), dtype=object)
        fold_f1 = []
        for tr, te in folds:
            m = clone(proto).fit(X[tr], y[tr])
            pred[te] = m.predict(X[te])
            fold_f1.append(f1_score(y[te], pred[te], average='macro'))
        oof[name] = pred
        R4.append({'skill': skill, 'model': name, 'accuracy': accuracy_score(y, pred), 'macro_f1': f1_score(y, pred, average='macro'),
                   'macro_f1_sd': float(np.std(fold_f1)), 'clip_accuracy': clip_accuracy(d, pred)})
        print(f'   {name:20s} accuracy {R4[-1]["accuracy"]:.3f}  macro F1 {R4[-1]["macro_f1"]:.3f} (±{R4[-1]["macro_f1_sd"]:.3f})  clip accuracy {R4[-1]["clip_accuracy"]:.3f}')
        classes = [c for c in SKILLS[skill] if c in set(y)]
        rep_ = classification_report(y, pred, labels=classes, output_dict=True, zero_division=0)
        for c in classes:
            P4.append({'skill': skill, 'model': name, 'class': c, 'precision': rep_[c]['precision'], 'recall': rep_[c]['recall'],
                       'f1': rep_[c]['f1-score'], 'test_frames': int(rep_[c]['support'])})
    names = list(oof)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = oof[names[i]] == y, oof[names[j]] == y
            n01, n10 = int((a & ~b).sum()), int((~a & b).sum())
            M4.append({'skill': skill, 'model_a': names[i], 'model_b': names[j], 'a_right_b_wrong': n01, 'b_right_a_wrong': n10,
                       'p_value': binomtest(n01, n01 + n10, 0.5).pvalue if n01 + n10 else 1.0})
results_4class = pd.DataFrame(R4)
results_4class.to_csv(D('results', 'results_4class.csv'), index=False)
pd.DataFrame(P4).to_csv(D('results', 'per_class_4class.csv'), index=False)
pd.DataFrame(M4).to_csv(D('results', 'mcnemar_4class.csv'), index=False)

# %% [markdown]
# ## 14. Experiment 1C: tuning the drive (finish window, features, model settings)
# Tries four finish windows, all 138 features or only the 39 body and picture measures, and several
# settings of XGBoost, SVM and MLP, with the same person-wise folds. Nothing is exported. Because
# the settings are chosen on the same folds, the best result is slightly optimistic.

# %%
import itertools
EXP_SKILL = 'drive'
full = df_all[df_all.skill == EXP_SKILL].reset_index(drop=True)
full['label'] = np.where(full['label_4class'] == CORRECT, CORRECT, FAULT)
MEASURES = [n for n in FEATURE_NAMES if not (n.startswith('c') and n[1:2].isdigit())]   # 32 body + 7 picture measures

def models_to_try():
    out = {}
    for depth, n in ([(3, 150), (4, 150), (4, 300), (6, 200)] if xgb is not None else []):
        out[f'XGBoost d{depth} n{n}'] = XGBModel(n_estimators=n, max_depth=depth, random_state=SEED)
    for C in [1.0, 3.0, 10.0]:
        out[f'SVM C{C:g}'] = SVMModel(C=C, random_state=SEED)
    out['MLP 64-32'] = make_pipeline(StandardScaler(), TextMLP(hidden_layer_sizes=(64, 32), alpha=1e-3, early_stopping=True, max_iter=600, random_state=SEED))
    out['MLP 32 a=0.01'] = make_pipeline(StandardScaler(), TextMLP(hidden_layer_sizes=(32,), alpha=1e-2, early_stopping=True, max_iter=600, random_state=SEED))
    return out

EXP, t0 = [], time.time()
for window, fset in itertools.product([0.4, 0.5, 0.6, 0.7], ['all', 'measures']):
    d = full[full.pos >= window].reset_index(drop=True)
    if d.label.nunique() < 2:
        continue
    cols = FEATURE_NAMES if fset == 'all' else MEASURES
    X, y = d[cols].values, d.label.values
    folds = folds_for(d)
    for name, proto in models_to_try().items():
        pred = np.empty(len(d), dtype=object)
        for tr, te in folds:
            pred[te] = clone(proto).fit(X[tr], y[tr]).predict(X[te])
        t = pd.DataFrame({'clip': d['clip'], 'true': y, 'pred': pred})
        votes = t.groupby('clip').agg(true=('true', 'first'), pred=('pred', lambda s_: s_.value_counts().index[0]))
        EXP.append({'window': f'last {int(round((1 - window) * 100))}%', 'features': fset, 'model': name, 'frames': len(d),
                    'macro_f1': f1_score(y, pred, average='macro'),
                    'fault_recall': float(((pred == FAULT) & (y == FAULT)).sum() / max(1, (y == FAULT).sum())),
                    'clip_macro_f1': f1_score(votes.true, votes.pred, average='macro')})
    print(f'window {window} {fset}: done ({time.time() - t0:.0f} s)')
exp = pd.DataFrame(EXP).sort_values('macro_f1', ascending=False)
exp.to_csv(D('results', f'experiment_{EXP_SKILL}_tuning.csv'), index=False)
print(exp.head(15).round(3).to_string(index=False))

# %% [markdown]
# ## 15. Experiment 1D: judging the whole finish of the drive instead of one frame
# Each clip's finish (last 40 %) becomes one example: the mean, standard deviation, minimum and
# maximum of every feature over those frames (138 × 4 = 552 numbers). Person-wise folds as before.

# %%
from sklearn.ensemble import RandomForestClassifier as _RF
fin = full[full.pos >= 0.6]
agg = fin.groupby('clip')[FEATURE_NAMES].agg(['mean', 'std', 'min', 'max']).fillna(0)
agg.columns = [f'{a}_{b}' for a, b in agg.columns]
meta = fin.groupby('clip').agg(label=('label', 'first'), participant=('participant', 'first'), frames=('t', 'size'))
cd = meta.join(agg).reset_index()
if cd.label.nunique() >= 2:
    X, y = cd[agg.columns].values, cd.label.values
    print(len(cd), 'clips,', X.shape[1], 'numbers per clip,', cd.participant.nunique(), 'participants', dict(cd.label.value_counts()))
    folds = folds_for(cd)
    CLIP_MODELS = {
        'Random Forest': _RF(n_estimators=500, min_samples_leaf=2, class_weight='balanced', n_jobs=-1, random_state=SEED),
        'Logistic Regression': make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000, C=0.1, class_weight='balanced')),
        'SVM C3': SVMModel(C=3.0, random_state=SEED),
        'SVM C10': SVMModel(C=10.0, random_state=SEED),
    }
    if xgb is not None:
        CLIP_MODELS['XGBoost d3'] = XGBModel(n_estimators=300, max_depth=3, random_state=SEED)
        CLIP_MODELS['XGBoost d4'] = XGBModel(n_estimators=300, max_depth=4, random_state=SEED)
    CLIP_RES = []
    for name, proto in CLIP_MODELS.items():
        pred = np.empty(len(cd), dtype=object)
        for tr, te in folds:
            pred[te] = clone(proto).fit(X[tr], y[tr]).predict(X[te])
        CLIP_RES.append({'model': name, 'clip_accuracy': accuracy_score(y, pred), 'clip_macro_f1': f1_score(y, pred, average='macro'),
                         'fault_recall': float(((pred == FAULT) & (y == FAULT)).sum() / (y == FAULT).sum()),
                         'correct_recall': float(((pred == CORRECT) & (y == CORRECT)).sum() / (y == CORRECT).sum())})
    clip_res = pd.DataFrame(CLIP_RES).sort_values('clip_macro_f1', ascending=False)
    clip_res.to_csv(D('results', f'experiment_{EXP_SKILL}_clip.csv'), index=False)
    print(clip_res.round(3).to_string(index=False))

# %% [markdown]
# # Experiment 2: shot recognition on a public dataset
#
# **Experiment 1** (above) trains the app's models on our own labelled clips: correct form or a
# named fault. **Experiment 2** uses the same pose model, the same 138 features and the same five
# classifiers on a public dataset, to show how the method does on data recorded by others:
# recognising **which shot** is played.
#
# Dataset: [rokmr/cricket-shot](https://huggingface.co/datasets/rokmr/cricket-shot) (Kumar, 2025;
# Apache-2.0; its structure follows CricShot10, Sen et al., 2021). 1,750 videos in 10 classes:
# cover, defense, flick, hook, late_cut, lofted, pull, square_cut, straight, sweep. The official
# split is used: train 1,250 + validation 250 for training, test 250 for testing (25 per class).
#
# This model is **not** put in the app: the labels are shot names, not faults, and most clips are
# broadcast footage from behind the bowler, not a phone at the batter's side.
#
# How a clip becomes one example: 16 frames are taken evenly through the clip; each usable frame
# (shoulders and hips seen) gives the 138 features; the clip is described by their mean, standard
# deviation, minimum and maximum over the clip and by their mean in each quarter of the clip
# (138 × 8 = 1,104 numbers), so the order of the movement is kept. The batting hand is not given,
# so it is estimated from which wrist is higher on the handle.
#
# Runtime: the download is 2.9 GB (about 2–5 minutes); landmark extraction takes about
# 30–60 minutes on Colab's CPU. Landmarks are saved to Drive as they go, so if Colab disconnects,
# run the cells again and it continues where it stopped.

# %%
# E2.1 Download and unpack the public dataset (to Colab's own disk, not to Drive)
PUBLIC_DIR = '/content/cricketshot' if IN_COLAB else os.environ.get('CC_PUBLIC_DIR', D('public_videos'))
PUBLIC_LANDMARKS = D('public', 'landmarks.jsonl')     # in Drive: survives a disconnect
os.makedirs(D('public'), exist_ok=True)
PUBLIC_CLASSES = ['cover', 'defense', 'flick', 'hook', 'late_cut', 'lofted', 'pull', 'square_cut', 'straight', 'sweep']

if not TEST_MODE and not glob.glob(os.path.join(PUBLIC_DIR, '**', 'train'), recursive=True):
    from huggingface_hub import hf_hub_download
    import tarfile
    tar_path = hf_hub_download(repo_id='rokmr/cricket-shot', filename='cricketshot.tar.gz', repo_type='dataset')
    print('downloaded', tar_path)
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    with tarfile.open(tar_path) as t:
        t.extractall(PUBLIC_DIR)

def public_videos():
    """(split, class, path) for every video; split and class come from the folder names."""
    out = []
    for path in glob.glob(os.path.join(PUBLIC_DIR, '**', '*'), recursive=True):
        if not path.lower().endswith(VIDEO_EXT):
            continue
        parts = path.replace('\\', '/').split('/')
        split = next((p for p in reversed(parts) if p in ('train', 'val', 'validation', 'test')), None)
        cls = next((p for p in reversed(parts[:-1]) if p in PUBLIC_CLASSES), None)
        if split and cls:
            out.append(('val' if split == 'validation' else split, cls, path))
    return sorted(out)

PUB = public_videos()
print(len(PUB), 'videos')
if PUB:
    print(pd.DataFrame(PUB, columns=['split', 'class', 'path']).groupby(['split', 'class']).size().unstack(0).to_string())

# %%
# E2.2 Landmarks: 16 frames evenly through each clip (saved to Drive as it goes)
PUBLIC_FRAMES = 16

def extract_public(path):
    import mediapipe as mp
    cap = cv2.VideoCapture(path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        total = 0
        while cap.grab():
            total += 1
        cap.release()
        cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    want = set(np.linspace(0, max(total - 1, 0), PUBLIC_FRAMES).round().astype(int).tolist())
    frames, aspect, n = [], None, 0
    with make_landmarker(True) as lmk:
        while True:
            ok, bgr = cap.read()
            if not ok or n > max(want):
                break
            if n in want:
                h, w = bgr.shape[:2]
                if h > 720:
                    bgr = cv2.resize(bgr, (int(w * 720 / h), 720))
                aspect = bgr.shape[1] / bgr.shape[0]
                res = lmk.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)), int(n * 1000 / fps))
                if res.pose_landmarks:
                    lm, world = to_lists(res)
                    frames.append({'i': n, 'lm': lm, 'world': world})
            n += 1
    cap.release()
    return {'aspect': aspect, 'total': total, 'frames': frames}

done = set()
if os.path.exists(PUBLIC_LANDMARKS):
    with open(PUBLIC_LANDMARKS) as fh:
        done = {json.loads(line)['path_key'] for line in fh if line.strip()}
key_of = lambda path: os.path.relpath(path, PUBLIC_DIR)
todo = [v for v in PUB if key_of(v[2]) not in done]
print(f'{len(done)} clips already done, {len(todo)} to go')
t0 = time.time()
for k, (split, cls, path) in enumerate(todo):
    data = extract_public(path)
    with open(PUBLIC_LANDMARKS, 'a') as fh:
        fh.write(json.dumps({'path_key': key_of(path), 'split': split, 'class': cls, **data}) + '\n')
    if (k + 1) % 50 == 0 or k + 1 == len(todo):
        rate = (time.time() - t0) / (k + 1)
        print(f'  {k + 1}/{len(todo)}  ~{rate * (len(todo) - k - 1) / 60:.0f} min left')

# %%
# E2.3 One example per clip: frame features summarised over time
def guess_hand(frames):
    """Right- or left-handed, from which wrist is higher when the hands are together on the handle
    (the top hand is the left for a right-hander). y points down."""
    votes = []
    for fr in frames:
        w = fr['world']
        lw, rw = np.array(w[15 * 3:15 * 3 + 3]), np.array(w[16 * 3:16 * 3 + 3])
        sh = np.linalg.norm(np.array(w[11 * 3:11 * 3 + 3]) - np.array(w[12 * 3:12 * 3 + 3])) or 0.3
        if np.linalg.norm(lw - rw) < 0.6 * sh and abs(rw[1] - lw[1]) > 0.02:
            votes.append(np.sign(rw[1] - lw[1]))
    return 'left' if votes and np.mean(votes) < -0.2 else 'right'

def public_usable(lm):
    vis = lambda j: lm[j * 4 + 3]
    return all(max(vis(a), vis(b)) >= 0.5 for a, b in [(11, 12), (23, 24)])

def clip_vector(frames, aspect, hand):
    F = np.array([extract_features(fr['world'], fr['lm'], hand, aspect) for fr in frames])
    quarters = [F[q].mean(axis=0) for q in np.array_split(np.arange(len(F)), 4)]
    return np.concatenate([F.mean(axis=0), F.std(axis=0), F.min(axis=0), F.max(axis=0), *quarters])

CLIP_FEATURES = [f'{s}_{n}' for s in ('mean', 'std', 'min', 'max', 'q1', 'q2', 'q3', 'q4') for n in FEATURE_NAMES]
prow, dropped, hands = [], 0, {'right': 0, 'left': 0}
with open(PUBLIC_LANDMARKS) as fh:
    for line in fh:
        r = json.loads(line)
        frames = [fr for fr in r['frames'] if public_usable(fr['lm'])]
        if len(frames) < 4:
            dropped += 1
            continue
        hand = guess_hand(frames)
        hands[hand] += 1
        prow.append([r['split'], r['class'], r['path_key'], hand] + clip_vector(frames, r['aspect'], hand).tolist())
pdf = pd.DataFrame(prow, columns=['split', 'label', 'clip', 'hand'] + CLIP_FEATURES)
pdf.to_csv(D('results', 'public_features.csv'), index=False)
print(f'{len(pdf)} clips usable, {dropped} dropped (fewer than 4 frames with the body seen); estimated hand: {hands}')
pub_summary = pdf.groupby(['label', 'split']).size().unstack(fill_value=0)
pub_summary.to_csv(D('results', 'public_dataset_summary.csv'))
print(pub_summary.to_string())

# %%
# E2.4 Train on train + val, test on the official test split
tr = pdf[pdf.split.isin(['train', 'val'])]
te = pdf[pdf.split == 'test']
Xtr, ytr, Xte, yte = tr[CLIP_FEATURES].values, tr.label.values, te[CLIP_FEATURES].values, te.label.values
PUB_MODELS = {
    'Random Forest': RandomForestClassifier(n_estimators=300, min_samples_leaf=1, class_weight='balanced', n_jobs=-1, random_state=SEED),
    'MLP': make_pipeline(StandardScaler(), TextMLP(hidden_layer_sizes=(128, 64), alpha=1e-2, early_stopping=True, max_iter=800, random_state=SEED)),
    'Logistic Regression': make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000, C=0.5, class_weight='balanced')),
}
if xgb is not None:
    PUB_MODELS['XGBoost'] = XGBModel(n_estimators=300, max_depth=4, random_state=SEED)
PUB_MODELS['SVM'] = SVMModel(C=10.0, random_state=SEED)
PUB_PRED, PUB_RESULTS = {}, []
for name, proto in PUB_MODELS.items():
    m = clone(proto).fit(Xtr, ytr)
    pred = m.predict(Xte)
    PUB_PRED[name] = pred
    PUB_RESULTS.append({'experiment': 'E2 public shot recognition', 'model': name, 'train_clips': len(tr), 'test_clips': len(te),
                        'accuracy': accuracy_score(yte, pred), 'macro_f1': f1_score(yte, pred, average='macro')})
    print(f'{name:20s} accuracy {PUB_RESULTS[-1]["accuracy"]:.3f}  macro F1 {PUB_RESULTS[-1]["macro_f1"]:.3f}')
pub_results = pd.DataFrame(PUB_RESULTS)
pub_results.to_csv(D('results', 'public_results.csv'), index=False)

# %%
# E2.5 Per-class results, confusion matrices and McNemar's test
classes = [c for c in PUBLIC_CLASSES if c in set(yte)]
rows = []
fig, axes = plt.subplots(1, len(PUB_PRED), figsize=(7 * len(PUB_PRED), 6))
for ax, (name, pred) in zip(np.atleast_1d(axes), PUB_PRED.items()):
    rep = classification_report(yte, pred, labels=classes, output_dict=True, zero_division=0)
    rows += [{'model': name, 'class': c, 'precision': rep[c]['precision'], 'recall': rep[c]['recall'], 'f1': rep[c]['f1-score'], 'test_clips': int(rep[c]['support'])} for c in classes]
    ConfusionMatrixDisplay(confusion_matrix(yte, pred, labels=classes), display_labels=classes).plot(ax=ax, colorbar=False, xticks_rotation=45)
    ax.set_title(f'Public dataset: {name}')
plt.tight_layout(); plt.savefig(D('results', 'public_confusion.png'), dpi=150); plt.show() if IN_COLAB else plt.close()
pd.DataFrame(rows).to_csv(D('results', 'public_per_class.csv'), index=False)
names = list(PUB_PRED)
mc = []
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        a, b = PUB_PRED[names[i]] == yte, PUB_PRED[names[j]] == yte
        n01, n10 = int((a & ~b).sum()), int((~a & b).sum())
        mc.append({'model_a': names[i], 'model_b': names[j], 'a_right_b_wrong': n01, 'b_right_a_wrong': n10,
                   'p_value': binomtest(n01, n01 + n10, 0.5).pvalue if n01 + n10 else 1.0})
pd.DataFrame(mc).to_csv(D('results', 'public_mcnemar.csv'), index=False)
print(pd.DataFrame(mc).to_string())

# %%
# E2.6 The two experiments side by side (for Chapter 5)
both = []
e1 = globals().get('results')
if e1 is None and os.path.exists(D('results', 'results.csv')):
    e1 = pd.read_csv(D('results', 'results.csv'))
if e1 is not None and len(e1):
    for _, r in e1.iterrows():
        both.append({'experiment': f'E1 own data: {r.skill} (correct / fault)', 'model': r.model, 'test': 'person-wise 5-fold CV',
                     'accuracy': round(r.accuracy, 3), 'macro_f1': round(r.macro_f1, 3)})
for r in PUB_RESULTS:
    both.append({'experiment': 'E2 public data: 10 shots', 'model': r['model'], 'test': f'official test split ({r["test_clips"]} clips)',
                 'accuracy': round(r['accuracy'], 3), 'macro_f1': round(r['macro_f1'], 3)})
both = pd.DataFrame(both)
both.to_csv(D('results', 'experiments_summary.csv'), index=False)
display(both) if IN_COLAB else print(both.to_string())
