export type RoutineTone = 'coral' | 'sage' | 'lavender' | 'sun';

export type RoutineStep = {
  id: string;
  title: string;
  duration?: string;
};

export type Routine = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  tone: RoutineTone;
  steps: RoutineStep[];
  createdAt: string;
};

export type CompletionMap = Record<string, Record<string, boolean>>;