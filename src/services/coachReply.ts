import { LESSON_BY_ID } from '@/data/curriculum';
import { SKILL_NAME, SKILLS, type Skill } from '@/lib/pose/benchmarks';

/**
 * The coach's reply can end with two machine lines, which are not shown as text:
 *   NEXT: question one | question two | question three   (follow-up questions, shown as buttons)
 *   OPEN: lesson:stance                                  (a screen of the app, shown as a button)
 * While the answer streams in, a half-written machine line is hidden too.
 */
export type CoachAction = { label: string; route: string };
export type ParsedReply = { body: string; next: string[]; open: CoachAction | null };

const OPEN_TARGETS: Record<string, CoachAction> = {
  practice: { label: 'Open the Practise tab', route: '/practice' },
  'grip-check': { label: 'Check my grip with a photo', route: '/grip-check' },
  'grip-quiz': { label: 'Spot the grip mistake', route: '/grip-quiz' },
  field: { label: 'Open the field trainer', route: '/tools/field' },
  'set-field': { label: 'Set a field', route: '/tools/field?mode=set' },
  'stance-guide': { label: 'See the model stance in 3D', route: '/stance-guide' },
};

export function openTarget(raw: string): CoachAction | null {
  const t = raw.trim().toLowerCase().replace(/[.\s]+$/, '');
  if (OPEN_TARGETS[t]) return OPEN_TARGETS[t];
  const [kind, id] = t.split(':').map((x) => x.trim());
  if (kind === 'lesson' && id && LESSON_BY_ID[id]) return { label: `Open the lesson: ${LESSON_BY_ID[id].title}`, route: `/lesson/${id}` };
  if (kind === 'demo' && id && (SKILLS as string[]).includes(id)) return { label: `Watch: ${SKILL_NAME[id as Skill].replace(/^The /, 'the ')}`, route: `/demo/${id}` };
  return null;
}

export function parseCoachReply(text: string): ParsedReply {
  const lines = text.replace(/\r/g, '').split('\n');
  const keep: string[] = [];
  let next: string[] = [];
  let open: CoachAction | null = null;
  lines.forEach((line, i) => {
    const m = /^\s*(NEXT|OPEN)\s*:\s*(.*)$/i.exec(line);
    if (m) {
      if (m[1].toUpperCase() === 'NEXT') next = m[2].split('|').map((q) => q.trim().replace(/^["“]|["”]$/g, '')).filter((q) => q.length > 3 && q.length < 90).slice(0, 3);
      else open = openTarget(m[2]) ?? open;
      return;
    }
    // A machine line still being written at the end of the stream.
    if (i === lines.length - 1 && /^\s*(N(E(X(T)?)?)?|O(P(E(N)?)?)?)\s*$/.test(line) && line.trim()) return;
    keep.push(line);
  });
  return { body: keep.join('\n').trim(), next, open };
}


