/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_ROUTINE_FILE_BYTES,
  mergeImportedProgress,
  mergeImportedRoutines,
  parseRoutinesFile,
  persistImportedBackup,
  serializeRoutines,
} from './routineTransfer';
import type { CompletionMap, Routine } from '@/types/routines';

const day = '2026-09-28';
const secondDay = '2026-09-29';

function routine(id = 'morning'): Routine {
  return {
    id,
    title: 'Morning',
    subtitle: 'Start well',
    icon: 'sunrise',
    tone: 'sun',
    createdAt: '2026-09-01T00:00:00.000Z',
    steps: [
      { id: 'water', title: 'Drink water', durationSeconds: 60 },
      { id: 'stretch', title: 'Stretch', durationSeconds: 120 },
    ],
  };
}

function backup(version: number, routines: unknown[], progress?: unknown): string {
  return JSON.stringify({
    format: 'routine-flow-routines',
    version,
    routines,
    ...(progress === undefined ? {} : { progress }),
  });
}

test('reads version 1 backups with legacy step durations but no history', () => {
  const old = routine();
  old.steps = [{ id: 'water', title: 'Drink water', duration: '5 minutes', durationSeconds: 0 }];
  const raw = JSON.parse(JSON.stringify(old));
  delete raw.steps[0].durationSeconds;

  assert.deepEqual(parseRoutinesFile(backup(1, [raw])), {
    routines: [{ ...old, steps: [{ ...old.steps[0], durationSeconds: 300 }] }],
  });
  assert.throws(
    () => parseRoutinesFile(backup(1, [raw], { [day]: { 'morning:water': true } })),
    /older backup cannot contain daily progress/,
  );
});

test('version 2 export and import keep only relevant completed history', () => {
  const source = routine();
  const raw = serializeRoutines([source], {
    [day]: { 'morning:water': true, 'morning:stretch': false, 'other:water': true },
    'not-a-date': { 'morning:water': true },
  });
  const json = JSON.parse(raw);
  assert.equal(json.version, 2);
  assert.deepEqual(json.progress, { [day]: { 'morning:water': true } });
  assert.deepEqual(parseRoutinesFile(raw), {
    routines: [source],
    progress: { [day]: { 'morning:water': true } },
  });
  assert.deepEqual(parseRoutinesFile(backup(2, [source], { [day]: { 'morning:water': false } })).progress, {
    [day]: {},
  });
});

test('backups preserve categories and treat a category edit as a different routine', () => {
  const categorized = { ...routine(), category: 'Health' };
  assert.deepEqual(parseRoutinesFile(serializeRoutines([categorized])).routines, [categorized]);
  assert.deepEqual(parseRoutinesFile(backup(1, [routine()])).routines, [routine()]);

  const merged = mergeImportedRoutines([routine()], [categorized], () => 'imported-health');
  assert.equal(merged.added, 1);
  assert.equal(merged.renamed, 1);
  assert.equal(merged.routines[0].category, undefined);
  assert.equal(merged.routines[1].category, 'Health');
  assert.throws(() => parseRoutinesFile(backup(2, [{ ...routine(), category: 42 }])), /invalid category/);
  assert.throws(() => parseRoutinesFile(backup(2, [{ ...routine(), category: '' }])), /invalid category/);
});

test('rejects malformed backup structure and invalid or unrelated history', () => {
  const source = routine();
  const invalidFiles = [
    '{',
    backup(3, [source]),
    backup(2, [source], []),
    backup(2, [source], { '2026-02-30': { 'morning:water': true } }),
    backup(2, [source], { [day]: [] }),
    backup(2, [source], { [day]: { 'unknown:water': true } }),
    backup(2, [source], { [day]: { 'morning:water': 'true' } }),
    backup(2, [source, source]),
    backup(2, [{ ...source, steps: [source.steps[0], source.steps[0]] }]),
    'x'.repeat(MAX_ROUTINE_FILE_BYTES + 1),
  ];
  for (const file of invalidFiles) {
    assert.throws(() => parseRoutinesFile(file), Error, file.slice(0, 100));
  }
});

test('conflicting routine IDs create a separate copy and remap progress without changing local flags', () => {
  const original = routine();
  const customized = { ...routine(), title: 'My morning' };
  const existing: CompletionMap = {
    [day]: { 'morning:water': false, 'morning:stretch': true },
    [secondDay]: { 'morning:water': true },
  };
  const imported = parseRoutinesFile(backup(2, [original], {
    [day]: { 'morning:water': true, 'morning:stretch': true },
    [secondDay]: { 'morning:water': true },
  }));
  let nextId = 0;
  const merged = mergeImportedRoutines([customized], imported.routines, () => `copy-${++nextId}`);
  assert.deepEqual({ added: merged.added, skipped: merged.skipped, renamed: merged.renamed }, {
    added: 1, skipped: 0, renamed: 1,
  });
  assert.deepEqual(merged.routines, [customized, { ...original, id: 'copy-1' }]);
  assert.equal(merged.idMap.morning, 'copy-1');

  const result = mergeImportedProgress(existing, imported.progress!, merged.idMap);
  assert.deepEqual(result, {
    progress: {
      [day]: {
        'morning:water': false,
        'morning:stretch': true,
        'copy-1:water': true,
        'copy-1:stretch': true,
      },
      [secondDay]: { 'morning:water': true, 'copy-1:water': true },
    },
    added: 3,
    kept: 0,
  });
  assert.deepEqual(existing[day], { 'morning:water': false, 'morning:stretch': true });

  const again = mergeImportedRoutines(merged.routines, imported.routines, () => {
    throw new Error('Repeated import should not generate an ID');
  });
  assert.deepEqual({ added: again.added, skipped: again.skipped, renamed: again.renamed }, {
    added: 0, skipped: 1, renamed: 0,
  });
  assert.equal(again.idMap.morning, 'copy-1');
  assert.deepEqual(mergeImportedProgress(result.progress, imported.progress!, again.idMap), {
    progress: result.progress, added: 0, kept: 3,
  });
});

