import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoutinePdfHtml } from './routinePrint';
import type { Routine } from '../types/routines';

const routine = (title: string, details: string): Routine => ({
  id: title.toLowerCase().replace(/\s/g, '-'),
  title,
  subtitle: 'A short <intro>',
  category: 'Morning',
  icon: 'sunny-outline',
  tone: 'sun',
  createdAt: '2030-01-01T00:00:00.000Z',
  steps: [{
    id: `${title}-step`,
    title: 'Drink water',
    description: details,
    additionalDetails: ['Take a breath'],
    durationSeconds: 60,
  }],
});

test('routine PDF includes ordered steps, optional notes, and a QR after each URL', () => {
  const html = buildRoutinePdfHtml({
    title: 'Morning <Plan>',
    kind: 'routine',
    routines: [routine('Morning', 'Read https://example.com/guide?x=1&y=2.')],
    includeNotes: true,
  });
  const urlPosition = html.indexOf('https://example.com/guide?x=1&amp;y=2');
  const qrPosition = html.indexOf('<div class="qr">', urlPosition);
  assert.ok(html.includes('Morning &lt;Plan&gt;'));
  assert.ok(html.includes('Drink water'));
  assert.ok(html.includes('Take a breath'));
  assert.ok(html.includes('A short &lt;intro&gt;'));
  assert.ok(html.includes('<svg'));
  assert.ok(urlPosition >= 0 && qrPosition > urlPosition);
});

test('routine PDF can omit notes and playlist PDF preserves order and missing entries', () => {
  const html = buildRoutinePdfHtml({
    title: 'Afternoon',
    kind: 'playlist',
    routines: [routine('First', 'private note'), undefined, routine('Last', 'later note')],
    includeNotes: false,
  });
  assert.ok(html.indexOf('1. First') < html.indexOf('2. Unavailable routine'));
  assert.ok(html.indexOf('2. Unavailable routine') < html.indexOf('3. Last'));
  assert.ok(!html.includes('private note'));
  assert.ok(!html.includes('later note'));
  assert.ok(!html.includes('<svg'));
});
