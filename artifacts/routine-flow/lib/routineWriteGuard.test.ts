import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoutineWriteGuard } from './routineWriteGuard';
import { renameRoutineCategory } from './routineCategories';
import type { Routine } from '@/types/routines';

test('a deferred rename cannot overwrite an overlapping visibility save; retry keeps both changes', async () => {
  const runWrite = createRoutineWriteGuard();
  let saved = [{ id: 'one', category: 'Health' }, { id: 'two', category: 'Health' }] as Routine[];
  let release!: () => void;
  const deferred = new Promise<void>((resolve) => { release = resolve; });
  const rename = runWrite(async () => {
    const next = renameRoutineCategory(saved, 'Health', 'Wellness');
    await deferred;
    saved = next;
  });
  await assert.rejects(
    runWrite(async () => {
      saved = saved.map((routine) => routine.id === 'two' ? { ...routine, hidden: true } : routine);
    }),
    /still saving/,
  );
  release();
  await rename;
  await runWrite(async () => {
    saved = saved.map((routine) => routine.id === 'two' ? { ...routine, hidden: true } : routine);
  });
  assert.deepEqual(saved.map(({ category, hidden }) => ({ category, hidden })), [
    { category: 'Wellness', hidden: undefined },
    { category: 'Wellness', hidden: true },
  ]);
});

test('a deferred visibility save prevents rename until that write finishes', async () => {
  const runWrite = createRoutineWriteGuard();
  let saved = [{ id: 'one', category: 'Health' }] as Routine[];
  let release!: () => void;
  const deferred = new Promise<void>((resolve) => { release = resolve; });
  const visibility = runWrite(async () => {
    const next = saved.map((routine) => ({ ...routine, hidden: true }));
    await deferred;
    saved = next;
  });
  await assert.rejects(
    runWrite(async () => { saved = renameRoutineCategory(saved, 'Health', 'Wellness'); }),
    /still saving/,
  );
  assert.equal(saved[0].category, 'Health');
  release();
  await visibility;
  await runWrite(async () => { saved = renameRoutineCategory(saved, 'Health', 'Wellness'); });
  assert.equal(saved[0].category, 'Wellness');
  assert.equal(saved[0].hidden, true);
});

test('a rejected save releases the guard for retry', async () => {
  const runWrite = createRoutineWriteGuard();
  await assert.rejects(runWrite(async () => { throw new Error('storage failed'); }), /storage failed/);
  assert.equal(await runWrite(async () => 'saved'), 'saved');
});