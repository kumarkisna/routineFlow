import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categoryKey, listRoutineCategories, normalizeCategory, removeRoutineCategory, renameRoutineCategory } from './routineCategories';
import type { Routine } from '@/types/routines';

test('shows custom categories once and keeps existing casing when selecting one', () => {
  const routines = [
    { category: 'Health' },
    { category: 'health' },
    { category: 'Work' },
    {},
  ] as Routine[];
  assert.deepEqual(listRoutineCategories(routines), ['Health', 'Work']);
  assert.equal(normalizeCategory(' health ', listRoutineCategories(routines)), 'Health');
  assert.equal(normalizeCategory('  Home   Care ', listRoutineCategories(routines)), 'Home Care');
  assert.equal(categoryKey(undefined), '');
});

test('renames all matching routines including hidden ones, without changing other routine data', () => {
  const routines = [
    { id: 'a', category: 'Health', steps: [{ id: 'step' }] },
    { id: 'b', category: ' health ', hidden: true },
    { id: 'c', category: 'Work' },
    { id: 'd' },
  ] as Routine[];
  const renamed = renameRoutineCategory(routines, 'HEALTH', '  Wellness  Care ');
  assert.deepEqual(renamed.map((routine) => routine.category), ['Wellness Care', 'Wellness Care', 'Work', undefined]);
  assert.deepEqual(listRoutineCategories(renamed), ['Wellness Care', 'Work']);
  assert.equal(renamed[0].steps, routines[0].steps);
  assert.equal(renamed[1].hidden, true);
  assert.deepEqual(routines.map((routine) => routine.category), ['Health', ' health ', 'Work', undefined]);
});

test('renaming into an existing category joins it, while case-only edits change the source label', () => {
  const routines = [{ category: 'Health' }, { category: 'health' }, { category: 'Work' }] as Routine[];
  const joined = renameRoutineCategory(routines, 'Health', ' WORK ');
  assert.deepEqual(joined.map((routine) => routine.category), ['Work', 'Work', 'Work']);
  assert.deepEqual(listRoutineCategories(joined), ['Work']);
  const recased = renameRoutineCategory(routines, 'health', 'HEALTH');
  assert.deepEqual(recased.map((routine) => routine.category), ['HEALTH', 'HEALTH', 'Work']);
});

test('refuses missing source, empty destination and overlong names', () => {
  const routines = [{ category: 'Health' }] as Routine[];
  assert.throws(() => renameRoutineCategory(routines, 'Missing', 'New'), /not found/);
  assert.throws(() => renameRoutineCategory(routines, 'Health', '  '), /Enter a category name/);
  assert.throws(() => renameRoutineCategory(routines, 'Health', 'x'.repeat(41)), /40 characters/);
});

test('removes a label from every match including hidden routines without mutating routine data', () => {
  const routines = [
    { id: 'a', category: 'Home Care', steps: [{ id: 'step', hidden: true, durationSeconds: 30 }] },
    { id: 'b', category: ' home   care ', hidden: true, steps: [] },
    { id: 'c', category: 'Work', steps: [] },
    { id: 'd', steps: [] },
  ] as Routine[];
  const before = structuredClone(routines);
  const removed = removeRoutineCategory(routines, ' HOME CARE ');
  assert.deepEqual(removed, before.map(({ category, ...rest }) =>
    categoryKey(category) === 'home care' ? rest : { ...rest, ...(category ? { category } : {}) }));
  assert.deepEqual(routines, before);
  assert.equal(removed[0].steps, routines[0].steps);
  assert.equal(removed[1].hidden, true);
  assert.equal(removed[2], routines[2]);
  assert.equal(removed[3], routines[3]);
  assert.deepEqual(listRoutineCategories(removed), ['Work']);
  assert.deepEqual(listRoutineCategories(removeRoutineCategory(removed, 'work')), []);
});

test('removal rejects missing or blank categories rather than touching uncategorized routines', () => {
  const routines = [{ category: 'Health' }, {}] as Routine[];
  for (const source of ['Missing', '', '  ']) {
    assert.throws(() => removeRoutineCategory(routines, source), /Category not found/);
  }
});