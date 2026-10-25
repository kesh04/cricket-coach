import * as Speech from 'expo-speech';
import { SPEECH_RATE } from '@/lib/voice';

/** Roughly how long a sentence takes to say, in milliseconds. */
function speakingTime(text: string) {
  return 1600 + text.length * 92;
}

/**
 * Says a piece of the demonstration and reports when it has finished.
 *
 * With the voice off, it waits for about as long as the caption takes to read.
 * With the voice on, it waits for the speech to end; if the phone never reports the end
 * (some voices do not), it moves on after a generous time so the demonstration cannot stall.
 *
 * Returns a function that cancels it without calling `onEnd`.
 */
export function narrate(text: string, opts: { voice: boolean; onEnd: () => void }): () => void {
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    opts.onEnd();
  };

  let timer: ReturnType<typeof setTimeout>;
  if (!opts.voice) {
    timer = setTimeout(end, speakingTime(text) * 0.8);
  } else {
    timer = setTimeout(end, speakingTime(text) * 1.8);
    Speech.stop();
    Speech.speak(text, { language: 'en', rate: SPEECH_RATE, onDone: end, onError: end });
  }

  return () => {
    over = true;
    clearTimeout(timer);
    if (opts.voice) void Speech.stop();
  };
}
