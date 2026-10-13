type CleanupStorage = {
  getAllKeys: () => Promise<readonly string[]>;
  multiGet: (keys: string[]) => Promise<ReadonlyArray<readonly [string, string | null]>>;
};
type CleanupFileSystem = {
  readDirectoryAsync: (uri: string) => Promise<string[]>;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean; isDirectory: boolean; size?: number }>;
  deleteAsync: (uri: string, options?: { idempotent?: boolean }) => Promise<void>;
};

export type StepDetailAttachmentCleanupResult = {
  removedCount: number;
  estimatedBytes: number | null;
};

export class StepDetailAttachmentCleanupError extends Error {
  constructor(
    message: string,
    readonly partialResult: StepDetailAttachmentCleanupResult,
  ) {
    super(message);
    this.name = 'StepDetailAttachmentCleanupError';
  }
}

export type StepDetailAttachmentCleanupStatus = 'running' | 'retry' | 'complete';

function addCleanupResults(
  previous: StepDetailAttachmentCleanupResult,
  next: StepDetailAttachmentCleanupResult,
): StepDetailAttachmentCleanupResult {
  return {
    removedCount: previous.removedCount + next.removedCount,
    estimatedBytes: previous.estimatedBytes === null || next.estimatedBytes === null
      ? null
      : previous.estimatedBytes + next.estimatedBytes,
  };
}

export function createStepDetailAttachmentCleanupRunner(
  cleanup: () => Promise<StepDetailAttachmentCleanupResult>,
  onStatus: (
    status: StepDetailAttachmentCleanupStatus,
    progress?: StepDetailAttachmentCleanupResult,
  ) => void,
): () => Promise<StepDetailAttachmentCleanupResult | null> {
  let inFlight: Promise<StepDetailAttachmentCleanupResult | null> | null = null;
  let previousAttempts: StepDetailAttachmentCleanupResult = {
    removedCount: 0,
    estimatedBytes: 0,
  };
  return () => {
    if (inFlight) return inFlight;
    onStatus('running');
    inFlight = (async () => {
      let removed: StepDetailAttachmentCleanupResult;
      try {
        removed = await cleanup();
      } catch (error) {
        if (error instanceof StepDetailAttachmentCleanupError) {
          previousAttempts = addCleanupResults(previousAttempts, error.partialResult);
        }
        onStatus('retry', previousAttempts);
        return null;
      }
      const total = addCleanupResults(previousAttempts, removed);
      previousAttempts = { removedCount: 0, estimatedBytes: 0 };
      onStatus('complete', total);
      return total;
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
}

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

async function readReferencedAttachmentUris(storage: CleanupStorage): Promise<Set<string>> {
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
  return referencedUris;
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
): Promise<StepDetailAttachmentCleanupResult> {
  if (!documentDirectory) throw new Error('App file storage is unavailable.');
  const documentRoot = documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
  const attachmentDirectory = `${documentRoot}step-detail-attachments/`;

  const referencedUris = await readReferencedAttachmentUris(storage);

  const fileNames = await fileSystem.readDirectoryAsync(attachmentDirectory);
  let removedCount = 0;
  let estimatedBytes = 0;
  let hasAllSizes = true;
  let failed = false;
  for (const fileName of fileNames) {
    if (!fileName || fileName === '.' || fileName === '..' || /[/\\]/.test(fileName)) continue;
    const uri = `${attachmentDirectory}${fileName}`;
    if (referencedUris.has(uri)) continue;
    let info: { exists: boolean; isDirectory: boolean; size?: number };
    try {
      info = await fileSystem.getInfoAsync(uri);
    } catch {
      failed = true;
      continue;
    }
    if (!info.exists || info.isDirectory) continue;
    // A routine may have saved this attachment since the initial scan (or
    // while the file metadata was being read). Re-check immediately before
    // deletion so cleanup never acts on a stale orphan decision. Keep this
    // outside the best-effort file-operation catch: unreadable routine data
    // must stop cleanup instead of being treated as a per-file failure.
    let latestReferences: Set<string>;
    try {
      latestReferences = await readReferencedAttachmentUris(storage);
    } catch (error) {
      throw new StepDetailAttachmentCleanupError(
        error instanceof Error ? error.message : 'Saved routines could not be checked safely.',
        {
          removedCount,
          estimatedBytes: hasAllSizes ? estimatedBytes : null,
        },
      );
    }
    if (latestReferences.has(uri)) {
      referencedUris.add(uri);
      continue;
    }
    try {
      await fileSystem.deleteAsync(uri, { idempotent: true });
      removedCount += 1;
      if (typeof info.size === 'number' && Number.isFinite(info.size) && info.size >= 0) {
        estimatedBytes += info.size;
      } else {
        hasAllSizes = false;
      }
    } catch {
      // Continue trying other files, then report failure so the caller can offer a retry.
      failed = true;
    }
  }
  const result = {
    removedCount,
    estimatedBytes: hasAllSizes ? estimatedBytes : null,
  };
  if (failed) {
    throw new StepDetailAttachmentCleanupError(
      'Some unused attachment files could not be removed.',
      result,
    );
  }
  return result;
}
