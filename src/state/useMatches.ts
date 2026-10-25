import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { backend, type MatchRecord } from '@/services/backend';
import { useAuth } from '@/state/AuthContext';

/**
 * The learner's own matches, newest first. Loaded again each time the screen comes into view,
 * so a match added or changed on another screen shows at once.
 */
export function useMatches() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!user) return;
      backend
        .list(user.uid, 'matches', 500)
        .then((items) => {
          if (!alive) return;
          setMatches(items.slice().sort((a, b) => b.at - a.at || b.savedAt - a.savedAt));
          setError(null);
        })
        .catch((e) => alive && setError((e as Error).message))
        .finally(() => alive && setLoaded(true));
      return () => {
        alive = false;
      };
    }, [user]),
  );

  const save = useCallback(
    async (m: MatchRecord) => {
      if (!user) return;
      await backend.add(user.uid, 'matches', m);
      setMatches((all) => [m, ...all.filter((x) => x.id !== m.id)].sort((a, b) => b.at - a.at || b.savedAt - a.savedAt));
    },
    [user],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!user) return;
      await backend.remove(user.uid, 'matches', id);
      setMatches((all) => all.filter((x) => x.id !== id));
    },
    [user],
  );

  return { matches, loaded, error, save, remove };
}
