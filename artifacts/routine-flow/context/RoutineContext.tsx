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
import { isCompleted, type CompletionMap, type Routine, type RoutineStep } from '@/types/routines';
import { makeRoutineCopy } from '@/lib/copyRoutine';
import { recordCompletion } from '@/lib/progressHistory';
import { removeRoutineCategory, renameRoutineCategory } from '@/lib/routineCategories';
import { createRoutineWriteGuard } from '@/lib/routineWriteGuard';
import { mergeImportedProgress, mergeImportedRoutines, persistImportedBackup, type RoutineBackup } from '@/lib/routineTransfer';

const ROUTINES_KEY = '@routine-flow/routines';
const PROGRESS_KEY = '@routine-flow/progress';

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
  toggleStep: (routineId: string, stepId: string) => Promise<void>;
  completeRoutine: (routineId: string) => Promise<void>;
  createRoutine: (title: string, subtitle: string, steps: RoutineStep[], category?: string) => Promise<Routine>;
  copyRoutine: (routineId: string) => Promise<Routine>;
  updateRoutine: (routineId: string, title: string, subtitle: string, steps: RoutineStep[], category?: string) => Promise<void>;
  renameCategory: (source: string, target: string) => Promise<void>;
  removeCategory: (source: string) => Promise<void>;
  moveRoutine: (routineId: string, adjacentId: string) => Promise<void>;
  importRoutines: (backup: RoutineBackup, includeProgress: boolean) => Promise<{
    added: number; skipped: number; renamed: number; progressAdded: number; progressKept: number;
  }>;
  setRoutineHidden: (routineId: string, hidden: boolean) => Promise<void>;
  setStepHidden: (routineId: string, stepId: string, hidden: boolean) => Promise<void>;
  deleteRoutine: (routineId: string) => Promise<void>;
  resetToday: () => Promise<void>;
  getCompletedCount: (routine: Routine) => number;
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
  const { activePerson } = usePeople();
  const [routines, setRoutines] = useState<Routine[]>(activePerson.id === 'me' ? seedRoutines : []);
  const [progress, setProgress] = useState<CompletionMap>({});
  const [loading, setLoading] = useState(true);
  const importNeedsRestart = useRef(false);
  const runRoutineWrite = useRef(createRoutineWriteGuard()).current;

  useEffect(() => {
    async function hydrate() {
      try {
        const [storedRoutines, storedProgress] = await Promise.all([
          AsyncStorage.getItem(ROUTINES_KEY),
          AsyncStorage.getItem(PROGRESS_KEY),
        ]);
        if (storedRoutines) setRoutines(JSON.parse(storedRoutines) as Routine[]);
        else if (activePerson.id === 'me') await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(seedRoutines));
        if (storedProgress) setProgress(JSON.parse(storedProgress) as CompletionMap);
      } finally {
        setLoading(false);
      }
    }
    void hydrate();
  }, [AsyncStorage, activePerson.id]);

  const saveProgress = useCallback(async (nextProgress: CompletionMap) => {
    setProgress(nextProgress);
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(nextProgress));
  }, []);

  const toggleStep = useCallback(
    async (routineId: string, stepId: string) => {
      const routine = routines.find((item) => item.id === routineId);
      const step = routine?.steps.find((item) => item.id === stepId);
      if (!routine || !step) throw new Error('Step not found');
      const day = todayKey();
      const key = `${routineId}:${stepId}`;
      const nextProgress = {
        ...progress,
        [day]: {
          ...(progress[day] ?? {}),
          [key]: isCompleted(progress[day]?.[key])
            ? false
            : recordCompletion(routine.title, step.title, progress[day]?.[key]),
        },
      };
      await saveProgress(nextProgress);
    },
    [progress, routines, saveProgress],
  );

  const completeRoutine = useCallback(
    async (routineId: string) => {
      const routine = routines.find((item) => item.id === routineId);
      if (!routine) return;
      const day = todayKey();
      const nextDay = { ...(progress[day] ?? {}) };
      routine.steps.filter((step) => !step.hidden).forEach((step) => {
        const key = `${routineId}:${step.id}`;
        nextDay[key] = recordCompletion(routine.title, step.title, nextDay[key]);
      });
      await saveProgress({ ...progress, [day]: nextDay });
    },
    [progress, routines, saveProgress],
  );

  const createRoutine = useCallback(
    (title: string, subtitle: string, steps: RoutineStep[], category?: string) => runRoutineWrite(async () => {
      const routine: Routine = {
        id: makeId(),
        title,
        subtitle,
        ...(category ? { category } : {}),
        icon: 'sparkles-outline',
        tone: 'sun',
        steps,
        createdAt: new Date().toISOString(),
      };
      const nextRoutines = [...routines, routine];
      setRoutines(nextRoutines);
      await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines));
      return routine;
    }),
    [routines, runRoutineWrite],
  );

  const copyRoutine = useCallback(
    (routineId: string) => runRoutineWrite(async () => {
      const source = routines.find((routine) => routine.id === routineId);
      if (!source) throw new Error('Routine not found');
      const copied = makeRoutineCopy(source, routines, makeId);
      const nextRoutines = [...routines, copied];
      await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines));
      setRoutines(nextRoutines);
      return copied;
    }),
    [routines, runRoutineWrite],
  );

  const updateRoutine = useCallback(
    (routineId: string, title: string, subtitle: string, steps: RoutineStep[], category?: string) => runRoutineWrite(async () => {
      if (!routines.some((routine) => routine.id === routineId)) {
        throw new Error('Routine not found');
      }
      const nextRoutines = routines.map((routine) =>
        routine.id === routineId ? { ...routine, title, subtitle, steps, category } : routine,
      );
      await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines));
      setRoutines(nextRoutines);
    }),
    [routines, runRoutineWrite],
  );

  const renameCategory = useCallback(
    (source: string, target: string) => runRoutineWrite(async () => {
      const nextRoutines = renameRoutineCategory(routines, source, target);
      await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines));
      setRoutines(nextRoutines);
    }),
    [routines, runRoutineWrite],
  );

  const removeCategory = useCallback(
    (source: string) => runRoutineWrite(async () => {
      const nextRoutines = removeRoutineCategory(routines, source);
      await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines));
      setRoutines(nextRoutines);
    }),
    [routines, runRoutineWrite],
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
      await persistImportedBackup(
        AsyncStorage, ROUTINES_KEY, PROGRESS_KEY, result.routines, merged.progress,
        result.added, merged.added, setRoutines, setProgress,
        () => { importNeedsRestart.current = true; },
      );
      return { added: result.added, skipped: result.skipped, renamed: result.renamed,
        progressAdded: merged.added, progressKept: merged.kept };
    }),
    [routines, progress, runRoutineWrite],
  );

  const moveRoutine = useCallback(
    (routineId: string, adjacentId: string) => runRoutineWrite(async () => {
      const fromIndex = routines.findIndex((routine) => routine.id === routineId);
      const toIndex = routines.findIndex((routine) => routine.id === adjacentId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        throw new Error('Could not find routines to reorder');
      }
      const nextRoutines = [...routines];
      [nextRoutines[fromIndex], nextRoutines[toIndex]] = [nextRoutines[toIndex], nextRoutines[fromIndex]];
      await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines));
      setRoutines(nextRoutines);
    }),
    [routines, runRoutineWrite],
  );

  const setRoutineHidden = useCallback(
    (routineId: string, hidden: boolean) => runRoutineWrite(async () => {
      if (!routines.some((routine) => routine.id === routineId)) throw new Error('Routine not found');
      const nextRoutines = routines.map((routine) =>
        routine.id === routineId ? { ...routine, hidden } : routine,
      );
      await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines));
      setRoutines(nextRoutines);
    }),
    [routines, runRoutineWrite],
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
      await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines));
      setRoutines(nextRoutines);
    }),
    [routines, runRoutineWrite],
  );

  const deleteRoutine = useCallback(
    (routineId: string) => runRoutineWrite(async () => {
      if (!routines.some((routine) => routine.id === routineId)) throw new Error('Routine not found');
      const nextRoutines = routines.filter((routine) => routine.id !== routineId);
      await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines));
      setRoutines(nextRoutines);
    }),
    [routines, runRoutineWrite],
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
      toggleStep,
      completeRoutine,
      createRoutine,
      copyRoutine,
      updateRoutine,
      renameCategory,
      removeCategory,
      moveRoutine,
      importRoutines,
      setRoutineHidden,
      setStepHidden,
      deleteRoutine,
      resetToday,
      getCompletedCount,
    }),
    [
      routines,
      progress,
      loading,
      toggleStep,
      completeRoutine,
      createRoutine,
      copyRoutine,
      updateRoutine,
      renameCategory,
      removeCategory,
      moveRoutine,
      importRoutines,
      setRoutineHidden,
      setStepHidden,
      deleteRoutine,
      resetToday,
      getCompletedCount,
    ],
  );

  return <RoutineContext.Provider value={value}>{children}</RoutineContext.Provider>;
}

export function useRoutines() {
  const context = useContext(RoutineContext);
  if (!context) throw new Error('useRoutines must be used within RoutineProvider');
  return context;
}
