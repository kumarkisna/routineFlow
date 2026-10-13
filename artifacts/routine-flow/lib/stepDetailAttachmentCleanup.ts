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

export const STEP_DETAIL_ATTACHMENT_CLEANUP_PROGRESS_KEY = '@routine-flow/step-detail-attachment-cleanup-progress';

export type PendingStepDetailAttachmentDeletion = {
  fileName: string;
  size: number | null;
  counted: boolean;
};

export type PendingStepDetailAttachmentReconciliation = 'removed' | 'present' | 'referenced';

export type StepDetailAttachmentCleanupMetrics = {
  referenceChecks: number;
  routineRecordsRead: number;
  routineRecordsParsed: number;
};

export type StepDetailAttachmentCleanupProgressStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

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
  cleanup: (
    onProgress?: (progress: StepDetailAttachmentCleanupResult) => Promise<void>,
    beforeDelete?: (pending: Omit<PendingStepDetailAttachmentDeletion, 'counted'>) => Promise<void>,
  ) => Promise<StepDetailAttachmentCleanupResult>,
  onStatus: (
    status: StepDetailAttachmentCleanupStatus,
    progress?: StepDetailAttachmentCleanupResult,
  ) => void,
  progressStorage?: StepDetailAttachmentCleanupProgressStorage,
  reconcilePendingDeletion?: (
    pending: PendingStepDetailAttachmentDeletion,
  ) => Promise<PendingStepDetailAttachmentReconciliation>,
): () => Promise<StepDetailAttachmentCleanupResult | null> {
  let inFlight: Promise<StepDetailAttachmentCleanupResult | null> | null = null;
  let previousAttempts: StepDetailAttachmentCleanupResult = {
    removedCount: 0,
    estimatedBytes: 0,
  };
  let progressLoaded = false;
  let pendingDeletion: PendingStepDetailAttachmentDeletion | undefined;

  const saveProgress = async (
    progress: StepDetailAttachmentCleanupResult,
    pending: PendingStepDetailAttachmentDeletion | undefined,
  ) => {
    if (!progressStorage) return;
    const serialized = JSON.stringify({
      version: 2,
      ...progress,
      ...(pending ? { pendingDeletion: pending } : {}),
    });
    try {
      await progressStorage.setItem(STEP_DETAIL_ATTACHMENT_CLEANUP_PROGRESS_KEY, serialized);
    } catch {
      // Some storage drivers can reject after committing. Confirm before failing.
      if (await progressStorage.getItem(STEP_DETAIL_ATTACHMENT_CLEANUP_PROGRESS_KEY) !== serialized) {
        throw new Error('Cleanup progress could not be saved.');
      }
    }
  };

  const clearProgress = async () => {
    if (!progressStorage) return;
    try {
      await progressStorage.removeItem(STEP_DETAIL_ATTACHMENT_CLEANUP_PROGRESS_KEY);
    } catch {
      // Confirm removal when a storage driver rejects after committing.
      if (await progressStorage.getItem(STEP_DETAIL_ATTACHMENT_CLEANUP_PROGRESS_KEY) !== null) {
        throw new Error('Completed cleanup progress could not be cleared.');
      }
    }
  };

  const loadProgress = async () => {
    if (!progressStorage || progressLoaded) return;
    const serialized = await progressStorage.getItem(STEP_DETAIL_ATTACHMENT_CLEANUP_PROGRESS_KEY);
    if (serialized !== null) {
      const parsed: unknown = JSON.parse(serialized);
      if (!isRecord(parsed) || (parsed.version !== 1 && parsed.version !== 2)
        || !Number.isSafeInteger(parsed.removedCount) || (parsed.removedCount as number) < 0
        || !(parsed.estimatedBytes === null
          || (typeof parsed.estimatedBytes === 'number'
            && Number.isFinite(parsed.estimatedBytes) && parsed.estimatedBytes >= 0))) {
        throw new Error('Saved cleanup progress could not be checked safely.');
      }
      previousAttempts = {
        removedCount: parsed.removedCount as number,
        estimatedBytes: parsed.estimatedBytes as number | null,
      };
      if (parsed.version === 2 && parsed.pendingDeletion !== undefined) {
        const pending = parsed.pendingDeletion;
        if (!isRecord(pending)
          || typeof pending.fileName !== 'string'
          || !pending.fileName
          || pending.fileName === '.' || pending.fileName === '..'
          || /[/\\]/.test(pending.fileName)
          || !(pending.size === null
            || (typeof pending.size === 'number'
              && Number.isFinite(pending.size) && pending.size >= 0))
          || typeof pending.counted !== 'boolean') {
          throw new Error('Saved cleanup progress could not be checked safely.');
        }
        pendingDeletion = {
          fileName: pending.fileName,
          size: pending.size as number | null,
          counted: pending.counted,
        };
      }
    }
    progressLoaded = true;
  };

  return () => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        await loadProgress();
      } catch {
        onStatus('retry', previousAttempts);
        return null;
      }
      if (pendingDeletion) {
        if (!reconcilePendingDeletion || !progressStorage) {
          onStatus('retry', previousAttempts);
          return null;
        }
        try {
          const outcome = await reconcilePendingDeletion(pendingDeletion);
          if (outcome === 'removed' && !pendingDeletion.counted) {
            previousAttempts = addCleanupResults(previousAttempts, {
              removedCount: 1,
              estimatedBytes: pendingDeletion.size,
            });
            pendingDeletion = { ...pendingDeletion, counted: true };
            await saveProgress(previousAttempts, pendingDeletion);
          } else if (pendingDeletion.counted && outcome !== 'removed') {
            previousAttempts = {
              removedCount: Math.max(0, previousAttempts.removedCount - 1),
              estimatedBytes: previousAttempts.estimatedBytes === null || pendingDeletion.size === null
                ? null
                : Math.max(0, previousAttempts.estimatedBytes - pendingDeletion.size),
            };
            await saveProgress(previousAttempts, pendingDeletion);
          }
          await saveProgress(previousAttempts, undefined);
          pendingDeletion = undefined;
        } catch {
          onStatus('retry', previousAttempts);
          return null;
        }
      }
      onStatus('running', previousAttempts);
      let removed: StepDetailAttachmentCleanupResult;
      const progressBeforeAttempt = previousAttempts;
      let lastSavedProgress = progressBeforeAttempt;
      try {
        removed = await cleanup(async progress => {
          const total = addCleanupResults(progressBeforeAttempt, progress);
          await saveProgress(total, undefined);
          pendingDeletion = undefined;
          lastSavedProgress = total;
        }, async pending => {
          const nextPending = { ...pending, counted: false };
          await saveProgress(progressBeforeAttempt, nextPending);
          pendingDeletion = nextPending;
        });
      } catch (error) {
        if (error instanceof StepDetailAttachmentCleanupError) {
          previousAttempts = addCleanupResults(progressBeforeAttempt, error.partialResult);
        } else {
          // Keep a confirmed per-file checkpoint if an unexpected later error occurs.
          previousAttempts = lastSavedProgress;
        }
        try {
          await saveProgress(previousAttempts, pendingDeletion);
        } catch {
          // Keep the in-memory count visible; the cleanup remains retryable.
        }
        onStatus('retry', previousAttempts);
        return null;
      }
      const total = addCleanupResults(previousAttempts, removed);
      try {
        await clearProgress();
      } catch {
        // The sweep finished, but retain its count and retry the storage cleanup.
        previousAttempts = total;
        try {
          await saveProgress(previousAttempts, pendingDeletion);
        } catch {
          // Preserve the in-memory count even if storage is still unavailable.
        }
        onStatus('retry', previousAttempts);
        return null;
      }
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

