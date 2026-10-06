import type { SkillRatingEvent } from './progressHistory';
import { formatSkillRatingDateTime } from './skillRatingReport';

function cleanSpeechText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function buildSkillRatingSpeechText(routineTitle: string, event: SkillRatingEvent): string {
  const title = cleanSpeechText(routineTitle);
  if (!title) throw new Error('The routine name is missing.');
  if (!event.ratings.length) throw new Error('There are no skill ratings to speak.');

  const dateTime = formatSkillRatingDateTime(event.dateTime);
  const eventSummary = event.isRunTime
    ? `Run completed ${dateTime}.`
    : `Ratings recorded ${dateTime}.`;
  const ratings = event.ratings.map((rating, index) => {
    const skillName = cleanSpeechText(rating.skillName);
    if (!skillName || !Number.isInteger(rating.rating) || rating.rating < 1 || rating.rating > 10) {
      throw new Error('A saved skill rating could not be read.');
    }
    const reflection = cleanSpeechText(rating.note ?? '') || 'No reflection was recorded.';
    return `${index + 1}. ${skillName}. Rating: ${rating.rating} out of 10. Reflection: ${reflection}.`;
  });

  return [`${title}.`, eventSummary, ...ratings].join(' ');
}
