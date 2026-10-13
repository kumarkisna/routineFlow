import type { Routine } from '../types/routines';
import { getSpokenStepDetails, getStepSeconds } from '../types/routines';
import type { RoutineSkill } from './skills';
import { getRoutinePlaybackStep } from './routinePlayback';
import { detailHtmlToText } from './stepDetailHtml';

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
  }
  const names = skillNames(step.skillIds, skills);
  return `${intro.length ? `${intro.join(' ')} ` : ''}Step ${index + 1}. ${step.title}.${names.length ? ` Skills: ${names.join(', ')}.` : ''} ${details.length ? `${details.join('. ')}. ` : ''}You have ${describeDuration(getStepSeconds(step))}.`;
}
