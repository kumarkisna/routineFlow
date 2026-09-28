/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Routine } from '@/types/routines';
import { formatHistoryDay, getHistoryForDay, recordedPastDays } from './progressHistory';

const routine: Routine = {
  id: 'morning',
  title: 'Morning',
  subtitle: '',
  icon: 'sunny-outline',
  tone: 'coral',
  hidden: true,
  createdAt: '2026-01-01T00:00:00Z',
  steps: [{ id: 'water', title: 'Water', durationSeconds: 60, hidden: true }],
};

test('lists only past dates with completions, newest first', () => {
  const days = recordedPastDays({
    '2026-01-03': { 'morning:water': true },
    '2026-01-01': { 'morning:water': true },
    '2026-01-02': { 'morning:water': false },
    '2026-01-04': { 'morning:water': true },
    '2026-02-30': { 'morning:water': true },
  }, '2026-01-04');
  assert.deepEqual(days, ['2026-01-03', '2026-01-01']);
  assert.match(formatHistoryDay('2026-01-03'), /January 3, 2026/);
});

test('shows hidden and edited routines alongside removed steps and routines', () => {
  const groups = getHistoryForDay({
    '2026-01-03': {
      'morning:water': true,
      'morning:old-step': true,
      'deleted:old-step': true,
      'morning:not-done': false,
    },
  }, [routine], '2026-01-03');

  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, 'Morning');
  assert.equal(groups[0].hidden, true);
  assert.deepEqual(groups[0].steps.map((step) => step.title), ['Water', 'Removed step (old-step)']);
  assert.equal(groups[0].steps[0].hidden, true);
  assert.equal(groups[1].title, 'Removed routine (deleted)');
  assert.equal(groups[1].steps[0].title, 'Removed step (old-step)');
});