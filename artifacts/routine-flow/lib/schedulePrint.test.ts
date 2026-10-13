import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSchedulePrintHtml } from './schedulePrint';
import type { Routine } from '@/types/routines';

function routine(title: string, steps: Routine['steps']): Pick<Routine, 'title' | 'steps'> {
  return { title, steps };
}

const visibleStep = (id: string, title: string, extra: Partial<Routine['steps'][number]> = {}): Routine['steps'][number] => ({
  id,
  title,
  durationSeconds: 90,
  ...extra,
});

test('prints the active person and scheduled date/time metadata', () => {
  const html = buildSchedulePrintHtml({
    personName: 'Alex',
    personId: 'profile-42',
    scheduledAt: '2026-10-08T09:30:00.000Z',
    title: 'Morning routine',
    targetType: 'routine',
    routines: [routine('Morning routine', [visibleStep('one', 'Get ready')])],
  });

  assert.match(html, /Person: Alex · Profile ID: profile-42/);
  assert.match(html, /datetime="2026-10-08T09:30:00\.000Z"/);
  assert.match(html, /<dt>Date and time<\/dt>/);
});

test('preserves playlist order and repeated routines', () => {
  const html = buildSchedulePrintHtml({
    personName: 'Alex',
    personId: 'profile-42',
    scheduledAt: '2026-10-08T09:30:00.000Z',
    title: 'Morning playlist',
    targetType: 'playlist',
    routines: [
      routine('Wake up', [visibleStep('one', 'Open curtains')]),
      routine('Stretch', [visibleStep('two', 'Reach up')]),
      routine('Wake up', [visibleStep('one', 'Open curtains')]),
    ],
  });

  const sequence = [...html.matchAll(/class="sequence">Routine (\d+) of 3/g)].map(match => match[1]);
  const firstWakeUp = html.indexOf('<h2>Wake up</h2>');
  const stretch = html.indexOf('<h2>Stretch</h2>');
  const repeatedWakeUp = html.indexOf('<h2>Wake up</h2>', firstWakeUp + 1);
  assert.deepEqual(sequence, ['1', '2', '3']);
  assert.ok(firstWakeUp < stretch && stretch < repeatedWakeUp);
});

test('omits hidden steps and leaves readable space between visible steps', () => {
  const html = buildSchedulePrintHtml({
    personName: 'Alex',
    personId: 'profile-42',
    scheduledAt: '2026-10-08T09:30:00.000Z',
    title: 'Morning routine',
    targetType: 'routine',
    routines: [routine('Morning routine', [
      visibleStep('one', 'Get ready'),
      visibleStep('hidden', 'Private step', { hidden: true }),
      visibleStep('two', 'Make breakfast', { additionalDetails: ['Gather ingredients'] }),
    ])],
  });

  assert.equal((html.match(/class="step"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /Private step/);
  assert.match(html, /\.step \+ \.step \{ margin-top: 18px; \}/);
  assert.match(html, /Gather ingredients/);
});

test('escapes user-provided text and rejects unusable schedules', () => {
  const html = buildSchedulePrintHtml({
    personName: '<script>alert("x")</script>',
    personId: 'profile-42',
    scheduledAt: '2026-10-08T09:30:00.000Z',
    title: 'Routine & flow',
    targetType: 'routine',
    routines: [routine('Routine', [visibleStep('one', '<img src=x>')])],
  });

  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /Routine &amp; flow/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.throws(() => buildSchedulePrintHtml({
    personName: 'Alex',
    personId: 'profile-42',
    scheduledAt: 'not-a-date',
    title: 'Routine',
    targetType: 'routine',
    routines: [routine('Routine', [visibleStep('one', 'Step')])],
  }), /scheduled date is invalid/i);
  assert.throws(() => buildSchedulePrintHtml({
    personName: 'Alex',
    personId: 'profile-42',
    scheduledAt: '2026-10-08T09:30:00.000Z',
    title: 'Routine',
    targetType: 'routine',
    routines: [routine('Routine', [visibleStep('hidden', 'Hidden', { hidden: true })])],
  }), /visible step/i);
});