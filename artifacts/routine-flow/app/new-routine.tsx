import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
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
import type { RoutineStep } from '@/types/routines';

export default function NewRoutineScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { createRoutine } = useRoutines();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [stepDraft, setStepDraft] = useState('');
  const [steps, setSteps] = useState<RoutineStep[]>([]);
  const [error, setError] = useState('');

  const canSave = useMemo(() => title.trim().length > 0 && steps.length > 0, [title, steps.length]);

  function addStep() {
    const nextTitle = stepDraft.trim();
    if (!nextTitle) return;
    setSteps((current) => [
      ...current,
      { id: `${Date.now().toString()}-${Math.random().toString(36).slice(2, 7)}`, title: nextTitle },
    ]);
    setStepDraft('');
    void Haptics.selectionAsync();
  }

  async function save() {
    if (!title.trim()) {
      setError('Give your routine a name first.');
      return;
    }
    if (steps.length === 0) {
      setError('Add at least one step to make this routine repeatable.');
      return;
    }
    Keyboard.dismiss();
    const routine = await createRoutine(
      title.trim(),
      subtitle.trim() || 'A routine made for your day',
      steps,
    );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace({ pathname: '/routine/[id]', params: { id: routine.id } });
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
        <Text style={[styles.topTitle, { color: colors.foreground }]}>New routine</Text>
        <Pressable
          accessibilityLabel="Save routine"
          disabled={!canSave}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: canSave ? colors.primary : colors.secondary },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.saveText, { color: canSave ? colors.primaryForeground : colors.mutedForeground }]}>
            Save
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
          <Text style={[styles.introTitle, { color: colors.heroForeground }]}>Make it easy to begin</Text>
          <Text style={[styles.introText, { color: colors.heroForeground }]}>
            Save the small sequence you want to return to again and again.
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
          <TextInput
            accessibilityLabel="New routine step"
            placeholder="Add a step"
            placeholderTextColor={colors.mutedForeground}
            value={stepDraft}
            onChangeText={(value) => {
              setStepDraft(value);
              setError('');
            }}
            onSubmitEditing={addStep}
            returnKeyType="done"
            style={[styles.stepInput, { color: colors.foreground }]}
          />
          <Pressable
            accessibilityLabel="Add step"
            onPress={addStep}
            style={({ pressed }) => [
              styles.addStepButton,
              { backgroundColor: stepDraft.trim() ? colors.primary : colors.secondary },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={22} color={stepDraft.trim() ? colors.primaryForeground : colors.mutedForeground} />
          </Pressable>
        </View>

        {steps.map((step, index) => (
          <View key={step.id} style={[styles.stepRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.number, { backgroundColor: colors.sageSoft }]}>
              <Text style={[styles.numberText, { color: colors.success }]}>{index + 1}</Text>
            </View>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
            <Pressable
              accessibilityLabel={`Remove ${step.title}`}
              onPress={() => setSteps((current) => current.filter((item) => item.id !== step.id))}
              style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
            >
              <Ionicons name="close-circle-outline" size={20} color={colors.mutedForeground} />
            </Pressable>
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
  stepComposer: { minHeight: 56, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 7, marginBottom: 10 },
  stepInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15 },
  addStepButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepRow: { minHeight: 60, borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  number: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  numberText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  stepTitle: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 19 },
  removeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  error: { fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 7 },
  pressed: { opacity: 0.72 },
});