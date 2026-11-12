import type { Routine } from '../types/routines';
import { getSpokenStepDetails, getStepSeconds } from '../types/routines';
import type { RoutineSkill } from './skills';
import { getRoutinePlaybackStep } from './routinePlayback';
import { detailHtmlToText } from './stepDetailHtml';
import { getPlaylistRoutineStepCounts, getPlaylistRunEntries, type RoutinePlaylist } from './playlists';

export type RoutineSpeechResult = 'finished' | 'cancelled' | 'error';

export type RoutineSpeechOptions = {
  rate: number;
  pitch: number;
  voice?: string;
};

type SpeechEntry = {
  sessionId: string;
  text: string;
  options: RoutineSpeechOptions;
  resolve: (result: RoutineSpeechResult) => void;
};

/**
 * Serializes speech across routine runs because the platform speech engine is
 * shared even when each run has its own timer and screen state.
 */
export class RoutineSpeechQueue {
  private waiting: SpeechEntry[] = [];
  private active: SpeechEntry | null = null;
  private stopPromise: Promise<void> | null = null;

  constructor(
    private readonly speak: (
      text: string,
      options: RoutineSpeechOptions,
      onFinish: (result: Exclude<RoutineSpeechResult, 'cancelled'>) => void,
    ) => void,
    private readonly stopSpeech: () => void | Promise<void>,
  ) {}

  announce(sessionId: string, text: string, options: RoutineSpeechOptions): Promise<RoutineSpeechResult> {
    return new Promise((resolve) => {
      this.waiting.push({ sessionId, text, options, resolve });
      this.startNext();
    });
  }

  /** Cancels all pending speech for a run and waits for an active utterance to stop. */
  cancel(sessionId: string): Promise<void> {
    const retained: SpeechEntry[] = [];
    for (const entry of this.waiting) {
      if (entry.sessionId === sessionId) entry.resolve('cancelled');
      else retained.push(entry);
    }
    this.waiting = retained;

    if (this.active?.sessionId === sessionId) {
      const active = this.active;
      this.active = null;
      active.resolve('cancelled');
      if (!this.stopPromise) {
        const stopPromise = Promise.resolve()
          .then(() => this.stopSpeech())
          .catch(() => undefined);
        this.stopPromise = stopPromise;
        void stopPromise.finally(() => {
          if (this.stopPromise === stopPromise) this.stopPromise = null;
          this.startNext();
        });
      }
    }

    return this.stopPromise ?? Promise.resolve();
  }

  private startNext() {
    if (this.active || this.stopPromise) return;
    const entry = this.waiting.shift();
    if (!entry) return;
    this.active = entry;
    try {
      this.speak(entry.text, entry.options, (result) => {
        if (this.active !== entry) return;
        this.active = null;
        entry.resolve(result);
        this.startNext();
      });
    } catch {
      if (this.active !== entry) return;
      this.active = null;
      entry.resolve('error');
      this.startNext();
    }
  }
}

export function getSpeechResumeMode(platform: string): 'replay-current-step' | 'resume-utterance' {
  return platform === 'android' ? 'replay-current-step' : 'resume-utterance';
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

function skillNames(ids: string[] | undefined, skills: RoutineSkill[]) {
  return [...new Set(ids ?? [])]
    .map(id => skills.find(skill => skill.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

export function buildPlaylistAnnouncement(
  playlist: Pick<RoutinePlaylist, 'title' | 'routineIds' | 'stepSelections' | 'skillIds'>,
  routines: Routine[],
  skills: RoutineSkill[],
) {
  const entries = getPlaylistRunEntries(playlist, routines);
  const names = skillNames(playlist.skillIds, skills);
  const routineSummaries = getPlaylistRoutineStepCounts(playlist, routines).flatMap(count => {
    if (count.selectedSteps === 0 || count.totalSteps === 0) return [];
    const routine = routines.find(item => item.id === count.routineId);
    if (!routine || routine.hidden) return [];
    return [`${routine.title}, ${count.selectedSteps} of ${count.totalSteps} ${count.totalSteps === 1 ? 'step' : 'steps'} selected`];
  });
  const totalSeconds = entries.reduce(
    (total, entry) => total + entry.steps.reduce((sum, step) => sum + getStepSeconds(step), 0),
    0,
  );
  const summary = [`Playlist ${playlist.title}.`];
  if (names.length) summary.push(`Skills: ${names.join(', ')}.`);
  if (routineSummaries.length) summary.push(`Routines: ${routineSummaries.join('; ')}.`);
  summary.push(`Estimated duration: ${describeDuration(totalSeconds)}.`);
  return summary.join(' ');
}

export function buildStepAnnouncement(
  routine: Routine,
  index: number,
  skills: RoutineSkill[],
  playlist?: { title: string; skillIds: string[] },
) {
  const step = getRoutinePlaybackStep(routine, index);
  const details = getSpokenStepDetails(step).map(detailHtmlToText).filter(Boolean);
  const intro: string[] = [];
  if (index === 0 && playlist) {
    const names = skillNames(playlist.skillIds, skills);
    if (names.length) intro.push(`Playlist ${playlist.title}. Skills: ${names.join(', ')}.`);
  }
  if (index === 0) {
    const names = skillNames(routine.skillIds, skills);
    if (names.length) intro.push(`Routine ${routine.title}. Skills: ${names.join(', ')}.`);
    const description = routine.speakSubtitle === false
      ? ''
      : (detailHtmlToText(routine.subtitleHtml ?? '').trim() || routine.subtitle.trim());
    if (description) intro.push(description);
  }
  const names = skillNames(step.skillIds, skills);
  return `${intro.length ? `${intro.join(' ')} ` : ''}Step ${index + 1}. ${step.title}.${names.length ? ` Skills: ${names.join(', ')}.` : ''} ${details.length ? `${details.join('. ')}. ` : ''}You have ${describeDuration(getStepSeconds(step))}.`;
}