test('matching routines with different IDs reuse their local progress, including explicit false', () => {
  const original = routine('backup-id');
  const local = routine('local-id');
  const existing = { [day]: { 'local-id:water': false, 'local-id:stretch': true } };
  const merged = mergeImportedRoutines([local], [original], () => {
    throw new Error('Identical routines should not be copied');
  });
  assert.equal(merged.added, 0);
  assert.equal(merged.skipped, 1);
  assert.equal(merged.idMap['backup-id'], 'local-id');
  assert.deepEqual(mergeImportedProgress(existing, {
    [day]: { 'backup-id:water': true, 'backup-id:stretch': true },
    [secondDay]: { 'backup-id:water': false, 'backup-id:stretch': true },
  }, merged.idMap), {
    progress: {
      [day]: { 'local-id:water': false, 'local-id:stretch': true },
      [secondDay]: { 'local-id:stretch': true },
    },
    added: 1,
    kept: 2,
  });
  assert.deepEqual(existing, { [day]: { 'local-id:water': false, 'local-id:stretch': true } });
});

test('failed history save reports saved routines and retry adds progress without another routine', async () => {
  const local = { ...routine(), title: 'Customized morning' };
  const imported = routine();
  const backupProgress = { [day]: { 'morning:water': true } };
  let currentRoutines = [local];
  let currentProgress: CompletionMap = {};
  const stored = new Map<string, string>();
  let failProgress = true;
  const storage = {
    async setItem(key: string, value: string) {
      if (key === 'progress' && failProgress) throw new Error('Disk full');
      stored.set(key, value);
    },
    async getItem(key: string) { return stored.get(key) ?? null; },
  };
  let generated = 0;
  async function restore() {
    const result = mergeImportedRoutines(currentRoutines, [imported], () => `copy-${++generated}`);
    const merged = mergeImportedProgress(currentProgress, backupProgress, result.idMap);
    await persistImportedBackup(
      storage, 'routines', 'progress', result.routines, merged.progress, result.added, merged.added,
      (saved) => { currentRoutines = saved; },
      (saved) => { currentProgress = saved; },
      () => { throw new Error('Routine save is not uncertain'); },
    );
    return result;
  }

  await assert.rejects(restore(), /1 routine was saved, but daily progress could not be confirmed saved.*Try importing this backup again/);
  assert.deepEqual(JSON.parse(stored.get('routines')!), [local, { ...imported, id: 'copy-1' }]);
  assert.equal(stored.has('progress'), false);
  assert.equal(currentRoutines.length, 2);
  assert.deepEqual(currentProgress, {});

  failProgress = false;
  const retried = await restore();
  assert.equal(retried.added, 0);
  assert.equal(generated, 1);
  assert.deepEqual(currentProgress, { [day]: { 'copy-1:water': true } });
  assert.deepEqual(JSON.parse(stored.get('progress')!), currentProgress);
  assert.equal(currentRoutines.length, 2);
});

test('a routines write that commits then rejects is reconciled before retry', async () => {
  const local = { ...routine(), title: 'Customized morning' };
  const imported = routine();
  const stored = new Map<string, string>();
  let currentRoutines = [local];
  let currentProgress: CompletionMap = {};
  let generated = 0;
  let failAfterCommit = true;
  const storage = {
    async setItem(key: string, value: string) {
      stored.set(key, value);
      if (key === 'routines' && failAfterCommit) throw new Error('Write acknowledged late');
    },
    async getItem(key: string) { return stored.get(key) ?? null; },
  };
  async function restore() {
    const result = mergeImportedRoutines(currentRoutines, [imported], () => `copy-${++generated}`);
    const merged = mergeImportedProgress(currentProgress, {
      [day]: { 'morning:water': true },
    }, result.idMap);
    await persistImportedBackup(
      storage, 'routines', 'progress', result.routines, merged.progress,
      result.added, merged.added,
      (saved) => { currentRoutines = saved; },
      (saved) => { currentProgress = saved; },
      () => { throw new Error('The write was confirmed'); },
    );
    return result;
  }

  await assert.rejects(restore(), /1 routine was saved, but daily progress was not restored/);
  assert.deepEqual(JSON.parse(stored.get('routines')!), [local, { ...imported, id: 'copy-1' }]);
  assert.equal(stored.has('progress'), false);
  failAfterCommit = false;
  const retried = await restore();
  assert.equal(retried.added, 0);
  assert.equal(generated, 1);
  assert.equal(currentRoutines.length, 2);
  assert.deepEqual(currentProgress, { [day]: { 'copy-1:water': true } });
  assert.deepEqual(JSON.parse(stored.get('progress')!), currentProgress);
});

test('unconfirmed routines write prevents an unsafe retry', async () => {
  let blocked = false;
  await assert.rejects(persistImportedBackup(
    {
      async setItem() { throw new Error('Write failed'); },
      async getItem() { throw new Error('Read failed'); },
    },
    'routines', 'progress', [routine()], {}, 1, 0,
    () => { throw new Error('Unexpected saved callback'); },
    () => { throw new Error('Unexpected progress callback'); },
    () => { blocked = true; },
  ), /Restart the app before trying this backup again/);
  assert.equal(blocked, true);
});