/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cleanupOrphanedStepDetailAttachmentCopies,
  createStepDetailAttachmentCleanupRunner,
  STEP_DETAIL_ATTACHMENT_CLEANUP_PROGRESS_KEY,
  StepDetailAttachmentCleanupError,
} from './stepDetailAttachmentCleanup';
import { PERSON_DATA_KEYS, personStorageKey } from './personStorage';
import type { Routine } from '@/types/routines';

const directory = 'file:///documents/';
const attachmentDirectory = `${directory}step-detail-attachments/`;
const PEOPLE_KEY = '@routine-flow/people';

function peopleRegistry(ids: string[]) {
  return JSON.stringify({ version: 1, people: ids.map(id => ({ id })), activePersonId: ids[0] });
}

function routine(uri: string, contentBase64 = 'c2FtcGxl'): Routine {
  return {
    id: 'routine',
    title: 'Routine',
    subtitle: '',
    icon: 'sunny-outline',
    tone: 'sun',
    createdAt: '2026-10-01T00:00:00.000Z',
    steps: [{
      id: 'step',
      title: 'Step',
      durationSeconds: 60,
      detailAttachments: [[{
        id: 'attachment',
        name: 'file.pdf',
        uri,
        mimeType: 'application/pdf',
        kind: 'document',
        contentBase64,
      }]],
    }],
  };
}

function createAdapters(
  initialEntries: Array<[string, string]>,
  fileNames: string[],
  fileSizes: Record<string, number> = {},
) {
  const values = new Map(initialEntries);
  const deleted: string[] = [];
  const storage = {
    getAllKeys: async () => [...values.keys()],
    multiGet: async (keys: readonly string[]) =>
      keys.map(key => [key, values.get(key) ?? null] as const),
  };
  const fileSystem = {
    readDirectoryAsync: async () => [...fileNames],
    getInfoAsync: async (uri: string) => ({
      exists: true,
      isDirectory: false,
      size: fileSizes[uri.slice(uri.lastIndexOf('/') + 1)],
    }),
    deleteAsync: async (uri: string) => { deleted.push(uri); },
  };
  return { values, deleted, storage, fileSystem };
}

test('removes orphaned local attachment copies across all profiles but keeps shared copies and backup bytes', async () => {
  const sharedUri = `${attachmentDirectory}shared.pdf`;
  const orphanUri = `${attachmentDirectory}orphan.pdf`;
  const rawRoutine = JSON.stringify([routine(sharedUri, 'YmFja3VwLWNvbnRlbnQ=')]);
  const adapters = createAdapters([
    [PEOPLE_KEY, peopleRegistry(['me', 'person-2'])],
    [PERSON_DATA_KEYS.routines, rawRoutine],
    [personStorageKey('person-2', PERSON_DATA_KEYS.routines), JSON.stringify([routine(sharedUri)])],
  ], ['shared.pdf', 'orphan.pdf'], { 'shared.pdf': 1200, 'orphan.pdf': 845 });

  const removed = await cleanupOrphanedStepDetailAttachmentCopies(
    directory, adapters.storage, adapters.fileSystem,
  );

  assert.deepEqual(removed, { removedCount: 1, estimatedBytes: 845 });
  assert.deepEqual(adapters.deleted, [orphanUri]);
  assert.equal(adapters.values.get(PERSON_DATA_KEYS.routines), rawRoutine);
  assert.match(adapters.values.get(PERSON_DATA_KEYS.routines)!, /YmFja3VwLWNvbnRlbnQ=/);
});

test('marks the size estimate unavailable when a removed file has no reported size', async () => {
  const adapters = createAdapters([
    [PEOPLE_KEY, peopleRegistry(['me'])],
    [PERSON_DATA_KEYS.routines, JSON.stringify([])],
  ], ['orphan.pdf']);

  const result = await cleanupOrphanedStepDetailAttachmentCopies(
    directory, adapters.storage, adapters.fileSystem,
  );

  assert.deepEqual(result, { removedCount: 1, estimatedBytes: null });
  assert.deepEqual(adapters.deleted, [`${attachmentDirectory}orphan.pdf`]);
});

test('does not delete files when any saved routine data cannot be inspected safely', async () => {
  const adapters = createAdapters([
    [PEOPLE_KEY, peopleRegistry(['me'])],
    [PERSON_DATA_KEYS.routines, '{not valid json'],
  ], ['possible-reference.pdf']);

  await assert.rejects(
    cleanupOrphanedStepDetailAttachmentCopies(directory, adapters.storage, adapters.fileSystem),
  );
  assert.deepEqual(adapters.deleted, []);
});

