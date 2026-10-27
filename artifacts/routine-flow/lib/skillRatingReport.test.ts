/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSkillRatingReportHtml } from './skillRatingReport';

test('skill report includes the run time, escaped notes, and sequential skill order', () => {
  const html = buildSkillRatingReportHtml({
    personName: 'Alex',
    personId: 'profile-42',
    routineTitle: 'Morning <Routine>',
    dateTime: '2030-06-12T12:00:00.000Z',
    isRunTime: true,
    runReflection: 'A useful <reflection>.\nNext step.',
    ratings: [
      { id: 'second', skillId: 'balance', ratingId: 'rating-second', skillName: 'Balance', rating: 7, ratedAt: '2030-06-12T12:05:00.000Z', sequence: 1, note: 'Keep <steady>.' },
      { id: 'first', skillId: 'breathing', ratingId: 'rating-first', skillName: 'Breathing', rating: 8, ratedAt: '2030-06-12T12:05:00.000Z', sequence: 0 },
    ],
  });
  assert.match(html, /Morning &lt;Routine&gt;/);
  assert.match(html, /Person: Alex · Profile ID: profile-42/);
  assert.match(html, /Run date and time/);
  assert.match(html, /Keep &lt;steady&gt;\./);
  assert.match(html, /Run reflection/);
  assert.match(html, /A useful &lt;reflection&gt;\.<br>Next step\./);
  assert.ok(html.indexOf('<th scope="row">Breathing</th>') < html.indexOf('<th scope="row">Balance</th>'));
  assert.match(html, /No note recorded\./);
});

test('skill report rejects empty or invalid export data', () => {
  assert.throws(() => buildSkillRatingReportHtml({
    personName: 'Alex',
    personId: 'profile-42',
    routineTitle: 'Morning',
    dateTime: '2030-06-12T12:00:00.000Z',
    isRunTime: true,
    ratings: [],
  }), /no skill ratings/i);
});
