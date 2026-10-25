import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Videos of practice sets.
 *
 * While the learner practises, the camera page records the picture with the skeleton (and the
 * stumps) drawn on it. When the set is saved, the video is handed to the app and kept here, on
 * this phone only, so the learner can watch the set again on the result screen. It is never
 * uploaded. Only the most recent few are kept, because videos are large.
 */
const KEEP = 8;
const FOLDER = 'clips';

// On the web (testing on a computer) there is no file system: videos are kept in memory.
const memory = new Map<string, string>();

function extensionOf(dataUrl: string): string {
  const type = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? '';
  return type.includes('mp4') ? 'mp4' : type.includes('quicktime') ? 'mov' : 'webm';
}

/** Saves a video (a data URL from the camera page). Returns the file name to keep with the set, or null. */
export async function saveClip(sessionId: string, dataUrl: string): Promise<string | null> {
  try {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    const name = `${sessionId}.${extensionOf(dataUrl)}`;
    if (Platform.OS === 'web') {
      memory.set(name, dataUrl);
      return name;
    }
    const dir = new Directory(Paths.document, FOLDER);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, name);
    file.write(dataUrl.slice(comma + 1), { encoding: 'base64' });
    // Keep only the newest few.
    const files = dir
      .list()
      .filter((f): f is File => f instanceof File)
      .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
    for (const old of files.slice(KEEP)) {
      try {
        old.delete();
      } catch {
        // Ignore: it will be tried again next time.
      }
    }
    return name;
  } catch {
    return null;
  }
}

/** Where a saved video can be played from, or null when it is gone. */
export async function clipUri(name: string): Promise<string | null> {
  if (Platform.OS === 'web') return memory.get(name) ?? null;
  try {
    const file = new File(Paths.document, FOLDER, name);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}
