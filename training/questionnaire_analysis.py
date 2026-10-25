"""Results of the usability and effectiveness questionnaire (report Tables 5.18, 5.19 and 5.20).

How to use (Google Colab):
  1. Make a Google Form with the questions of Appendix B. Start every question title with its code
     and a full stop, for example "B1. I think that I would like to use this app frequently."
     Use a linear scale 1 to 5 for B1-B10 and C1-C10, multiple choice for A1-A5, C11 and C12,
     and paragraph answers for D1-D3.
  2. After the session: Responses -> Download responses (.csv).
  3. Upload the CSV to Colab (folder icon on the left) and run:
         %run questionnaire_analysis.py responses.csv
     or paste this file into a cell and call  analyse('responses.csv').
Every number the report needs is printed; results are also saved as questionnaire_results.csv.
"""
import re
import sys

import numpy as np
import pandas as pd

CONSTRUCTS = [
    ('Perceived accuracy of the judgement', ['C1', 'C2']),
    ('Quality of the spoken feedback', ['C3', 'C4']),
    ('Trust in the application', ['C5', 'C6']),
    ('Perceived usefulness for learning', ['C7', 'C8']),
    ('Intention to continue use', ['C9', 'C10']),
]
PROFILE = [('A1', 'Role'), ('A2', 'Age group'), ('A3', 'Batting experience'), ('A4', 'Batting hand'), ('A5', 'Phone used')]


def load(path):
    raw = pd.read_csv(path)
    cols = {}
    for c in raw.columns:
        m = re.match(r'\s*([ABCD]\d{1,2})\b', str(c))
        if m:
            cols[c] = m.group(1)
    df = raw[list(cols)].rename(columns=cols)
    missing = [f'B{i}' for i in range(1, 11) if f'B{i}' not in df] + [f'C{i}' for i in range(1, 11) if f'C{i}' not in df]
    if missing:
        raise ValueError(f'Columns not found: {missing}. Start each question title with its code, e.g. "B1. ..."')
    for c in [f'B{i}' for i in range(1, 11)] + [f'C{i}' for i in range(1, 11)]:
        df[c] = pd.to_numeric(df[c].astype(str).str.extract(r'(\d)')[0], errors='coerce')
    return df


def cronbach_alpha(items: pd.DataFrame) -> float:
    items = items.dropna()
    k = items.shape[1]
    if k < 2 or len(items) < 2:
        return float('nan')
    item_var = items.var(axis=0, ddof=1).sum()
    total_var = items.sum(axis=1).var(ddof=1)
    return float(k / (k - 1) * (1 - item_var / total_var)) if total_var > 0 else float('nan')


def sus_scores(df):
    odd = sum(df[f'B{i}'] - 1 for i in (1, 3, 5, 7, 9))
    even = sum(5 - df[f'B{i}'] for i in (2, 4, 6, 8, 10))
    return 2.5 * (odd + even)


def analyse(path):
    df = load(path)
    n = len(df)
    out = []
    print(f'n = {n} participants\n')

    print('Table 5.18  Participant profile')
    for code, name in PROFILE:
        if code in df:
            vc = df[code].value_counts()
            print(f'  {name}: ' + ' / '.join(f'{k}: {v} ({100 * v / n:.0f}%)' for k, v in vc.items()))
    print()

    print('Table 5.19  Constructs (mean of the two items per participant)')
    rows = []
    for name, items in CONSTRUCTS:
        score = df[items].mean(axis=1)
        a = cronbach_alpha(df[items])
        rows.append((name, score.mean(), score.std(ddof=1), a))
        print(f'  {name:38s} {"+".join(items):7s} mean {score.mean():.2f} (SD {score.std(ddof=1):.2f})  alpha {a:.2f}')
        out.append({'table': '5.19', 'measure': name, 'mean': score.mean(), 'sd': score.std(ddof=1), 'alpha': a})
    hi, lo = max(rows, key=lambda r: r[1]), min(rows, key=lambda r: r[1])
    print(f'  Highest: {hi[0]} ({hi[1]:.2f}); lowest: {lo[0]} ({lo[1]:.2f})')
    low_alpha = [r[0] for r in rows if not (r[3] >= 0.70)]
    print('  All constructs alpha >= 0.70' if not low_alpha else f'  Alpha below 0.70: {low_alpha}')
    if 'C11' in df:
        yes = df['C11'].astype(str).str.lower().str.startswith('y').sum()
        print(f'  C11: {yes} of {n} reported at least one wrong result')
        if 'C12' in df:
            print('  C12: ' + ', '.join(f'{k}: {v}' for k, v in df['C12'].dropna().value_counts().items()))
    print()

    sus = sus_scores(df)
    print('Table 5.20  System Usability Scale')
    print(f'  Mean SUS {sus.mean():.1f} (SD {sus.std(ddof=1):.1f})')
    print(f'  Median {sus.median():.1f} (min {sus.min():.1f} to max {sus.max():.1f})')
    good = (sus >= 68).sum()
    print(f'  68 or higher: {good} of {n} ({100 * good / n:.0f}%)')
    # Even items are negatively worded; reverse them so that all ten items point the same way for alpha.
    adj = pd.DataFrame({f'B{i}': (df[f'B{i}'] if i % 2 else 6 - df[f'B{i}']) for i in range(1, 11)})
    a10 = cronbach_alpha(adj)
    print(f'  Cronbach alpha (ten items) {a10:.2f}')
    print(f'  Benchmark 68: {"above" if sus.mean() >= 68 else "below"}  -> NFR7 {"met" if sus.mean() >= 68 else "not met"}')
    contrib = {f'B{i}': ((df[f'B{i}'] - 1) if i % 2 else (5 - df[f'B{i}'])).mean() for i in range(1, 11)}
    worst = min(contrib, key=contrib.get)
    print(f'  Lowest-scoring item: {worst} (mean contribution {contrib[worst]:.2f} of 4)')
    out += [{'table': '5.20', 'measure': 'SUS mean', 'mean': sus.mean(), 'sd': sus.std(ddof=1), 'alpha': a10},
            {'table': '5.20', 'measure': 'SUS median/min/max', 'mean': sus.median(), 'sd': sus.min(), 'alpha': sus.max()}]
    print()

    for code, q in [('D1', 'Liked most'), ('D2', 'Difficult or confusing'), ('D3', 'Would improve')]:
        if code in df:
            print(f'{code} {q}:')
            for t in df[code].dropna():
                print(f'  - {t}')
    pd.DataFrame(out).to_csv('questionnaire_results.csv', index=False)
    pd.DataFrame({'participant': range(1, n + 1), 'SUS': sus}).to_csv('sus_per_participant.csv', index=False)
    print('\nSaved questionnaire_results.csv and sus_per_participant.csv')


if __name__ == '__main__' and len(sys.argv) > 1 and sys.argv[1].endswith('.csv'):
    analyse(sys.argv[1])
