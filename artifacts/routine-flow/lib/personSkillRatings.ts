import { createPersonStorage, PERSON_DATA_KEYS, waitForPersonWrites, type PersonStorage } from './personStorage';
import {
  MAX_SKILLS, MAX_SKILL_NOTE_LENGTH, normalizeSkillName, parseSkills, skillNameKey,
  type RoutineSkill, type SkillRating, type SkillRatingRun,
} from './skills';

export type PersonRatingEntry = { sourceSkillId: string; rating: number; note?: string; sequence: number };

export async function getPreviousPersonSkillRatings(
  personId: string,
  sourceSkills: RoutineSkill[],
  storageOverride?: PersonStorage,
): Promise<Record<string, SkillRating | null>> {
  if (!personId.trim()) throw new Error('Previous skill ratings could not be loaded.');
  await waitForPersonWrites(personId);
  const storage = storageOverride ?? createPersonStorage(personId);
  const stored = await storage.getItem(PERSON_DATA_KEYS.skills);
  const skills = stored === null ? [] : parseSkills(stored);
  const nameToSkill = new Map(skills.map(skill => [skillNameKey(skill.name), skill]));
  const result: Record<string, SkillRating | null> = {};

  for (const source of sourceSkills) {
    const history = nameToSkill.get(skillNameKey(source.name))?.ratings ?? [];
    const latest = history.reduce<(typeof history)[number] | null>((current, rating) => (
      !current || Date.parse(rating.ratedAt) >= Date.parse(current.ratedAt) ? rating : current
    ), null);
    result[source.id] = latest;
  }
  return result;
}

function makeSkillId(used: Set<string>) {
  let id = '';
  do {
    id = `skill-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  } while (used.has(id));
  used.add(id);
  return id;
}

export async function recordPersonSkillRatings(input: {
  personId: string;
  sourceSkills: RoutineSkill[];
  routineTitle: string;
  entries: PersonRatingEntry[];
  run: SkillRatingRun;
  storageOverride?: PersonStorage;
}) {
  const { personId, sourceSkills, routineTitle, entries, run } = input;
  if (!personId.trim() || !routineTitle.trim() || routineTitle.length > 200
    || !run.runId || !run.sourceRoutineId || !run.completedAt
    || !Number.isFinite(Date.parse(run.completedAt))) {
    throw new Error('The group rating could not be verified. Please try again.');
  }
  if (!entries.length) return;
  const sourceById = new Map(sourceSkills.map(skill => [skill.id, skill]));
  if (entries.some(entry => !sourceById.has(entry.sourceSkillId)
    || !Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 10
    || !Number.isInteger(entry.sequence) || entry.sequence < 0
    || (entry.note !== undefined && (typeof entry.note !== 'string' || entry.note.length > MAX_SKILL_NOTE_LENGTH)))
    || new Set(entries.map(entry => entry.sourceSkillId)).size !== entries.length
    || new Set(entries.map(entry => entry.sequence)).size !== entries.length) {
    throw new Error('Choose a valid rating for each selected skill.');
  }

  await waitForPersonWrites(personId);
  const storage = input.storageOverride ?? createPersonStorage(personId);
  const stored = await storage.getItem(PERSON_DATA_KEYS.skills);
  const skills = stored === null ? [] : parseSkills(stored);
  const usedIds = new Set(skills.map(skill => skill.id));
  const nameToSkill = new Map(skills.map(skill => [skillNameKey(skill.name), skill]));
  const ratedAt = new Date().toISOString();
  const next = [...skills];

  for (const entry of entries) {
    const source = sourceById.get(entry.sourceSkillId)!;
    const key = skillNameKey(source.name);
    let target = nameToSkill.get(key);
    if (!target) {
      if (next.length >= MAX_SKILLS) throw new Error(`This profile has reached the ${MAX_SKILLS}-skill limit.`);
      target = { id: makeSkillId(usedIds), name: normalizeSkillName(source.name) };
      next.push(target);
      nameToSkill.set(key, target);
    }
    const current = next.find(skill => skill.id === target!.id)!;
    if ((current.ratings?.length ?? 0) >= 20_000) {
      throw new Error(`The rating history for ${current.name} has reached its saved limit.`);
    }
    const rating = {
      id: `rating-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      rating: entry.rating,
      ratedAt,
      routineTitle: routineTitle.trim(),
      sourceRoutineId: run.sourceRoutineId,
      ...(run.sourcePlaylistId ? { sourcePlaylistId: run.sourcePlaylistId } : {}),
      runId: run.runId,
      completedAt: run.completedAt,
      sequence: entry.sequence,
      ...(entry.note?.trim() ? { note: entry.note.trim() } : {}),
    };
    const updated = { ...current, ratings: [...(current.ratings ?? []), rating] };
    next[next.findIndex(skill => skill.id === current.id)] = updated;
  }
  await storage.setItem(PERSON_DATA_KEYS.skills, JSON.stringify(next));
}