type ParsedRoutineRecord = {
  serialized: string | null;
  uris: Set<string>;
};

async function readReferencedAttachmentUris(
  storage: CleanupStorage,
  parsedRoutineRecords: Map<string, ParsedRoutineRecord> = new Map(),
  metrics?: StepDetailAttachmentCleanupMetrics,
): Promise<Set<string>> {
  if (metrics) metrics.referenceChecks += 1;
  const allKeys = await storage.getAllKeys();
  const peopleValues = allKeys.includes(PEOPLE_KEY) ? await storage.multiGet([PEOPLE_KEY]) : [];
  const serializedPeople = peopleValues.find(([key]) => key === PEOPLE_KEY)?.[1];
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
  const activeKeys = new Set(routineKeys);
  for (const cachedKey of parsedRoutineRecords.keys()) {
    if (!activeKeys.has(cachedKey)) parsedRoutineRecords.delete(cachedKey);
  }
  for (const [key, serialized] of savedRoutines) {
    if (metrics) metrics.routineRecordsRead += 1;
    let cached = parsedRoutineRecords.get(key);
    if (!cached || cached.serialized !== serialized) {
      const uris = serialized === null
        ? new Set<string>()
        : collectReferencedAttachmentUris(JSON.parse(serialized));
      cached = { serialized, uris };
      parsedRoutineRecords.set(key, cached);
      if (metrics) metrics.routineRecordsParsed += 1;
    }
    for (const uri of cached.uris) referencedUris.add(uri);
  }
  return referencedUris;
}

