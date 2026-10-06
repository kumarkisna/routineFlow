import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_PERSON_ID = 'me';
export const PEOPLE_KEY = '@routine-flow/people';
export const PERSON_DATA_KEYS = {
  routines: '@routine-flow/routines',
  progress: '@routine-flow/progress',
  playlists: '@routine-flow/playlists',
  schedules: '@routine-flow/schedules',
  skills: '@routine-flow/skills',
  skillRatingWindow: '@routine-flow/skill-rating-window',
  appearance: '@routine-flow/appearance',
} as const;

export function personStorageKey(personId: string, key: string) {
  // Me retains the existing keys; adding people never migrates or replaces data.
  return personId === DEFAULT_PERSON_ID ? key : `@routine-flow/person/${personId}/${key}`;
}

const pendingWrites = new Map<string, Set<Promise<unknown>>>();

type PersonStorageBackend = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

function trackWrite<T>(personId: string, operation: Promise<T>): Promise<T> {
  const pending = pendingWrites.get(personId) ?? new Set<Promise<unknown>>();
  pendingWrites.set(personId, pending);
  pending.add(operation);
  void operation.then(() => pending.delete(operation), () => pending.delete(operation));
  return operation;
}

export async function waitForPersonWrites(personId: string) {
  while (pendingWrites.get(personId)?.size) {
    await Promise.allSettled([...pendingWrites.get(personId)!]);
  }
}

export function createPersonStorage(personId: string, backend: PersonStorageBackend = AsyncStorage) {
  return {
    getItem: (key: string) => backend.getItem(personStorageKey(personId, key)),
    setItem: (key: string, value: string) =>
      trackWrite(personId, backend.setItem(personStorageKey(personId, key), value)),
    removeItem: (key: string) =>
      trackWrite(personId, backend.removeItem(personStorageKey(personId, key))),
  };
}