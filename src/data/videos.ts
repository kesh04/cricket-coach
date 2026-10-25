import type { Skill } from '@/lib/pose/benchmarks';

/**
 * Videos for extra learning, opened in YouTube or the browser.
 *
 * Each skill has a free coaching video from Sikana (checked when this was written) and a YouTube
 * search, which always shows current videos. To show one video your coach has chosen, add it at
 * the top of the list, for example:
 *   { title: 'Forward defence with Coach Perera', source: 'YouTube', url: 'https://www.youtube.com/watch?v=...' },
 * Only add videos you have watched and are happy for a young learner to see.
 */
export type VideoLink = { title: string; source: string; url: string };

const youtube = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

export const MORE_VIDEOS: Record<Skill, VideoLink[]> = {
  grip: [
    { title: 'Cricket batting basics: Grip', source: 'Cricket Mentoring, YouTube', url: 'https://www.youtube.com/watch?v=7hQzWlxTqc8' },
    { title: 'Batting grip: how to hold the bat correctly (Sid Lahiri)', source: 'Cricket Life Stories, YouTube', url: 'https://www.youtube.com/watch?v=GgBt2S1KTGA' },
    { title: 'Learn the grip and stance', source: 'Sikana, free coaching video', url: 'https://www.sikana.tv/en/sport/grip-and-stance' },
    { title: 'More videos: how to hold a cricket bat', source: 'YouTube search', url: youtube('how to hold a cricket bat grip for beginners') },
  ],
  stance: [
    { title: 'Learn the grip and stance', source: 'Sikana, free coaching video', url: 'https://www.sikana.tv/en/sport/grip-and-stance' },
    { title: 'More videos: the batting stance', source: 'YouTube search', url: youtube('cricket batting stance for beginners') },
  ],
  drive: [{ title: 'More videos: the front-foot drive', source: 'YouTube search', url: youtube('cricket front foot drive tutorial for beginners') }],
  backdefence: [{ title: 'More videos: the back-foot defence', source: 'YouTube search', url: youtube('cricket back foot defence tutorial for beginners') }],
  pull: [{ title: 'More videos: the pull shot', source: 'YouTube search', url: youtube('cricket pull shot tutorial for beginners') }],
  cut: [{ title: 'More videos: the square cut', source: 'YouTube search', url: youtube('cricket square cut tutorial for beginners') }],
  sweep: [{ title: 'More videos: the sweep shot', source: 'YouTube search', url: youtube('cricket sweep shot tutorial for beginners') }],
  defence: [
    { title: 'How to play a front foot defence', source: 'Sikana, free coaching video', url: 'https://sikana.tv/en/sport/cricket/front-foot-defence' },
    { title: 'More videos: the forward defence', source: 'YouTube search', url: youtube('cricket forward defence tutorial for beginners') },
  ],
};

/**
 * A coaching video that must be watched to the end before the first practice of a skill.
 * It plays inside the app and cannot be skipped. To change it, put the YouTube video id here:
 * the part after "v=" (or after youtu.be/) in a link such as https://youtu.be/xebUS0CCg6k.
 * Check that it plays in the app: some videos do not allow playing in other apps.
 * Leave a skill out to use the in-app animation only.
 *
 * Set MUST_WATCH_EVERY_DAY to true to show it before the first practice of every day instead.
 */
export type MustWatch = { youtubeId: string; title: string; source: string };

export const MUST_WATCH: Partial<Record<Skill, MustWatch>> = {
  // A coach explains the grip close up: top and bottom hand, the Vs and why the grip decides where
  // the ball goes. The channel allows embedding ("For online use, you may embed this YouTube video").
  // If it does not play in the app, the in-app grip pictures are shown instead.
  grip: { youtubeId: '7hQzWlxTqc8', title: 'Cricket batting basics: Grip', source: 'Cricket Mentoring coaching video' },
  // Sikana's free "Learn the grip and stance" lesson (sikana.tv/en/sport/grip-and-stance).
  stance: { youtubeId: 'gusv3BsHd3g', title: 'Learn the grip and stance', source: 'Sikana coaching video' },
  // Sikana's free "How to play a front foot defence" lesson (sikana.tv/en/sport/cricket/front-foot-defence).
  // If it does not play in the app, the in-app animation is shown instead.
  defence: { youtubeId: 'CdlYCoqUVEQ', title: 'How to play a front foot defence', source: 'Sikana coaching video' },
};

export const MUST_WATCH_EVERY_DAY = false;