test('keeps a file when a routine starts referencing it during cleanup', async () => {
  const attachedUri = `${attachmentDirectory}newly-attached.pdf`;
  const adapters = createAdapters([
    [PEOPLE_KEY, peopleRegistry(['me'])],
    [PERSON_DATA_KEYS.routines, JSON.stringify([])],
  ], ['newly-attached.pdf']);
  let resumeMetadataRead!: () => void;
  let signalMetadataRead!: () => void;
  const metadataReadStarted = new Promise<void>(resolve => { signalMetadataRead = resolve; });
  const allowMetadataRead = new Promise<void>(resolve => { resumeMetadataRead = resolve; });
  adapters.fileSystem.getInfoAsync = async () => {
    signalMetadataRead();
    await allowMetadataRead;
    return { exists: true, isDirectory: false, size: 500 };
  };

  const cleanup = cleanupOrphanedStepDetailAttachmentCopies(
    directory, adapters.storage, adapters.fileSystem,
  );
  await metadataReadStarted;
  // This represents a routine save completing while cleanup is between its
  // initial reference scan and the actual file deletion.
  adapters.values.set(PERSON_DATA_KEYS.routines, JSON.stringify([routine(attachedUri)]));
  resumeMetadataRead();

  assert.deepEqual(await cleanup, { removedCount: 0, estimatedBytes: 0 });
  assert.deepEqual(adapters.deleted, []);
});

test('stops later deletions if routine data becomes unreadable during cleanup', async () => {
  const firstUri = `${attachmentDirectory}first-orphan.pdf`;
  const secondUri = `${attachmentDirectory}second-orphan.pdf`;
  const adapters = createAdapters([
    [PEOPLE_KEY, peopleRegistry(['me'])],
    [PERSON_DATA_KEYS.routines, JSON.stringify([])],
  ], ['first-orphan.pdf', 'second-orphan.pdf'], {
    'first-orphan.pdf': 125,
    'second-orphan.pdf': 250,
  });
  adapters.fileSystem.deleteAsync = async uri => {
    adapters.deleted.push(uri);
    if (uri === firstUri) adapters.values.set(PERSON_DATA_KEYS.routines, '{invalid json');
  };

  await assert.rejects(
    cleanupOrphanedStepDetailAttachmentCopies(directory, adapters.storage, adapters.fileSystem),
    error => {
      assert.ok(error instanceof StepDetailAttachmentCleanupError);
      assert.deepEqual(error.partialResult, { removedCount: 1, estimatedBytes: 125 });
      return true;
    },
  );
  assert.deepEqual(adapters.deleted, [firstUri]);
  assert.ok(!adapters.deleted.includes(secondUri));
});

test('reports failed file removals after still cleaning other orphaned files', async () => {
  const adapters = createAdapters([
    [PEOPLE_KEY, peopleRegistry(['me'])],
    [PERSON_DATA_KEYS.routines, JSON.stringify([])],
  ], ['retry-later.pdf', 'remove-now.pdf']);
  let storageAvailable = false;
  adapters.fileSystem.deleteAsync = async uri => {
    if (uri.endsWith('retry-later.pdf') && !storageAvailable) throw new Error('Temporary storage error');
    adapters.deleted.push(uri);
  };

  await assert.rejects(
    cleanupOrphanedStepDetailAttachmentCopies(directory, adapters.storage, adapters.fileSystem),
    error => {
      assert.ok(error instanceof StepDetailAttachmentCleanupError);
      assert.match(error.message, /Some unused attachment files could not be removed/);
      assert.deepEqual(error.partialResult, { removedCount: 1, estimatedBytes: null });
      return true;
    },
  );
  assert.deepEqual(adapters.deleted, [`${attachmentDirectory}remove-now.pdf`]);
  storageAvailable = true;
  await cleanupOrphanedStepDetailAttachmentCopies(directory, adapters.storage, adapters.fileSystem);
  assert.ok(adapters.deleted.includes(`${attachmentDirectory}retry-later.pdf`));
});

