import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StepDetails } from '@/components/StepDetails';
import { SkillTagList } from '@/components/SkillPicker';
import { StepDetailAttachments } from '@/components/StepDetailAttachments';
import { SkillRatingPrompt } from '@/components/SkillRatingPrompt';
import { RoutinePdfExportButton } from '@/components/RoutinePdfExportButton';
import { usePeople } from '@/context/PeopleContext';
import { useRoutines } from '@/context/RoutineContext';
import { useColors } from '@/hooks/useColors';
import { createSkillRatingRun, getRoutineSkillIds, type SkillRatingRun } from '@/lib/skills';
import { formatDuration, getStepDetails, getStepSeconds, isCompleted } from '@/types/routines';

export default function RoutineDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activePerson } = usePeople();
  const { routines, loading, progress, getCompletedCount, toggleStep, completeRoutine, updateRoutine, copyRoutine, setStepHidden, deleteRoutine } = useRoutines();
  const [reorderBusy, setReorderBusy] = React.useState(false);
  const [copyBusy, setCopyBusy] = React.useState(false);
  const [copyError, setCopyError] = React.useState('');
  const copyLock = React.useRef(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');
  const deleteLock = React.useRef(false);
  const [visibilityBusy, setVisibilityBusy] = React.useState(false);
  const [showHiddenSteps, setShowHiddenSteps] = React.useState(false);
  const [reorderError, setReorderError] = React.useState('');
  const [ratingSkillIds, setRatingSkillIds] = React.useState<string[]>([]);
  const [ratingRun, setRatingRun] = React.useState<SkillRatingRun | null>(null);
  const [showRatingPrompt, setShowRatingPrompt] = React.useState(false);
  const reorderLock = React.useRef(false);
  const routine = routines.find((item) => item.id === id);

  if (loading) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.background }]}>
        <Text style={[styles.missingTitle, { color: colors.foreground }]}>Loading routine</Text>
      </View>
    );
  }

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

  const visibleSteps = currentRoutine.steps.filter((step) => !step.hidden);
  const hiddenCount = currentRoutine.steps.length - visibleSteps.length;
  const displayedSteps = showHiddenSteps ? currentRoutine.steps : visibleSteps;
  const completed = getCompletedCount(currentRoutine);
  const done = visibleSteps.length > 0 && completed === visibleSteps.length;
  const percent = visibleSteps.length ? Math.round((completed / visibleSteps.length) * 100) : 0;
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayProgress = progress[day] ?? {};
  const totalSeconds = visibleSteps.reduce((sum, step) => sum + getStepSeconds(step), 0);

  async function handleDelete() {
    if (deleteLock.current) return;
    deleteLock.current = true;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await deleteRoutine(currentRoutine.id);
      router.replace('/(tabs)');
    } catch {
      setDeleteError('Could not delete this routine. Please try again.');
    } finally {
      deleteLock.current = false;
      setDeleteBusy(false);
    }
  }

  async function handleStep(stepId: string) {
    const progressKey = `${currentRoutine.id}:${stepId}`;
    const wasComplete = isCompleted(todayProgress[progressKey]);
    const completesRoutine = !wasComplete && visibleSteps.every(step =>
      step.id === stepId || isCompleted(todayProgress[`${currentRoutine.id}:${step.id}`]));
    const run = completesRoutine ? createSkillRatingRun(currentRoutine.id) : undefined;
    await toggleStep(currentRoutine.id, stepId);
    void Haptics.selectionAsync();
    if (run) openRatingPrompt(run);
  }

  async function handleComplete() {
    const run = createSkillRatingRun(currentRoutine.id);
    await completeRoutine(currentRoutine.id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    openRatingPrompt(run);
  }

  function openRatingPrompt(run: SkillRatingRun) {
    const assigned = getRoutineSkillIds(currentRoutine);
    if (!assigned.length) return;
    setRatingSkillIds(assigned);
    setRatingRun(run);
    setShowRatingPrompt(true);
  }

  function closeRatingPrompt() {
    setShowRatingPrompt(false);
    setRatingSkillIds([]);
    setRatingRun(null);
  }

  async function handleCopy() {
    if (copyLock.current || reorderLock.current) return;
    copyLock.current = true;
    setCopyBusy(true);
    setCopyError('');
    try {
      const copied = await copyRoutine(currentRoutine.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: '/routine/[id]', params: { id: copied.id } });
    } catch {
      setCopyError('Could not copy this routine. Please try again.');
    } finally {
      copyLock.current = false;
      setCopyBusy(false);
    }
  }

  async function moveStep(stepId: string, direction: -1 | 1) {
    if (reorderLock.current) return;
    const visibleIndex = visibleSteps.findIndex((step) => step.id === stepId);
    const nextVisibleIndex = visibleIndex + direction;
    if (visibleIndex < 0 || nextVisibleIndex < 0 || nextVisibleIndex >= visibleSteps.length) return;
    const index = currentRoutine.steps.findIndex((step) => step.id === stepId);
    const destination = currentRoutine.steps.findIndex((step) => step.id === visibleSteps[nextVisibleIndex].id);
    reorderLock.current = true;
    setReorderBusy(true);
    setReorderError('');
    const reordered = [...currentRoutine.steps];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    try {
      await updateRoutine(currentRoutine.id, currentRoutine.title, currentRoutine.subtitle, reordered, currentRoutine.category);
      void Haptics.selectionAsync();
    } catch {
      setReorderError('Could not change the step order. Please try again.');
    } finally {
      reorderLock.current = false;
      setReorderBusy(false);
    }
  }

  async function changeStepVisibility(stepId: string, hidden: boolean) {
    if (reorderLock.current) return;
    reorderLock.current = true;
    setVisibilityBusy(true);
    setReorderError('');
    try {
      await setStepHidden(currentRoutine.id, stepId, hidden);
      void Haptics.selectionAsync();
    } catch {
      setReorderError('Could not update step visibility. Please try again.');
    } finally {
      reorderLock.current = false;
      setVisibilityBusy(false);
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
              <RoutinePdfExportButton
                title={currentRoutine.title}
                kind="routine"
                routines={[currentRoutine]}
                testID={`print-routine-${currentRoutine.id}`}
                buttonStyle={styles.iconButton}
                iconColor={colors.heroForeground}
              />
              <Pressable
                accessibilityLabel="Copy routine"
                testID="copy-routine"
                disabled={copyBusy || reorderBusy || visibilityBusy}
                onPress={() => void handleCopy()}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                {copyBusy
                  ? <ActivityIndicator size="small" color={colors.heroForeground} />
                  : <Ionicons name="copy-outline" size={21} color={colors.heroForeground} />}
              </Pressable>
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
                testID="delete-routine"
                disabled={deleteBusy}
                onPress={() => setConfirmingDelete(true)}
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
          {currentRoutine.category ? (
            <Text style={[styles.heroCategory, { color: colors.heroForeground }]}>{currentRoutine.category}</Text>
          ) : null}
          <SkillTagList skillIds={currentRoutine.skillIds} dark />
          {copyError ? <Text accessibilityRole="alert" style={[styles.copyError, { color: colors.heroForeground }]}>{copyError}</Text> : null}
          {confirmingDelete ? (
            <View style={[styles.deletePrompt, { backgroundColor: colors.card }]}>
              <Text style={[styles.deleteTitle, { color: colors.foreground }]}>Delete this routine?</Text>
              <Text style={[styles.deleteDescription, { color: colors.mutedForeground }]}>
                This removes the routine from your library.
              </Text>
              {deleteError ? (
                <Text accessibilityRole="alert" style={[styles.deleteError, { color: colors.destructive }]}>{deleteError}</Text>
              ) : null}
              <View style={styles.deleteActions}>
                <Pressable
                  accessibilityLabel="Cancel deleting routine"
                  testID="cancel-delete-routine"
                  disabled={deleteBusy}
                  onPress={() => {
                    setConfirmingDelete(false);
                    setDeleteError('');
                  }}
                  style={({ pressed }) => [styles.deleteCancel, pressed && styles.pressed]}
                >
                  <Text style={[styles.deleteActionText, { color: colors.foreground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Confirm delete routine"
                  testID="confirm-delete-routine"
                  disabled={deleteBusy}
                  onPress={() => void handleDelete()}
                  style={({ pressed }) => [styles.deleteConfirm, { backgroundColor: colors.destructive }, pressed && styles.pressed]}
                >
                  {deleteBusy
                    ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                    : <Text style={[styles.deleteActionText, { color: colors.primaryForeground }]}>Delete</Text>}
                </Pressable>
              </View>
            </View>
          ) : null}
          <View style={styles.heroMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={16} color={colors.heroForeground} />
              <Text style={[styles.metaText, { color: colors.heroForeground }]}>
                {formatDuration(totalSeconds)}
              </Text>
            </View>
            <View style={styles.metaDivider} />
            <Text style={[styles.metaText, { color: colors.heroForeground }]}>
              {hiddenCount ? `${visibleSteps.length} of ${currentRoutine.steps.length} steps` : `${visibleSteps.length} steps`}
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
              {completed} of {visibleSteps.length}
            </Text>
          </View>
          <Text style={[styles.reorderHint, { color: colors.mutedForeground }]}>
            Use the arrows to reorder. Hidden steps are skipped when running.
          </Text>
          {hiddenCount > 0 ? (
            <Pressable
              accessibilityLabel={showHiddenSteps ? 'Hide hidden steps' : `Show hidden steps (${hiddenCount})`}
              testID="toggle-hidden-steps"
              onPress={() => setShowHiddenSteps((current) => !current)}
              style={({ pressed }) => [styles.showHiddenButton, pressed && styles.pressed]}
            >
              <Ionicons name={showHiddenSteps ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.primary} />
              <Text style={[styles.showHiddenText, { color: colors.primary }]}>
                {showHiddenSteps ? 'Hide hidden steps' : `Show hidden steps (${hiddenCount})`}
              </Text>
            </Pressable>
          ) : null}
          {reorderError ? <Text style={[styles.reorderError, { color: colors.destructive }]}>{reorderError}</Text> : null}

          {visibleSteps.length === 0 && !showHiddenSteps ? (
            <Text style={[styles.noSteps, { color: colors.mutedForeground }]}>
              All steps are hidden. Show hidden steps to bring one back.
            </Text>
          ) : null}

          {displayedSteps.map((step) => {
            const visibleIndex = visibleSteps.findIndex((item) => item.id === step.id);
            const isDone = isCompleted(todayProgress[`${currentRoutine.id}:${step.id}`]);
            const details = [step.description ?? '', ...(step.additionalDetails ?? [])];
            return (
              <View
                key={step.id}
                style={[
                  styles.stepCard,
                  { backgroundColor: step.hidden ? colors.secondary : isDone ? colors.sageSoft : colors.card, borderColor: isDone && !step.hidden ? colors.sage : colors.border },
                ]}
              >
                <Pressable
                  accessibilityLabel={step.hidden ? `${step.title} is hidden` : `${isDone ? 'Uncomplete' : 'Complete'} ${step.title}`}
                  disabled={Boolean(step.hidden)}
                  onPress={() => void handleStep(step.id)}
                  style={({ pressed }) => [styles.stepContent, pressed && styles.pressed]}
                >
                  <View style={[styles.stepNumber, { backgroundColor: isDone ? colors.success : colors.secondary }]}>
                    {step.hidden ? (
                      <Ionicons name="eye-off-outline" size={18} color={colors.mutedForeground} />
                    ) : isDone ? (
                      <Ionicons name="checkmark" size={18} color={colors.primaryForeground} />
                    ) : (
                      <Text style={[styles.stepNumberText, { color: colors.inkSoft }]}>{visibleIndex + 1}</Text>
                    )}
                  </View>
                  <View style={styles.stepCopy}>
                    <Text style={[styles.stepTitle, { color: step.hidden ? colors.mutedForeground : isDone ? colors.success : colors.foreground }, isDone && !step.hidden && styles.completedText]}>
                      {step.title}
                    </Text>
                    {getStepDetails(step).length > 0 || step.detailHtml?.some(Boolean) ? (
                      <StepDetails
                        details={details}
                        detailHtml={step.detailHtml}
                        style={[styles.stepDescription, { color: colors.mutedForeground }]}
                        linkColor={colors.primary}
                      />
                    ) : null}
                    {step.detailAttachments?.map((attachments, detailIndex) => attachments.length ? (
                      <StepDetailAttachments key={`${step.id}-attachments-${detailIndex}`} attachments={attachments}
                        testID={`view-step-detail-files-${step.id}-${detailIndex}`} />
                    ) : null)}
                    <SkillTagList skillIds={step.skillIds} />
                    <Text style={[styles.duration, { color: colors.mutedForeground }]}>
                      {step.hidden ? 'Hidden · skipped in timer' : formatDuration(getStepSeconds(step))}
                    </Text>
                  </View>
                  {!step.hidden ? <Ionicons name={isDone ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={isDone ? colors.success : colors.border} /> : null}
                </Pressable>
                <Pressable
                  accessibilityLabel={`${step.hidden ? 'Show' : 'Hide'} step ${step.title}`}
                  testID={`toggle-step-visibility-${step.id}`}
                  disabled={reorderBusy || visibilityBusy}
                  onPress={() => void changeStepVisibility(step.id, !step.hidden)}
                  style={({ pressed }) => [styles.visibilityButton, { borderLeftColor: colors.border }, pressed && styles.pressed]}
                >
                  <Ionicons name={step.hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.primary} />
                </Pressable>
                <View style={[styles.reorderControls, { borderLeftColor: colors.border }]}>
                  <Pressable
                    accessibilityLabel={`Move ${step.title} up`}
                    testID={`detail-move-up-${step.id}`}
                    disabled={reorderBusy || visibilityBusy || visibleIndex <= 0}
                    onPress={() => void moveStep(step.id, -1)}
                    style={({ pressed }) => [styles.reorderButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="chevron-up" size={21} color={visibleIndex <= 0 ? colors.border : colors.primary} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Move ${step.title} down`}
                    testID={`detail-move-down-${step.id}`}
                    disabled={reorderBusy || visibilityBusy || visibleIndex < 0 || visibleIndex === visibleSteps.length - 1}
                    onPress={() => void moveStep(step.id, 1)}
                    style={({ pressed }) => [styles.reorderButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="chevron-down" size={21} color={visibleIndex < 0 || visibleIndex === visibleSteps.length - 1 ? colors.border : colors.primary} />
                  </Pressable>
                </View>
              </View>
            );
          })}

          <Pressable
            accessibilityLabel="Run routine timer"
            disabled={visibleSteps.length === 0}
            onPress={() => router.push({
              pathname: '/routine/[id]/run',
              params: {
                id: currentRoutine.id,
                stepReminder: activePerson.defaultPlaylistReminderSettings.stepCompletion ? '1' : '0',
                routineReminder: activePerson.defaultPlaylistReminderSettings.routineCompletion ? '1' : '0',
              },
            })}
            style={({ pressed }) => [
              styles.runButton,
              { backgroundColor: visibleSteps.length ? colors.primary : colors.secondary },
              pressed && styles.pressed,
            ]}
          >
            <Feather name="play" size={17} color={visibleSteps.length ? colors.primaryForeground : colors.mutedForeground} />
            <Text style={[styles.completeButtonText, { color: visibleSteps.length ? colors.primaryForeground : colors.mutedForeground }]}>Run routine</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Schedule routine"
            accessibilityState={{ disabled: !!currentRoutine.hidden || visibleSteps.length === 0 }}
            testID="schedule-routine"
            disabled={!!currentRoutine.hidden || visibleSteps.length === 0}
            onPress={() => router.push({ pathname: '/schedule-editor', params: { targetType: 'routine', targetId: currentRoutine.id } })}
            style={({ pressed }) => [styles.completeButton, { backgroundColor: colors.secondary }, pressed && styles.pressed]}
          >
            <Feather name="calendar" size={17} color={visibleSteps.length ? colors.inkSoft : colors.mutedForeground} />
            <Text style={[styles.completeButtonText, { color: visibleSteps.length ? colors.inkSoft : colors.mutedForeground }]}>Schedule for later</Text>
          </Pressable>

          <Pressable
            accessibilityLabel={done ? 'Routine complete' : 'Complete routine'}
            disabled={done || visibleSteps.length === 0}
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
      <SkillRatingPrompt
        visible={showRatingPrompt}
        skillIds={ratingSkillIds}
        routineTitle={currentRoutine.title}
        run={ratingRun ?? undefined}
        onSkip={closeRatingPrompt}
        onSaved={closeRatingPrompt}
      />
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
  heroCategory: { fontFamily: 'Inter_600SemiBold', fontSize: 12, opacity: 0.85, marginTop: 10 },
  copyError: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 10 },
  deletePrompt: { borderRadius: 16, padding: 16, marginTop: 18 },
  deleteTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  deleteDescription: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 5 },
  deleteError: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 10 },
  deleteActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  deleteCancel: { minHeight: 42, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  deleteConfirm: { minHeight: 42, borderRadius: 12, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center' },
  deleteActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
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
  showHiddenButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, marginTop: -6, marginBottom: 7 },
  showHiddenText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  noSteps: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  reorderError: { fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 10 },
  stepCard: { minHeight: 84, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', marginBottom: 9 },
  stepContent: { flex: 1, minHeight: 84, flexDirection: 'row', alignItems: 'center', paddingLeft: 13, paddingRight: 10, paddingVertical: 8 },
  visibilityButton: { width: 40, alignSelf: 'stretch', borderLeftWidth: 1, alignItems: 'center', justifyContent: 'center' },
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
