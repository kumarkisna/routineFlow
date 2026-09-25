export type RoutineTone = 'coral' | 'sage' | 'lavender' | 'sun';

export type RoutineStep = {
  id: string;
  title: string;
  durationSeconds: number;
  /** Kept for compatibility with routines saved before timers were added. */
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

export type RoutineNotificationSettings = {
  stepCompletion: boolean;
  routineCompletion: boolean;
};

export type CompletionMap = Record<string, Record<string, boolean>>;

export function getStepSeconds(step: RoutineStep) {
  if (step.durationSeconds > 0) return step.durationSeconds;
  const legacyMinutes = Number.parseInt(step.duration ?? '', 10);
  return Number.isFinite(legacyMinutes) && legacyMinutes > 0 ? legacyMinutes * 60 : 60;
}

export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}