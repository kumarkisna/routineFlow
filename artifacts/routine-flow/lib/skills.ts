import type { Routine } from '@/types/routines';

export type RoutineSkill = { id: string; name: string };

export const MAX_SKILL_NAME = 50;
export const MAX_SKILLS = 200;

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
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 160 || item.id.includes(':')
      || typeof item.name !== 'string') {
      throw new Error('Saved skills could not be read.');
    }
    const name = normalizeSkillName(item.name);
    if (!name || name.length > MAX_SKILL_NAME
      || skills.some(skill => skill.id === item.id || skillNameKey(skill.name) === skillNameKey(name))) {
      throw new Error('Saved skills could not be read.');
    }
    skills.push({ id: item.id, name });
  }
  return skills;
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
