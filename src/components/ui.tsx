import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { C, F, R, sp, statusColor, statusIcon, statusLabel, type Status } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Page wrapper: safe area, background and optional scrolling. */
export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  style,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView edges={edges} style={[styles.screen, style]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Back button and title for pushed screens. */
export function TopBar({ title, right, onBack }: { title?: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        style={styles.backButton}>
        <Ionicons name="chevron-back" size={22} color={C.ink} />
      </Pressable>
      {title ? (
        <Text style={styles.topTitle} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.h1, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.h2, style]}>{children}</Text>;
}
export function H3({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.h3, style]}>{children}</Text>;
}
export function P({ children, style, soft }: { children: ReactNode; style?: StyleProp<TextStyle>; soft?: boolean }) {
  return <Text style={[styles.p, soft && { color: C.inkSoft }, style]}>{children}</Text>;
}
export function Small({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.small, style]}>{children}</Text>;
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = kind === 'primary' || kind === 'danger' ? '#FFFFFF' : kind === 'ghost' ? C.outfield : C.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && { backgroundColor: C.outfield },
        kind === 'danger' && { backgroundColor: C.ball },
        kind === 'secondary' && { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.line },
        kind === 'ghost' && { backgroundColor: 'transparent', minHeight: 44 },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field({ label, error, style, ...input }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ gap: sp(1.5) }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={C.inkMute}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, !!error && { borderColor: C.bad }, style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** One-of-many choice shown as a row of buttons. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T | null;
  options: { value: T; label: string; note?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: sp(1.5) }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.choiceRow}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={[styles.choice, on && styles.choiceOn]}>
              <Text style={[styles.choiceText, on && { color: '#FFFFFF' }]}>{o.label}</Text>
              {o.note ? <Text style={[styles.choiceNote, on && { color: '#DDEBE3' }]}>{o.note}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Progress drawn as the stitched seam of a cricket ball.
 * Each stitch is one step; filled stitches are done.
 */
export function Seam({ value, total = 24, color = C.ball, track = C.line }: { value: number; total?: number; color?: string; track?: string }) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * total);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={styles.seam}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.stitch, { backgroundColor: i < filled ? color : track }]} />
      ))}
    </View>
  );
}

/** Status shown with an icon and a word, never by colour alone. */
export function StatusPill({ status, label, compact }: { status: Status; label?: string; compact?: boolean }) {
  return (
    <View style={[styles.pill, { borderColor: statusColor[status] }, compact && { paddingHorizontal: sp(2), paddingVertical: sp(1) }]}>
      <Ionicons name={statusIcon[status]} size={compact ? 14 : 16} color={statusColor[status]} />
      <Text style={[styles.pillText, compact && { fontSize: 12 }]}>{label ?? statusLabel[status]}</Text>
    </View>
  );
}

export function Notice({ icon = 'information-circle', children, tone = 'info' }: { icon?: IconName; children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <View style={[styles.notice, tone === 'warn' && { backgroundColor: C.warnTint }]}>
      <Ionicons name={icon} size={20} color={tone === 'warn' ? C.warn : C.outfield} />
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: sp(3) }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: sp(5), paddingBottom: sp(10), gap: sp(4), width: '100%', maxWidth: 560, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginBottom: sp(1) },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.line,
  },
  topTitle: { flex: 1, fontFamily: F.display, fontSize: 22, color: C.ink },
  h1: { fontFamily: F.displayBold, fontSize: 40, lineHeight: 42, color: C.ink, letterSpacing: -0.3 },
  h2: { fontFamily: F.display, fontSize: 28, lineHeight: 31, color: C.ink },
  h3: { fontFamily: F.display, fontSize: 21, lineHeight: 25, color: C.ink },
  p: { fontSize: 16, lineHeight: 24, color: C.ink },
  small: { fontSize: 13, lineHeight: 18, color: C.inkSoft },
  button: {
    minHeight: 54,
    borderRadius: R.md,
    paddingHorizontal: sp(5),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sp(2),
  },
  buttonText: { fontSize: 17, fontWeight: '600' },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: sp(4.5), gap: sp(2.5), borderWidth: 1, borderColor: C.line },
  label: { fontSize: 14, fontWeight: '600', color: C.ink },
  input: {
    minHeight: 52,
    borderRadius: R.md,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.surface,
    paddingHorizontal: sp(4),
    fontSize: 16,
    color: C.ink,
  },
  error: { color: C.bad, fontSize: 13 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  choice: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 50,
    borderRadius: R.md,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.surface,
    paddingHorizontal: sp(3),
    paddingVertical: sp(2.5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceOn: { backgroundColor: C.outfield, borderColor: C.outfield },
  choiceText: { fontSize: 15, fontWeight: '600', color: C.ink, textAlign: 'center' },
  choiceNote: { fontSize: 12, color: C.inkSoft, textAlign: 'center', marginTop: 2 },
  seam: { flexDirection: 'row', gap: 3, alignItems: 'center', height: 14 },
  stitch: { flex: 1, height: 12, borderRadius: 2, transform: [{ skewX: '-24deg' }] },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(1.5),
    borderWidth: 1.5,
    borderRadius: R.pill,
    paddingHorizontal: sp(3),
    paddingVertical: sp(1.5),
    backgroundColor: C.surface,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 13, fontWeight: '600', color: C.ink },
  notice: { flexDirection: 'row', gap: sp(2.5), backgroundColor: C.outfieldTint, borderRadius: R.md, padding: sp(3.5), alignItems: 'flex-start' },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20, color: C.ink },
});
