import type * as LocalNotifications from './localNotifications';
import { alertDate, scheduleAlertContent } from '@/lib/scheduleAlerts';
import type { RoutineSchedule } from '@/lib/schedules';

export type ScheduleReminderNotifications = Pick<typeof LocalNotifications.Notifications,
  'SchedulableTriggerInputTypes' | 'getPermissionsAsync' | 'requestPermissionsAsync'
  | 'scheduleNotificationAsync' | 'cancelScheduledNotificationAsync'>;

export type ScheduleReminderService = {
  create: (schedule: RoutineSchedule, offsetMinutes?: number) => Promise<string>;
  cancel: (notificationId: string) => Promise<void>;
};

export function createScheduleReminderService(
  personId: string,
  platform: string,
  notifications: ScheduleReminderNotifications,
): ScheduleReminderService {
  return {
    create: async (schedule, offsetMinutes = 0) => {
      if (platform === 'web') {
        throw new Error('Phone reminders are unavailable in the web preview. Turn off the reminder to save.');
      }
      let permission = await notifications.getPermissionsAsync();
      if (!permission.granted) permission = await notifications.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Enable notifications in your phone settings, or turn off the reminder to save.');
      }
      const notificationAt = alertDate(schedule, offsetMinutes);
      if (!Number.isFinite(notificationAt.getTime()) || notificationAt.getTime() <= Date.now()) {
        throw new Error('An alert time has passed. Choose a later date or a shorter lead time.');
      }
      const alertContent = scheduleAlertContent(schedule, offsetMinutes);
      return notifications.scheduleNotificationAsync({
        ...(schedule.notificationId ? { identifier: schedule.notificationId } : {}),
        content: { ...alertContent, data: { ...alertContent.data, personId } },
        trigger: { type: notifications.SchedulableTriggerInputTypes.DATE, date: notificationAt },
      });
    },
    cancel: async notificationId => {
      if (platform !== 'web') await notifications.cancelScheduledNotificationAsync(notificationId);
    },
  };
}
