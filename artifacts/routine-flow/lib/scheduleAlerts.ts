import type { RoutineSchedule } from './schedules';

export const MAX_SCHEDULE_ALERTS = 12;
export const DEFAULT_ALERT_MINUTES = [0, 15, 60];
export type ScheduledAlertNotification = { id: string; offsetMinutes: number };

export function validateAlertOffsets(value: unknown): asserts value is number[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SCHEDULE_ALERTS) {
    throw new Error('Set between 1 and 12 alerts for this scheduled routine or playlist.');
  }
  if (value.some(n => !Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(n * 60000))) {
    throw new Error('Enter a valid lead time in whole minutes. Use 0 for the scheduled start time.');
  }
  if (new Set(value).size !== value.length) throw new Error('Choose a different lead time for each alert.');
}

/** Legacy appointments have one alert at their scheduled start. */
export function scheduleAlertOffsets(schedule: Pick<RoutineSchedule, 'alertOffsetsMinutes'>): number[] {
  return [...(schedule.alertOffsetsMinutes ?? [0])];
}

export function alertDate(schedule: Pick<RoutineSchedule, 'scheduledAt'>, offsetMinutes: number): Date {
  return new Date(Date.parse(schedule.scheduledAt) - offsetMinutes * 60000);
}

export function futureScheduleAlerts(
  schedule: Pick<RoutineSchedule, 'scheduledAt' | 'reminder' | 'alertOffsetsMinutes'>, now = Date.now(),
): number[] {
  if (!schedule.reminder) return [];
  return scheduleAlertOffsets(schedule).filter(offset => alertDate(schedule, offset).getTime() > now);
}

export function scheduleNotificationRecords(schedule: RoutineSchedule): ScheduledAlertNotification[] {
  return schedule.notifications ?? (schedule.notificationId ? [{ id: schedule.notificationId, offsetMinutes: 0 }] : []);
}

export function formatAlertOffset(minutes: number): string {
  if (minutes === 0) return 'At start';
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? 'day' : 'days'} before`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'} before`;
  return `${minutes} min before`;
}

export function scheduleAlertContent(schedule: RoutineSchedule, offsetMinutes = 0) {
  const kind = schedule.targetType === 'playlist' ? 'playlist' : 'routine';
  return {
    title: offsetMinutes === 0 ? `Time for your ${kind}` : `Upcoming ${kind}`,
    body: offsetMinutes === 0 ? `${schedule.targetTitle} is scheduled now. Tap to open your schedule.`
      : `${schedule.targetTitle} · ${formatAlertOffset(offsetMinutes)}. Starts ${new Date(schedule.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}. Tap to open your schedule.`,
    sound: 'default', data: { scheduleId: schedule.id, alertOffsetMinutes: offsetMinutes },
  };
}