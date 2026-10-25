# Training the position classifier

The app's verdict on a position (good, or which fault) comes from a classifier **trained on our
own labelled clips**. MediaPipe Pose Landmarker only finds the 33 body points; the cricket
judgement is the trained model. The coaching-range rules (`src/lib/pose/benchmarks.ts`) are kept
to explain the model's verdict in words ("Move your feet a little wider").

| File | What it is |
|---|---|
| `Cricket_Coach_Training.ipynb` | The Google Colab notebook: labelling tool, landmark extraction, training, evaluation, export. |
| `features.py` | Feature extraction (138 numbers per frame). Twin of `src/lib/pose/features.ts`. |
| `notebook_src.py`, `build_notebook.py` | Source of the notebook. Edit `notebook_src.py`, then `python training/build_notebook.py`. |

## Steps

1. Upload `Cricket_Coach_Training.ipynb` to Google Colab (File → Upload notebook).
2. Put clips in Google Drive under `MyDrive/CricketCoach/unlabelled/<skill>/` (`stance`, `defence`, `drive`,
   `backdefence`, `pull`, `cut`, `sweep`; each has `correct` and three fault classes, see `SKILLS` in the notebook).
   3–6 s each, one held position, whole body in view, back camera.
3. Run the cells. The labelling tool shows each clip; press its class. Clips are renamed
   `p01_R_side_01.mp4` (participant, hand, phone position, take) and moved to `dataset/<skill>/<class>/`.
4. Ask a coach to run `relabel_tool('coach')` on 20 % of the clips (label agreement, Cohen's kappa).
5. Run the rest: landmarks → features → person-wise 5-fold cross-validation of Random Forest, MLP and
   Logistic Regression → per-class results, confusion matrices, McNemar → speed and size → export.
   Tables and figures for the report are written to `MyDrive/CricketCoach/results/`.
6. Copy `export/<skill>_model.json` into `src/lib/pose/models/`, remove the `//` in front of its line
   in `src/lib/pose/models/index.ts`, and run `npm run test:model` (checks the phone gives the same
   answers as Colab, and the time per frame).

## How the app uses the model

`analyzePose` (src/lib/pose/stanceAnalyzer.ts) computes the features of each camera frame, runs the
model (`src/lib/pose/classifier.ts`), smooths the class probabilities between frames, and then:

- **score** = the model's probability that the position is correct, scaled so the model's "good"
  threshold (`good_prob`, 0.6 by default) is 85;
- **a predicted fault** marks its linked rule check poor and its correction is spoken first
  (`FAULTS` in the notebook links each fault to a check);
- **a position the model calls correct** counts, and rule checks that disagree are spoken as tips only.

A skill with no model file is judged by the rules alone, as before. Drills that practise one part
of a skill are judged by the rules. The coach test records whether the model or the rules judged,
and the model's class and probability (CSV columns `judge`, `model_label`, `model_prob`).

## Changing features

`features.py` and `src/lib/pose/features.ts` must give the same numbers. If you change one, change the
other, raise `FEATURE_VERSION` in both, rebuild the notebook and train again. The app refuses a
model trained with another feature version.
