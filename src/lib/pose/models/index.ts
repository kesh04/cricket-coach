import type { Skill } from '../benchmarks';
import { checkModel, type PositionModel } from '../classifier';

/**
 * The trained position classifiers, one per skill.
 *
 * After training in Google Colab (training/Cricket_Coach_Training.ipynb), download
 * the <skill>_model.json files (stance, defence, drive, backdefence, pull, cut, sweep), put them in this folder and
 * remove the // in front of their lines below. Then run `npm run test:model` to check that the
 * phone gives the same answers as Colab.
 *
 * A skill with no model here is judged by the coaching-range rules alone, as before.
 */
const FILES: Partial<Record<Skill, unknown>> = {
  stance: require('./stance_model.json'),
  defence: require('./defence_model.json'),
  drive: require('./drive_model.json'),
  // backdefence: require('./backdefence_model.json'),
  pull: require('./pull_model.json'),
  // cut: require('./cut_model.json'),
  // sweep: require('./sweep_model.json'),
};

function load(): Partial<Record<Skill, PositionModel>> {
  const out: Partial<Record<Skill, PositionModel>> = {};
  for (const [skill, file] of Object.entries(FILES) as [Skill, unknown][]) {
    const model = file as PositionModel;
    const problem = checkModel(model);
    if (problem) {
      console.warn(`Trained model for ${skill} not used: ${problem}`);
      continue;
    }
    out[skill] = model;
  }
  return out;
}

export const MODELS = load();

/** The trained model for a skill, or null when the skill is judged by the rules alone. */
export function modelFor(skill: Skill): PositionModel | null {
  return MODELS[skill] ?? null;
}
