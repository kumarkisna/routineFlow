import type { Routine } from './routines';
import type { RoutinePlaylist } from '@/lib/playlists';
import type { RoutineSchedule } from '@/lib/schedules';

export type Person = {
  id: string;
  name: string;
};
export type PersonProfileInput = {
  name: string;
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