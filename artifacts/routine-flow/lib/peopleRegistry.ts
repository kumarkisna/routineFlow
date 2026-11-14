import { DEFAULT_PERSON_ID } from './personStorage';
import { DEFAULT_PLAYLIST_REMINDER_SETTINGS } from './playlists';
import type { Person } from '@/types/people';
import { DEFAULT_SPEECH_LINE_GAP_SECONDS, isValidSpeechLineGapSeconds } from './speechGap';

export type PeopleRegistry = { version: 1; people: Person[]; activePersonId: string };

export const initialPeopleRegistry: PeopleRegistry = {
  version: 1,
  people: [{
    id: DEFAULT_PERSON_ID,
    name: 'Me',
    speechVoiceId: null,
    defaultSpeechLineGapSeconds: DEFAULT_SPEECH_LINE_GAP_SECONDS,
    defaultRateSkillsAtPlaylistEnd: true,
    defaultPlaylistReminderSettings: { ...DEFAULT_PLAYLIST_REMINDER_SETTINGS },
    defaultSpeakRoutineDescription: true,
  }],
  activePersonId: DEFAULT_PERSON_ID,
};

export function parsePeopleRegistry(raw: string): PeopleRegistry {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Saved people are invalid.');
  const item = value as Partial<PeopleRegistry>;
  if (item.version !== 1 || !Array.isArray(item.people) || !item.people.length
    || item.people.some(person => !person || typeof person.id !== 'string' || !person.id
      || typeof person.name !== 'string' || !person.name.trim()
       || (person.speechVoiceId !== undefined
         && person.speechVoiceId !== null
         && (typeof person.speechVoiceId !== 'string' || !person.speechVoiceId.trim()))
      || (person.defaultRateSkillsAtPlaylistEnd !== undefined
        && typeof person.defaultRateSkillsAtPlaylistEnd !== 'boolean')
      || (person.defaultSpeakRoutineDescription !== undefined
        && typeof person.defaultSpeakRoutineDescription !== 'boolean')
      || (person.defaultSpeechLineGapSeconds !== undefined
        && !isValidSpeechLineGapSeconds(person.defaultSpeechLineGapSeconds))
      || (person.defaultPlaylistReminderSettings !== undefined && (
        !person.defaultPlaylistReminderSettings
        || typeof person.defaultPlaylistReminderSettings.stepCompletion !== 'boolean'
        || typeof person.defaultPlaylistReminderSettings.routineCompletion !== 'boolean'
      )))
    || new Set(item.people.map(person => person.id)).size !== item.people.length
    || !item.people.some(person => person.id === DEFAULT_PERSON_ID && person.name === 'Me')
    || !item.people.some(person => person.id === item.activePersonId)) {
    throw new Error('Saved people are invalid. Your data has not been replaced.');
  }
  return {
    version: 1,
    people: item.people.map(person => ({
      id: person.id,
      name: person.name,
      speechVoiceId: person.speechVoiceId ?? null,
      defaultSpeechLineGapSeconds: person.defaultSpeechLineGapSeconds ?? DEFAULT_SPEECH_LINE_GAP_SECONDS,
      defaultRateSkillsAtPlaylistEnd: person.defaultRateSkillsAtPlaylistEnd ?? true,
      defaultSpeakRoutineDescription: person.defaultSpeakRoutineDescription ?? true,
      defaultPlaylistReminderSettings: {
        stepCompletion: person.defaultPlaylistReminderSettings?.stepCompletion
          ?? DEFAULT_PLAYLIST_REMINDER_SETTINGS.stepCompletion,
        routineCompletion: person.defaultPlaylistReminderSettings?.routineCompletion
          ?? DEFAULT_PLAYLIST_REMINDER_SETTINGS.routineCompletion,
      },
    })),
    activePersonId: item.activePersonId!,
  };
}
