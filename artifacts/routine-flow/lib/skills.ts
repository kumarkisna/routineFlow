import type { Routine } from '@/types/routines';
import type { RoutinePlaylist } from './playlists';

export type RoutineSkill = { id: string; name: string; ratings?: SkillRating[] };
export type SkillRatingRun = { runId: string; completedAt: string };
export type SkillRating = {
  id: string;
  rating: number;
  ratedAt: string;
  routineTitle: string;
  runId?: string;
  completedAt?: string;
  sequence?: number;
  note?: string;
};

export type SkillRatingPoint = SkillRating & { average: number };

export const MAX_SKILL_NAME = 50;
export const MAX_SKILLS = 200;
export const MAX_SKILL_NOTE_LENGTH = 1000;
export const DEFAULT_SKILL_RATING_WINDOW = 5;
export const MIN_SKILL_RATING_WINDOW = 1;
export const MAX_SKILL_RATING_WINDOW = 100;

export function createSkillRatingRun(): SkillRatingRun {
  return {
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    completedAt: new Date().toISOString(),
  };
}

export function parseSkillRatingWindow(value: string | null): number {
  if (value === null) return DEFAULT_SKILL_RATING_WINDOW;
  const windowSize = Number(value);
  if (!Number.isInteger(windowSize) || windowSize < MIN_SKILL_RATING_WINDOW || windowSize > MAX_SKILL_RATING_WINDOW) {
    throw new Error('Saved skill rating average setting could not be read.');
  }
  return windowSize;
}

export function normalizeSkillName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

export function skillNameKey(name: string) {
  return normalizeSkillName(name).toLocaleLowerCase();
}

export function validateSkillName(name: string, skills: RoutineSkill[], exceptId?: string) {
  const normalized = normalizeSkillName(name);
  if (!normalized) throw new Error('Enter a skill name.');
  if (normalized.length > MAX_SKILL_NAME) {
    throw new Error(`Use ${MAX_SKILL_NAME} characters or fewer.`);
  }
  if (skills.some(skill => skill.id !== exceptId && skillNameKey(skill.name) === skillNameKey(normalized))) {
    throw new Error('A skill with this name already exists.');
  }
  return normalized;
}

export function removeSkillFromCatalog(skills: RoutineSkill[], skillId: string): RoutineSkill[] {
  return skills.filter(skill => skill.id !== skillId);
}

export function parseSkills(value: string): RoutineSkill[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Saved skills could not be read.');
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_SKILLS) {
    throw new Error('Saved skills could not be read.');
  }
  const skills: RoutineSkill[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Saved skills could not be read.');
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > 160 || entry.id.includes(':')
      || typeof entry.name !== 'string') {
      throw new Error('Saved skills could not be read.');
    }
    const name = normalizeSkillName(entry.name);
    if (!name || name.length > MAX_SKILL_NAME
      || skills.some(skill => skill.id === entry.id || skillNameKey(skill.name) === skillNameKey(name))) {
      throw new Error('Saved skills could not be read.');
    }
    const ratings = parseRatings(entry.ratings);
    skills.push({ id: entry.id, name, ...(ratings.length ? { ratings } : {}) });
  }
  return skills;
}

function parseRatings(value: unknown): SkillRating[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20_000) throw new Error('Saved skills could not be read.');
  const ratings: SkillRating[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Saved skills could not be read.');
    const rating = item as Record<string, unknown>;
    if (typeof rating.id !== 'string' || !rating.id.trim() || rating.id.length > 160 || rating.id.includes(':')
      || typeof rating.rating !== 'number' || !Number.isInteger(rating.rating) || rating.rating < 1 || rating.rating > 10
      || typeof rating.ratedAt !== 'string' || !Number.isFinite(Date.parse(rating.ratedAt))
      || typeof rating.routineTitle !== 'string' || !rating.routineTitle.trim() || rating.routineTitle.length > 200
      || ((rating.runId === undefined) !== (rating.completedAt === undefined))
      || (rating.runId !== undefined
        && (typeof rating.runId !== 'string' || !rating.runId.trim() || rating.runId.length > 160 || rating.runId.includes(':')))
      || (rating.completedAt !== undefined
        && (typeof rating.completedAt !== 'string' || !Number.isFinite(Date.parse(rating.completedAt))))
      || (rating.sequence !== undefined
        && (!Number.isInteger(rating.sequence) || (rating.sequence as number) < 0 || (rating.sequence as number) > 999))
      || (rating.note !== undefined
        && (typeof rating.note !== 'string' || rating.note.length > MAX_SKILL_NOTE_LENGTH))
      || ratings.some(existing => existing.id === rating.id)) {
      throw new Error('Saved skills could not be read.');
    }
    const note = typeof rating.note === 'string' ? rating.note.trim() : '';
    ratings.push({
      id: rating.id,
      rating: rating.rating,
      ratedAt: rating.ratedAt,
      routineTitle: rating.routineTitle.trim(),
      ...(typeof rating.runId === 'string' ? { runId: rating.runId } : {}),
      ...(typeof rating.completedAt === 'string' ? { completedAt: rating.completedAt } : {}),
      ...(typeof rating.sequence === 'number' ? { sequence: rating.sequence } : {}),
      ...(note ? { note } : {}),
    });
  }
  return ratings;
}

