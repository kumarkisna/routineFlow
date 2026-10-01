import type { Routine } from '@/types/routines';

export const MAX_CATEGORY_LENGTH = 40;

export function categoryKey(category?: string): string {
  return category?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() ?? '';
}

export function listRoutineCategories(routines: Routine[]): string[] {
  const names = new Map<string, string>();
  for (const routine of routines) {
    const label = routine.category?.trim();
    const key = categoryKey(label);
    if (key && !names.has(key)) names.set(key, label!);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

export function normalizeCategory(value: string, existing: string[]): string | undefined {
  const label = value.trim().replace(/\s+/g, ' ');
  if (!label) return undefined;
  return existing.find((name) => categoryKey(name) === categoryKey(label)) ?? label;
}

export function renameRoutineCategory(routines: Routine[], source: string, target: string): Routine[] {
  const sourceKey = categoryKey(source);
  if (!sourceKey || !routines.some((routine) => categoryKey(routine.category) === sourceKey)) {
    throw new Error('Category not found.');
  }
  const label = target.trim().replace(/\s+/g, ' ');
  if (!label) throw new Error('Enter a category name.');
  if (label.length > MAX_CATEGORY_LENGTH) throw new Error(`Category names must be ${MAX_CATEGORY_LENGTH} characters or fewer.`);

  // A rename into another category joins that category and adopts its existing spelling.
  const otherCategories = listRoutineCategories(routines).filter((name) => categoryKey(name) !== sourceKey);
  const destination = categoryKey(label) === sourceKey ? label : normalizeCategory(label, otherCategories)!;
  return routines.map((routine) =>
    categoryKey(routine.category) === sourceKey ? { ...routine, category: destination } : routine,
  );
}