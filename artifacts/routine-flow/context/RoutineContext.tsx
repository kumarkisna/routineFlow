import { usePeople, usePersonStorage } from '@/context/PeopleContext';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import {
  isCompleted, type CompletionMap, type PlaylistCompletionSource, type Routine, type RoutineStep,
} from '@/types/routines';
import { makeRoutineCopy } from '@/lib/copyRoutine';
import { recordCompletion } from '@/lib/progressHistory';
import { removeRoutineCategory, renameRoutineCategory } from '@/lib/routineCategories';
import { createRoutineWriteGuard } from '@/lib/routineWriteGuard';
import { mergeImportedProgress, mergeImportedRoutines, persistImportedBackup, type RoutineBackup } from '@/lib/routineTransfer';
import {
  saveRoutinesWithStepDetailAttachments,
  type StepDetailAttachmentWriteFileSystem,
} from '@/lib/stepDetailAttachmentCleanup';

const ROUTINES_KEY = '@routine-flow/routines';
const PROGRESS_KEY = '@routine-flow/progress';
const stepDetailAttachmentWriteFileSystem: StepDetailAttachmentWriteFileSystem = {
  getInfoAsync: async uri => ({ exists: (await FileSystem.getInfoAsync(uri)).exists }),
  makeDirectoryAsync: (uri, options) => FileSystem.makeDirectoryAsync(uri, options),
  writeAsStringAsync: (uri, contents) => FileSystem.writeAsStringAsync(uri, contents, {
    encoding: FileSystem.EncodingType.Base64,
  }),
};

const seedRoutines: Routine[] = [
  {
    id: 'morning-reset',
    title: 'Morning Reset',
    subtitle: 'Start clear and unhurried',
    icon: 'sunny-outline',
    tone: 'coral',
    createdAt: '2026-09-01T08:00:00.000Z',
    steps: [
      { id: 'morning-water', title: 'Drink a glass of water', durationSeconds: 120 },
      { id: 'morning-breathe', title: 'Take five slow breaths', durationSeconds: 180 },
      { id: 'morning-stretch', title: 'Move through a light stretch', durationSeconds: 300 },
      { id: 'morning-intention', title: 'Choose one intention for today', durationSeconds: 120 },
    ],
  },
  {
    id: 'deep-work',
    title: 'Deep Work',
    subtitle: 'Make room for the important thing',
    icon: 'layers-outline',
    tone: 'sage',
    createdAt: '2026-09-01T08:00:00.000Z',
    steps: [
      { id: 'work-clear', title: 'Clear your desk and close distractions', durationSeconds: 180 },
      { id: 'work-focus', title: 'Set a single outcome for this block', durationSeconds: 120 },
      { id: 'work-timer', title: 'Work with focus for 45 minutes', durationSeconds: 2700 },
    ],
  },
  {
    id: 'evening-wind-down',
    title: 'Evening Wind-down',
    subtitle: 'Close the day gently',
    icon: 'moon-outline',
    tone: 'lavender',
    createdAt: '2026-09-01T08:00:00.000Z',
    steps: [
      { id: 'evening-reset', title: 'Put tomorrow’s essentials in place', durationSeconds: 300 },
      { id: 'evening-reflect', title: 'Name one thing that went well', durationSeconds: 120 },
      { id: 'evening-screen', title: 'Leave your phone outside the bedroom', durationSeconds: 60 },
      { id: 'evening-rest', title: 'Get comfortable and rest', durationSeconds: 600 },
    ],
  },
];

type RoutineContextValue = {
  routines: Routine[];
  progress: CompletionMap;
  loading: boolean;
  completeRoutine: (routineId: string, playlistRun?: PlaylistCompletionSource) => Promise<void>;
  createRoutine: (title: string, subtitle: string, steps: RoutineStep[], category?: string, skillIds?: string[], subtitleHtml?: string, speakSubtitle?: boolean, descriptionAttachments?: Routine['descriptionAttachments'], reflectionTemplate?: string, reflectionTemplateHtml?: string) => Promise<Routine>;
  copyRoutine: (routineId: string) => Promise<Routine>;
  updateRoutine: (routineId: string, title: string, subtitle: string, steps: RoutineStep[], category?: string, skillIds?: string[], subtitleHtml?: string, speakSubtitle?: boolean, descriptionAttachments?: Routine['descriptionAttachments'], reflectionTemplate?: string, reflectionTemplateHtml?: string) => Promise<void>;
  renameCategory: (source: string, target: string) => Promise<void>;
  removeCategory: (source: string) => Promise<void>;
  moveRoutine: (routineId: string, adjacentId: string) => Promise<void>;
  importRoutines: (backup: RoutineBackup, includeProgress: boolean) => Promise<{
    added: number; skipped: number; renamed: number; progressAdded: number; progressKept: number;
    routineIdMap: Record<string, string>;
  }>;
  importProgress: (
    progress: CompletionMap,
    routineIdMap: Record<string, string>,
    playlistIdMap: Record<string, string>,
  ) => Promise<{ added: number; kept: number }>;
  setRoutineHidden: (routineId: string, hidden: boolean) => Promise<void>;
  setStepHidden: (routineId: string, stepId: string, hidden: boolean) => Promise<void>;
  deleteRoutine: (routineId: string) => Promise<void>;
  resetToday: () => Promise<void>;
  getCompletedCount: (routine: Routine) => number;
  removeSkillAssignments: (skillId: string) => Promise<void>;
};

