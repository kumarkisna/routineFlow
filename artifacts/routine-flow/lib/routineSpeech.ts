import type { Routine } from '../types/routines';
import { getSpokenStepDetails, getStepSeconds } from '../types/routines';
import type { RoutineSkill } from './skills';
import { getRoutinePlaybackStep } from './routinePlayback';
import { detailHtmlToText } from './stepDetailHtml';
import { getPlaylistRoutineStepCounts, getPlaylistRunEntries, type RoutinePlaylist } from './playlists';

export type RoutineSpeechResult = 'finished' | 'cancelled' | 'error';
export type RoutineSpeechLineSequence = {
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

export type RoutineSpeechOptions = {
  rate: number;
  pitch: number;
  voice?: string;
};

export function createRoutineSpeechLineSequence(
  lines: string[],
  gapSeconds: number,
  engine: {
    speak: (text: string, onFinish: (result: RoutineSpeechResult) => void) => void;
    pause: () => void;
    resume: () => void;
    stop: () => void;
  },
  onFinish: (result: RoutineSpeechResult) => void,
): RoutineSpeechLineSequence {
  const spokenLines = lines.map(line => line.trim()).filter(Boolean);
  const gapMilliseconds = Number.isFinite(gapSeconds) ? Math.max(0, gapSeconds) * 1000 : 0;
  let active = true;
  let paused: 'gap' | 'utterance' | null = null;
  let lineIndex = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timerDeadline = 0;
  let remainingGapMilliseconds = 0;

  const finish = (result: RoutineSpeechResult) => {
    if (!active) return;
    active = false;
    if (timer) clearTimeout(timer);
    timer = null;
    onFinish(result);
  };
  const scheduleNextLine = (delay: number) => {
    if (!active) return;
    remainingGapMilliseconds = delay;
    timerDeadline = Date.now() + delay;
    timer = setTimeout(() => {
      timer = null;
      remainingGapMilliseconds = 0;
      speakCurrentLine();
    }, delay);
  };
  const speakCurrentLine = () => {
    if (!active || paused) return;
    if (lineIndex >= spokenLines.length) {
      finish('finished');
      return;
    }
    try {
      engine.speak(spokenLines[lineIndex], result => {
        if (!active || paused) return;
        if (result !== 'finished') {
          finish(result);
          return;
        }
        lineIndex += 1;
        if (lineIndex >= spokenLines.length || gapMilliseconds === 0) speakCurrentLine();
        else scheduleNextLine(gapMilliseconds);
      });
    } catch {
      finish('error');
    }
  };

  if (spokenLines.length) speakCurrentLine();
  else finish('finished');

  return {
    pause() {
      if (!active || paused) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
        remainingGapMilliseconds = Math.max(0, timerDeadline - Date.now());
        paused = 'gap';
      } else {
        paused = 'utterance';
        engine.pause();
      }
    },
    resume() {
      if (!active || !paused) return;
      const wasPaused = paused;
      paused = null;
      if (wasPaused === 'gap') scheduleNextLine(remainingGapMilliseconds);
      else engine.resume();
    },
    stop() {
      if (!active) return;
      active = false;
      if (timer) clearTimeout(timer);
      timer = null;
      engine.stop();
    },
  };
}

type SpeechEntry = {
  sessionId: string;
  lines: string[];
  options: RoutineSpeechOptions;
  gapMilliseconds: number;
  nextLineIndex: number;
  resolve: (result: RoutineSpeechResult) => void;
};

/**
 * Serializes speech across routine runs because the platform speech engine is
 * shared even when each run has its own timer and screen state.
 */
export class RoutineSpeechQueue {
  private waiting: SpeechEntry[] = [];
  private active: SpeechEntry | null = null;
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private stopPromise: Promise<void> | null = null;

  constructor(
    private readonly speak: (
      text: string,
      options: RoutineSpeechOptions,
      onFinish: (result: Exclude<RoutineSpeechResult, 'cancelled'>) => void,
    ) => void,
    private readonly stopSpeech: () => void | Promise<void>,
  ) {}

  announce(
    sessionId: string,
    lines: string | string[],
    options: RoutineSpeechOptions,
    gapSeconds = 0,
  ): Promise<RoutineSpeechResult> {
    return new Promise((resolve) => {
      this.waiting.push({
        sessionId,
        lines: (Array.isArray(lines) ? lines : [lines]).map(line => line.trim()).filter(Boolean),
        options,
        gapMilliseconds: Math.max(0, gapSeconds) * 1000,
        nextLineIndex: 0,
        resolve,
      });
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
      if (this.gapTimer) clearTimeout(this.gapTimer);
      this.gapTimer = null;
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
    if (!entry.lines.length) {
      entry.resolve('finished');
      this.startNext();
      return;
    }
    this.active = entry;
    this.speakNextLine(entry);
  }

  private speakNextLine(entry: SpeechEntry) {
    if (this.active !== entry) return;
    try {
      this.speak(entry.lines[entry.nextLineIndex], entry.options, (result) => {
        if (this.active !== entry) return;
        if (result === 'error') {
          this.finishEntry(entry, 'error');
          return;
        }
        entry.nextLineIndex += 1;
        if (entry.nextLineIndex >= entry.lines.length) {
          this.finishEntry(entry, 'finished');
          return;
        }
        if (!entry.gapMilliseconds) {
          this.speakNextLine(entry);
          return;
        }
        this.gapTimer = setTimeout(() => {
          this.gapTimer = null;
          this.speakNextLine(entry);
        }, entry.gapMilliseconds);
      });
    } catch {
      if (this.active !== entry) return;
      this.finishEntry(entry, 'error');
    }
  }

  private finishEntry(entry: SpeechEntry, result: Exclude<RoutineSpeechResult, 'cancelled'>) {
    if (this.active !== entry) return;
    if (this.gapTimer) clearTimeout(this.gapTimer);
    this.gapTimer = null;
    this.active = null;
    entry.resolve(result);
    this.startNext();
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
  return buildStepAnnouncementLines(routine, index, skills, playlist).join(' ');
}

export function buildStepAnnouncementLines(
  routine: Routine,
  index: number,
  skills: RoutineSkill[],
  playlist?: { title: string; skillIds: string[] },
) {
  const step = getRoutinePlaybackStep(routine, index);
  const details = getSpokenStepDetails(step).map(detailHtmlToText).filter(Boolean);
  const lines: string[] = [];
  if (index === 0 && playlist) {
    const names = skillNames(playlist.skillIds, skills);
    if (names.length) lines.push(`Playlist ${playlist.title}. Skills: ${names.join(', ')}.`);
  }
  if (index === 0) {
    const names = skillNames(routine.skillIds, skills);
    if (names.length) lines.push(`Routine ${routine.title}. Skills: ${names.join(', ')}.`);
    const description = routine.speakSubtitle === false
      ? ''
      : (detailHtmlToText(routine.subtitleHtml ?? '').trim() || routine.subtitle.trim());
    if (description) lines.push(description);
  }
  const names = skillNames(step.skillIds, skills);
  lines.push(`Step ${index + 1}. ${step.title}.`);
  if (names.length) lines.push(`Skills: ${names.join(', ')}.`);
  lines.push(...details.map(detail => `${detail}.`));
  lines.push(`You have ${describeDuration(getStepSeconds(step))}.`);
  return lines;
}
