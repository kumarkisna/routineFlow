import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Modal,
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
import { StepDetails } from '@/components/StepDetails';
import { StepDetailAttachments } from '@/components/StepDetailAttachments';
import { SkillRatingPrompt } from '@/components/SkillRatingPrompt';
import { GroupSkillRatingPrompt } from '@/components/GroupSkillRatingPrompt';
import { RunReflectionPrompt } from '@/components/RunReflectionPrompt';
import { useSkills } from '@/context/SkillContext';
import { usePeople } from '@/context/PeopleContext';
import { useRoutines } from '@/context/RoutineContext';
import { usePlaylists } from '@/context/PlaylistContext';
import { useColors } from '@/hooks/useColors';
import { useSpeechVoice } from '@/hooks/useSpeechVoice';
import { Notifications } from '@/lib/localNotifications';
import { nextPlaylistCursor, parsePlaylistQueue, playablePlaylistIds } from '@/lib/playlists';
import {
  isRunKeepaliveAvailable,
  startRunKeepalive,
  stopRunKeepalive,
  updateRunKeepalive,
} from '@/lib/runKeepalive';
import { buildRunReminderRequests, requestRunReminderPermission } from '@/lib/runReminders';
import {
  getNextRoutineStepIndex,
  getPlayableRoutine,
  getRoutinePlaybackStepSeconds,
} from '@/lib/routinePlayback';
import {
  buildStepAnnouncement,
  RoutineSpeechQueue,
} from '@/lib/routineSpeech';
import { createSkillRatingRun, getPlaylistSkillIds, getRoutineSkillIds, type SkillRatingRun } from '@/lib/skills';
import {
  registerActiveRunSession,
  removeActiveRunSession,
  updateActiveRunSession,
} from '@/lib/activeRunSessions';
import {
  formatDuration,
  getStepDetails,
  getStepSeconds,
  type Routine,
  type RoutineNotificationSettings,
  type RunReflection,
} from '@/types/routines';

import { localDayKey } from '@/lib/progressHistory';
import { detailHtmlToText, resolveReflectionTemplateHtml } from '@/lib/stepDetailHtml';

const DEFAULT_NOTIFICATION_SETTINGS: RoutineNotificationSettings = {
  stepCompletion: false,
  routineCompletion: false,
};

const runSpeechQueue = new RoutineSpeechQueue(
  (text, options, onFinish) => Speech.speak(text, {
    ...options,
    onDone: () => onFinish('finished'),
    onStopped: () => onFinish('finished'),
    onError: () => onFinish('error'),
  }),
  () => Speech.stop(),
);
function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function parseSkillIdsParam(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(id => typeof id === 'string')
      ? [...new Set(parsed)]
      : [];
  } catch {
    return [];
  }
}

function parseRatingPeopleParam(value: string | string[] | undefined): string[] | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(id => typeof id === 'string' && id.length > 0)
      ? [...new Set(parsed)]
      : null;
  } catch {
    return null;
  }
}