test('keeps partial cleanup progress visible across retries without counting saved attachments', async () => {
  const sharedUri = `${attachmentDirectory}shared.pdf`;
  const retryUri = `${attachmentDirectory}retry-later.pdf`;
  const removeUri = `${attachmentDirectory}remove-now.pdf`;
  const adapters = createAdapters([
    [PEOPLE_KEY, peopleRegistry(['me', 'person-2'])],
    [PERSON_DATA_KEYS.routines, JSON.stringify([routine(sharedUri)])],
    [personStorageKey('person-2', PERSON_DATA_KEYS.routines), JSON.stringify([routine(sharedUri)])],
  ], ['shared.pdf', 'retry-later.pdf', 'remove-now.pdf'], {
    'shared.pdf': 100,
    'retry-later.pdf': 200,
    'remove-now.pdf': 300,
  });
  const remainingFiles = ['shared.pdf', 'retry-later.pdf', 'remove-now.pdf'];
  let storageAvailable = false;
  adapters.fileSystem.readDirectoryAsync = async () => [...remainingFiles];
  adapters.fileSystem.deleteAsync = async uri => {
    if (uri === retryUri && !storageAvailable) throw new Error('Temporary storage error');
    adapters.deleted.push(uri);
    const fileName = uri.slice(uri.lastIndexOf('/') + 1);
    const index = remainingFiles.indexOf(fileName);
    if (index >= 0) remainingFiles.splice(index, 1);
  };

  const statuses: Array<{
    status: string;
    progress?: { removedCount: number; estimatedBytes: number | null };
  }> = [];
  const runCleanup = createStepDetailAttachmentCleanupRunner(
    () => cleanupOrphanedStepDetailAttachmentCopies(
      directory, adapters.storage, adapters.fileSystem,
    ),
    (status, progress) => statuses.push({ status, progress }),
  );

  assert.equal(await runCleanup(), null);
  assert.deepEqual(statuses.at(-1), {
    status: 'retry',
    progress: { removedCount: 1, estimatedBytes: 300 },
  });
  assert.deepEqual(adapters.deleted, [removeUri]);
  assert.ok(!adapters.deleted.includes(sharedUri));

  storageAvailable = true;
  assert.deepEqual(await runCleanup(), { removedCount: 2, estimatedBytes: 500 });
  assert.deepEqual(statuses.at(-1), {
    status: 'complete',
    progress: { removedCount: 2, estimatedBytes: 500 },
  });
  assert.deepEqual(adapters.deleted, [removeUri, retryUri]);
  assert.ok(!adapters.deleted.includes(sharedUri));
});

test('persists partial cleanup progress across restarts until every profile has been safely checked', async () => {
  const sharedUri = `${attachmentDirectory}shared.pdf`;
  const retryUri = `${attachmentDirectory}retry-later.pdf`;
  const removeUri = `${attachmentDirectory}remove-now.pdf`;
  const adapters = createAdapters([
    [PEOPLE_KEY, peopleRegistry(['me', 'person-2'])],
    [PERSON_DATA_KEYS.routines, JSON.stringify([routine(sharedUri)])],
    [personStorageKey('person-2', PERSON_DATA_KEYS.routines), JSON.stringify([routine(sharedUri)])],
  ], ['shared.pdf', 'retry-later.pdf', 'remove-now.pdf'], {
    'shared.pdf': 100,
    'retry-later.pdf': 200,
    'remove-now.pdf': 300,
  });
  const progressValues = new Map<string, string>();
  const progressStorage = {
    getItem: async (key: string) => progressValues.get(key) ?? null,
    setItem: async (key: string, value: string) => { progressValues.set(key, value); },
    removeItem: async (key: string) => { progressValues.delete(key); },
  };
  const remainingFiles = ['remove-now.pdf', 'retry-later.pdf', 'shared.pdf'];
  let storageAvailable = false;
  adapters.fileSystem.readDirectoryAsync = async () => [...remainingFiles];
  adapters.fileSystem.deleteAsync = async uri => {
    if (uri === retryUri && !storageAvailable) throw new Error('Temporary storage error');
    if (uri === retryUri) {
      const checkpoint = progressValues.get(STEP_DETAIL_ATTACHMENT_CLEANUP_PROGRESS_KEY);
      assert.ok(checkpoint, 'completed deletions are checkpointed before the next file is removed');
      assert.equal(JSON.parse(checkpoint).removedCount, 1);
    }
    adapters.deleted.push(uri);
    const fileName = uri.slice(uri.lastIndexOf('/') + 1);
    const index = remainingFiles.indexOf(fileName);
    if (index >= 0) remainingFiles.splice(index, 1);
  };
  const createRunner = () => createStepDetailAttachmentCleanupRunner(
    onProgress => cleanupOrphanedStepDetailAttachmentCopies(
      directory, adapters.storage, adapters.fileSystem, onProgress,
    ),
    () => {},
    progressStorage,
  );

  assert.equal(await createRunner()(), null);
  const savedPartialProgress = progressValues.get(STEP_DETAIL_ATTACHMENT_CLEANUP_PROGRESS_KEY);
  assert.ok(savedPartialProgress);
  assert.deepEqual(JSON.parse(savedPartialProgress), {
    version: 1,
    removedCount: 1,
    estimatedBytes: 300,
  });
  assert.deepEqual(adapters.deleted, [removeUri]);

  // A new process must not clear the prior count if routines cannot be checked.
  adapters.values.set(PERSON_DATA_KEYS.routines, '{invalid json');
  const afterRestart = createRunner();
  assert.equal(await afterRestart(), null);
  assert.equal(progressValues.get(STEP_DETAIL_ATTACHMENT_CLEANUP_PROGRESS_KEY), savedPartialProgress);

  adapters.values.set(PERSON_DATA_KEYS.routines, JSON.stringify([routine(sharedUri)]));
  storageAvailable = true;
  assert.deepEqual(await afterRestart(), { removedCount: 2, estimatedBytes: 500 });
  assert.equal(progressValues.has(STEP_DETAIL_ATTACHMENT_CLEANUP_PROGRESS_KEY), false);
  assert.deepEqual(adapters.deleted, [removeUri, retryUri]);
  assert.ok(!adapters.deleted.includes(sharedUri));
});

