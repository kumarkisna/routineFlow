import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { MAX_SKILL_NOTE_LENGTH, type RoutineSkill, type SkillRating, type SkillRatingRun } from '@/lib/skills';
import { getPreviousPersonSkillRatings, recordPersonSkillRatings } from '@/lib/personSkillRatings';
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
  const [pendingDiscardAction, setPendingDiscardAction] = React.useState<'close' | 'skipPerson' | 'skipRemaining' | null>(null);
  const [previousRatings, setPreviousRatings] = React.useState<Record<string, SkillRating | null>>({});
  const [loadingPreviousRatings, setLoadingPreviousRatings] = React.useState(false);
  const [previousRatingsError, setPreviousRatingsError] = React.useState('');
  const person = people[personIndex];
  const peopleSignature = people.map(item => item.id).join('|');
  const sourceSkillSignature = sourceSkills.map(skill => `${skill.id}\u0000${skill.name}`).join('\u0001');
  React.useEffect(() => {
    if (!visible) return;
    setPersonIndex(0);
    setRatings({});
    setNotes({});
    setError('');
    setPendingDiscardAction(null);
  }, [visible, peopleSignature]);
  React.useEffect(() => {
    let cancelled = false;
    if (!visible || !person) {
      setPreviousRatings({});
      setPreviousRatingsError('');
      setLoadingPreviousRatings(false);
      return () => { cancelled = true; };
    }

    setPreviousRatings({});
    setPreviousRatingsError('');
    setLoadingPreviousRatings(true);
    void getPreviousPersonSkillRatings(person.id, sourceSkills)
      .then(result => {
        if (!cancelled) setPreviousRatings(result);
      })
      .catch(cause => {
        if (!cancelled) {
          setPreviousRatingsError(cause instanceof Error
            ? `Previous ratings for ${person.name} could not be loaded. ${cause.message}`
            : `Previous ratings for ${person.name} could not be loaded.`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreviousRatings(false);
      });
    return () => { cancelled = true; };
  }, [visible, person?.id, sourceSkillSignature]);

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

  function performDiscard(action: 'close' | 'skipPerson' | 'skipRemaining') {
    setPendingDiscardAction(null);
    setRatings({});
    setNotes({});
    setError('');
    if (action === 'skipPerson') nextPerson();
    else onDone();
  }

  function requestDiscard(action: 'close' | 'skipPerson' | 'skipRemaining') {
    if (saving) return;
    const hasUnsavedInput = Object.keys(ratings).length > 0 || Object.values(notes).some(note => note.length > 0);
    if (hasUnsavedInput) {
      setPendingDiscardAction(action);
      return;
    }
    performDiscard(action);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => requestDiscard('close')}>
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
            <Pressable
              testID="close-group-rating-prompt"
              accessibilityRole="button"
              accessibilityLabel="Close group ratings"
              disabled={saving}
              onPress={() => requestDiscard('close')}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={20} color={colors.inkSoft} />
            </Pressable>
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
                    <View testID={`previous-rating-${person.id}-${skill.id}`} style={styles.previousRating}>
                      {loadingPreviousRatings ? (
                        <Text style={[styles.previousRatingText, { color: colors.mutedForeground }]}>Loading previous rating…</Text>
                      ) : previousRatingsError ? (
                        <Text style={[styles.previousRatingText, { color: colors.destructive }]}>{previousRatingsError}</Text>
                      ) : previousRatings[skill.id] ? (
                        <>
                          <Text style={[styles.previousRatingText, { color: colors.mutedForeground }]}>
                            Previous: {previousRatings[skill.id]!.rating}/10 · {new Date(previousRatings[skill.id]!.ratedAt).toLocaleDateString()}
                          </Text>
                          <Text style={[styles.previousRatingText, { color: colors.mutedForeground }]}>
                            {previousRatings[skill.id]!.note
                              ? `Previous note: ${previousRatings[skill.id]!.note}`
                              : 'No previous note saved.'}
                          </Text>
                        </>
                      ) : (
                        <Text style={[styles.previousRatingText, { color: colors.mutedForeground }]}>No previous rating for this person.</Text>
                      )}
                    </View>
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
            <Pressable testID="skip-group-ratings" disabled={saving} onPress={() => requestDiscard('skipRemaining')} style={styles.action}>
              <Text style={[styles.skip, { color: colors.inkSoft }]}>Skip remaining</Text>
            </Pressable>
            <Pressable testID="skip-group-person" disabled={saving} onPress={() => requestDiscard('skipPerson')} style={styles.action}>
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
          {pendingDiscardAction ? (
            <View testID="unsaved-rating-confirmation" style={styles.confirmationOverlay}>
              <View style={[styles.confirmationCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.confirmationTitle, { color: colors.foreground }]}>
                  {pendingDiscardAction === 'skipPerson' ? `Skip ${person?.name ?? 'person'}?` : 'Discard unsaved ratings?'}
                </Text>
                <Text style={[styles.confirmationMessage, { color: colors.mutedForeground }]}>
                  Scores and notes for {person?.name ?? 'this person'} haven’t been saved. You can keep editing or discard this person’s entries.
                </Text>
                <View style={styles.confirmationActions}>
                  <Pressable
                    testID="cancel-discard-unsaved-ratings"
                    accessibilityRole="button"
                    onPress={() => setPendingDiscardAction(null)}
                    style={styles.confirmationCancel}
                  >
                    <Text style={[styles.confirmationCancelText, { color: colors.foreground }]}>Keep editing</Text>
                  </Pressable>
                  <Pressable
                    testID="confirm-discard-unsaved-ratings"
                    accessibilityRole="button"
                    onPress={() => performDiscard(pendingDiscardAction)}
                    style={[styles.confirmationConfirm, { backgroundColor: colors.destructive }]}
                  >
                    <Text style={styles.confirmationConfirmText}>
                      {pendingDiscardAction === 'skipPerson'
                        ? 'Discard and skip'
                        : pendingDiscardAction === 'skipRemaining'
                          ? 'Discard and skip remaining'
                          : 'Discard and close'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
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
  previousRating: { gap: 3 },
  previousRatingText: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15 },
  scores: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  score: { width: 27, height: 33, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  note: { minHeight: 58, borderWidth: 1, borderRadius: 10, padding: 9, textAlignVertical: 'top', fontFamily: 'Inter_400Regular', fontSize: 12 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 5, paddingTop: 12 },
  action: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 4 },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  skip: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  save: { minHeight: 42, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  confirmationOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#14191dcc', justifyContent: 'center', padding: 20 },
  confirmationCard: { borderWidth: 1, borderRadius: 18, padding: 18 },
  confirmationTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  confirmationMessage: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 8 },
  confirmationActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  confirmationCancel: { minHeight: 42, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 12 },
  confirmationCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  confirmationConfirm: { minHeight: 42, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 12 },
  confirmationConfirmText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