export default function RoutineRunScreen() {
  const { id, cursor = '0', queue, playlistId, playlistRateSkillsAtEnd, stepReminder, routineReminder, sessionId: routeSessionId } =
    useLocalSearchParams<{ id: string; cursor?: string; queue?: string; playlistId?: string;
      playlistRateSkillsAtEnd?: string; stepReminder?: string; routineReminder?: string; sessionId?: string }>();
  const [generatedSessionId] = useState(() => `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const sessionId = routeSessionId || generatedSessionId;
  useEffect(() => {
    if (!routeSessionId) router.setParams({ sessionId });
  }, [routeSessionId, sessionId]);
  // A new routine (including a repeated routine) needs fresh timer/speech state.
  return <RoutinePlayer sessionId={sessionId} key={`${sessionId}:${id}:${cursor}:${queue ?? ''}:${playlistId ?? ''}:${playlistRateSkillsAtEnd ?? '1'}:${stepReminder ?? '0'}:${routineReminder ?? '0'}`} />;
}

function RoutinePlayer({ sessionId }: { sessionId: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activePerson, people } = usePeople();
  const speechVoiceId = useSpeechVoice(activePerson.speechVoiceId);
  const { id, queue, cursor = '0', playlistId, playlistTitle, playlistSkills: playlistSkillsParam,
    playlistRateSkillsAtEnd, autoStart, voice, stepReminder, routineReminder, ratingPeople: ratingPeopleParam, adminMode: adminModeParam } =
    useLocalSearchParams<{ id: string; queue?: string; cursor?: string; playlistId?: string; playlistTitle?: string;
      playlistSkills?: string; playlistRateSkillsAtEnd?: string; autoStart?: string; voice?: string;
      stepReminder?: string; routineReminder?: string; ratingPeople?: string; adminMode?: string }>();
  const playlistQueue = useMemo(() => parsePlaylistQueue(queue), [queue]);
  const playlistSkillIds = useMemo(() => parseSkillIdsParam(playlistSkillsParam), [playlistSkillsParam]);
  const rateSkillsAtPlaylistEnd = playlistRateSkillsAtEnd !== '0';
  const queueCursor = Number(cursor);
  const inPlaylist = !!playlistQueue && Number.isInteger(queueCursor)
    && queueCursor >= 0 && playlistQueue[queueCursor] === id;
  const { routines, loading, completeRoutine, saveRunReflection: saveCompletionRunReflection } = useRoutines();
  const { playlists } = usePlaylists();
  const { skills, reload: reloadSkills } = useSkills();
  const routine = useMemo(() => {
    const savedRoutine = routines.find((item) => item.id === id);
    return savedRoutine ? getPlayableRoutine(savedRoutine) : undefined;
  }, [routines, id]);
  const initialRemainingSeconds = routine?.steps.length ? getRoutinePlaybackStepSeconds(routine, 0) : 0;
  const [activeIndex, setActiveIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(initialRemainingSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(voice !== '0');
  const [voiceError, setVoiceError] = useState('');
  const [notificationError, setNotificationError] = useState('');
  const [backgroundError, setBackgroundError] = useState('');
  const [completionError, setCompletionError] = useState('');
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [ratingSkillIds, setRatingSkillIds] = useState<string[]>([]);
  const [ratingRun, setRatingRun] = useState<SkillRatingRun | null>(null);
  const [showRatingPrompt, setShowRatingPrompt] = useState(false);
  const [pendingRunReflections, setPendingRunReflections] = useState<{ day: string; reflection: RunReflection }[]>([]);
  const [showRunReflectionPrompt, setShowRunReflectionPrompt] = useState(false);
  const [showRatingPeoplePicker, setShowRatingPeoplePicker] = useState(false);
  const [peoplePickerError, setPeoplePickerError] = useState('');
  const [ratingPersonIds, setRatingPersonIds] = useState<string[]>(
    () => parseRatingPeopleParam(ratingPeopleParam) ?? [activePerson.id],
  );
  const [adminMode, setAdminMode] = useState(adminModeParam === '1');
  const [pendingPlaylistCursor, setPendingPlaylistCursor] = useState<number | null>(null);
  const autoStartedRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const [notificationSettings, setNotificationSettings] = useState<RoutineNotificationSettings>(
    { ...DEFAULT_NOTIFICATION_SETTINGS, stepCompletion: stepReminder === '1', routineCompletion: routineReminder === '1' },
  );
  const selectedPeople = people.filter(person => ratingPersonIds.includes(person.id));
  const ratingPeople = selectedPeople.filter(person => !adminMode || person.id !== activePerson.id);
  const groupRating = adminMode || ratingPeople.length > 1 || ratingPeople.some(person => person.id !== activePerson.id);
  const sourceRatingSkills = skills.filter(skill => ratingSkillIds.includes(skill.id));
  const activeIndexRef = useRef(0);
  const remainingMillisecondsRef = useRef(initialRemainingSeconds * 1000);
  const stepEndsAtRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  const isAnnouncingRef = useRef(false);
  const announcementTokenRef = useRef(0);
  const backgroundedAnnouncementRef = useRef(false);
  const isFinishedRef = useRef(false);
  const notificationSettingsRef = useRef(notificationSettings);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const scheduledStepNotificationIdsRef = useRef<string[]>([]);
  const scheduledRoutineNotificationIdsRef = useRef<string[]>([]);
  const notificationScheduleRevisionRef = useRef(0);
  const notificationPermissionAlertShownRef = useRef(false);
  const notificationPermissionDeniedRef = useRef(false);
  const playlistTransitionRef = useRef(false);

  useEffect(() => {
    if (loading || !routine) return;
    registerActiveRunSession({
      sessionId, routineId: routine.id, title: routine.title,
      activeStep: 0, totalSteps: routine.steps.length, remainingSeconds: getRoutinePlaybackStepSeconds(routine, 0),
      status: 'ready',
    });
    return () => removeActiveRunSession(sessionId);
  }, [loading, routine?.id, sessionId]);
  useEffect(() => {
    if (!routine) return;
    updateActiveRunSession(sessionId, {
      routineId: routine.id,
      title: routine.title,
      activeStep: activeIndex + 1,
      totalSteps: routine.steps.length,
      remainingSeconds,
      status: isFinished ? 'finished' : isAnnouncing ? 'announcing' : isRunning ? 'running' : activeIndex ? 'paused' : 'ready',
    });
  }, [sessionId, routine, activeIndex, remainingSeconds, isRunning, isAnnouncing, isFinished]);

  useEffect(() => {
    if (!loading && !isRunningRef.current && !isAnnouncingRef.current && !isFinishedRef.current && activeIndexRef.current === 0) {
      remainingMillisecondsRef.current = initialRemainingSeconds * 1000;
      setRemainingSeconds(initialRemainingSeconds);
    }
  }, [loading, initialRemainingSeconds]);

  const showNotificationPermissionHelp = useCallback((canAskAgain: boolean) => {
    if (!mountedRef.current) return;
    setNotificationError(Platform.OS === 'android'
      ? 'Allow notifications to receive reminders and see the active timer while your phone is locked.'
      : 'Allow notifications in your device settings to receive reminders.');
    if (notificationPermissionAlertShownRef.current) return;
    notificationPermissionAlertShownRef.current = true;
    Alert.alert(
      'Notifications are off',
      canAskAgain
        ? Platform.OS === 'android'
          ? 'Allow notifications to receive reminders and keep a visible timer status while a routine runs in the background.'
          : 'Allow notifications to receive reminders when a step or routine finishes.'
        : Platform.OS === 'android'
          ? 'Notifications are blocked for this app. Allow them in your device settings to show the background timer and reminders.'
          : 'Notifications are blocked for this app. Allow them in your device settings to receive reminders.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => { void Linking.openSettings().catch(() => undefined); } },
      ],
    );
  }, []);

  const ensureRunReminderPermission = useCallback(async (force = false, retry = false) => {
    const settings = notificationSettingsRef.current;
    if (!force && !settings.stepCompletion && !settings.routineCompletion) return true;
    if (Platform.OS === 'web') {
      if (mountedRef.current) {
        setNotificationError('Phone alerts require the Routine Flow app and cannot run in this web preview.');
      }
      return false;
    }
    if (retry) {
      notificationPermissionDeniedRef.current = false;
      notificationPermissionAlertShownRef.current = false;
    }
    if (notificationPermissionDeniedRef.current) return false;
    try {
      const permission = await requestRunReminderPermission(Notifications);
      if (!permission.granted) {
        notificationPermissionDeniedRef.current = true;
        showNotificationPermissionHelp(permission.canAskAgain !== false);
        return false;
      }
      notificationPermissionDeniedRef.current = false;
      notificationPermissionAlertShownRef.current = false;
      if (mountedRef.current) setNotificationError('');
      return true;
    } catch {
      if (mountedRef.current) {
        setNotificationError('This device could not check notification access.');
        Alert.alert('Notifications unavailable', 'This device could not enable routine reminders.');
      }
      return false;
    }
  }, [showNotificationPermissionHelp]);

  const cancelNotifications = useCallback(async (
    includeRoutineCompletion = true,
    invalidatePendingSchedules = true,
  ) => {
    if (invalidatePendingSchedules) notificationScheduleRevisionRef.current += 1;
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
    const settings = notificationSettingsRef.current;
    if (Platform.OS === 'web') {
      if ((settings.stepCompletion || settings.routineCompletion) && mountedRef.current) {
        setNotificationError('Phone alerts require the Routine Flow app and cannot run in this web preview.');
      }
      return;
    }
    if (!routine || !isRunningRef.current || isFinishedRef.current
      || (!settings.stepCompletion && !settings.routineCompletion)) {
      await cancelNotifications();
      return;
    }

    const stepEndAt = stepEndsAtRef.current;
    if (!stepEndAt) {
      await cancelNotifications();
      return;
    }
    const scheduleRevision = ++notificationScheduleRevisionRef.current;
    await cancelNotifications(true, false);
    const stepNotificationIds: string[] = [];
    const routineNotificationIds: string[] = [];
    try {
      const hasPermission = await ensureRunReminderPermission();
      if (
        scheduleRevision !== notificationScheduleRevisionRef.current ||
        stepEndsAtRef.current !== stepEndAt ||
        !isRunningRef.current
      ) return;
      if (!hasPermission) return;
      const requests = buildRunReminderRequests({
        routineTitle: routine.title,
        steps: routine.steps,
        activeIndex: activeIndexRef.current,
        stepEndsAt: stepEndAt,
        now: Date.now(),
        settings,
      });
      for (const request of requests) {
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: { title: request.title, body: request.body },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: request.date,
          },
        });
        if (request.kind === 'step') stepNotificationIds.push(notificationId);
        else routineNotificationIds.push(notificationId);
      }

      if (
        scheduleRevision !== notificationScheduleRevisionRef.current ||
        stepEndsAtRef.current !== stepEndAt ||
        !isRunningRef.current
      ) {
        await Promise.all([...stepNotificationIds, ...routineNotificationIds].map(
          (notificationId) => Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => undefined),
        ));
        return;
      }
      scheduledStepNotificationIdsRef.current = stepNotificationIds;
      scheduledRoutineNotificationIdsRef.current = routineNotificationIds;
    } catch {
      await Promise.all([...stepNotificationIds, ...routineNotificationIds].map(
        (notificationId) => Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => undefined),
      ));
      if (mountedRef.current) {
        setNotificationError('Could not schedule reminders. Check notification access and try again.');
      }
    }
  }, [cancelNotifications, ensureRunReminderPermission, routine]);

  const stopAnnouncement = useCallback(() => {
    announcementTokenRef.current += 1;
    isAnnouncingRef.current = false;
    setIsAnnouncing(false);
    return runSpeechQueue.cancel(sessionId);
  }, [sessionId]);

  const advancePlaylist = useCallback((nextCursor: number) => {
    if (!playlistQueue || nextCursor < 0 || nextCursor >= playlistQueue.length) return;
    playlistTransitionRef.current = true;
    router.replace({
      pathname: '/routine/[id]/run',
      params: {
        id: playlistQueue[nextCursor],
        queue: JSON.stringify(playlistQueue),
        cursor: String(nextCursor),
        sessionId,
        ...(playlistId ? { playlistId } : {}),
        playlistTitle: playlistTitle ?? 'Playlist',
        playlistSkills: JSON.stringify(playlistSkillIds),
        playlistRateSkillsAtEnd: rateSkillsAtPlaylistEnd ? '1' : '0',
        autoStart: '1',
        voice: voiceEnabled ? '1' : '0',
        stepReminder: notificationSettingsRef.current.stepCompletion ? '1' : '0',
        routineReminder: notificationSettingsRef.current.routineCompletion ? '1' : '0',
        ratingPeople: JSON.stringify(ratingPersonIds),
        adminMode: adminMode ? '1' : '0',
      },
    });
  }, [playlistQueue, playlistSkillIds, playlistId, playlistTitle, playlistRateSkillsAtEnd, voiceEnabled,
    sessionId, ratingPersonIds, adminMode]);

  const closeRatingPrompt = useCallback(() => {
    const nextCursor = pendingPlaylistCursor;
    setShowRatingPrompt(false);
    setRatingSkillIds([]);
    setRatingRun(null);
    void reloadSkills();
    if (pendingRunReflections.length) {
      setShowRunReflectionPrompt(true);
      return;
    }
    setPendingPlaylistCursor(null);
    if (nextCursor !== null) advancePlaylist(nextCursor);
    else stopRunKeepalive(sessionId);
  }, [advancePlaylist, pendingPlaylistCursor, pendingRunReflections.length, reloadSkills, sessionId]);

  const closeRunReflectionPrompt = useCallback(() => {
    if (pendingRunReflections.length > 1) {
      setPendingRunReflections(current => current.slice(1));
      return;
    }
    const nextCursor = pendingPlaylistCursor;
    setShowRunReflectionPrompt(false);
    setPendingRunReflections([]);
    setPendingPlaylistCursor(null);
    if (nextCursor !== null) advancePlaylist(nextCursor);
    else stopRunKeepalive(sessionId);
  }, [advancePlaylist, pendingPlaylistCursor, pendingRunReflections.length, sessionId]);

  const updateKeepaliveForStep = useCallback((index: number, start: boolean) => {
    if (Platform.OS !== 'android' || !routine) return;
    if (!isRunKeepaliveAvailable) {
      setBackgroundError(
        'Lock-screen auto-advance needs the installed Android app build. It is unavailable in Expo Go.',
      );
      return;
    }

    const title = inPlaylist
      ? `Playlist · ${playlistTitle ?? 'Playlist'}`
      : `Routine · ${routine.title}`;
    const body = `${routine.title} · Step ${index + 1} of ${routine.steps.length}`;
    const succeeded = start
      ? startRunKeepalive(title, body, sessionId)
      : updateRunKeepalive(title, body, sessionId);
    setBackgroundError(succeeded
      ? ''
      : 'The Android timer service could not start. Keep the app open or try starting the run again.');
  }, [inPlaylist, playlistTitle, routine, sessionId]);

  const startCountdown = useCallback(() => {
    if (isFinishedRef.current) return;
    updateKeepaliveForStep(activeIndexRef.current, false);
    stepEndsAtRef.current = Date.now() + remainingMillisecondsRef.current;
    isRunningRef.current = true;
    setIsRunning(true);
    void scheduleNotifications();
  }, [scheduleNotifications, updateKeepaliveForStep]);

  const prepareStep = useCallback(
    (index: number, shouldStart: boolean, milliseconds?: number) => {
      if (!routine) return;
      const stopped = stopAnnouncement();
      void cancelNotifications();
      activeIndexRef.current = index;
      const remaining = milliseconds ?? getRoutinePlaybackStepSeconds(routine, index) * 1000;
      remainingMillisecondsRef.current = remaining;
      stepEndsAtRef.current = null;
      isRunningRef.current = false;
      setIsRunning(false);
      setActiveIndex(index);
      setRemainingSeconds(Math.ceil(remaining / 1000));
      setVoiceError('');
      if (!shouldStart) return;
      updateKeepaliveForStep(index, true);
      const token = ++announcementTokenRef.current;
      if (!voiceEnabled) {
        void stopped.then(() => {
          if (token === announcementTokenRef.current) startCountdown();
        });
        return;
      }

      isAnnouncingRef.current = true;
      setIsAnnouncing(true);
      const finish = (failed = false) => {
        if (token !== announcementTokenRef.current || !isAnnouncingRef.current) return;
        announcementTokenRef.current += 1;
        isAnnouncingRef.current = false;
        setIsAnnouncing(false);
        if (failed) setVoiceError('Voice unavailable. The timer started without an announcement.');
        startCountdown();
      };
      // A cancelled callback cannot start an old timer because every transition
      // changes the token.
      void stopped.then(() => {
        if (token !== announcementTokenRef.current || !isAnnouncingRef.current) return;
        try {
          const playlistIsStarting = inPlaylist && playlistQueue && queueCursor === nextPlaylistCursor(playlistQueue, -1, routines);
          void runSpeechQueue.announce(sessionId, buildStepAnnouncement(
            routine,
            index,
            skills,
            playlistIsStarting ? { title: playlistTitle ?? 'Playlist', skillIds: playlistSkillIds } : undefined,
          ), {
            rate: 0.92,
            pitch: 1,
            voice: speechVoiceId,
          }).then((result) => {
            if (result !== 'cancelled') finish(result === 'error');
          }).catch(() => finish(true));
        } catch {
          finish(true);
        }
      }).catch(() => finish(true));
    },
    [cancelNotifications, routine, startCountdown, stopAnnouncement, voiceEnabled, skills, inPlaylist, sessionId,
      playlistQueue, queueCursor, routines, playlistTitle, playlistSkillIds, updateKeepaliveForStep, speechVoiceId],
  );

  const finishRoutine = useCallback(() => {
    if (!routine || isFinishedRef.current) return;
    const ratingRun = createSkillRatingRun(routine.id, inPlaylist ? playlistId : undefined);
    const next = inPlaylist && playlistQueue ? nextPlaylistCursor(playlistQueue, queueCursor, routines) : -1;
    const playlist = inPlaylist && playlistId ? playlists.find(item => item.id === playlistId) : undefined;
    const reflections: RunReflection[] = [];
    const routineTemplateHtml = resolveReflectionTemplateHtml(
      routine.reflectionTemplateHtml,
      routine.reflectionTemplate,
    );
    if (routineTemplateHtml && detailHtmlToText(routineTemplateHtml).trim()) {
      reflections.push({
        runId: `${ratingRun.runId}-routine-reflection`,
        sourceType: 'routine',
        sourceId: routine.id,
        sourceTitle: routine.title,
        routineId: routine.id,
        completedAt: ratingRun.completedAt ?? new Date().toISOString(),
        templateHtml: routineTemplateHtml,
      });
    }
    const playlistTemplateHtml = resolveReflectionTemplateHtml(
      playlist?.reflectionTemplateHtml,
      playlist?.reflectionTemplate,
    );
    if (inPlaylist && next === -1 && playlistId && playlist && playlistTemplateHtml
      && detailHtmlToText(playlistTemplateHtml).trim()) {
      reflections.push({
        runId: `${ratingRun.runId}-playlist-reflection`,
        sourceType: 'playlist',
        sourceId: playlistId,
        sourceTitle: playlistTitle ?? playlist.title,
        routineId: routine.id,
        completedAt: ratingRun.completedAt ?? new Date().toISOString(),
        templateHtml: playlistTemplateHtml,
      });
    }
    const completionDay = localDayKey(new Date(ratingRun.completedAt ?? Date.now()));
    stopAnnouncement();
    isFinishedRef.current = true;
    isRunningRef.current = false;
    stepEndsAtRef.current = null;
    remainingMillisecondsRef.current = 0;
    setRemainingSeconds(0);
    setIsRunning(false);
    setIsFinished(true);
    setSavingCompletion(true);
    setCompletionError('');
    void cancelNotifications();
    void completeRoutine(routine.id, inPlaylist && playlistId
      ? { playlistId, playlistTitle: playlistTitle ?? playlist?.title ?? 'Playlist' } : undefined, reflections).then(() => {
      if (!mountedRef.current) return;
      setSavingCompletion(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const deferUntilPlaylistEnd = inPlaylist && rateSkillsAtPlaylistEnd;
      if (deferUntilPlaylistEnd && next !== -1) {
        if (reflections.length) {
          setPendingPlaylistCursor(next);
          setPendingRunReflections(reflections.map(reflection => ({ day: completionDay, reflection })));
          stopRunKeepalive(sessionId);
          setShowRunReflectionPrompt(true);
        } else {
          advancePlaylist(next);
        }
        return;
      }
      const involvedSkillIds = deferUntilPlaylistEnd && playlistQueue
        ? getPlaylistSkillIds(playablePlaylistIds(playlistQueue, routines), routines, playlistSkillIds)
        : [...new Set([
          ...getRoutineSkillIds(routine),
          ...(inPlaylist ? playlistSkillIds : []),
        ])];
      if (next !== -1) setPendingPlaylistCursor(next);
      setPendingRunReflections(reflections.map(reflection => ({ day: completionDay, reflection })));
      if (involvedSkillIds.length && (!adminMode || ratingPeople.length > 0)) {
        stopRunKeepalive(sessionId);
        setRatingRun(ratingRun);
        setRatingSkillIds(involvedSkillIds);
        setShowRatingPrompt(true);
      } else if (reflections.length) {
        stopRunKeepalive(sessionId);
        setShowRunReflectionPrompt(true);
      } else if (next !== -1) {
        advancePlaylist(next);
      } else {
        stopRunKeepalive(sessionId);
      }
    }).catch(() => {
      if (!mountedRef.current) return;
      stopRunKeepalive(sessionId);
      setSavingCompletion(false);
      setCompletionError('Your completion could not be saved. Retry to continue.');
    });
  }, [cancelNotifications, completeRoutine, routine, stopAnnouncement, inPlaylist,
    playlistQueue, queueCursor, routines, playlistSkillIds, playlistId, playlistTitle,
    rateSkillsAtPlaylistEnd, advancePlaylist, sessionId, adminMode, ratingPeople.length, playlists]);

  const reconcileTimer = useCallback(
    (now: number) => {
      if (!routine || !isRunningRef.current || isFinishedRef.current) return;
      const index = activeIndexRef.current;
      const stepEndAt = stepEndsAtRef.current;
      if (!stepEndAt) return;

      if (stepEndAt <= now) {
        const nextIndex = getNextRoutineStepIndex(routine, index);
        if (nextIndex === null) {
          finishRoutine();
          return;
        }
        prepareStep(nextIndex, true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      remainingMillisecondsRef.current = Math.max(0, stepEndAt - now);
      setRemainingSeconds(Math.ceil(remainingMillisecondsRef.current / 1000));
    },
    [finishRoutine, prepareStep, routine],
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
      if (nextState !== 'active' && isAnnouncingRef.current) {
        backgroundedAnnouncementRef.current = true;
        stopAnnouncement();
      }
      if (nextState === 'active' && previousState !== 'active') {
        notificationPermissionDeniedRef.current = false;
        notificationPermissionAlertShownRef.current = false;
        reconcileTimer(Date.now());
        if (isRunningRef.current) void scheduleNotifications();
        if (backgroundedAnnouncementRef.current && !isFinishedRef.current) {
          backgroundedAnnouncementRef.current = false;
          prepareStep(activeIndexRef.current, true, remainingMillisecondsRef.current);
        }
      }
    });
    return () => subscription.remove();
  }, [prepareStep, reconcileTimer, scheduleNotifications, stopAnnouncement]);

  useEffect(
    () => () => {
      isRunningRef.current = false;
      announcementTokenRef.current += 1;
      void runSpeechQueue.cancel(sessionId);
      void cancelNotifications();
      if (!playlistTransitionRef.current) stopRunKeepalive(sessionId);
    },
    [cancelNotifications, sessionId],
  );

  useEffect(() => {
    if (autoStart !== '1' || loading || !routine?.steps.length || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void (async () => {
      await ensureRunReminderPermission(Platform.OS === 'android');
      if (mountedRef.current) prepareStep(0, true);
    })();
  }, [autoStart, loading, routine, prepareStep, ensureRunReminderPermission]);

  if (loading || !routine || routine.steps.length === 0) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.background }]}>
        <Ionicons name="file-tray-outline" size={40} color={colors.mutedForeground} />
        <Text style={[styles.missingTitle, { color: colors.foreground }]}>
          {loading ? 'Loading routine' : routine ? 'No visible steps to run' : 'Routine not found'}
        </Text>
        <Pressable onPress={() => { stopRunKeepalive(sessionId); router.back(); }}>
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

  async function startOrPause() {
    if (isFinished) return;
    if (isRunningRef.current) {
      const now = Date.now();
      reconcileTimer(now);
      // Reconciliation can end this step and begin an announcement.
      if (isAnnouncingRef.current) {
        stopAnnouncement();
        void cancelNotifications();
        stopRunKeepalive(sessionId);
        return;
      }
      const stepEndAt = stepEndsAtRef.current;
      if (stepEndAt) {
        remainingMillisecondsRef.current = Math.max(0, stepEndAt - now);
      }
      stepEndsAtRef.current = null;
      isRunningRef.current = false;
      setIsRunning(false);
      void cancelNotifications();
      stopRunKeepalive(sessionId);
    } else if (isAnnouncingRef.current) {
      stopAnnouncement();
      stopRunKeepalive(sessionId);
    } else {
      await ensureRunReminderPermission(Platform.OS === 'android');
      if (!mountedRef.current || isFinishedRef.current) return;
      prepareStep(activeIndexRef.current, true, remainingMillisecondsRef.current);
    }
    void Haptics.selectionAsync();
  }

  function restart() {
    if (inPlaylist && playlistQueue) {
      const first = nextPlaylistCursor(playlistQueue, -1, routines);
      if (first !== -1 && first !== queueCursor) {
        playlistTransitionRef.current = true;
        router.replace({
          pathname: '/routine/[id]/run',
          params: { id: playlistQueue[first], queue: JSON.stringify(playlistQueue),
              cursor: String(first), playlistTitle: playlistTitle ?? 'Playlist',
              playlistSkills: JSON.stringify(playlistSkillIds),
              playlistRateSkillsAtEnd: rateSkillsAtPlaylistEnd ? '1' : '0',
              autoStart: '1',
            voice: voiceEnabled ? '1' : '0',
            stepReminder: notificationSettingsRef.current.stepCompletion ? '1' : '0',
            routineReminder: notificationSettingsRef.current.routineCompletion ? '1' : '0' },
        });
        return;
      }
    }
    const firstStepSeconds = getStepSeconds(currentRoutine.steps[0]);
    isFinishedRef.current = false;
    setIsFinished(false);
    prepareStep(0, true, firstStepSeconds * 1000);
    void Haptics.selectionAsync();
  }

  function skipStep() {
    if (activeIndexRef.current >= currentRoutine.steps.length - 1) {
      finishRoutine();
      return;
    }
    const shouldStart = isRunningRef.current || isAnnouncingRef.current;
    prepareStep(activeIndexRef.current + 1, shouldStart);
    void Haptics.selectionAsync();
  }

  async function updateNotificationSetting(
    setting: keyof RoutineNotificationSettings,
    enabled: boolean,
  ) {
    if (enabled) {
      if (Platform.OS === 'web') {
        setNotificationError('Reminders need notification permission from the Routine Flow phone app.');
        Alert.alert('Notifications unavailable', 'Enable notifications on your phone to use reminders.');
        return;
      }
      if (!await ensureRunReminderPermission(true, true)) return;
    } else {
      setNotificationError('');
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
        contentContainerStyle={{ paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 30 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close timer"
            onPress={() => { stopAnnouncement(); stopRunKeepalive(sessionId); router.back(); }}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={24} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCenter}>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={voiceEnabled ? 'Mute step voice' : 'Turn on step voice'}
            testID="toggle-step-voice"
            onPress={() => {
              if (voiceEnabled && isAnnouncingRef.current) {
                const stopped = stopAnnouncement();
                const token = announcementTokenRef.current;
                void stopped.then(() => {
                  if (token === announcementTokenRef.current) startCountdown();
                });
              }
              setVoiceEnabled(!voiceEnabled);
            }}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name={voiceEnabled ? 'volume-high' : 'volume-mute'} size={22} color={colors.foreground} />
          </Pressable>
        </View>
        <Pressable
          testID="run-another-routine"
          accessibilityRole="button"
          accessibilityLabel="Run another routine in parallel"
          onPress={() => router.push('/')}
          style={({ pressed }) => [styles.addParallelRun, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={[styles.addParallelRunText, { color: colors.primary }]}>Run another routine</Text>
        </Pressable>
        <Pressable
          testID="rating-people-picker"
          accessibilityRole="button"
          accessibilityLabel={`Choose people for ratings, ${ratingPeople.length} selected`}
          onPress={() => { setPeoplePickerError(''); setShowRatingPeoplePicker(true); }}
          style={({ pressed }) => [styles.addParallelRun, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}
        >
          <Ionicons name="people-outline" size={18} color={colors.primary} />
          <Text style={[styles.addParallelRunText, { color: colors.primary }]} numberOfLines={1}>
            Ratings for: {ratingPeople.map(person => person.name).join(', ') || 'Choose people'}{adminMode ? ' · Admin mode' : ''}
          </Text>
        </Pressable>

        <View style={[styles.timerCard, { backgroundColor: colors.hero }]}>
          {inPlaylist ? (
            <View style={styles.playlistContext}>
              <Text style={[styles.playlistContextLine, { color: colors.heroForeground }]} numberOfLines={2}>
                <Text style={styles.playlistContextPrefix}>PLAYLIST · </Text>
                <Text style={styles.playlistContextName}>{playlistTitle ?? 'Playlist'}</Text>
              </Text>
              <Text style={[styles.playlistContextPosition, { color: colors.heroForeground }]} numberOfLines={1}>
                {`ROUTINE ${queueCursor + 1} OF ${playlistQueue!.length}`}
              </Text>
              <Text style={[styles.playlistContextSubtitle, { color: colors.heroForeground }]} numberOfLines={2}>
                Current routine: {currentRoutine.title}
              </Text>
            </View>
          ) : (
            <View style={styles.playlistContext} testID="routine-play-context">
              <Text style={[styles.playlistContextLine, { color: colors.heroForeground }]} numberOfLines={2}>
                <Text style={styles.playlistContextPrefix}>ROUTINE · </Text>
                <Text style={styles.playlistContextName}>{currentRoutine.title}</Text>
              </Text>
              <Text style={[styles.playlistContextPosition, { color: colors.heroForeground }]} numberOfLines={1}>
                {isFinished ? 'ROUTINE COMPLETE' : `STEP ${activeIndex + 1} OF ${currentRoutine.steps.length}`}
              </Text>
            </View>
          )}
          <View style={[styles.timerRing, { borderColor: colors.sage }]}>
            <Text style={[styles.timerText, { color: colors.heroForeground }]}>
              {isFinished ? '00:00:00' : formatClock(remainingSeconds)}
            </Text>
            <Text style={[styles.timerCaption, { color: colors.heroForeground }]}>
              {isFinished ? 'complete' : isAnnouncing ? 'announcing step' : isRunning ? 'in progress' : 'paused'}
            </Text>
          </View>
          <Text style={[styles.activeTitle, { color: colors.heroForeground }]}>
            {isFinished ? savingCompletion ? 'Saving completion…' : completionError ? 'Save needs attention'
              : inPlaylist ? 'Playlist complete' : 'Routine complete' : activeStep.title}
          </Text>
          {!isFinished && (getStepDetails(activeStep).length > 0 || activeStep.detailHtml?.some(Boolean)) ? (
            <StepDetails
              details={[activeStep.description ?? '', ...(activeStep.additionalDetails ?? [])]}
              detailHtml={activeStep.detailHtml}
              style={[styles.activeDescription, { color: colors.heroForeground }]}
              linkColor={colors.heroForeground}
              backgroundColor={colors.hero}
            />
          ) : null}
          {!isFinished ? activeStep.detailAttachments?.map((attachments, detailIndex) => attachments.length ? (
            <StepDetailAttachments key={`${activeStep.id}-attachments-${detailIndex}`} attachments={attachments}
              label={detailIndex === 0 ? 'Main detail files' : `Detail ${detailIndex} files`}
              testID={`run-step-detail-files-${activeStep.id}-${detailIndex}`} />
          ) : null) : null}
          <Text style={[styles.activeMeta, { color: colors.heroForeground }]}>
            {isFinished ? `You finished all ${currentRoutine.steps.length} steps` : `Step ${activeIndex + 1} of ${currentRoutine.steps.length} · ${formatDuration(getStepSeconds(activeStep))}`}
          </Text>
        </View>

        <View style={styles.body}>
          {completionError ? (
            <View>
              <Text style={{ color: colors.destructive }}>{completionError}</Text>
              <Pressable accessibilityRole="button" testID="retry-playlist-completion"
                accessibilityLabel="Retry completion save"
                onPress={() => { isFinishedRef.current = false; finishRoutine(); }}>
                <Text style={{ color: colors.primary, paddingVertical: 12 }}>Retry save</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.max(progress, isRunning ? 0.02 : 0) * 100}%` }]} />
          </View>

          <View style={styles.controlRow}>
            {isFinished ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={inPlaylist ? 'Run playlist again' : 'Run routine again'}
                disabled={savingCompletion || !!completionError}
                onPress={restart}
                style={({ pressed }) => [styles.secondaryControl, { borderColor: colors.border }, pressed && styles.pressed]}
              >
                <Ionicons name="refresh" size={19} color={colors.foreground} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip current step"
                onPress={skipStep}
                style={({ pressed }) => [styles.secondaryControl, { borderColor: colors.border }, pressed && styles.pressed]}
              >
                <Ionicons name="play-skip-forward" size={19} color={colors.foreground} />
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isFinished ? 'Routine complete' : isRunning || isAnnouncing ? 'Pause timer' : 'Start timer'}
              testID="start-pause-timer"
              disabled={isFinished}
              onPress={startOrPause}
              style={({ pressed }) => [
                styles.primaryControl,
                { backgroundColor: isFinished ? colors.sageSoft : colors.primary },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name={isFinished ? 'checkmark' : isRunning || isAnnouncing ? 'pause' : 'play'} size={23} color={isFinished ? colors.success : colors.primaryForeground} />
              <Text style={[styles.primaryControlText, { color: isFinished ? colors.success : colors.primaryForeground }]}>
                {isFinished ? 'Done' : isRunning || isAnnouncing ? 'Pause' : 'Start'}
              </Text>
            </Pressable>
          </View>
          {voiceError ? <Text style={[styles.voiceError, { color: colors.destructive }]}>{voiceError}</Text> : null}
          {backgroundError ? (
            <Text accessibilityRole="alert" style={[styles.notificationDescription, { color: colors.destructive }]}>
              {backgroundError}
            </Text>
          ) : null}

          <View style={[styles.notificationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.notificationHeader}>
              <View style={[styles.notificationIcon, { backgroundColor: colors.coralSoft }]}>
                <Ionicons name="notifications-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.notificationCopy}>
                <Text style={[styles.notificationTitle, { color: colors.foreground }]}>Reminders</Text>
                <Text style={[styles.notificationDescription, { color: colors.mutedForeground }]}>
                  {Platform.OS === 'android'
                    ? isRunKeepaliveAvailable
                      ? 'Android keeps this run moving while locked with a quiet status notification. Use these switches for completion alerts.'
                      : 'Locked playback needs the installed Android app build. Step and routine alerts remain optional.'
                    : 'Alerts are scheduled for the current step or routine while the timer runs.'}
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
            {notificationError ? (
              <Text accessibilityRole="alert" style={[styles.notificationDescription, { color: colors.destructive }]}>
                {notificationError}
              </Text>
            ) : null}
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
                  {getStepDetails(step).length > 0 || step.detailHtml?.some(Boolean) ? (
                    <StepDetails
                      details={[step.description ?? '', ...(step.additionalDetails ?? [])]}
                      detailHtml={step.detailHtml}
                      style={[styles.stepDescription, { color: colors.mutedForeground }]}
                      linkColor={colors.primary}
                      backgroundColor={colors.card}
                      numberOfLines={2}
                    />
                  ) : null}
                  <Text style={[styles.stepDuration, { color: colors.mutedForeground }]}>{formatDuration(getStepSeconds(step))}</Text>
                </View>
                {active ? <Feather name="clock" size={18} color={colors.primary} /> : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
      {groupRating && ratingRun ? (
        <GroupSkillRatingPrompt
          visible={showRatingPrompt}
          people={ratingPeople}
          sourceSkills={sourceRatingSkills}
          routineTitle={currentRoutine.title}
          contextLabel={inPlaylist && rateSkillsAtPlaylistEnd ? `Playlist: ${playlistTitle ?? 'Playlist'}` : undefined}
          run={ratingRun}
          onDone={closeRatingPrompt}
        />
      ) : (
        <SkillRatingPrompt
          visible={showRatingPrompt}
          skillIds={ratingSkillIds}
          routineTitle={currentRoutine.title}
          contextLabel={inPlaylist && rateSkillsAtPlaylistEnd
            ? `Playlist: ${playlistTitle ?? 'Playlist'}`
            : undefined}
          run={ratingRun ?? undefined}
          onSkip={closeRatingPrompt}
          onSaved={closeRatingPrompt}
        />
      )}
      <RunReflectionPrompt
        key={pendingRunReflections[0]?.reflection.runId ?? 'no-run-reflection'}
        visible={showRunReflectionPrompt && pendingRunReflections.length > 0}
        sourceTitle={pendingRunReflections[0]?.reflection.sourceTitle ?? ''}
        templateHtml={pendingRunReflections[0]?.reflection.templateHtml ?? ''}
        onSkip={closeRunReflectionPrompt}
        onSave={async responseHtml => {
          const pending = pendingRunReflections[0];
          if (!pending) throw new Error('This completed run could not be found.');
          await saveCompletionRunReflection(
            pending.day,
            pending.reflection.runId,
            responseHtml,
          );
          closeRunReflectionPrompt();
        }}
      />
      <Modal
        visible={showRatingPeoplePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRatingPeoplePicker(false)}
      >
        <View style={styles.peoplePickerBackdrop}>
          <View style={[styles.peoplePickerCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.peoplePickerTitle, { color: colors.foreground }]}>Who should be rated?</Text>
            <Text style={[styles.peoplePickerHint, { color: colors.mutedForeground }]}>
              One shared run. Each selected person gets separate skill ratings and notes.
            </Text>
            <View style={[styles.adminModeRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.peoplePickerName, { color: colors.foreground }]}>Admin mode</Text>
                <Text style={[styles.peoplePickerHint, { marginBottom: 0, marginTop: 3, color: colors.mutedForeground }]}>
                  Don’t rate or add notes for {activePerson.name}.
                </Text>
              </View>
              <Switch
                testID="toggle-admin-rating-mode"
                accessibilityLabel="Run in admin mode without rating me"
                value={adminMode}
                onValueChange={enabled => {
                  if (enabled && !ratingPersonIds.some(personId => personId !== activePerson.id)) {
                    setPeoplePickerError('Select at least one other person before enabling admin mode.');
                    return;
                  }
                  setAdminMode(enabled);
                  setPeoplePickerError('');
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            {peoplePickerError ? (
              <Text accessibilityRole="alert" style={[styles.peoplePickerHint, { color: colors.destructive }]}>
                {peoplePickerError}
              </Text>
            ) : null}
            <ScrollView style={{ maxHeight: 340 }}>
              {people.map(person => {
                const selected = ratingPersonIds.includes(person.id);
                return (
                  <Pressable
                    key={person.id}
                    testID={`rating-person-${person.id}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={adminMode && person.id === activePerson.id
                      ? `${person.name}, admin, not rated`
                      : `Rate ${person.name}`}
                    onPress={() => {
                      setRatingPersonIds(current => {
                        if (current.includes(person.id)) {
                          const next = current.filter(id => id !== person.id);
                          if (!next.length || (adminMode && !next.some(id => id !== activePerson.id))) return current;
                          return next;
                        }
                        return [...current, person.id];
                      });
                      setPeoplePickerError('');
                    }}
                    style={[styles.peoplePickerRow, { borderColor: colors.border }]}
                  >
                    <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={21} color={selected ? colors.primary : colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.peoplePickerName, { color: colors.foreground }]}>{person.name}</Text>
                      {adminMode && person.id === activePerson.id ? (
                        <Text style={[styles.adminNotRated, { color: colors.mutedForeground }]}>Administrator · not rated</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              testID="done-rating-people"
              accessibilityRole="button"
              onPress={() => setShowRatingPeoplePicker(false)}
              disabled={adminMode && ratingPeople.length === 0}
              style={[styles.peoplePickerDone, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 72, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  addParallelRun: { minHeight: 40, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 12 },
  addParallelRunText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  peoplePickerBackdrop: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: '#14191dcc' },
  peoplePickerCard: { borderWidth: 1, borderRadius: 20, padding: 18 },
  peoplePickerTitle: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  peoplePickerHint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 6, marginBottom: 10 },
  adminModeRow: { minHeight: 62, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, marginTop: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  peoplePickerRow: { minHeight: 50, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  peoplePickerName: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  adminNotRated: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  peoplePickerDone: { minHeight: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  headerSpacer: { width: 42 },
  headerLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.1 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 5, maxWidth: 250 },
  playlistContext: { width: '100%', alignItems: 'center', marginBottom: 12 },
  playlistContextLine: { fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 28, textAlign: 'center', maxWidth: 280 },
  playlistContextPrefix: { fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: 0.2, opacity: 0.9 },
  playlistContextName: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  playlistContextPosition: { fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.6, lineHeight: 16, textAlign: 'center', marginTop: 4 },
  playlistContextSubtitle: { fontFamily: 'Inter_700Bold', fontSize: 20, textAlign: 'center', lineHeight: 24, marginTop: 5, maxWidth: 280 },
  timerCard: { marginHorizontal: 20, borderRadius: 26, alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  timerRing: { width: 164, height: 164, borderRadius: 82, borderWidth: 7, alignItems: 'center', justifyContent: 'center' },
  timerText: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: 1 },
  timerCaption: { fontFamily: 'Inter_500Medium', fontSize: 11, opacity: 0.65, marginTop: 5, textTransform: 'uppercase', letterSpacing: 1 },
  activeTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, textAlign: 'center', marginTop: 16 },
  activeDescription: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'center', opacity: 0.82, marginTop: 9 },
  activeMeta: { fontFamily: 'Inter_400Regular', fontSize: 13, opacity: 0.68, textAlign: 'center', marginTop: 7 },
  body: { paddingHorizontal: 20, paddingTop: 24 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  controlRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 22 },
  secondaryControl: { width: 52, height: 52, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryControl: { minWidth: 130, height: 52, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 21 },
  primaryControlText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  voiceError: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', marginTop: 12 },
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
  stepDescription: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 },
  stepDuration: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  missingTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18 },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 5 },
  pressed: { opacity: 0.72 },
});
