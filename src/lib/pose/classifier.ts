import { extractFeatures, FEATURE_COUNT, FEATURE_VERSION } from './features';
import type { Hand } from './landmarks';

/**
 * The position classifier trained in Google Colab (training/Cricket_Coach_Training.ipynb) on
 * our own labelled clips of beginner batters, and exported as JSON.
 *
 * Three kinds of model can be exported; the notebook picks the one with the best balance of
 * macro F1-score, speed and size:
 *  - 'mlp':    multi-layer perceptron (scikit-learn MLPClassifier), ReLU hidden layers
 *  - 'logreg': logistic regression (written as an MLP with no hidden layer)
 *  - 'forest': random forest (scikit-learn RandomForestClassifier), every tree written out
 *  - 'boosted': gradient-boosted trees (XGBoost), every tree written out
 */
export type ModelLayer = { W: number[][]; b: number[] };
export type ModelTree = { feature: number[]; threshold: number[]; left: number[]; right: number[]; value: number[][] };
/**
 * One XGBoost tree. A node goes left when the feature, as a 32-bit float (XGBoost works in float32),
 * is below the threshold. A leaf (left = -1) adds `leaf` to the score of the tree's class.
 */
export type BoostTree = { feature: number[]; threshold: number[]; left: number[]; right: number[]; leaf: number[] };
export type Boost = { trees: BoostTree[]; tree_class: number[]; base: number[] };

/** How a predicted fault is explained to the learner: which rule check says what to change. */
export type FaultLink = { check: string; dir: 'low' | 'high'; message?: string };

export type PositionModel = {
  format: 'cricket-coach-model';
  feature_version: number;
  skill: string;
  type: 'mlp' | 'logreg' | 'forest' | 'boosted';
  classes: string[];
  correct_class: string;
  /** Probability of the correct class at or above which the position counts as good. */
  good_prob?: number;
  scaler?: { mean: number[]; scale: number[] };
  layers?: ModelLayer[];
  /** 'softmax' for three or more classes, 'logistic' for two (one output unit). */
  output?: 'softmax' | 'logistic';
  trees?: ModelTree[];
  boost?: Boost;
  faults?: Record<string, FaultLink>;
  /** Shown on the coach-test screen and in the report. */
  metrics?: Record<string, number | string>;
  trained_at?: string;
  /** Frames saved by the notebook with the features and probabilities Python computed. */
  parity?: { world: number[]; lm: number[]; hand: Hand; aspect: number | null; features: number[]; probs: number[] }[];
};

export type ModelPrediction = {
  label: string;
  index: number;
  /** Probability of each class, in the order of model.classes. */
  probs: number[];
  /** Probability of the correct class. */
  pCorrect: number;
};

export function checkModel(model: PositionModel): string | null {
  if (model.format !== 'cricket-coach-model') return 'not a cricket-coach model file';
  if (model.feature_version !== FEATURE_VERSION) return `trained with feature version ${model.feature_version}, the app has ${FEATURE_VERSION}`;
  if (!model.classes.includes(model.correct_class)) return `correct class "${model.correct_class}" is not one of the classes`;
  const empty =
    model.type === 'forest' ? !model.trees?.length : model.type === 'boosted' ? !model.boost?.trees.length : !model.layers?.length || !model.scaler;
  if (empty) return 'model has no weights';
  if (model.scaler && model.scaler.mean.length !== FEATURE_COUNT) return `model expects ${model.scaler.mean.length} features, the app makes ${FEATURE_COUNT}`;
  return null;
}

function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

/** Probability of each class for one feature vector. */
export function predictProba(model: PositionModel, x: number[]): number[] {
  if (model.type === 'boosted') {
    const { trees, tree_class, base } = model.boost!;
    const margin = base.slice();
    const xf = x.map((v) => Math.fround(v));
    trees.forEach((t, i) => {
      let n = 0;
      while (t.left[n] !== -1) n = xf[t.feature[n]] < t.threshold[n] ? t.left[n] : t.right[n];
      margin[tree_class[i]] += t.leaf[n];
    });
    if (model.output === 'logistic' || margin.length === 1) {
      const p = 1 / (1 + Math.exp(-margin[0]));
      return [1 - p, p];
    }
    return softmax(margin);
  }
  if (model.type === 'forest') {
    const k = model.classes.length;
    const total = new Array(k).fill(0);
    for (const t of model.trees!) {
      let n = 0;
      while (t.left[n] !== -1) n = x[t.feature[n]] <= t.threshold[n] ? t.left[n] : t.right[n];
      const v = t.value[n];
      for (let c = 0; c < k; c++) total[c] += v[c];
    }
    return total.map((v) => v / model.trees!.length);
  }
  const { mean, scale } = model.scaler!;
  let a = x.map((v, i) => (v - mean[i]) / (scale[i] || 1));
  const layers = model.layers!;
  layers.forEach((layer, li) => {
    const out = layer.b.slice();
    for (let i = 0; i < a.length; i++) {
      const ai = a[i];
      if (ai === 0) continue;
      const row = layer.W[i];
      for (let j = 0; j < out.length; j++) out[j] += ai * row[j];
    }
    a = li < layers.length - 1 ? out.map((v) => (v > 0 ? v : 0)) : out;
  });
  if (model.output === 'logistic' || a.length === 1) {
    const p = 1 / (1 + Math.exp(-a[0]));
    return [1 - p, p];
  }
  return softmax(a);
}

export function predictionFrom(model: PositionModel, probs: number[]): ModelPrediction {
  let index = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[index]) index = i;
  return { label: model.classes[index], index, probs, pCorrect: probs[model.classes.indexOf(model.correct_class)] ?? 0 };
}

/** Features and class probabilities of one camera frame. */
export function classifyFrame(model: PositionModel, world: number[], lm: number[], hand: Hand, aspect?: number | null): number[] {
  return predictProba(model, extractFeatures(world, lm, hand, aspect));
}
