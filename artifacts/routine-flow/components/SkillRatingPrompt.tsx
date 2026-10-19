import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSkills } from '@/context/SkillContext';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { getLatestSkillRating, MAX_SKILL_NOTE_LENGTH, type RoutineSkill, type SkillRatingRun } from '@/lib/skills';
import type { MissingSkillRatingNote } from '@/lib/progressHistory';
import { formatHistoryDay } from '@/lib/progressHistory';

type RatingPromptItem = {
  skill: RoutineSkill;
  key: string;
  noteTarget?: MissingSkillRatingNote;
  editTarget?: SkillRatingNoteEditTarget;
};

export type SkillRatingNoteEditTarget = {
  skillId: string;
  ratingId: string;
  rating: number;
  note: string;
  ratedAt: string;
  completedDay?: string;
  completedAt?: string;
  contextLabel?: string;
};

export function SkillRatingPrompt({
  visible,
  skillIds,
  routineTitle,
  contextLabel,
  run,
  noteTargets,
  editTarget,
  onSkip,
  onSaved,
}: {
  visible: boolean;
  skillIds: string[];
  routineTitle: string;
  /** Optional display context, such as a playlist name; ratings still attach to routineTitle in history. */
  contextLabel?: string;
  run?: SkillRatingRun;
  /** Existing ratings can be given a missing note without changing the saved score. */
  noteTargets?: MissingSkillRatingNote[];
  /** An existing reflection can be updated without changing its score or history entry. */
  editTarget?: SkillRatingNoteEditTarget;
  onSkip: () => void;
  onSaved: () => void;
}) {
  const colors = useColors();
  const { skills, recordRatings, addRatingNotes, updateRatingNote } = useSkills();
  const noteOnly = noteTargets !== undefined;
  const editing = editTarget !== undefined;
  const items: RatingPromptItem[] = editing
    ? (() => {
      const skill = skills.find(item => item.id === editTarget.skillId);
      return skill ? [{ skill, key: editTarget.ratingId, editTarget }] : [];
    })()
    : noteOnly
    ? (noteTargets ?? []).flatMap(noteTarget => {
      const skill = skills.find(item => item.id === noteTarget.skillId);
      return skill ? [{ skill, key: noteTarget.ratingId, noteTarget }] : [];
    })
    : [...new Set(skillIds)].flatMap(id => {
      const skill = skills.find(item => item.id === id);
      return skill ? [{ skill, key: skill.id }] : [];
    });
  const [selected, setSelected] = React.useState<Record<string, number>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const lock = React.useRef(false);
  const itemKey = items.map(item => item.key).join('|');

  React.useEffect(() => {
    if (visible) {
      setSelected({});
      setNotes(editTarget ? { [editTarget.ratingId]: editTarget.note } : {});
      setError('');
    }
  }, [visible, itemKey, editTarget?.note, editTarget?.ratingId]);

  async function save() {
    if (lock.current) return;
    const ratingEntries = items.flatMap(({ skill, key }, sequence) => {
      const rating = selected[skill.id];
      if (rating === undefined) return [];
      return [{
        skillId: skill.id,
        rating,
        sequence,
        ...(notes[key]?.trim() ? { note: notes[key].trim() } : {}),
      }];
    });
    const noteEntries = items.flatMap(({ skill, key, noteTarget }) => {
      const note = notes[key]?.trim();
      const target = noteTarget;
      if (!target || !note) return [];
      return [{ skillId: skill.id, ratingId: target.ratingId, note }];
    });
    if (noteOnly ? !noteEntries.length : !editing && !ratingEntries.length) return;
    if (!noteOnly && !editing && !run) {
      setError('Could not find this routine’s completion time. Please close and try again.');
      return;
    }
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      if (editing && editTarget) {
        await updateRatingNote(editTarget.skillId, editTarget.ratingId, notes[editTarget.ratingId] ?? '');
      } else if (noteOnly) {
        await addRatingNotes(noteEntries);
      } else {
        await recordRatings(routineTitle, ratingEntries, run!);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save these ratings.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  const canSave = editing || (noteOnly
    ? Object.values(notes).some(note => note.trim().length > 0)
    : Object.keys(selected).length > 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <View style={styles.backdrop}>
      <KeyboardAwareScrollViewCompat
        style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={70}
      >
          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: colors.sageSoft }]}>
              <Ionicons name={noteOnly ? 'create-outline' : 'star'} size={18} color={colors.success} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {editing ? 'Edit reflection' : noteOnly ? 'Add notes to past ratings' : 'Rate the skills you used'}
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
                {editTarget?.contextLabel ?? contextLabel ?? routineTitle}
              </Text>
            </View>
          </View>
          <Text style={[styles.note, { color: colors.mutedForeground }]}>
            {editing
              ? 'Update your reflection. The saved score and original history entry will stay unchanged.'
              : noteOnly
              ? 'Add a reflection to the saved rating. The score will stay unchanged.'
              : 'Choose a score from 1 to 10 for any skill. Add an optional note to remember what went well or what to work on.'}
          </Text>
          <View style={styles.list}>
            {items.map(({ skill, key, noteTarget }) => {
              const previousRating = !noteOnly && !editing ? getLatestSkillRating(skill) : null;
              return (
              <View key={key} style={[styles.skillRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.skillName, { color: colors.foreground }]}>{skill.name}</Text>
                {noteOnly || editing ? (
                  <>
                    <Text style={[styles.savedScore, { color: colors.primary }]}>
                      Saved score · {noteTarget?.rating ?? editTarget?.rating}/10
                    </Text>
                    {noteTarget || editTarget ? (
                      <Text style={[styles.targetDate, { color: colors.mutedForeground }]}>
                        {(noteTarget?.completedAt ?? editTarget?.completedAt)
                          ? new Date(noteTarget?.completedAt ?? editTarget?.completedAt ?? '').toLocaleString()
                          : (noteTarget?.completedDay ?? editTarget?.completedDay)
                            ? `Completed ${formatHistoryDay((noteTarget?.completedDay ?? editTarget?.completedDay)!)}`
                            : `Rated ${new Date(noteTarget?.ratedAt ?? editTarget?.ratedAt ?? '').toLocaleString()}`}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <>
                    <View testID={`previous-rating-${skill.id}`} style={styles.previousRating}>
                      {previousRating ? (
                        <>
                          <Text style={[styles.savedScore, { color: colors.primary }]}>
                            Previous rating (reference only) · {previousRating.rating}/10 · {new Date(previousRating.ratedAt).toLocaleDateString()}
                          </Text>
                          {previousRating.routineTitle?.trim() ? (
                            <Text testID={`previous-rating-routine-${skill.id}`} style={[styles.previousNote, { color: colors.mutedForeground }]}>
                              Routine: {previousRating.routineTitle}
                            </Text>
                          ) : null}
                          <Text testID={`previous-rating-note-${skill.id}`} style={[styles.previousNote, { color: colors.mutedForeground }]}>
                            {previousRating.note ? `Previous note: ${previousRating.note}` : 'No note saved with the previous rating.'}
                          </Text>
                        </>
                      ) : (
                        <Text style={[styles.previousNote, { color: colors.mutedForeground }]}>No previous rating yet.</Text>
                      )}
                    </View>
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
                  </>
                )}
                <Text style={[styles.noteLabel, { color: colors.inkSoft }]}>
                  {editing ? 'Reflection note' : noteOnly ? 'Add reflection note' : 'Reflection note · optional'}
                </Text>
                <TextInput
                  accessibilityLabel={`Note about ${skill.name}${noteTarget ? `, rating ${noteTarget.rating} out of 10` : ''}`}
                  testID={editing
                    ? `edit-skill-note-${skill.id}-${editTarget?.ratingId}`
                    : noteTarget ? `skill-note-${skill.id}-${noteTarget.ratingId}` : `skill-note-${skill.id}`}
                  value={notes[key] ?? ''}
                  onChangeText={value => {
                    setNotes(previous => ({ ...previous, [key]: value }));
                    setError('');
                  }}
                  editable={!saving && (noteOnly || editing || selected[skill.id] !== undefined)}
                  maxLength={MAX_SKILL_NOTE_LENGTH}
                  multiline
                  placeholder={noteOnly || editing || selected[skill.id] !== undefined
                    ? 'What did you notice? What could you improve?'
                    : 'Choose a score to add a note'}
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.noteInput,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      opacity: noteOnly || selected[skill.id] !== undefined ? 1 : 0.55,
                    },
                  ]}
                />
                <Text style={[styles.noteCount, { color: colors.mutedForeground }]}>
                  {(notes[key] ?? '').length}/{MAX_SKILL_NOTE_LENGTH}
                </Text>
              </View>
              );
            })}
          </View>
          {error ? <Text accessibilityRole="alert" testID="skill-rating-error" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Cancel reflection edit' : noteOnly ? 'Close note editor' : 'Skip skill ratings'}
              testID={editing ? 'cancel-edit-reflection' : 'skip-skill-ratings'}
              disabled={saving}
              onPress={onSkip}
              style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
            >
              <Text style={[styles.skipText, { color: colors.inkSoft }]}>
                {editing ? 'Cancel' : noteOnly ? 'Close' : 'Not now'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Save reflection' : noteOnly ? 'Save reflection notes' : 'Save skill ratings'}
              testID={editing ? 'save-reflection-edit' : noteOnly ? 'save-skill-notes' : 'save-skill-ratings'}
              disabled={saving || !canSave}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.save,
                { backgroundColor: saving || !canSave ? colors.secondary : colors.primary },
                pressed && styles.pressed,
              ]}
            >
              {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
              <Text style={[styles.saveText, { color: saving || !canSave ? colors.mutedForeground : colors.primaryForeground }]}>
                {saving ? 'Saving…' : editing ? 'Save reflection' : noteOnly ? 'Save notes' : 'Save ratings and notes'}
              </Text>
            </Pressable>
          </View>
      </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#14191dcc', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, maxHeight: '85%' },
  sheetContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 2 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, marginTop: 12 },
  list: { marginTop: 12, gap: 10 },
  skillRow: { borderWidth: 1, borderRadius: 15, padding: 11, gap: 9 },
  skillName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  scores: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  score: { width: 27, height: 34, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  savedScore: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 10 },
  previousRating: { gap: 3 },
  previousNote: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15, alignSelf: 'stretch', flexShrink: 1 },
  targetDate: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  noteLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 1 },
  noteInput: { minHeight: 74, maxHeight: 140, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 9, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, textAlignVertical: 'top' },
  noteCount: { fontFamily: 'Inter_400Regular', fontSize: 10, textAlign: 'right', marginTop: -4 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 10 },
  skip: { minHeight: 46, paddingHorizontal: 14, justifyContent: 'center' },
  skipText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  save: { minHeight: 46, paddingHorizontal: 18, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  saveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  pressed: { opacity: 0.72 },
});
