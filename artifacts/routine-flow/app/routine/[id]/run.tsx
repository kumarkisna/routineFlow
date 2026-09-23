import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
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
import type { Routine } from '@/types/routines';

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function describeDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  }
  return parts.join(' and ');
}

function announceStep(routine: Routine, index: number, enabled: boolean) {
  if (!enabled) return;
  const step = routine.steps[index];
  if (!step) return;
  void Speech.stop();
  Speech.speak(
    `Step ${index + 1}. ${step.title}. You have ${describeDuration(getStepSeconds(step))}.`,
    { rate: 0.92, pitch: 1 },
  );
}

export default function RoutineRunScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { routines, completeRoutine } = useRoutines();
  const routine = routines.find((item) => item.id === id);
  const [activeIndex, setActiveIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(
    routine ? getStepSeconds(routine.steps[0]) : 0,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  useEffect(() => {
    return () => {
      void Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (!isRunning) return undefined;
    const interval = setInterval(() => {
      setRemainingSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning || remainingSeconds > 0 || !routine) return;
    const currentRoutine = routine;
    if (activeIndex >= currentRoutine.steps.length - 1) {
      setIsRunning(false);
      setIsFinished(true);
      void Speech.stop();
      void completeRoutine(currentRoutine.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    const nextIndex = activeIndex + 1;
    setActiveIndex(nextIndex);
    setRemainingSeconds(getStepSeconds(currentRoutine.steps[nextIndex]));
    announceStep(currentRoutine, nextIndex, voiceEnabled);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [activeIndex, completeRoutine, isRunning, remainingSeconds, routine, voiceEnabled]);

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

  const activeStep = currentRoutine.steps[activeIndex];
  const totalSeconds = currentRoutine.steps.reduce((sum, step) => sum + getStepSeconds(step), 0);
  const elapsedSteps = isFinished ? currentRoutine.steps.length : activeIndex;
  const progress = currentRoutine.steps.length ? elapsedSteps / currentRoutine.steps.length : 0;

  function startOrPause() {
    if (isFinished) return;
    if (isRunning) {
      void Speech.stop();
    } else {
      announceStep(currentRoutine, activeIndex, voiceEnabled);
    }
    setIsRunning((running) => !running);
    void Haptics.selectionAsync();
  }

  function restart() {
    setActiveIndex(0);
    setRemainingSeconds(getStepSeconds(currentRoutine.steps[0]));
    setIsFinished(false);
    setIsRunning(true);
    announceStep(currentRoutine, 0, voiceEnabled);
    void Haptics.selectionAsync();
  }

  function skipStep() {
    if (activeIndex >= currentRoutine.steps.length - 1) {
      setRemainingSeconds(0);
      return;
    }
    const nextIndex = activeIndex + 1;
    setActiveIndex(nextIndex);
    setRemainingSeconds(getStepSeconds(currentRoutine.steps[nextIndex]));
    announceStep(currentRoutine, nextIndex, voiceEnabled);
    void Haptics.selectionAsync();
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            accessibilityLabel="Close timer"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={24} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerLabel, { color: colors.mutedForeground }]}>RUNNING ROUTINE</Text>
            <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{currentRoutine.title}</Text>
          </View>
          <Pressable
            accessibilityLabel={voiceEnabled ? 'Mute step voice' : 'Turn on step voice'}
            onPress={() => {
              setVoiceEnabled((enabled) => {
                if (enabled) void Speech.stop();
                return !enabled;
              });
            }}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name={voiceEnabled ? 'volume-high' : 'volume-mute'} size={22} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={[styles.timerCard, { backgroundColor: colors.hero }]}>
          <View style={[styles.timerRing, { borderColor: colors.sage }]}>
            <Text style={[styles.timerText, { color: colors.heroForeground }]}>
              {isFinished ? '00:00:00' : formatClock(remainingSeconds)}
            </Text>
            <Text style={[styles.timerCaption, { color: colors.heroForeground }]}>
              {isFinished ? 'complete' : isRunning ? 'in progress' : 'paused'}
            </Text>
          </View>
          <Text style={[styles.activeTitle, { color: colors.heroForeground }]}>
            {isFinished ? 'Routine complete' : activeStep.title}
          </Text>
          <Text style={[styles.activeMeta, { color: colors.heroForeground }]}>
            {isFinished ? `You finished all ${currentRoutine.steps.length} steps` : `Step ${activeIndex + 1} of ${currentRoutine.steps.length} · ${formatDuration(getStepSeconds(activeStep))}`}
          </Text>
        </View>

        <View style={styles.body}>
          <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.max(progress, isRunning ? 0.02 : 0) * 100}%` }]} />
          </View>

          <View style={styles.controlRow}>
            {isFinished ? (
              <Pressable
                accessibilityLabel="Run routine again"
                onPress={restart}
                style={({ pressed }) => [styles.secondaryControl, { borderColor: colors.border }, pressed && styles.pressed]}
              >
                <Ionicons name="refresh" size={19} color={colors.foreground} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityLabel="Skip current step"
                onPress={skipStep}
                style={({ pressed }) => [styles.secondaryControl, { borderColor: colors.border }, pressed && styles.pressed]}
              >
                <Ionicons name="play-skip-forward" size={19} color={colors.foreground} />
              </Pressable>
            )}
            <Pressable
              accessibilityLabel={isFinished ? 'Routine complete' : isRunning ? 'Pause timer' : 'Start timer'}
              disabled={isFinished}
              onPress={startOrPause}
              style={({ pressed }) => [
                styles.primaryControl,
                { backgroundColor: isFinished ? colors.sageSoft : colors.primary },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name={isFinished ? 'checkmark' : isRunning ? 'pause' : 'play'} size={23} color={isFinished ? colors.success : colors.primaryForeground} />
              <Text style={[styles.primaryControlText, { color: isFinished ? colors.success : colors.primaryForeground }]}>
                {isFinished ? 'Done' : isRunning ? 'Pause' : 'Start'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.stepsHeader}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SEQUENCE</Text>
            <Text style={[styles.totalTime, { color: colors.mutedForeground }]}>{formatDuration(totalSeconds)} total</Text>
          </View>

          {currentRoutine.steps.map((step, index) => {
            const complete = index < activeIndex || isFinished;
            const active = index === activeIndex && !isFinished;
            return (
              <View
                key={step.id}
                style={[
                  styles.stepRow,
                  {
                    backgroundColor: active ? colors.coralSoft : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={[styles.stepNumber, { backgroundColor: complete ? colors.success : active ? colors.primary : colors.secondary }]}>
                  {complete ? (
                    <Ionicons name="checkmark" size={17} color={colors.primaryForeground} />
                  ) : (
                    <Text style={[styles.stepNumberText, { color: active ? colors.primaryForeground : colors.inkSoft }]}>{index + 1}</Text>
                  )}
                </View>
                <View style={styles.stepCopy}>
                  <Text style={[styles.stepTitle, { color: colors.foreground }]} numberOfLines={2}>{step.title}</Text>
                  <Text style={[styles.stepDuration, { color: colors.mutedForeground }]}>{formatDuration(getStepSeconds(step))}</Text>
                </View>
                {active ? <Feather name="clock" size={18} color={colors.primary} /> : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 72, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 42 },
  headerLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.1 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 5, maxWidth: 210 },
  timerCard: { marginHorizontal: 20, borderRadius: 26, alignItems: 'center', paddingHorizontal: 20, paddingTop: 25, paddingBottom: 27 },
  timerRing: { width: 190, height: 190, borderRadius: 95, borderWidth: 8, alignItems: 'center', justifyContent: 'center' },
  timerText: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: 1 },
  timerCaption: { fontFamily: 'Inter_500Medium', fontSize: 12, opacity: 0.65, marginTop: 5, textTransform: 'uppercase', letterSpacing: 1 },
  activeTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, textAlign: 'center', marginTop: 22 },
  activeMeta: { fontFamily: 'Inter_400Regular', fontSize: 13, opacity: 0.68, textAlign: 'center', marginTop: 7 },
  body: { paddingHorizontal: 20, paddingTop: 24 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  controlRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 22 },
  secondaryControl: { width: 52, height: 52, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryControl: { minWidth: 130, height: 52, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 21 },
  primaryControlText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  stepsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 34, marginBottom: 12 },
  sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.1 },
  totalTime: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  stepRow: { minHeight: 68, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 9 },
  stepNumber: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  stepNumberText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  stepCopy: { flex: 1, paddingRight: 8 },
  stepTitle: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 19 },
  stepDuration: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  missingTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18 },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 5 },
  pressed: { opacity: 0.72 },
});