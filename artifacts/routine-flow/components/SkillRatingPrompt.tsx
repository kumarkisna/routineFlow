import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSkills } from '@/context/SkillContext';
import { useColors } from '@/hooks/useColors';

export function SkillRatingPrompt({
  visible,
  skillIds,
  routineTitle,
  onSkip,
  onSaved,
}: {
  visible: boolean;
  skillIds: string[];
  routineTitle: string;
  onSkip: () => void;
  onSaved: () => void;
}) {
  const colors = useColors();
  const { skills, recordRatings } = useSkills();
  const items = [...new Set(skillIds)]
    .map(id => skills.find(skill => skill.id === id))
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));
  const [selected, setSelected] = React.useState<Record<string, number>>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const lock = React.useRef(false);
  const itemKey = items.map(item => item.id).join('|');

  React.useEffect(() => {
    if (visible) {
      setSelected({});
      setError('');
    }
  }, [visible, itemKey]);

  async function save() {
    if (lock.current) return;
    const entries = Object.entries(selected).map(([skillId, rating]) => ({ skillId, rating }));
    if (!entries.length) return;
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      await recordRatings(routineTitle, entries);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save these ratings.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: colors.sageSoft }]}>
              <Ionicons name="star" size={18} color={colors.success} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.foreground }]}>Rate the skills you used</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={2}>{routineTitle}</Text>
            </View>
          </View>
          <Text style={[styles.note, { color: colors.mutedForeground }]}>Choose a score from 1 to 10 for any skill. Ratings are optional.</Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            {items.map(skill => (
              <View key={skill.id} style={[styles.skillRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.skillName, { color: colors.foreground }]}>{skill.name}</Text>
                <View style={styles.scores}>
                  {Array.from({ length: 10 }, (_, index) => index + 1).map(score => {
                    const active = selected[skill.id] === score;
                    return (
                      <Pressable
                        key={score}
                        accessibilityRole="button"
                        accessibilityLabel={`Rate ${skill.name} ${score} out of 10`}
                        accessibilityState={{ selected: active }}
                        testID={`rate-skill-${skill.id}-${score}`}
                        disabled={saving}
                        onPress={() => {
                          setSelected(previous => ({ ...previous, [skill.id]: score }));
                          setError('');
                        }}
                        style={({ pressed }) => [
                          styles.score,
                          { backgroundColor: active ? colors.primary : colors.background, borderColor: active ? colors.primary : colors.border },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.scoreText, { color: active ? colors.primaryForeground : colors.inkSoft }]}>{score}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
          {error ? <Text accessibilityRole="alert" testID="skill-rating-error" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip skill ratings"
              testID="skip-skill-ratings"
              disabled={saving}
              onPress={onSkip}
              style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
            >
              <Text style={[styles.skipText, { color: colors.inkSoft }]}>Not now</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save skill ratings"
              testID="save-skill-ratings"
              disabled={saving || !Object.keys(selected).length}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.save,
                { backgroundColor: saving || !Object.keys(selected).length ? colors.secondary : colors.primary },
                pressed && styles.pressed,
              ]}
            >
              {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
              <Text style={[styles.saveText, { color: saving || !Object.keys(selected).length ? colors.mutedForeground : colors.primaryForeground }]}>
                {saving ? 'Saving…' : 'Save ratings'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#14191dcc', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 2 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, marginTop: 12 },
  list: { marginTop: 12, flexGrow: 0 },
  listContent: { gap: 10, paddingBottom: 4 },
  skillRow: { borderWidth: 1, borderRadius: 15, padding: 11, gap: 9 },
  skillName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  scores: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  score: { width: 27, height: 34, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 10 },
  skip: { minHeight: 46, paddingHorizontal: 14, justifyContent: 'center' },
  skipText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  save: { minHeight: 46, paddingHorizontal: 18, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  saveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  pressed: { opacity: 0.72 },
});
