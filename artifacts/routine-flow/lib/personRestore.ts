import type { AllPeopleBackup, RoutineBackup } from '@/lib/routineTransfer';
import { mergeImportedProgress, mergeImportedRoutines } from '@/lib/routineTransfer';
import { mergePlaylistCatalog, remapPlaylistReferences } from '@/lib/playlists';
import { mergeImportedSchedules, type RoutineSchedule } from '@/lib/schedules';
import { mergeSkillCatalog, remapRoutineSkillIds } from '@/lib/skills';
import type { CompletionMap } from '@/types/routines';
import type { Person, PersonSnapshot } from '@/types/people';

export type PersonRestoreSnapshot = PersonSnapshot & {
  progress: CompletionMap;
  selectedThemeId: string;
};

export type PersonRestoreResult = {
  profile: Person;
  snapshot: PersonRestoreSnapshot;
  schedulesToEnable: RoutineSchedule[];
  counts: {
    routinesAdded: number;
    playlistsAdded: number;
    playlistsUpdated: number;
    skillsAdded: number;
    ratingsAdded: number;
    schedulesAdded: number;
    schedulesSkipped: number;
    progressAdded: number;
    progressKept: number;
  };
};

export function mergePersonRestore(
  current: PersonRestoreSnapshot,
  profile: Person,
  imported: AllPeopleBackup['people'][number],
  restoreHistory: boolean,
): PersonRestoreResult {
  const backup: RoutineBackup = imported.backup;
  if (!backup.personData || !backup.skills) {
    throw new Error(`The backup for ${profile.name} is missing full profile data.`);
  }

  const skills = mergeSkillCatalog(current.skills, backup.skills);
  const ratingCount = (items: typeof current.skills) =>
    items.reduce((total, skill) => total + (skill.ratings?.length ?? 0), 0);
  const routines = mergeImportedRoutines(
    current.routines,
    remapRoutineSkillIds(backup.routines, skills.idMap),
    () => `routine-import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    current.progress,
  );
  const playlists = mergePlaylistCatalog(
    current.playlists,
    remapPlaylistReferences(backup.personData.playlists, routines.idMap, skills.idMap),
  );
  const schedules = mergeImportedSchedules(
    current.schedules,
    backup.personData.schedules,
    routines.idMap,
    playlists.idMap,
    skills.idMap,
  );
  const progress = restoreHistory && backup.progress
    ? mergeImportedProgress(current.progress, backup.progress, routines.idMap, playlists.idMap)
    : { progress: current.progress, added: 0, kept: 0 };
  const routineById = new Map(routines.routines.map(routine => [routine.id, routine]));
  const playlistById = new Map(playlists.playlists.map(playlist => [playlist.id, playlist]));
  const setScheduleTitle = <T extends import('@/lib/schedules').RoutineSchedule>(schedule: T): T => {
    const title = schedule.targetType === 'routine'
      ? routineById.get(schedule.targetId)?.title
      : schedule.playlistOverride?.title ?? playlistById.get(schedule.targetId)?.title;
    return title ? { ...schedule, targetTitle: title } : schedule;
  };
  const mergedSchedules = schedules.schedules.map(setScheduleTitle);
  const schedulesById = new Map(mergedSchedules.map(schedule => [schedule.id, schedule]));
  const schedulesToEnable = schedules.added
    .filter(schedule => schedule.reminder)
    .map(schedule => ({
      ...setScheduleTitle(schedulesById.get(schedule.id)!),
      reminder: true,
      notificationId: undefined,
      notifications: undefined,
    }));

  return {
    profile,
    snapshot: {
      routines: routines.routines,
      playlists: playlists.playlists,
      schedules: mergedSchedules,
      skills: skills.skills,
      skillRatingWindow: backup.personData.skillRatingWindow,
      progress: progress.progress,
      selectedThemeId: backup.personData.selectedThemeId,
    },
    schedulesToEnable,
    counts: {
      routinesAdded: routines.added,
      playlistsAdded: playlists.added,
      playlistsUpdated: playlists.updated,
      skillsAdded: Math.max(0, skills.skills.length - current.skills.length),
      ratingsAdded: Math.max(0, ratingCount(skills.skills) - ratingCount(current.skills)),
      schedulesAdded: schedules.added.length,
      schedulesSkipped: schedules.skipped,
      progressAdded: progress.added,
      progressKept: progress.kept,
    },
  };
}
