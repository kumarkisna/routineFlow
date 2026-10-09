import { Platform } from 'react-native';
import { Notifications } from '@/lib/localNotifications';
import { alertDate, scheduleAlertContent } from '@/lib/scheduleAlerts';
import type { RoutineSchedule } from '@/lib/schedules';

export type ScheduleReminderService = {
  create: (schedule: RoutineSchedule, offsetMinutes?: number) => Promise<string>;
  cancel: (notificationId: string) => Promise<void>;
};

export function createScheduleReminderService(personId: string): ScheduleReminderService {
  return {
    create: async (schedule, offsetMinutes = 0) => {
      if (Platform.OS === 'web') {
        throw new Error('Phone reminders are unavailable in the web preview. Turn off the reminder to save.');
      }
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Enable notifications in your phone settings, or turn off the reminder to save.');
      }
      const notificationAt = alertDate(schedule, offsetMinutes);
      if (!Number.isFinite(notificationAt.getTime()) || notificationAt.getTime() <= Date.now()) {
        throw new Error('An alert time has passed. Choose a later date or a shorter lead time.');
      }
      const alertContent = scheduleAlertContent(schedule, offsetMinutes);
      return Notifications.scheduleNotificationAsync({
        ...(schedule.notificationId ? { identifier: schedule.notificationId } : {}),
        content: { ...alertContent, data: { ...alertContent.data, personId } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notificationAt },
      });
    },
    cancel: async notificationId => {
      if (Platform.OS !== 'web') await Notifications.cancelScheduledNotificationAsync(notificationId);
    },
  };
}
