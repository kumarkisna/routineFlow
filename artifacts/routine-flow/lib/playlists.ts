import type { Routine } from '../types/routines';

export type RoutinePlaylist = {
  id: string;
  title: string;
  routineIds: string[];
};

export function playablePlaylistIds(ids: string[], routines: Routine[]): string[] {
  const available = new Set(routines
    .filter(routine => !routine.hidden && routine.steps.some(step => !step.hidden))
    .map(routine => routine.id));
  return ids.filter(id => available.has(id));
}

export function validatePlaylist(title: string, ids: string[]) {
  if (!title.trim()) throw new Error('Give your playlist a name.');
  if (title.trim().length > 100) throw new Error('Use a playlist name of 100 characters or fewer.');
  if (!ids.length) throw new Error('Add at least one routine.');
  if (ids.length > 100) throw new Error('A playlist can contain up to 100 routines.');
}

export function parsePlaylists(value: string): RoutinePlaylist[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some(item =>
    !item || typeof item.id !== 'string' || typeof item.title !== 'string'
    || !Array.isArray(item.routineIds) || item.routineIds.some((id: unknown) => typeof id !== 'string')
  )) throw new Error('Saved playlists could not be read.');
  return parsed;
}

export function parsePlaylistQueue(value?: string): string[] | null {
  if (!value) return null;
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) && ids.length > 0 && ids.length <= 100
      && ids.every(id => typeof id === 'string') ? ids : null;
  } catch {
    return null;
  }
}

export function nextPlaylistCursor(ids: string[], cursor: number, routines: Routine[]): number {
  const available = new Set(playablePlaylistIds(ids, routines));
  return ids.findIndex((id, index) => index > cursor && available.has(id));
}