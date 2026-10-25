import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, P, Seam, Small } from '@/components/ui';
import { STANCE_FIRST_REPS } from '@/data/training';
import { useData } from '@/state/DataContext';
import { sp } from '@/theme';

/**
 * Shown where a practice is closed because the stance has not been done yet: why the stance comes
 * first, how far the learner has got, and a button straight to the stance practice.
 */
export function StanceFirst({ compact }: { compact?: boolean }) {
  const { stanceReps, skills } = useData();
  const done = Math.min(stanceReps, STANCE_FIRST_REPS);
  const left = STANCE_FIRST_REPS - done;
  const go = () => router.push(skills.stance.watched ? '/setup?skill=stance' : '/demo/stance');
  return (
    <View style={{ gap: sp(2) }}>
      <P soft>
        {compact
          ? `Do the stance first: ${left} more good ${left === 1 ? 'stance' : 'stances'} with the camera opens this practice.`
          : `Every shot starts from the stance. If your stance is wrong, every shot you play from it is wrong too, so the stance comes first. Hold ${STANCE_FIRST_REPS} good stances with the camera, and all the shots open.`}
      </P>
      <Seam value={done} total={STANCE_FIRST_REPS} />
      <Small>
        {done} of {STANCE_FIRST_REPS} good stances done{left > 0 ? `, ${left} to go` : ''}
      </Small>
      <Button title={skills.stance.watched ? 'Practise the stance' : 'Learn the stance'} icon="body" kind={compact ? 'secondary' : 'primary'} onPress={go} />
    </View>
  );
}