const RoutineContext = createContext<RoutineContextValue | null>(null);

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function makeId() {
  return `${Date.now().toString()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function RoutineProvider({ children }: { children: React.ReactNode }) {
  const AsyncStorage = usePersonStorage();
  const { activePerson, runAttachmentCleanup } = usePeople();
  const [routines, setRoutines] = useState<Routine[]>(activePerson.id === 'me' ? seedRoutines : []);
  const [progress, setProgress] = useState<CompletionMap>({});
  const progressRef = useRef<CompletionMap>({});
  const [loading, setLoading] = useState(true);
  const importNeedsRestart = useRef(false);
  const runRoutineWrite = useRef(createRoutineWriteGuard()).current;
  const persistRoutineList = useCallback((nextRoutines: Routine[]) => (
    saveRoutinesWithStepDetailAttachments(
      nextRoutines,
      () => AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines)),
      FileSystem.documentDirectory,
      stepDetailAttachmentWriteFileSystem,
    )
  ), [AsyncStorage]);

  useEffect(() => {
    async function hydrate() {
      try {
        const [storedRoutines, storedProgress] = await Promise.all([
          AsyncStorage.getItem(ROUTINES_KEY),
          AsyncStorage.getItem(PROGRESS_KEY),
        ]);
        if (storedRoutines) setRoutines(JSON.parse(storedRoutines) as Routine[]);
        else if (activePerson.id === 'me') await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(seedRoutines));
        const loadedProgress = storedProgress ? JSON.parse(storedProgress) as CompletionMap : {};
        progressRef.current = loadedProgress;
        setProgress(loadedProgress);
      } finally {
        setLoading(false);
      }
    }
    void hydrate();
  }, [AsyncStorage, activePerson.id]);

  const saveProgress = useCallback(async (nextProgress: CompletionMap) => {
    progressRef.current = nextProgress;
    setProgress(nextProgress);
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(nextProgress));
  }, []);

  const completeRoutine = useCallback(
    async (routineId: string, playlistRun?: PlaylistCompletionSource) => {
      const routine = routines.find((item) => item.id === routineId);
      if (!routine) return;
      const day = todayKey();
      const nextDay = { ...(progress[day] ?? {}) };
      routine.steps.filter((step) => !step.hidden).forEach((step) => {
        const key = `${routineId}:${step.id}`;
        nextDay[key] = recordCompletion(routine.title, step.title, nextDay[key], playlistRun);
      });
      await saveProgress({ ...progress, [day]: nextDay });
    },
    [progress, routines, saveProgress],
  );

  const createRoutine = useCallback(
    (title: string, subtitle: string, steps: RoutineStep[], category?: string, skillIds?: string[], subtitleHtml?: string, speakSubtitle?: boolean, descriptionAttachments?: Routine['descriptionAttachments'], reflectionTemplate?: string, reflectionTemplateHtml?: string) => runRoutineWrite(async () => {
      const routine: Routine = {
        id: makeId(),
        title,
        subtitle,
        ...(subtitleHtml ? { subtitleHtml } : {}),
        speakSubtitle: speakSubtitle ?? true,
        ...(descriptionAttachments?.length ? { descriptionAttachments: [...descriptionAttachments] } : {}),
        ...(category ? { category } : {}),
        ...(skillIds?.length ? { skillIds: [...skillIds] } : {}),
        ...(reflectionTemplate?.trim() ? { reflectionTemplate: reflectionTemplate.trim() } : {}),
        ...(reflectionTemplateHtml?.trim() ? { reflectionTemplateHtml } : {}),
        icon: 'sparkles-outline',
        tone: 'sun',
        steps,
        createdAt: new Date().toISOString(),
      };
      const nextRoutines = [...routines, routine];
      setRoutines(nextRoutines);
      await persistRoutineList(nextRoutines);
      void runAttachmentCleanup();
      return routine;
    }),
    [routines, persistRoutineList, runRoutineWrite, runAttachmentCleanup],
  );

  const copyRoutine = useCallback(
    (routineId: string) => runRoutineWrite(async () => {
      const source = routines.find((routine) => routine.id === routineId);
      if (!source) throw new Error('Routine not found');
      const copied = makeRoutineCopy(source, routines, makeId);
      const nextRoutines = [...routines, copied];
      await persistRoutineList(nextRoutines);
      setRoutines(nextRoutines);
      return copied;
    }),
    [routines, persistRoutineList, runRoutineWrite],
  );

  const updateRoutine = useCallback(
    (routineId: string, title: string, subtitle: string, steps: RoutineStep[], category?: string, skillIds?: string[], subtitleHtml?: string, speakSubtitle?: boolean, descriptionAttachments?: Routine['descriptionAttachments'], reflectionTemplate?: string, reflectionTemplateHtml?: string) => runRoutineWrite(async () => {
      if (!routines.some((routine) => routine.id === routineId)) {
        throw new Error('Routine not found');
      }
      const nextRoutines = routines.map((routine) =>
        routine.id === routineId ? {
          ...routine, title, subtitle, steps, category,
          ...(subtitleHtml !== undefined ? { subtitleHtml } : {}),
          ...(speakSubtitle !== undefined ? { speakSubtitle } : {}),
          ...(descriptionAttachments !== undefined ? { descriptionAttachments: [...descriptionAttachments] } : {}),
          ...(skillIds !== undefined ? { skillIds: [...skillIds] } : {}),
          ...(reflectionTemplate !== undefined ? { reflectionTemplate: reflectionTemplate.trim() || undefined } : {}),
          ...(reflectionTemplateHtml !== undefined ? {
            reflectionTemplateHtml: typeof reflectionTemplate === 'string' && reflectionTemplate.trim()
              ? reflectionTemplateHtml
              : undefined,
          } : {}),
        } : routine,
      );
      await persistRoutineList(nextRoutines);
      setRoutines(nextRoutines);
      void runAttachmentCleanup();
    }),
    [routines, persistRoutineList, runRoutineWrite, runAttachmentCleanup],
  );

  const removeSkillAssignments = useCallback((skillId: string) => runRoutineWrite(async () => {
    if (loading) throw new Error('Wait for routines to load before deleting this skill.');
    const remove = (ids: string[] | undefined) => {
      if (!ids?.includes(skillId)) return ids;
      const remaining = ids.filter(id => id !== skillId);
      return remaining.length ? remaining : undefined;
    };
    const nextRoutines = routines.map(routine => ({
      ...routine,
      ...(routine.skillIds?.includes(skillId) ? { skillIds: remove(routine.skillIds) } : {}),
      steps: routine.steps.map(step => ({
        ...step,
        ...(step.skillIds?.includes(skillId) ? { skillIds: remove(step.skillIds) } : {}),
      })),
    }));
    const changed = routines.some((routine, index) =>
      nextRoutines[index].skillIds !== routine.skillIds
      || routine.steps.some((step, stepIndex) => nextRoutines[index].steps[stepIndex].skillIds !== step.skillIds));
    if (!changed) return;
    await persistRoutineList(nextRoutines);
    setRoutines(nextRoutines);
  }), [loading, persistRoutineList, routines, runRoutineWrite]);

  const renameCategory = useCallback(
    (source: string, target: string) => runRoutineWrite(async () => {
      const nextRoutines = renameRoutineCategory(routines, source, target);
      await persistRoutineList(nextRoutines);
      setRoutines(nextRoutines);
    }),
    [routines, persistRoutineList, runRoutineWrite],
  );

  const removeCategory = useCallback(
    (source: string) => runRoutineWrite(async () => {
      const nextRoutines = removeRoutineCategory(routines, source);
      await persistRoutineList(nextRoutines);
      setRoutines(nextRoutines);
    }),
    [routines, persistRoutineList, runRoutineWrite],
  );

  const importRoutines = useCallback(
    (backup: RoutineBackup, includeProgress: boolean) => runRoutineWrite(async () => {
      if (importNeedsRestart.current) {
        throw new Error('Could not confirm the saved routines. Restart the app before trying this backup again to avoid duplicates.');
      }
      const result = mergeImportedRoutines(routines, backup.routines, makeId, progress);
      const merged = includeProgress && backup.progress
        ? mergeImportedProgress(progress, backup.progress, result.idMap)
        : { progress, added: 0, kept: 0 };
      await saveRoutinesWithStepDetailAttachments(
        result.routines,
        () => persistImportedBackup(
          AsyncStorage, ROUTINES_KEY, PROGRESS_KEY, result.routines, merged.progress,
          result.added, merged.added, setRoutines, saved => {
            progressRef.current = saved;
            setProgress(saved);
          },
          () => { importNeedsRestart.current = true; },
        ),
        FileSystem.documentDirectory,
        stepDetailAttachmentWriteFileSystem,
      );
      return { added: result.added, skipped: result.skipped, renamed: result.renamed,
        progressAdded: merged.added, progressKept: merged.kept, routineIdMap: result.idMap };
    }),
    [AsyncStorage, routines, progress, runRoutineWrite],
  );

  const importProgress = useCallback((
    imported: CompletionMap,
    routineIdMap: Record<string, string>,
    playlistIdMap: Record<string, string>,
  ) => runRoutineWrite(async () => {
    if (importNeedsRestart.current) {
      throw new Error('Could not confirm the saved routines. Restart the app before trying this backup again to avoid duplicates.');
    }
    const merged = mergeImportedProgress(progressRef.current, imported, routineIdMap, playlistIdMap);
    await persistImportedBackup(
      AsyncStorage, ROUTINES_KEY, PROGRESS_KEY, [], merged.progress, 0, merged.added, () => {},
      saved => {
        progressRef.current = saved;
        setProgress(saved);
      },
      () => { importNeedsRestart.current = true; },
    );
    return { added: merged.added, kept: merged.kept };
  }), [AsyncStorage, runRoutineWrite]);

  const moveRoutine = useCallback(
    (routineId: string, adjacentId: string) => runRoutineWrite(async () => {
      const fromIndex = routines.findIndex((routine) => routine.id === routineId);
      const toIndex = routines.findIndex((routine) => routine.id === adjacentId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        throw new Error('Could not find routines to reorder');
      }
      const nextRoutines = [...routines];
      [nextRoutines[fromIndex], nextRoutines[toIndex]] = [nextRoutines[toIndex], nextRoutines[fromIndex]];
      await persistRoutineList(nextRoutines);
      setRoutines(nextRoutines);
    }),
    [routines, persistRoutineList, runRoutineWrite],
  );

  const setRoutineHidden = useCallback(
    (routineId: string, hidden: boolean) => runRoutineWrite(async () => {
      if (!routines.some((routine) => routine.id === routineId)) throw new Error('Routine not found');
      const nextRoutines = routines.map((routine) =>
        routine.id === routineId ? { ...routine, hidden } : routine,
      );
      await persistRoutineList(nextRoutines);
      setRoutines(nextRoutines);
    }),
    [routines, persistRoutineList, runRoutineWrite],
  );

  const setStepHidden = useCallback(
    (routineId: string, stepId: string, hidden: boolean) => runRoutineWrite(async () => {
      const routine = routines.find((item) => item.id === routineId);
      if (!routine?.steps.some((step) => step.id === stepId)) throw new Error('Step not found');
      const nextRoutines = routines.map((item) =>
        item.id === routineId
          ? { ...item, steps: item.steps.map((step) => step.id === stepId ? { ...step, hidden } : step) }
          : item,
      );
      await persistRoutineList(nextRoutines);
      setRoutines(nextRoutines);
    }),
    [routines, persistRoutineList, runRoutineWrite],
  );

  const deleteRoutine = useCallback(
    (routineId: string) => runRoutineWrite(async () => {
      if (!routines.some((routine) => routine.id === routineId)) throw new Error('Routine not found');
      const nextRoutines = routines.filter((routine) => routine.id !== routineId);
      await persistRoutineList(nextRoutines);
      setRoutines(nextRoutines);
      void runAttachmentCleanup();
    }),
    [routines, persistRoutineList, runRoutineWrite, runAttachmentCleanup],
  );

  const resetToday = useCallback(async () => {
    const nextProgress = { ...progress };
    delete nextProgress[todayKey()];
    await saveProgress(nextProgress);
  }, [progress, saveProgress]);

  const getCompletedCount = useCallback(
    (routine: Routine) => {
      const day = progress[todayKey()] ?? {};
      return routine.steps.filter((step) => !step.hidden && isCompleted(day[`${routine.id}:${step.id}`])).length;
    },
    [progress],
  );

  const value = useMemo(
    () => ({
      routines,
      progress,
      loading,
      completeRoutine,
      createRoutine,
      copyRoutine,
      updateRoutine,
      renameCategory,
      removeCategory,
      moveRoutine,
      importRoutines,
      importProgress,
      setRoutineHidden,
      setStepHidden,
      deleteRoutine,
      resetToday,
      getCompletedCount,
      removeSkillAssignments,
    }),
    [
      routines,
      progress,
      loading,
      completeRoutine,
      createRoutine,
      copyRoutine,
      updateRoutine,
      renameCategory,
      removeCategory,
      moveRoutine,
      importRoutines,
      importProgress,
      setRoutineHidden,
      setStepHidden,
      deleteRoutine,
      resetToday,
      getCompletedCount,
      removeSkillAssignments,
    ],
  );

  return <RoutineContext.Provider value={value}>{children}</RoutineContext.Provider>;
}

export function useRoutines() {
  const context = useContext(RoutineContext);
  if (!context) throw new Error('useRoutines must be used within RoutineProvider');
  return context;
}
