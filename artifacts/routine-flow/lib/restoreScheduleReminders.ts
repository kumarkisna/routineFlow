import { futureScheduleAlerts } from './scheduleAlerts';
import { persistScheduleChange, type RoutineSchedule } from './schedules';

type RestoredProfileSchedules = {
  profile: { id: string };
  snapshot: { schedules: RoutineSchedule[] };
  schedulesToEnable: RoutineSchedule[];
};

type ScheduleStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

type ScheduleReminderService = {
  create: (schedule: RoutineSchedule, offsetMinutes?: number) => Promise<string>;
  cancel: (notificationId: string) => Promise<void>;
};

type RestoreScheduleRemindersOptions = {
  profiles: RestoredProfileSchedules[];
  existingSchedules: RoutineSchedule[];
  platform: string;
  createStorage: (personId: string) => ScheduleStorage;
  createReminderService: (personId: string) => ScheduleReminderService;
  now?: number;
};

/** Re-register imported alerts against their owning profile after its data is saved. */
export async function restoreScheduleReminders({
  profiles, existingSchedules, platform, createStorage, createReminderService, now = Date.now(),
}: RestoreScheduleRemindersOptions): Promise<number> {
  const schedulesToEnable = profiles.flatMap(result => result.schedulesToEnable);
  const importedFutureAlerts = schedulesToEnable.reduce(
    (total, schedule) => total + futureScheduleAlerts(schedule, now).length, 0,
  );

  if (platform === 'web') return schedulesToEnable.length;

  const existingFutureAlerts = existingSchedules.reduce(
    (total, schedule) => total + futureScheduleAlerts(schedule, now).length, 0,
  );
  if (platform === 'ios' && existingFutureAlerts + importedFutureAlerts > 60) {
    return schedulesToEnable.length;
  }

  let remindersLeftOff = 0;
  let reminderSetupBlocked = false;
  const schedulesByPerson = new Map(profiles.map(result => [
    result.profile.id,
    [...result.snapshot.schedules],
  ]));

  for (const result of profiles) {
    let personSchedules = schedulesByPerson.get(result.profile.id) ?? [];
    const storage = createStorage(result.profile.id);
    for (const schedule of result.schedulesToEnable) {
      if (!futureScheduleAlerts(schedule, now).length || reminderSetupBlocked) {
        remindersLeftOff++;
        continue;
      }
      try {
        personSchedules = await persistScheduleChange(
          storage,
          '@routine-flow/schedules',
          personSchedules,
          { ...schedule, reminder: true },
          schedule.id,
          createReminderService(result.profile.id),
        );
        schedulesByPerson.set(result.profile.id, personSchedules);
      } catch {
        reminderSetupBlocked = true;
        remindersLeftOff++;
      }
    }
  }

  return remindersLeftOff;
}
