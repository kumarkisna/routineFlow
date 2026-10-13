type CleanupStorage = {
  getAllKeys: () => Promise<readonly string[]>;
  multiGet: (keys: string[]) => Promise<ReadonlyArray<readonly [string, string | null]>>;
};
type CleanupFileSystem = {
  readDirectoryAsync: (uri: string) => Promise<string[]>;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean; isDirectory: boolean }>;
  deleteAsync: (uri: string, options?: { idempotent?: boolean }) => Promise<void>;
};

const ROUTINES_KEY = '@routine-flow/routines';
const PEOPLE_KEY = '@routine-flow/people';
const PERSON_ROUTINES_KEY = /^@routine-flow\/person\/([A-Za-z0-9_-]{1,160})\/@routine-flow\/routines$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRegisteredPersonIds(value: unknown): Set<string> {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.people)) {
    throw new Error('Saved profiles could not be checked safely.');
  }
  const ids = value.people.map(person => {
    if (!isRecord(person) || typeof person.id !== 'string'
      || !/^[A-Za-z0-9_-]{1,160}$/.test(person.id)) {
      throw new Error('Saved profiles could not be checked safely.');
    }
    return person.id;
  });
  if (!ids.includes('me') || new Set(ids).size !== ids.length) {
    throw new Error('Saved profiles could not be checked safely.');
  }
  return new Set(ids);
}

function collectReferencedAttachmentUris(routines: unknown): Set<string> {
  if (!Array.isArray(routines)) throw new Error('Saved routines are not a list.');

  const uris = new Set<string>();
  for (const routine of routines) {
    if (!isRecord(routine) || !Array.isArray(routine.steps)) {
      throw new Error('A saved routine could not be checked for attachments.');
    }
    for (const step of routine.steps) {
      if (!isRecord(step)) throw new Error('A saved routine step could not be checked for attachments.');
      if (step.detailAttachments === undefined) continue;
      if (!Array.isArray(step.detailAttachments)) {
        throw new Error('Saved step attachments could not be checked safely.');
      }
      for (const group of step.detailAttachments) {
        if (!Array.isArray(group)) throw new Error('Saved step attachments could not be checked safely.');
        for (const attachment of group) {
          if (!isRecord(attachment)) throw new Error('A saved attachment could not be checked safely.');
          if (attachment.uri !== undefined) {
            if (typeof attachment.uri !== 'string') {
              throw new Error('A saved attachment path could not be checked safely.');
            }
            uris.add(attachment.uri);
          }
        }
      }
    }
  }
  return uris;
}

/**
 * Delete only unreferenced files in the app-managed attachment directory.
 * The routine records (including embedded backup bytes) are never modified.
 * If any saved routine data cannot be inspected, fail closed and delete nothing.
 */
export async function cleanupOrphanedStepDetailAttachmentCopies(
  documentDirectory: string | null | undefined,
  storage: CleanupStorage,
  fileSystem: CleanupFileSystem,
): Promise<number> {
  if (!documentDirectory) throw new Error('App file storage is unavailable.');
  const documentRoot = documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
  const attachmentDirectory = `${documentRoot}step-detail-attachments/`;

  const allKeys = await storage.getAllKeys();
  const keysToRead = allKeys.filter(key => key === PEOPLE_KEY
    || key === ROUTINES_KEY || PERSON_ROUTINES_KEY.test(key));
  const storedData = keysToRead.length ? await storage.multiGet(keysToRead) : [];
  const storedDataByKey = new Map(storedData);
  const serializedPeople = storedDataByKey.get(PEOPLE_KEY);
  const personIds = serializedPeople === undefined || serializedPeople === null
    ? new Set(['me'])
    : getRegisteredPersonIds(JSON.parse(serializedPeople));
  const routineKeys = allKeys.filter(key => {
    if (key === ROUTINES_KEY) return personIds.has('me');
    const match = PERSON_ROUTINES_KEY.exec(key);
    return !!match && personIds.has(match[1]);
  });
  const savedRoutines = routineKeys.length ? await storage.multiGet(routineKeys) : [];
  const referencedUris = new Set<string>();
  for (const [, serialized] of savedRoutines) {
    if (serialized === null) continue;
    const routines: unknown = JSON.parse(serialized);
    for (const uri of collectReferencedAttachmentUris(routines)) referencedUris.add(uri);
  }

  const fileNames = await fileSystem.readDirectoryAsync(attachmentDirectory);
  let removed = 0;
  let failed = false;
  for (const fileName of fileNames) {
    if (!fileName || fileName === '.' || fileName === '..' || /[/\\]/.test(fileName)) continue;
    const uri = `${attachmentDirectory}${fileName}`;
    if (referencedUris.has(uri)) continue;
    try {
      const info = await fileSystem.getInfoAsync(uri);
      if (!info.exists || info.isDirectory) continue;
      await fileSystem.deleteAsync(uri, { idempotent: true });
      removed += 1;
    } catch {
      // Continue trying other files, then report failure so the caller can offer a retry.
      failed = true;
    }
  }
  if (failed) throw new Error('Some unused attachment files could not be removed.');
  return removed;
}
