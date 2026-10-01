import type { CompletionMap } from '@/types/routines';

// Routine IDs cannot contain colons. Use a separate key namespace for archived
// history so it can never identify a live routine, even after another import.
const PREFIX = 'history:';

export function historySourceId(id: string): string {
  if (!id.startsWith(PREFIX)) return id;
  const encoded = id.slice(PREFIX.length);
  try {
    const source = decodeURIComponent(encoded);
    return source.trim() && !source.includes(':') && encodeURIComponent(source) === encoded ? source : id;
  } catch {
    return id;
  }
}

export function splitProgressKey(key: string): { routineId: string; stepId: string } | undefined {
  const separator = key.lastIndexOf(':');
  if (separator <= 0) return undefined;
  const routineId = key.slice(0, separator);
  const stepId = key.slice(separator + 1);
  if (!stepId.trim() || stepId.includes(':') || !routineId.trim()) return undefined;
  if (routineId.includes(':') && historySourceId(routineId) === routineId) return undefined;
  return { routineId, stepId };
}

export function progressRoutineIds(progress: CompletionMap): Set<string> {
  return new Set(Object.values(progress).flatMap((entries) =>
    Object.keys(entries).flatMap((key) => {
      const parsed = splitProgressKey(key);
      return parsed ? [parsed.routineId] : [];
    })));
}

export function detachedHistoryId(sourceId: string): string {
  return `${PREFIX}${encodeURIComponent(historySourceId(sourceId))}`;
}