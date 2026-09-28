import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categoryKey, listRoutineCategories, normalizeCategory } from './routineCategories';
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