function makeSkillId(usedIds: Set<string>) {
  let id: string;
  do {
    id = `skill-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}

/** Merge imported definitions without replacing local names or creating duplicate labels. */
export function mergeSkillCatalog(
  existing: RoutineSkill[],
  imported: RoutineSkill[],
  createId: (usedIds: Set<string>) => string = makeSkillId,
): { skills: RoutineSkill[]; idMap: Record<string, string> } {
  const skills = [...existing];
  const usedIds = new Set(skills.map(skill => skill.id));
  const idMap: Record<string, string> = Object.create(null) as Record<string, string>;

  for (const incoming of imported) {
    const sameName = skills.find(skill => skillNameKey(skill.name) === skillNameKey(incoming.name));
    if (sameName) {
      idMap[incoming.id] = sameName.id;
      const existingRatings = sameName.ratings ?? [];
      const existingRatingIds = new Set(existingRatings.map(rating => rating.id));
      const mergedRatings = [...existingRatings, ...(incoming.ratings ?? []).filter(rating => !existingRatingIds.has(rating.id))];
      if (mergedRatings.length !== existingRatings.length) {
        const index = skills.findIndex(skill => skill.id === sameName.id);
        skills[index] = { ...sameName, ratings: mergedRatings };
      }
      continue;
    }
    const id = usedIds.has(incoming.id) ? createId(usedIds) : incoming.id;
    usedIds.add(id);
    idMap[incoming.id] = id;
    skills.push({ ...incoming, id });
  }

  return { skills, idMap };
}

export function remapRoutineSkillIds(routines: Routine[], idMap: Record<string, string>): Routine[] {
  const remap = (skillIds: string[] | undefined) => skillIds?.map(id => idMap[id] ?? id);
  return routines.map(routine => ({
    ...routine,
    ...(routine.skillIds !== undefined ? { skillIds: remap(routine.skillIds) } : {}),
    steps: routine.steps.map(step => ({
      ...step,
      ...(step.skillIds !== undefined ? { skillIds: remap(step.skillIds) } : {}),
    })),
  }));
}

export function getRoutineSkillIds(routine: Routine): string[] {
  return [...new Set([
    ...(routine.skillIds ?? []),
    ...routine.steps.filter(step => !step.hidden).flatMap(step => step.skillIds ?? []),
  ])];
}

export function getPlaylistSkillIds(routineIds: string[], routines: Routine[], playlistSkillIds: string[] = []): string[] {
  const routinesById = new Map(routines.map(routine => [routine.id, routine] as const));
  return [...new Set([
    ...routineIds.flatMap(id => {
      const routine = routinesById.get(id);
      return routine ? getRoutineSkillIds(routine) : [];
    }),
    ...playlistSkillIds,
  ])];
}

export type SkillRoutineUse = {
  id: string;
  title: string;
  hidden: boolean;
  assignedToRoutine: boolean;
  steps: { title: string; hidden: boolean }[];
};

export type SkillPlaylistUse = {
  id: string;
  title: string;
  assignedToPlaylist: boolean;
  routines: SkillRoutineUse[];
};

export function getSkillAssociations(
  skillId: string,
  routines: Routine[],
  playlists: RoutinePlaylist[],
): { routines: SkillRoutineUse[]; playlists: SkillPlaylistUse[] } {
  const routineUses = routines.flatMap(routine => {
    const steps = routine.steps
      .filter(step => step.skillIds?.includes(skillId))
      .map(step => ({ title: step.title, hidden: Boolean(step.hidden) }));
    const assignedToRoutine = Boolean(routine.skillIds?.includes(skillId));
    return assignedToRoutine || steps.length
      ? [{ id: routine.id, title: routine.title, hidden: Boolean(routine.hidden), assignedToRoutine, steps }]
      : [];
  });
  const useByRoutineId = new Map(routineUses.map(use => [use.id, use]));
  const playlistUses = playlists.flatMap(playlist => {
    const relatedRoutines = [...new Set(playlist.routineIds)]
      .map(id => useByRoutineId.get(id))
      .filter((use): use is SkillRoutineUse => Boolean(use));
    const assignedToPlaylist = Boolean(playlist.skillIds?.includes(skillId));
    return assignedToPlaylist || relatedRoutines.length
      ? [{
          id: playlist.id,
          title: playlist.title,
          assignedToPlaylist,
          routines: relatedRoutines,
        }]
      : [];
  });
  return { routines: routineUses, playlists: playlistUses };
}

function chronologicalRatings(skill: RoutineSkill) {
  return [...(skill.ratings ?? [])].sort((a, b) =>
    Date.parse(a.ratedAt) - Date.parse(b.ratedAt) || a.id.localeCompare(b.id));
}

export function getSkillRatingPoints(skill: RoutineSkill, windowSize: number, limit = 12): SkillRatingPoint[] {
  const ratings = chronologicalRatings(skill);
  return ratings.map((rating, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const window = ratings.slice(start, index + 1);
    return { ...rating, average: window.reduce((sum, item) => sum + item.rating, 0) / window.length };
  }).slice(-limit);
}

export function getSkillAverage(skill: RoutineSkill, windowSize: number): { average: number | null; count: number } {
  const recent = chronologicalRatings(skill).slice(-windowSize);
  if (!recent.length) return { average: null, count: 0 };
  return { average: recent.reduce((sum, item) => sum + item.rating, 0) / recent.length, count: recent.length };
}
