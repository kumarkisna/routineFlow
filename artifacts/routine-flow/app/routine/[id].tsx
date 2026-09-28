import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoutines } from '@/context/RoutineContext';
import { useColors } from '@/hooks/useColors';
import { formatDuration, getStepSeconds } from '@/types/routines';

export default function RoutineDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { routines, progress, getCompletedCount, toggleStep, completeRoutine, updateRoutine, deleteRoutine } = useRoutines();
  const [reorderBusy, setReorderBusy] = React.useState(false);
  const [reorderError, setReorderError] = React.useState('');
  const reorderLock = React.useRef(false);
  const routine = routines.find((item) => item.id === id);

  if (!routine) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.background }]}>
        <Ionicons name="file-tray-outline" size={40} color={colors.mutedForeground} />
        <Text style={[styles.missingTitle, { color: colors.foreground }]}>Routine not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.primary }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }
  const currentRoutine = routine;

  const completed = getCompletedCount(currentRoutine);
  const done = completed === currentRoutine.steps.length;
  const percent = Math.round((completed / currentRoutine.steps.length) * 100);
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayProgress = progress[day] ?? {};
  const totalSeconds = currentRoutine.steps.reduce((sum, step) => sum + getStepSeconds(step), 0);

  function confirmDelete() {
    Alert.alert('Delete this routine?', 'This removes the routine from your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteRoutine(currentRoutine.id);
          router.back();
        },
      },
    ]);
  }

  async function handleStep(stepId: string) {
    await toggleStep(currentRoutine.id, stepId);
    void Haptics.selectionAsync();
  }

  async function handleComplete() {
    await completeRoutine(currentRoutine.id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function moveStep(stepId: string, direction: -1 | 1) {
    if (reorderLock.current) return;
    const index = currentRoutine.steps.findIndex((step) => step.id === stepId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= currentRoutine.steps.length) return;
    reorderLock.current = true;
    setReorderBusy(true);
    setReorderError('');
    const reordered = [...currentRoutine.steps];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    try {
      await updateRoutine(currentRoutine.id, currentRoutine.title, currentRoutine.subtitle, reordered);
      void Haptics.selectionAsync();
    } catch {
      setReorderError('Could not change the step order. Please try again.');
    } finally {
      reorderLock.current = false;
      setReorderBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 36 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.hero, paddingTop: insets.top + 8 }]}>
          <View style={styles.heroTop}>
            <Pressable
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons name="arrow-back" size={23} color={colors.heroForeground} />
            </Pressable>
            <View style={styles.heroActions}>
              <Pressable
                accessibilityLabel="Edit routine"
                testID="edit-routine"
                onPress={() => router.push({ pathname: '/new-routine', params: { editId: currentRoutine.id } })}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons name="create-outline" size={23} color={colors.heroForeground} />
              </Pressable>
              <Pressable
                accessibilityLabel="Delete routine"
                onPress={confirmDelete}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons name="trash-outline" size={21} color={colors.heroForeground} />
              </Pressable>
            </View>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name={currentRoutine.icon as keyof typeof Ionicons.glyphMap} size={25} color={colors.accentForeground} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.heroForeground }]}>{currentRoutine.title}</Text>
          <Text style={[styles.heroSubtitle, { color: colors.heroForeground }]}>{currentRoutine.subtitle}</Text>
          <View style={styles.heroMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={16} color={colors.heroForeground} />
              <Text style={[styles.metaText, { color: colors.heroForeground }]}>
                {formatDuration(totalSeconds)}
              </Text>
            </View>
            <View style={styles.metaDivider} />
            <Text style={[styles.metaText, { color: colors.heroForeground }]}>
              {currentRoutine.steps.length} steps
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>TODAY</Text>
              <Text style={[styles.progressTitle, { color: colors.foreground }]}>
                {done ? 'You showed up.' : 'One step at a time.'}
              </Text>
            </View>
            <Text style={[styles.percent, { color: colors.primary }]}>{percent}%</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${percent}%` }]} />
          </View>

          <View style={styles.stepsHeading}>
            <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>YOUR FLOW</Text>
            <Text style={[styles.stepCount, { color: colors.mutedForeground }]}>
              {completed} of {currentRoutine.steps.length}
            </Text>
          </View>
          <Text style={[styles.reorderHint, { color: colors.mutedForeground }]}>Use the arrows to change step order</Text>
          {reorderError ? <Text style={[styles.reorderError, { color: colors.destructive }]}>{reorderError}</Text> : null}

          {currentRoutine.steps.map((step, index) => {
            const isDone = Boolean(todayProgress[`${currentRoutine.id}:${step.id}`]);
            return (
              <View
                key={step.id}
                style={[
                  styles.stepCard,
                  { backgroundColor: isDone ? colors.sageSoft : colors.card, borderColor: isDone ? colors.sage : colors.border },
                ]}
              >
                <Pressable
                  accessibilityLabel={`${isDone ? 'Uncomplete' : 'Complete'} ${step.title}`}
                  onPress={() => void handleStep(step.id)}
                  style={({ pressed }) => [styles.stepContent, pressed && styles.pressed]}
                >
                  <View style={[styles.stepNumber, { backgroundColor: isDone ? colors.success : colors.secondary }]}>
                    {isDone ? (
                      <Ionicons name="checkmark" size={18} color={colors.primaryForeground} />
                    ) : (
                      <Text style={[styles.stepNumberText, { color: colors.inkSoft }]}>{index + 1}</Text>
                    )}
                  </View>
                  <View style={styles.stepCopy}>
                    <Text style={[styles.stepTitle, { color: isDone ? colors.success : colors.foreground }, isDone && styles.completedText]}>
                      {step.title}
                    </Text>
                    {step.description ? (
                      <Text style={[styles.stepDescription, { color: colors.mutedForeground }]}>{step.description}</Text>
                    ) : null}
                    <Text style={[styles.duration, { color: colors.mutedForeground }]}>
                      {formatDuration(getStepSeconds(step))}
                    </Text>
                  </View>
                  <Ionicons name={isDone ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={isDone ? colors.success : colors.border} />
                </Pressable>
                <View style={[styles.reorderControls, { borderLeftColor: colors.border }]}>
                  <Pressable
                    accessibilityLabel={`Move ${step.title} up`}
                    testID={`detail-move-up-${step.id}`}
                    disabled={reorderBusy || index === 0}
                    onPress={() => void moveStep(step.id, -1)}
                    style={({ pressed }) => [styles.reorderButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="chevron-up" size={21} color={index === 0 ? colors.border : colors.primary} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Move ${step.title} down`}
                    testID={`detail-move-down-${step.id}`}
                    disabled={reorderBusy || index === currentRoutine.steps.length - 1}
                    onPress={() => void moveStep(step.id, 1)}
                    style={({ pressed }) => [styles.reorderButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="chevron-down" size={21} color={index === currentRoutine.steps.length - 1 ? colors.border : colors.primary} />
                  </Pressable>
                </View>
              </View>
            );
          })}

          <Pressable
            accessibilityLabel="Run routine timer"
            onPress={() => router.push({ pathname: '/routine/[id]/run', params: { id: currentRoutine.id } })}
            style={({ pressed }) => [
              styles.runButton,
              { backgroundColor: colors.primary },
              pressed && styles.pressed,
            ]}
          >
            <Feather name="play" size={17} color={colors.primaryForeground} />
            <Text style={[styles.completeButtonText, { color: colors.primaryForeground }]}>Run routine</Text>
          </Pressable>

          <Pressable
            accessibilityLabel={done ? 'Routine complete' : 'Complete routine'}
            disabled={done}
            onPress={() => void handleComplete()}
            style={({ pressed }) => [
              styles.completeButton,
              { backgroundColor: done ? colors.sageSoft : colors.secondary },
              pressed && styles.pressed,
            ]}
          >
            <Feather name={done ? 'check' : 'check-circle'} size={17} color={done ? colors.success : colors.inkSoft} />
            <Text style={[styles.completeButtonText, { color: done ? colors.success : colors.inkSoft }]}>
              {done ? 'Routine complete' : 'Mark all complete'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hero: { paddingHorizontal: 20, paddingBottom: 26, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 23 },
  heroActions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  heroIcon: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.7 },
  heroSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, opacity: 0.72, marginTop: 7 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 21 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontFamily: 'Inter_500Medium', fontSize: 13, opacity: 0.8 },
  metaDivider: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 12 },
  body: { paddingHorizontal: 20, paddingTop: 27 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  sectionEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.1 },
  progressTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 7 },
  percent: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 17 },
  progressFill: { height: '100%', borderRadius: 4 },
  stepsHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 34, marginBottom: 5 },
  stepCount: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  reorderHint: { fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 12 },
  reorderError: { fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 10 },
  stepCard: { minHeight: 84, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', marginBottom: 9 },
  stepContent: { flex: 1, minHeight: 84, flexDirection: 'row', alignItems: 'center', paddingLeft: 13, paddingRight: 10, paddingVertical: 8 },
  reorderControls: { borderLeftWidth: 1, width: 44, alignSelf: 'stretch', justifyContent: 'center' },
  reorderButton: { height: 42, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  stepNumberText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  stepCopy: { flex: 1, paddingRight: 8 },
  stepTitle: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 19 },
  stepDescription: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 4 },
  completedText: { textDecorationLine: 'line-through' },
  duration: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  completeButton: { minHeight: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 22 },
  runButton: { minHeight: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 22 },
  completeButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  missingTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18 },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 5 },
  pressed: { opacity: 0.72 },
});