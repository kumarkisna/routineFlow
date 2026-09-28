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