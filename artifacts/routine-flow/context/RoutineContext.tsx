import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { CompletionMap, Routine, RoutineStep } from '@/types/routines';

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
  createRoutine: (title: string, subtitle: string, steps: RoutineStep[]) => Promise<Routine>;
  updateRoutine: (routineId: string, title: string, subtitle: string, steps: RoutineStep[]) => Promise<void>;
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
  const [routines, setRoutines] = useState<Routine[]>(seedRoutines);
  const [progress, setProgress] = useState<CompletionMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function hydrate() {
      try {
        const [storedRoutines, storedProgress] = await Promise.all([
          AsyncStorage.getItem(ROUTINES_KEY),
          AsyncStorage.getItem(PROGRESS_KEY),
        ]);
        if (storedRoutines) setRoutines(JSON.parse(storedRoutines) as Routine[]);
        if (storedProgress) setProgress(JSON.parse(storedProgress) as CompletionMap);
      } finally {
        setLoading(false);
      }
    }
    void hydrate();
  }, []);

  const saveProgress = useCallback(async (nextProgress: CompletionMap) => {
    setProgress(nextProgress);
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(nextProgress));
  }, []);

  const toggleStep = useCallback(
    async (routineId: string, stepId: string) => {
      const day = todayKey();
      const nextProgress = {
        ...progress,
        [day]: {
          ...(progress[day] ?? {}),
          [`${routineId}:${stepId}`]: !(progress[day]?.[`${routineId}:${stepId}`] ?? false),
        },
      };
      await saveProgress(nextProgress);
    },
    [progress, saveProgress],
  );

  const completeRoutine = useCallback(
    async (routineId: string) => {
      const routine = routines.find((item) => item.id === routineId);
      if (!routine) return;
      const day = todayKey();
      const nextDay = { ...(progress[day] ?? {}) };
      routine.steps.forEach((step) => {
        nextDay[`${routineId}:${step.id}`] = true;
      });
      await saveProgress({ ...progress, [day]: nextDay });
    },
    [progress, routines, saveProgress],
  );

  const createRoutine = useCallback(
    async (title: string, subtitle: string, steps: RoutineStep[]) => {
      const routine: Routine = {
        id: makeId(),
        title,
        subtitle,
        icon: 'sparkles-outline',
        tone: 'sun',
        steps,
        createdAt: new Date().toISOString(),
      };
      const nextRoutines = [...routines, routine];
      setRoutines(nextRoutines);
      await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines));
      return routine;
    },
    [routines],
  );

  const updateRoutine = useCallback(
    async (routineId: string, title: string, subtitle: string, steps: RoutineStep[]) => {
      if (!routines.some((routine) => routine.id === routineId)) {
        throw new Error('Routine not found');
      }
      const nextRoutines = routines.map((routine) =>
        routine.id === routineId ? { ...routine, title, subtitle, steps } : routine,
      );
      await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines));
      setRoutines(nextRoutines);
    },
    [routines],
  );

  const deleteRoutine = useCallback(
    async (routineId: string) => {
      const nextRoutines = routines.filter((routine) => routine.id !== routineId);
      setRoutines(nextRoutines);
      await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(nextRoutines));
    },
    [routines],
  );

  const resetToday = useCallback(async () => {
    const nextProgress = { ...progress };
    delete nextProgress[todayKey()];
    await saveProgress(nextProgress);
  }, [progress, saveProgress]);

  const getCompletedCount = useCallback(
    (routine: Routine) => {
      const day = progress[todayKey()] ?? {};
      return routine.steps.filter((step) => day[`${routine.id}:${step.id}`]).length;
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
      updateRoutine,
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
      updateRoutine,
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