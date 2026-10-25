import type { CoachTrial } from '@/services/backend';

/**
 * How well the app agrees with a coach, from coach-test trials.
 *
 * Trials the app could not judge ('unseen') are counted separately and left out of agreement.
 * Cohen's kappa corrects the agreement for the agreement expected by chance:
 *   kappa = (po - pe) / (1 - pe)
 * where po is the share of trials where both agree and pe the share expected by chance.
 */
export type Agreement = {
  /** Trials the app could judge. */
  n: number;
  unseen: number;
  /** Coach good and app good, coach good and app not, coach not and app good, both not. */
  both: number;
  coachOnly: number;
  appOnly: number;
  neither: number;
  /** Share of trials where the app and the coach agree, 0 to 1. */
  accuracy: number | null;
  kappa: number | null;
  /** Of the positions the coach called not good, the share the app also called not good. */
  catchesFaults: number | null;
  /** Of the positions the coach called good, the share the app also called good. */
  acceptsGood: number | null;
};

export function agreement(trials: CoachTrial[]): Agreement {
  const seen = trials.filter((t) => t.app !== 'unseen');
  const count = (coach: CoachTrial['coach'], app: CoachTrial['app']) => seen.filter((t) => t.coach === coach && t.app === app).length;
  const both = count('good', 'good');
  const coachOnly = count('good', 'not');
  const appOnly = count('not', 'good');
  const neither = count('not', 'not');
  const n = seen.length;
  const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
  let kappa: number | null = null;
  if (n > 0) {
    const po = (both + neither) / n;
    const coachGood = (both + coachOnly) / n;
    const appGood = (both + appOnly) / n;
    const pe = coachGood * appGood + (1 - coachGood) * (1 - appGood);
    kappa = pe < 1 ? (po - pe) / (1 - pe) : null;
  }
  return {
    n,
    unseen: trials.length - n,
    both,
    coachOnly,
    appOnly,
    neither,
    accuracy: ratio(both + neither, n),
    kappa,
    catchesFaults: ratio(neither, neither + appOnly),
    acceptsGood: ratio(both, both + coachOnly),
  };
}

/** The trials as a CSV table, for a spreadsheet or the report's appendix. */
export function trialsCsv(trials: CoachTrial[]): string {
  const head = 'id,time,skill,hand,coach,app,score,app_first_fault,blind,rater,judge,model_label,model_prob';
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [...trials]
    .sort((a, b) => a.at - b.at)
    .map((t) => [t.id, new Date(t.at).toISOString(), t.skill, t.hand, t.coach, t.app, t.score, t.appFault, t.blind, t.rater, t.judge ?? 'rules', t.modelLabel, t.modelProb].map(esc).join(','));
  return [head, ...rows].join('\n');
}
