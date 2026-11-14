import type { Routine } from './routines';
import type { CompletionMap, RoutineNotificationSettings } from './routines';
import type { RoutinePlaylist } from '@/lib/playlists';
import type { RoutineSchedule } from '@/lib/schedules';
import type { RoutineSkill } from '@/lib/skills';
import type { ThemeCustomizationStore } from '@/lib/appThemes';

export type Person = {
  id: string;
  name: string;
  speechVoiceId: string | null;
  defaultSpeechLineGapSeconds: number;
  defaultRateSkillsAtPlaylistEnd: boolean;
  defaultPlaylistReminderSettings: RoutineNotificationSettings;
  defaultSpeakRoutineDescription: boolean;
  defaultStepPhotoSlideshow: boolean;
  defaultStepPhotoSlideshowIntervalSeconds: number;
};
export type PersonProfileInput = {
  name: string;
  speechVoiceId?: string | null;
  defaultSpeechLineGapSeconds?: number;
  defaultRateSkillsAtPlaylistEnd: boolean;
  defaultPlaylistReminderSettings: RoutineNotificationSettings;
  defaultSpeakRoutineDescription: boolean;
  defaultStepPhotoSlideshow: boolean;
  defaultStepPhotoSlideshowIntervalSeconds?: number;
};
export type PersonSnapshot = {
  routines: Routine[];
  playlists: RoutinePlaylist[];
  schedules: RoutineSchedule[];
  skills: RoutineSkill[];
  skillRatingWindow: number;
};
export type PersonExportSnapshot = PersonSnapshot & {
  progress: CompletionMap;
  selectedThemeId: string;
  themeCustomizations: ThemeCustomizationStore;
};
export type PersonCopySelection = {
  routineIds: string[];
  playlistIds: string[];
  scheduleIds: string[];
};
export type PersonCopySummary = {
  routines: number;
  playlists: number;
  schedules: number;
};