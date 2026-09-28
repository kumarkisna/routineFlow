import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useRoutines } from '@/context/RoutineContext';
import { useColors } from '@/hooks/useColors';
import { formatDuration, getStepSeconds } from '@/types/routines';
import type { Routine, RoutineStep } from '@/types/routines';

export default function NewRoutineScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const { routines, loading } = useRoutines();
  const editingRoutine = editId ? routines.find((item) => item.id === editId) : undefined;
  if (editId && (loading || !editingRoutine)) {
    return (
      <View style={styles.missing}>
        <Text>{loading ? 'Loading routine…' : 'Routine not found'}</Text>
        {!loading ? <Pressable onPress={() => router.back()}><Text>Go back</Text></Pressable> : null}
      </View>
    );
  }
  return <RoutineForm key={editId ?? 'new'} editingRoutine={editingRoutine} />;
}

function RoutineForm({ editingRoutine }: { editingRoutine?: Routine }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { createRoutine, updateRoutine } = useRoutines();
  const [title, setTitle] = useState(editingRoutine?.title ?? '');
  const [subtitle, setSubtitle] = useState(editingRoutine?.subtitle ?? '');
  const [stepDraft, setStepDraft] = useState('');
  const [stepDescriptionDraft, setStepDescriptionDraft] = useState('');
  const [hoursDraft, setHoursDraft] = useState('0');
  const [minutesDraft, setMinutesDraft] = useState('5');
  const [secondsDraft, setSecondsDraft] = useState('0');
  const [steps, setSteps] = useState<RoutineStep[]>(editingRoutine?.steps ?? []);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(() => title.trim().length > 0 && steps.length > 0, [title, steps.length]);

  function clearStepDraft() {
    setEditingStepId(null);
    setStepDraft('');
    setStepDescriptionDraft('');
    setHoursDraft('0');
    setMinutesDraft('5');
    setSecondsDraft('0');
  }

  function editStep(step: RoutineStep) {
    const duration = getStepSeconds(step);
    setEditingStepId(step.id);
    setStepDraft(step.title);
    setStepDescriptionDraft(step.description ?? '');
    setHoursDraft(String(Math.floor(duration / 3600)));
    setMinutesDraft(String(Math.floor((duration % 3600) / 60)));
    setSecondsDraft(String(duration % 60));
    setError('');
  }

  function addStep() {
    const nextTitle = stepDraft.trim();
    const nextDescription = stepDescriptionDraft.trim();
    if (!nextTitle) {
      setError('Give this step a name.');
      return;
    }
    const hours = Math.max(0, Number.parseInt(hoursDraft, 10) || 0);
    const minutes = Math.min(59, Math.max(0, Number.parseInt(minutesDraft, 10) || 0));
    const seconds = Math.min(59, Math.max(0, Number.parseInt(secondsDraft, 10) || 0));
    const durationSeconds = hours * 3600 + minutes * 60 + seconds;
    if (durationSeconds === 0) {
      setError('Give this step a duration before adding it.');
      return;
    }
    if (editingStepId) {
      setSteps((current) => current.map((step) =>
        step.id === editingStepId ? { ...step, title: nextTitle, description: nextDescription, durationSeconds } : step,
      ));
    } else {
      setSteps((current) => [
        ...current,
        { id: `${Date.now().toString()}-${Math.random().toString(36).slice(2, 7)}`, title: nextTitle, description: nextDescription, durationSeconds },
      ]);
    }
    clearStepDraft();
    setError('');
    void Haptics.selectionAsync();
  }

  function moveStep(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= steps.length) return;
    setSteps((current) => {
      const reordered = [...current];
      [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
      return reordered;
    });
    void Haptics.selectionAsync();
  }

  async function save() {
    if (saving) return;
    if (!title.trim()) {
      setError('Give your routine a name first.');
      return;
    }
    if (steps.length === 0) {
      setError('Add at least one step to make this routine repeatable.');
      return;
    }
    if (editingStepId) {
      setError('Update or cancel the step you are editing before saving.');
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    try {
      if (editingRoutine) {
        await updateRoutine(editingRoutine.id, title.trim(), subtitle.trim() || 'A routine made for your day', steps);
        router.back();
      } else {
        const routine = await createRoutine(title.trim(), subtitle.trim() || 'A routine made for your day', steps);
        router.replace({ pathname: '/routine/[id]', params: { id: routine.id } });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError('Could not save the routine. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>{editingRoutine ? 'Edit routine' : 'New routine'}</Text>
        <Pressable
          accessibilityLabel="Save routine"
          disabled={!canSave || saving || Boolean(editingStepId)}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: canSave && !saving && !editingStepId ? colors.primary : colors.secondary },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.saveText, { color: canSave && !saving && !editingStepId ? colors.primaryForeground : colors.mutedForeground }]}>
            {saving ? 'Saving' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.intro, { backgroundColor: colors.hero }]}>
          <View style={[styles.introIcon, { backgroundColor: colors.accent }]}>
            <Feather name="plus" size={20} color={colors.accentForeground} />
          </View>
          <Text style={[styles.introTitle, { color: colors.heroForeground }]}>{editingRoutine ? 'Make this flow yours' : 'Make it easy to begin'}</Text>
          <Text style={[styles.introText, { color: colors.heroForeground }]}>
            {editingRoutine ? 'Update your steps and timers for the next time you run this routine.' : 'Save the small sequence you want to return to again and again.'}
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.inkSoft }]}>Routine details</Text>
        <TextInput
          accessibilityLabel="Routine name"
          placeholder="Name your routine"
          placeholderTextColor={colors.mutedForeground}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            setError('');
          }}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        />
        <TextInput
          accessibilityLabel="Routine description"
          placeholder="What does it help you do?"
          placeholderTextColor={colors.mutedForeground}
          value={subtitle}
          onChangeText={setSubtitle}
          style={[styles.input, styles.descriptionInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        />

        <View style={styles.stepsHeader}>
          <Text style={[styles.label, { color: colors.inkSoft, marginBottom: 0 }]}>Steps</Text>
          <Text style={[styles.stepCount, { color: colors.mutedForeground }]}>{steps.length} added</Text>
        </View>
        <View style={[styles.stepComposer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.stepComposerTop}>
            <TextInput
              accessibilityLabel={editingStepId ? 'Edit routine step' : 'New routine step'}
              placeholder="Add a step"
              placeholderTextColor={colors.mutedForeground}
              value={stepDraft}
              onChangeText={(value) => {
                setStepDraft(value);
                setError('');
              }}
              returnKeyType="next"
              style={[styles.stepInput, { color: colors.foreground }]}
            />
            <Pressable
              accessibilityLabel={editingStepId ? 'Update step' : 'Add step'}
              onPress={addStep}
              style={({ pressed }) => [
                styles.addStepButton,
                { backgroundColor: stepDraft.trim() ? colors.primary : colors.secondary },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name={editingStepId ? 'checkmark' : 'add'} size={22} color={stepDraft.trim() ? colors.primaryForeground : colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={[styles.stepDescriptionLabel, { color: colors.mutedForeground }]}>Step details (optional)</Text>
          <TextInput
            accessibilityLabel="Step details"
            testID="step-description-input"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            placeholder="Add instructions or a helpful note"
            placeholderTextColor={colors.mutedForeground}
            value={stepDescriptionDraft}
            onChangeText={setStepDescriptionDraft}
            style={[styles.stepDescriptionInput, { borderColor: colors.border, color: colors.foreground }]}
          />
          <View style={styles.durationComposer}>
            <Text style={[styles.durationLabel, { color: colors.mutedForeground }]}>Timer</Text>
            <View style={styles.timeInputs}>
              <TextInput
                accessibilityLabel="Step hours"
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={setHoursDraft}
                placeholder="00"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border }]}
                value={hoursDraft}
              />
              <Text style={[styles.timeColon, { color: colors.mutedForeground }]}>:</Text>
              <TextInput
                accessibilityLabel="Step minutes"
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={setMinutesDraft}
                placeholder="05"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border }]}
                value={minutesDraft}
              />
              <Text style={[styles.timeColon, { color: colors.mutedForeground }]}>:</Text>
              <TextInput
                accessibilityLabel="Step seconds"
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={setSecondsDraft}
                placeholder="00"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border }]}
                value={secondsDraft}
              />
              <Text style={[styles.timeHint, { color: colors.mutedForeground }]}>h&nbsp;&nbsp; m&nbsp;&nbsp; s</Text>
            </View>
          </View>
          {editingStepId ? (
            <Pressable accessibilityLabel="Cancel editing step" onPress={clearStepDraft} style={styles.cancelEdit}>
              <Text style={[styles.cancelEditText, { color: colors.primary }]}>Cancel editing step</Text>
            </Pressable>
          ) : null}
        </View>

        {steps.map((step, index) => (
          <View key={step.id} style={[styles.stepRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.number, { backgroundColor: colors.sageSoft }]}>
              <Text style={[styles.numberText, { color: colors.success }]}>{index + 1}</Text>
            </View>
            <View style={styles.stepCopy}>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
              {step.hidden ? <Text style={[styles.stepDescription, { color: colors.mutedForeground }]}>Hidden · skipped in timer</Text> : null}
              {step.description ? (
                <Text style={[styles.stepDescription, { color: colors.mutedForeground }]} numberOfLines={2}>{step.description}</Text>
              ) : null}
              <Text style={[styles.stepDuration, { color: colors.mutedForeground }]}>
                {formatDuration(getStepSeconds(step))}
              </Text>
            </View>
            <View style={styles.stepActions}>
              <View>
                <Pressable
                  accessibilityLabel={`Move ${step.title} up`}
                  testID={`move-step-up-${step.id}`}
                  disabled={index === 0}
                  onPress={() => moveStep(index, -1)}
                  style={({ pressed }) => [styles.stepActionButton, pressed && styles.pressed]}
                >
                  <Ionicons name="chevron-up" size={20} color={index === 0 ? colors.border : colors.primary} />
                </Pressable>
                <Pressable
                  accessibilityLabel={`Move ${step.title} down`}
                  testID={`move-step-down-${step.id}`}
                  disabled={index === steps.length - 1}
                  onPress={() => moveStep(index, 1)}
                  style={({ pressed }) => [styles.stepActionButton, pressed && styles.pressed]}
                >
                  <Ionicons name="chevron-down" size={20} color={index === steps.length - 1 ? colors.border : colors.primary} />
                </Pressable>
              </View>
              <View>
                <Pressable
                  accessibilityLabel={`Edit ${step.title}`}
                  testID={`edit-step-${step.id}`}
                  onPress={() => editStep(step)}
                  style={({ pressed }) => [styles.stepActionButton, pressed && styles.pressed]}
                >
                  <Ionicons name="pencil-outline" size={18} color={colors.primary} />
                </Pressable>
                <Pressable
                  accessibilityLabel={`Remove ${step.title}`}
                  onPress={() => {
                    if (editingStepId === step.id) clearStepDraft();
                    setSteps((current) => current.filter((item) => item.id !== step.id));
                  }}
                  style={({ pressed }) => [styles.stepActionButton, pressed && styles.pressed]}
                >
                  <Ionicons name="close-circle-outline" size={19} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>
          </View>
        ))}

        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  topTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  saveButton: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 18 },
  saveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  content: { paddingHorizontal: 20, paddingTop: 10 },
  intro: { borderRadius: 24, padding: 20, marginBottom: 28 },
  introIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  introTitle: { fontFamily: 'Inter_700Bold', fontSize: 21, marginBottom: 7 },
  introText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, opacity: 0.78 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, letterSpacing: 0.3, marginBottom: 9 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 16, fontFamily: 'Inter_500Medium', fontSize: 16, marginBottom: 11 },
  descriptionInput: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  stepsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 9 },
  stepCount: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  stepComposer: { borderWidth: 1, borderRadius: 15, padding: 8, marginBottom: 10 },
  stepComposerTop: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 0 },
  stepInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15 },
  addStepButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepDescriptionLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, marginLeft: 8, marginTop: 4, marginBottom: 7 },
  stepDescriptionInput: { minHeight: 72, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, marginHorizontal: 6, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  durationComposer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 4, paddingTop: 5 },
  durationLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  timeInputs: { flexDirection: 'row', alignItems: 'center' },
  timeInput: { width: 35, height: 30, borderWidth: 1, borderRadius: 8, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 12, padding: 0 },
  timeColon: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginHorizontal: 3 },
  timeHint: { fontFamily: 'Inter_400Regular', fontSize: 9, marginLeft: 6 },
  stepRow: { minHeight: 82, borderWidth: 1, borderRadius: 15, paddingLeft: 12, paddingRight: 6, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  number: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  numberText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  stepCopy: { flex: 1 },
  stepTitle: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 19 },
  stepDescription: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 },
  stepDuration: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  stepActions: { flexDirection: 'row', marginLeft: 4 },
  stepActionButton: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  cancelEdit: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 8 },
  cancelEditText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 7 },
  pressed: { opacity: 0.72 },
});