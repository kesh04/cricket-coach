# Evaluating the app against a coach

Question answered: when a coach says a stance or shot is good or bad, how often does the app agree?

## 1. Collect clips
- Film each attempt as a **separate short video** (3–6 s): the person takes the position and holds it. One attempt per file.
- Same phone position as in the app (side, or in front). Mix good and bad attempts, about **equal numbers**. Aim for 30+ per class per skill; more people is better than more clips of one person.
- Have the coach label each clip **good** or **bad**, and for bad ones name the main fault (e.g. `feet_too_close`, `knees_straight`, `head_up`, `no_step`). Label blind: the coach must not see the app's verdict.

## 2. Extract landmarks (same model as the app)
```
pip install mediapipe opencv-python
python tools/extract_landmarks.py path/to/videos
```
Creates one `.json` per video.

## 3. labels.csv (in the videos folder)
```
file,skill,label,hand,view,drill,fault
clip001.mp4,stance,good,right,side,,
clip002.mp4,stance,bad,right,side,,feet_too_close
clip010.mp4,defence,good,right,front,def-full,
clip011.mp4,defence,bad,right,front,def-footwork,no_step
```
Required: `file`, `skill` (stance, defence, drive), `label` (good, bad). Optional: `hand` (default right), `view` (default side), `drill` (def-footwork or def-full; judges only that part), `fault`.

## 4. Run
```
npx tsx scripts/evaluate.ts path/to/videos            # uses videos/labels.csv
npx tsx scripts/evaluate.ts path/to/videos --hold=2000
```
Prints and saves `summary.md` (confusion matrix, accuracy, precision, recall, specificity, F1, Cohen's kappa, by skill, by fault, and every disagreement with the reason) and `results.csv`.

## Notes for the paper
- "Positive" = coach says good. **Precision** = of clips the app calls good, how many the coach agrees with (a false "good" teaches a bad habit). **Recall** = of the coach's good clips, how many the app accepts (a low recall frustrates learners).
- Report Cohen's kappa too: accuracy alone misleads when classes are unbalanced.
- Use **different people** for tuning the limits (`benchmarks.ts`) and for testing; otherwise the numbers are optimistic. Keep a held-out set you never tune on.
- The bat is not judged here (it comes from the camera image, not the landmarks), so label clips by body checks only, or evaluate the bat separately with `npm run test:pose` / `scripts/check-bat.ts`.
- Two coaches labelling the same clips gives you inter-rater agreement (kappa) as the ceiling the app can be compared to.