export async function reconcilePendingStepDetailAttachmentDeletion(
  pending: PendingStepDetailAttachmentDeletion,
  documentDirectory: string | null | undefined,
  storage: CleanupStorage,
  fileSystem: CleanupFileSystem,
): Promise<PendingStepDetailAttachmentReconciliation> {
  if (!documentDirectory) throw new Error('App file storage is unavailable.');
  if (!pending.fileName || pending.fileName === '.' || pending.fileName === '..'
    || /[/\\]/.test(pending.fileName)) {
    throw new Error('Saved cleanup progress could not be checked safely.');
  }
  const referencedUris = await readReferencedAttachmentUris(storage);
  const documentRoot = documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
  const uri = `${documentRoot}step-detail-attachments/${pending.fileName}`;
  if (referencedUris.has(uri)) return 'referenced';
  const info = await fileSystem.getInfoAsync(uri);
  return info.exists ? 'present' : 'removed';
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
  onProgress?: (progress: StepDetailAttachmentCleanupResult) => Promise<void>,
  beforeDelete?: (pending: Omit<PendingStepDetailAttachmentDeletion, 'counted'>) => Promise<void>,
  metrics?: StepDetailAttachmentCleanupMetrics,
): Promise<StepDetailAttachmentCleanupResult> {
  if (!documentDirectory) throw new Error('App file storage is unavailable.');
  const documentRoot = documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
  const attachmentDirectory = `${documentRoot}step-detail-attachments/`;

  const parsedRoutineRecords = new Map<string, ParsedRoutineRecord>();
  const referencedUris = await readReferencedAttachmentUris(storage, parsedRoutineRecords, metrics);

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
      latestReferences = await readReferencedAttachmentUris(storage, parsedRoutineRecords, metrics);
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
    if (beforeDelete) {
      try {
        await beforeDelete({
          fileName,
          size: typeof info.size === 'number' && Number.isFinite(info.size) && info.size >= 0
            ? info.size
            : null,
        });
      } catch {
        throw new StepDetailAttachmentCleanupError(
          'Cleanup progress could not be saved.',
          {
            removedCount,
            estimatedBytes: hasAllSizes ? estimatedBytes : null,
          },
        );
      }
    }
    try {
      await fileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // Continue trying other files, then report failure so the caller can offer a retry.
      failed = true;
      continue;
    }
    removedCount += 1;
    if (typeof info.size === 'number' && Number.isFinite(info.size) && info.size >= 0) {
      estimatedBytes += info.size;
    } else {
      hasAllSizes = false;
    }
    if (onProgress) {
      try {
        await onProgress({
          removedCount,
          estimatedBytes: hasAllSizes ? estimatedBytes : null,
        });
      } catch {
        throw new StepDetailAttachmentCleanupError(
          'Cleanup progress could not be saved.',
          {
            removedCount,
            estimatedBytes: hasAllSizes ? estimatedBytes : null,
          },
        );
      }
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
