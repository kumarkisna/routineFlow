import type { Routine } from '../types/routines';

export type RoutinePlaylist = {
  id: string;
  title: string;
  routineIds: string[];
  /** Optional links to reusable, person-specific skills. */
  skillIds?: string[];
  /** When enabled, defer skill ratings until the complete playlist run finishes. */
  rateSkillsAtPlaylistEnd?: boolean;
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
    || (item.skillIds !== undefined && (!Array.isArray(item.skillIds)
      || item.skillIds.some((id: unknown) => typeof id !== 'string' || !id.trim())
      || new Set(item.skillIds).size !== item.skillIds.length))
    || (item.rateSkillsAtPlaylistEnd !== undefined && typeof item.rateSkillsAtPlaylistEnd !== 'boolean')
  )) throw new Error('Saved playlists could not be read.');
  return parsed.map(playlist => ({
    ...playlist,
    rateSkillsAtPlaylistEnd: playlist.rateSkillsAtPlaylistEnd ?? true,
  }));
}

export function mergePlaylistCatalog(
  existing: RoutinePlaylist[],
  imported: RoutinePlaylist[],
  createId: () => string = () => `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
): {
  playlists: RoutinePlaylist[];
  idMap: Record<string, string>;
  added: number;
  skipped: number;
  renamed: number;
  updated: number;
} {
  const playlists = [...existing];
  const usedIds = new Set(playlists.map(playlist => playlist.id));
  const coreKey = (playlist: RoutinePlaylist) => JSON.stringify([playlist.title, playlist.routineIds]);
  const matchingIds = new Map(playlists.map(playlist => [coreKey(playlist), playlist.id]));
  const idMap: Record<string, string> = Object.create(null) as Record<string, string>;
  let added = 0;
  let skipped = 0;
  let renamed = 0;
  let updated = 0;

  for (const incoming of imported) {
    const key = coreKey(incoming);
    const matchingId = matchingIds.get(key);
    if (matchingId) {
      idMap[incoming.id] = matchingId;
      const index = playlists.findIndex(playlist => playlist.id === matchingId);
      const current = playlists[index];
      const skillIds = [...new Set([...(current.skillIds ?? []), ...(incoming.skillIds ?? [])])];
      if (skillIds.length !== (current.skillIds ?? []).length) {
        playlists[index] = { ...current, skillIds };
        updated++;
      } else {
        skipped++;
      }
      continue;
    }

    let id = incoming.id;
    if (usedIds.has(id)) {
      do {
        id = createId();
      } while (usedIds.has(id));
      renamed++;
    }
    usedIds.add(id);
    idMap[incoming.id] = id;
    playlists.push({
      ...incoming,
      id,
      routineIds: [...incoming.routineIds],
      ...(incoming.skillIds ? { skillIds: [...incoming.skillIds] } : {}),
    });
    matchingIds.set(key, id);
    added++;
  }

  return { playlists, idMap, added, skipped, renamed, updated };
}

export function remapPlaylistReferences(
  playlists: RoutinePlaylist[],
  routineIdMap: Record<string, string>,
  skillIdMap: Record<string, string>,
): RoutinePlaylist[] {
  return playlists.map(playlist => ({
    ...playlist,
    routineIds: playlist.routineIds.map(id => routineIdMap[id] ?? id),
    ...(playlist.skillIds !== undefined
      ? { skillIds: playlist.skillIds.map(id => skillIdMap[id] ?? id) }
      : {}),
  }));
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