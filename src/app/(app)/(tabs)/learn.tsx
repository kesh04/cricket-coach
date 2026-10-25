import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { H1, H3, P, Screen, Seam, Small } from '@/components/ui';
import { LESSONS, LEVELS, personalise, sentence } from '@/data/curriculum';
import { useProfile } from '@/state/AuthContext';
import { levelProgress, useData } from '@/state/DataContext';
import { C, R, sp } from '@/theme';

export default function Learn() {
  const profile = useProfile();
  const { passed, unlocked } = useData();

  return (
    <Screen>
      <H1>Learn</H1>
      <P soft>Pass each quiz to open the next lesson.</P>

      {LEVELS.map((level) => {
        const { done, total } = levelProgress(level.number, passed);
        return (
          <View key={level.number} style={{ gap: sp(2.5), marginTop: sp(2) }}>
            <View>
              <Small>
                Level {level.number}, {done} of {total} passed
              </Small>
              <H3>{level.title}</H3>
            </View>
            <Seam value={total ? done / total : 0} total={total * 4} />
            <View style={styles.list}>
              {LESSONS.filter((l) => l.level === level.number).map((lesson, i, all) => {
                const isPassed = passed.has(lesson.id);
                const open = unlocked(lesson.id);
                return (
                  <Pressable
                    key={lesson.id}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !open }}
                    accessibilityLabel={`${lesson.title}. ${isPassed ? 'Passed' : open ? 'Open' : 'Locked'}`}
                    disabled={!open}
                    onPress={() => router.push(`/lesson/${lesson.id}`)}
                    style={({ pressed }) => [styles.row, i < all.length - 1 && styles.divider, pressed && { backgroundColor: C.outfieldTint }]}>
                    <Ionicons
                      name={isPassed ? 'checkmark-circle' : open ? 'play-circle' : 'lock-closed'}
                      size={28}
                      color={isPassed ? C.good : open ? C.outfield : C.inkMute}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.title, !open && { color: C.inkMute }]}>{lesson.title}</Text>
                      <Text style={styles.summary}>
                        {open ? sentence(personalise(lesson.summary, profile.battingHand)) : 'Pass the lesson before this one to open it.'}
                      </Text>
                    </View>
                    <Text style={styles.minutes}>{isPassed ? 'Passed' : `${lesson.minutes} min`}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(3), padding: sp(4), minHeight: 68 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.line },
  title: { fontSize: 16, fontWeight: '600', color: C.ink },
  summary: { fontSize: 13, lineHeight: 18, color: C.inkSoft, marginTop: 2 },
  minutes: { fontSize: 13, color: C.inkSoft },
});
