/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanupOrphanedStepDetailAttachmentCopies } from './stepDetailAttachmentCleanup';
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

function createAdapters(initialEntries: Array<[string, string]>, fileNames: string[]) {
  const values = new Map(initialEntries);
  const deleted: string[] = [];
  const storage = {
    getAllKeys: async () => [...values.keys()],
    multiGet: async (keys: readonly string[]) =>
      keys.map(key => [key, values.get(key) ?? null] as const),
  };
  const fileSystem = {
    readDirectoryAsync: async () => [...fileNames],
    getInfoAsync: async () => ({ exists: true, isDirectory: false }),
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
  ], ['shared.pdf', 'orphan.pdf']);

  const removed = await cleanupOrphanedStepDetailAttachmentCopies(
    directory, adapters.storage, adapters.fileSystem,
  );

  assert.equal(removed, 1);
  assert.deepEqual(adapters.deleted, [orphanUri]);
  assert.equal(adapters.values.get(PERSON_DATA_KEYS.routines), rawRoutine);
  assert.match(adapters.values.get(PERSON_DATA_KEYS.routines)!, /YmFja3VwLWNvbnRlbnQ=/);
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
