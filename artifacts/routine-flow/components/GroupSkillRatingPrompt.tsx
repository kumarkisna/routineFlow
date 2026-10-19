import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { MAX_SKILL_NOTE_LENGTH, type RoutineSkill, type SkillRatingRun } from '@/lib/skills';
import { recordPersonSkillRatings } from '@/lib/personSkillRatings';
import type { Person } from '@/types/people';

export function GroupSkillRatingPrompt({
  visible, people, sourceSkills, routineTitle, contextLabel, run, onDone,
}: {
  visible: boolean;
  people: Person[];
  sourceSkills: RoutineSkill[];
  routineTitle: string;
  contextLabel?: string;
  run: SkillRatingRun;
  onDone: () => void;
}) {
  const colors = useColors();
  const [personIndex, setPersonIndex] = React.useState(0);
  const [ratings, setRatings] = React.useState<Record<string, number>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const person = people[personIndex];
  React.useEffect(() => {
    if (visible) {
      setPersonIndex(0);
      setRatings({});
      setNotes({});
      setError('');
    }
  }, [visible, people.map(item => item.id).join('|')]);

  function nextPerson() {
    if (personIndex + 1 >= people.length) {
      onDone();
      return;
    }
    setPersonIndex(index => index + 1);
    setRatings({});
    setNotes({});
    setError('');
  }

  async function save() {
    if (!person || saving || !Object.keys(ratings).length) return;
    setSaving(true);
    setError('');
    try {
      await recordPersonSkillRatings({
        personId: person.id,
        sourceSkills,
        routineTitle,
        run,
        entries: sourceSkills.flatMap((skill, sequence) => ratings[skill.id] === undefined ? [] : [{
          sourceSkillId: skill.id,
          rating: ratings[skill.id],
          sequence,
          ...(notes[skill.id]?.trim() ? { note: notes[skill.id].trim() } : {}),
        }]),
      });
      nextPerson();
    } catch (cause) {
      setError(cause instanceof Error
        ? `Could not save ratings for ${person.name}. ${cause.message}`
        : `Could not save ratings for ${person.name}. Please try again.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: colors.sageSoft }]}>
              <Ionicons name="people-outline" size={18} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>Rate each person</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {contextLabel ?? routineTitle} · Person {Math.min(personIndex + 1, people.length)} of {people.length}
              </Text>
            </View>
          </View>
          {person ? (
            <>
              <Text testID="group-rating-person-name" style={[styles.personName, { color: colors.foreground }]}>
                {person.name}
              </Text>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                Skills are matched by name in this person’s profile. Missing skills are added when you save ratings.
              </Text>
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {sourceSkills.map(skill => (
                  <View key={skill.id} style={[styles.skill, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.skillName, { color: colors.foreground }]}>{skill.name}</Text>
                    <View style={styles.scores}>
                      {Array.from({ length: 10 }, (_, index) => index + 1).map(score => {
                        const selected = ratings[skill.id] === score;
                        return (
                          <Pressable
                            key={score}
                            accessibilityRole="button"
                            accessibilityLabel={`Rate ${person.name} ${skill.name} ${score} out of 10`}
                            testID={`group-rate-${person.id}-${skill.id}-${score}`}
                            onPress={() => setRatings(current => ({ ...current, [skill.id]: score }))}
                            style={[styles.score, { backgroundColor: selected ? colors.primary : colors.background, borderColor: selected ? colors.primary : colors.border }]}
                          >
                            <Text style={{ color: selected ? colors.primaryForeground : colors.inkSoft, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{score}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <TextInput
                      accessibilityLabel={`Note for ${person.name} about ${skill.name}`}
                      testID={`group-note-${person.id}-${skill.id}`}
                      value={notes[skill.id] ?? ''}
                      onChangeText={value => setNotes(current => ({ ...current, [skill.id]: value }))}
                      editable={!saving && ratings[skill.id] !== undefined}
                      maxLength={MAX_SKILL_NOTE_LENGTH}
                      multiline
                      placeholder={ratings[skill.id] === undefined ? 'Choose a score to add a note' : 'Add an optional note'}
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.note, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    />
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
          {error ? <Text testID="group-rating-error" accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable testID="skip-group-ratings" onPress={onDone} style={styles.action}>
              <Text style={[styles.skip, { color: colors.inkSoft }]}>Skip remaining</Text>
            </Pressable>
            <Pressable testID="skip-group-person" onPress={nextPerson} style={styles.action}>
              <Text style={[styles.skip, { color: colors.inkSoft }]}>Skip person</Text>
            </Pressable>
            <Pressable
              testID="save-group-ratings"
              disabled={saving || !Object.keys(ratings).length}
              onPress={() => void save()}
              style={[styles.save, { backgroundColor: saving || !Object.keys(ratings).length ? colors.secondary : colors.primary }]}
            >
              {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
              <Text style={{ color: saving || !Object.keys(ratings).length ? colors.mutedForeground : colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                {saving ? 'Saving…' : personIndex + 1 === people.length ? 'Save and finish' : 'Save and continue'}
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
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  personName: { fontFamily: 'Inter_700Bold', fontSize: 19, marginTop: 16 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 5 },
  list: { marginTop: 12 },
  skill: { borderWidth: 1, borderRadius: 14, padding: 11, marginBottom: 9, gap: 9 },
  skillName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  scores: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  score: { width: 27, height: 33, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  note: { minHeight: 58, borderWidth: 1, borderRadius: 10, padding: 9, textAlignVertical: 'top', fontFamily: 'Inter_400Regular', fontSize: 12 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 5, paddingTop: 12 },
  action: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 4 },
  skip: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  save: { minHeight: 42, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
