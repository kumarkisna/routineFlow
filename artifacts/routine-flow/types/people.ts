import type { Routine } from './routines';
import type { RoutinePlaylist } from '@/lib/playlists';
import type { RoutineSchedule } from '@/lib/schedules';

export type Person = {
  id: string;
  name: string;
  backupEmailFrom?: string;
  backupEmailTo?: string;
  backupEmailSubject?: string;
  backupEmailMessage?: string;
  includeDailyProgressByDefault?: boolean;
};
export type PersonProfileInput = {
  name: string;
  backupEmailFrom?: string;
  backupEmailTo?: string;
  backupEmailSubject?: string;
  backupEmailMessage?: string;
  includeDailyProgressByDefault?: boolean;
};
export type PersonSnapshot = {
  routines: Routine[];
  playlists: RoutinePlaylist[];
  schedules: RoutineSchedule[];
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