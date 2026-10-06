export type RoutineTone = 'coral' | 'sage' | 'lavender' | 'sun';

export type RoutineStep = {
  id: string;
  title: string;
  /** Optional so routines saved before step details still load unchanged. */
  description?: string;
  /** Additional optional instructions that can be added independently. */
  additionalDetails?: string[];
  /** Omitted means details remain spoken for routines saved before this choice existed. */
  speakDetails?: boolean;
  /** Optional links to reusable, person-specific skills. */
  skillIds?: string[];
  /** Hidden steps are omitted from the timer and daily progress. */
  hidden?: boolean;
  durationSeconds: number;
  /** Kept for compatibility with routines saved before timers were added. */
  duration?: string;
};

export type Routine = {
  id: string;
  title: string;
  subtitle: string;
  /** Optional so routines saved before categories remain valid. */
  category?: string;
  /** Optional links to reusable, person-specific skills. */
  skillIds?: string[];
  /** Hidden routines remain saved but are omitted from the main list and progress. */
  hidden?: boolean;
  icon: string;
  tone: RoutineTone;
  steps: RoutineStep[];
  createdAt: string;
};

export type RoutineNotificationSettings = {
  stepCompletion: boolean;
  routineCompletion: boolean;
};

/** Older saved completions are booleans; new completions retain their original labels. */
export type CompletionValue = boolean | { routineTitle: string; stepTitle: string };
export type CompletionMap = Record<string, Record<string, CompletionValue>>;

export function isCompleted(value: CompletionValue | undefined): boolean {
  return value === true || (typeof value === 'object' && value !== null);
}

export function getStepDetails(step: Pick<RoutineStep, 'description' | 'additionalDetails'>): string[] {
  return [step.description, ...(step.additionalDetails ?? [])]
    .filter((detail): detail is string => typeof detail === 'string' && detail.trim().length > 0);
}

export function getSpokenStepDetails(
  step: Pick<RoutineStep, 'description' | 'additionalDetails' | 'speakDetails'>,
): string[] {
  return step.speakDetails === false ? [] : getStepDetails(step);
}

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