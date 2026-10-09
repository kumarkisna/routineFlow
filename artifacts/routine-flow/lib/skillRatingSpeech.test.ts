import assert from 'node:assert/strict';
import test from 'node:test';
import type { SkillRatingEvent } from './progressHistory';
import { formatSkillRatingDateTime } from './skillRatingReport';
import { buildSkillRatingSpeechText } from './skillRatingSpeech';

test('speech text reads each run rating and reflection in displayed order', () => {
  const event: SkillRatingEvent = {
    id: 'run:practice-1',
    dateTime: '2026-10-05T10:30:00.000Z',
    isRunTime: true,
    ratings: [
      {
        id: 'rating-planning',
        skillId: 'planning',
        ratingId: 'rating-planning',
        skillName: 'Planning',
        rating: 8,
        ratedAt: '2026-10-05T10:31:00.000Z',
        sequence: 0,
        note: 'Write the next step.\nPause before switching tasks.',
      },
      {
        id: 'rating-focus',
        skillId: 'focus',
        ratingId: 'rating-focus',
        skillName: 'Focus',
        rating: 6,
        ratedAt: '2026-10-05T10:31:00.000Z',
        sequence: 1,
      },
    ],
  };

  const speech = buildSkillRatingSpeechText('Morning routine', event);

  assert.match(speech, /^Morning routine\. Run completed /);
  assert.ok(speech.includes(formatSkillRatingDateTime(event.dateTime)));
  assert.ok(speech.includes('1. Planning. Rating: 8 out of 10. Reflection: Write the next step. Pause before switching tasks.'));
  assert.ok(speech.includes('2. Focus. Rating: 6 out of 10. Reflection: No reflection was recorded.'));
  assert.ok(speech.indexOf('Planning') < speech.indexOf('Focus'));
});

test('speech text identifies a manually recorded rating session', () => {
  const event: SkillRatingEvent = {
    id: 'legacy:2026-10-05T10:30:00.000Z',
    dateTime: '2026-10-05T10:30:00.000Z',
    isRunTime: false,
    ratings: [{
      id: 'rating-focus',
      skillId: 'focus',
      ratingId: 'rating-focus',
      skillName: 'Focus',
      rating: 7,
      ratedAt: '2026-10-05T10:30:00.000Z',
      note: '  Try a shorter session. ',
    }],
  };

  assert.match(
    buildSkillRatingSpeechText('Morning routine', event),
    /Ratings recorded .* Focus\. Rating: 7 out of 10\. Reflection: Try a shorter session\./,
  );
});

test('speech text rejects empty or invalid rating data', () => {
  const event: SkillRatingEvent = {
    id: 'run:invalid',
    dateTime: '2026-10-05T10:30:00.000Z',
    isRunTime: true,
    ratings: [],
  };

  assert.throws(() => buildSkillRatingSpeechText('Morning routine', event), /no skill ratings to speak/);
  assert.throws(() => buildSkillRatingSpeechText('', event), /routine name is missing/);
});