test('reports when local attachment storage is unavailable', async () => {
  const adapters = createAdapters([], []);
  await assert.rejects(
    cleanupOrphanedStepDetailAttachmentCopies(null, adapters.storage, adapters.fileSystem),
    /App file storage is unavailable/,
  );
});

test('retries startup cleanup after reopening and hides the retry state after success', async () => {
  const sharedUri = `${attachmentDirectory}shared.pdf`;
  const orphanUri = `${attachmentDirectory}orphan.pdf`;
  const adapters = createAdapters([
    [PEOPLE_KEY, peopleRegistry(['me', 'person-2'])],
    [PERSON_DATA_KEYS.routines, JSON.stringify([routine(sharedUri)])],
    [personStorageKey('person-2', PERSON_DATA_KEYS.routines), JSON.stringify([routine(sharedUri)])],
  ], ['shared.pdf', 'orphan.pdf'], { 'shared.pdf': 1200, 'orphan.pdf': 845 });
  let storageAvailable = false;
  adapters.fileSystem.deleteAsync = async uri => {
    if (uri === orphanUri && !storageAvailable) throw new Error('Temporary storage error');
    adapters.deleted.push(uri);
  };
  let retryVisible = false;
  let busy = false;
  const createRunner = () => createStepDetailAttachmentCleanupRunner(
    () => cleanupOrphanedStepDetailAttachmentCopies(directory, adapters.storage, adapters.fileSystem),
    status => {
      busy = status === 'running';
      if (status === 'retry') retryVisible = true;
      if (status === 'complete') retryVisible = false;
    },
  );

  assert.equal(await createRunner()(), null);
  assert.equal(retryVisible, true);
  assert.equal(busy, false);

  // A fresh runner represents app startup after reopening; startup retries too.
  const afterRestart = createRunner();
  assert.equal(await afterRestart(), null);
  assert.equal(retryVisible, true);

  storageAvailable = true;
  assert.deepEqual(await afterRestart(), { removedCount: 1, estimatedBytes: 845 });
  assert.equal(retryVisible, false);
  assert.equal(busy, false);
  assert.ok(adapters.deleted.includes(orphanUri));
  assert.ok(!adapters.deleted.includes(sharedUri));
});

test('only examines the dedicated attachment directory and routine storage keys', async () => {
  const adapters = createAdapters([
    [PEOPLE_KEY, peopleRegistry(['me'])],
    [PERSON_DATA_KEYS.routines, JSON.stringify([routine(`${directory}other-file.pdf`)])],
    ['@routine-flow/person/person/notes', 'not routine data'],
  ], ['unreferenced.pdf', '../outside.pdf']);

  await cleanupOrphanedStepDetailAttachmentCopies(directory, adapters.storage, adapters.fileSystem);

  assert.deepEqual(adapters.deleted, [`${attachmentDirectory}unreferenced.pdf`]);
});

test('a removed profile’s missing routine record no longer keeps its attachment copy', async () => {
  const removedProfileKey = personStorageKey('removed-profile', PERSON_DATA_KEYS.routines);
  const adapters = createAdapters([
    [PEOPLE_KEY, peopleRegistry(['me'])],
    [PERSON_DATA_KEYS.routines, JSON.stringify([])],
    [removedProfileKey, JSON.stringify([routine(`${attachmentDirectory}old-profile.pdf`)])],
  ], ['old-profile.pdf']);

  await cleanupOrphanedStepDetailAttachmentCopies(directory, adapters.storage, adapters.fileSystem);

  assert.deepEqual(adapters.deleted, [`${attachmentDirectory}old-profile.pdf`]);
});
