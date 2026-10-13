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
  backgroundImage: '@routine-flow/background-image',
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

export type PersonStorage = ReturnType<typeof createPersonStorage>;

export class PersonBackgroundStateUncertainError extends Error {}

export async function persistPersonBackgroundImage(storage: PersonStorage, image: string | null) {
  const action = image === null ? 'cleared' : 'saved';
  const failureMessage = `The background photo could not be ${action}. Your previous photo is still selected. Please try again.`;
  const uncertainMessage = `The background photo could not be ${action}, and its previous setting could not be verified. Check the selected photo and try again.`;
  let previous: string | null;
  try {
    previous = await storage.getItem(PERSON_DATA_KEYS.backgroundImage);
  } catch {
    throw new PersonBackgroundStateUncertainError(uncertainMessage);
  }

  try {
    if (image === null) await storage.removeItem(PERSON_DATA_KEYS.backgroundImage);
    else await storage.setItem(PERSON_DATA_KEYS.backgroundImage, image);
    if (await storage.getItem(PERSON_DATA_KEYS.backgroundImage) !== image) {
      throw new Error('Background photo update could not be verified.');
    }
  } catch {
    // A storage driver can reject after applying a write. Restore and verify the
    // prior value before reporting failure so the UI and saved profile agree.
    try {
      if (previous === null) await storage.removeItem(PERSON_DATA_KEYS.backgroundImage);
      else await storage.setItem(PERSON_DATA_KEYS.backgroundImage, previous);
    } catch {
      // Verify below because some drivers reject after committing the rollback.
    }
    let restored: string | null;
    try {
      restored = await storage.getItem(PERSON_DATA_KEYS.backgroundImage);
    } catch {
      throw new PersonBackgroundStateUncertainError(uncertainMessage);
    }
    if (restored !== previous) {
      throw new PersonBackgroundStateUncertainError(
        `The background photo could not be ${action}, and its previous setting could not be restored. Check the selected photo and try again.`,
      );
    }
    throw new Error(failureMessage);
  }
}

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