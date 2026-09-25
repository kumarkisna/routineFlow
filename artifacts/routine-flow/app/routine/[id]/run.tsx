import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  type AppStateStatus,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoutines } from '@/context/RoutineContext';
import { useColors } from '@/hooks/useColors';
import {
  formatDuration,
  getStepSeconds,
  type Routine,
  type RoutineNotificationSettings,
} from '@/types/routines';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const DEFAULT_NOTIFICATION_SETTINGS: RoutineNotificationSettings = {
  stepCompletion: false,
  routineCompletion: false,
};

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
  const initialRemainingSeconds = routine ? getStepSeconds(routine.steps[0]) : 0;
  const [activeIndex, setActiveIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(initialRemainingSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [notificationSettings, setNotificationSettings] = useState<RoutineNotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const activeIndexRef = useRef(0);
  const remainingMillisecondsRef = useRef(initialRemainingSeconds * 1000);
  const stepEndsAtRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  const isFinishedRef = useRef(false);
  const notificationSettingsRef = useRef(notificationSettings);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const scheduledStepNotificationIdsRef = useRef<string[]>([]);
  const scheduledRoutineNotificationIdsRef = useRef<string[]>([]);

  useEffect(
    () => () => {
      void Speech.stop();
    },
    [],
  );

  const cancelNotifications = useCallback(async (includeRoutineCompletion = true) => {
    const ids = [
      ...scheduledStepNotificationIdsRef.current,
      ...(includeRoutineCompletion ? scheduledRoutineNotificationIdsRef.current : []),
    ];
    if (includeRoutineCompletion) {
      scheduledRoutineNotificationIdsRef.current = [];
    }
    scheduledStepNotificationIdsRef.current = [];
    await Promise.all(
      ids.map((notificationId) =>
        Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => undefined),
      ),
    );
  }, []);

  const scheduleNotifications = useCallback(async () => {
    if (
      Platform.OS === 'web' ||
      !routine ||
      !isRunningRef.current ||
      isFinishedRef.current ||
      (!notificationSettingsRef.current.stepCompletion &&
        !notificationSettingsRef.current.routineCompletion)
    ) {
      return;
    }

    await cancelNotifications();
    const stepNotificationIds: string[] = [];
    const routineNotificationIds: string[] = [];
    const settings = notificationSettingsRef.current;
    const now = Date.now();
    let stepEndAt = stepEndsAtRef.current;
    if (!stepEndAt) return;

    for (let index = activeIndexRef.current; index < routine.steps.length; index += 1) {
      if (stepEndAt > now && settings.stepCompletion) {
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Step complete',
            body:
              index === routine.steps.length - 1
                ? `${routine.title} is complete.`
                : `${routine.steps[index].title} is complete.`,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(stepEndAt),
          },
        });
        stepNotificationIds.push(notificationId);
      }

      if (index === routine.steps.length - 1 && stepEndAt > now && settings.routineCompletion) {
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Routine complete',
            body: `${routine.title} is complete.`,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(stepEndAt),
          },
        });
        routineNotificationIds.push(notificationId);
      }

      if (index < routine.steps.length - 1) {
        stepEndAt += getStepSeconds(routine.steps[index + 1]) * 1000;
      }
    }

    scheduledStepNotificationIdsRef.current = stepNotificationIds;
    scheduledRoutineNotificationIdsRef.current = routineNotificationIds;
  }, [cancelNotifications, routine]);

  const reconcileTimer = useCallback(
    (now: number) => {
      if (!routine || !isRunningRef.current || isFinishedRef.current) return;
      let index = activeIndexRef.current;
      let stepEndAt = stepEndsAtRef.current;
      if (!stepEndAt) return;

      while (stepEndAt <= now) {
        if (index >= routine.steps.length - 1) {
          activeIndexRef.current = index;
          remainingMillisecondsRef.current = 0;
          stepEndsAtRef.current = null;
          isRunningRef.current = false;
          isFinishedRef.current = true;
          setActiveIndex(index);
          setRemainingSeconds(0);
          setIsRunning(false);
          setIsFinished(true);
          void Speech.stop();
          void cancelNotifications(false);
          void completeRoutine(routine.id);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        }

        index += 1;
        stepEndAt += getStepSeconds(routine.steps[index]) * 1000;
        activeIndexRef.current = index;
        setActiveIndex(index);
        announceStep(routine, index, voiceEnabled);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      activeIndexRef.current = index;
      stepEndsAtRef.current = stepEndAt;
      remainingMillisecondsRef.current = Math.max(0, stepEndAt - now);
      setRemainingSeconds(Math.ceil(remainingMillisecondsRef.current / 1000));
    },
    [cancelNotifications, completeRoutine, routine, voiceEnabled],
  );

  useEffect(() => {
    if (!isRunning) return undefined;
    const interval = setInterval(() => reconcileTimer(Date.now()), 250);
    return () => clearInterval(interval);
  }, [isRunning, reconcileTimer]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState === 'active' && previousState !== 'active') {
        reconcileTimer(Date.now());
      }
    });
    return () => subscription.remove();
  }, [reconcileTimer]);

  useEffect(
    () => () => {
      isRunningRef.current = false;
      void cancelNotifications();
    },
    [cancelNotifications],
  );

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
    if (isRunningRef.current) {
      void Speech.stop();
      const now = Date.now();
      reconcileTimer(now);
      const stepEndAt = stepEndsAtRef.current;
      if (stepEndAt) {
        remainingMillisecondsRef.current = Math.max(0, stepEndAt - now);
      }
      stepEndsAtRef.current = null;
      isRunningRef.current = false;
      setIsRunning(false);
      void cancelNotifications();
    } else {
      announceStep(currentRoutine, activeIndex, voiceEnabled);
      const now = Date.now();
      stepEndsAtRef.current = now + remainingMillisecondsRef.current;
      isRunningRef.current = true;
      setIsRunning(true);
      void scheduleNotifications();
    }
    void Haptics.selectionAsync();
  }

  function restart() {
    const firstStepSeconds = getStepSeconds(currentRoutine.steps[0]);
    activeIndexRef.current = 0;
    remainingMillisecondsRef.current = firstStepSeconds * 1000;
    stepEndsAtRef.current = Date.now() + remainingMillisecondsRef.current;
    isRunningRef.current = true;
    isFinishedRef.current = false;
    setActiveIndex(0);
    setRemainingSeconds(firstStepSeconds);
    setIsFinished(false);
    setIsRunning(true);
    announceStep(currentRoutine, 0, voiceEnabled);
    void scheduleNotifications();
    void Haptics.selectionAsync();
  }

  function skipStep() {
    if (activeIndex >= currentRoutine.steps.length - 1) {
      if (isRunningRef.current) reconcileTimer(Date.now() + remainingMillisecondsRef.current);
      return;
    }
    const nextIndex = activeIndex + 1;
    const nextStepMilliseconds = getStepSeconds(currentRoutine.steps[nextIndex]) * 1000;
    activeIndexRef.current = nextIndex;
    remainingMillisecondsRef.current = nextStepMilliseconds;
    stepEndsAtRef.current = isRunningRef.current ? Date.now() + nextStepMilliseconds : null;
    setActiveIndex(nextIndex);
    setRemainingSeconds(Math.ceil(nextStepMilliseconds / 1000));
    announceStep(currentRoutine, nextIndex, voiceEnabled);
    void cancelNotifications();
    if (isRunningRef.current) void scheduleNotifications();
    void Haptics.selectionAsync();
  }

  async function updateNotificationSetting(
    setting: keyof RoutineNotificationSettings,
    enabled: boolean,
  ) {
    if (enabled) {
      if (Platform.OS === 'web') {
        Alert.alert('Notifications unavailable', 'Enable notifications on your phone to use reminders.');
        return;
      }
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('routine-flow', {
            name: 'Routine Flow',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }
        let permission = await Notifications.getPermissionsAsync();
        if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Notifications are off', 'Allow notifications in Settings to receive routine reminders.');
          return;
        }
      } catch {
        Alert.alert('Notifications unavailable', 'This device could not enable routine reminders.');
        return;
      }
    }

    const nextSettings = { ...notificationSettingsRef.current, [setting]: enabled };
    notificationSettingsRef.current = nextSettings;
    setNotificationSettings(nextSettings);
    if (isRunningRef.current) void scheduleNotifications();
    else if (!enabled) void cancelNotifications();
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

          <View style={[styles.notificationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.notificationHeader}>
              <View style={[styles.notificationIcon, { backgroundColor: colors.coralSoft }]}>
                <Ionicons name="notifications-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.notificationCopy}>
                <Text style={[styles.notificationTitle, { color: colors.foreground }]}>Reminders</Text>
                <Text style={[styles.notificationDescription, { color: colors.mutedForeground }]}>
                  Get a reminder even when your phone is locked.
                </Text>
              </View>
            </View>
            <View style={[styles.notificationRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.notificationLabel, { color: colors.foreground }]}>When a step finishes</Text>
              <Switch
                accessibilityLabel="Notify when a step finishes"
                testID="step-completion-notifications"
                value={notificationSettings.stepCompletion}
                onValueChange={(enabled) => void updateNotificationSetting('stepCompletion', enabled)}
                trackColor={{ false: colors.secondary, true: colors.sage }}
                thumbColor={notificationSettings.stepCompletion ? colors.success : colors.card}
              />
            </View>
            <View style={[styles.notificationRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.notificationLabel, { color: colors.foreground }]}>When the routine finishes</Text>
              <Switch
                accessibilityLabel="Notify when the routine finishes"
                testID="routine-completion-notifications"
                value={notificationSettings.routineCompletion}
                onValueChange={(enabled) => void updateNotificationSetting('routineCompletion', enabled)}
                trackColor={{ false: colors.secondary, true: colors.sage }}
                thumbColor={notificationSettings.routineCompletion ? colors.success : colors.card}
              />
            </View>
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
  notificationCard: { borderRadius: 18, borderWidth: 1, marginTop: 22, paddingHorizontal: 15 },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  notificationIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  notificationCopy: { flex: 1 },
  notificationTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  notificationDescription: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  notificationRow: { minHeight: 51, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notificationLabel: { fontFamily: 'Inter_500Medium', fontSize: 13 },
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