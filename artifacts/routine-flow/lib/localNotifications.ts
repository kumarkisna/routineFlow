// Import only local-notification modules. The package root also initializes
// remote push modules, which throw on Android in Expo Go.
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { setNotificationChannelGroupAsync } from 'expo-notifications/build/setNotificationChannelGroupAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { addNotificationResponseReceivedListener, getLastNotificationResponseAsync, clearLastNotificationResponseAsync } from 'expo-notifications/build/NotificationsEmitter';
import { Platform } from 'react-native';

export const SCHEDULE_REMINDER_CHANNEL_ID = 'routine-schedules-v2';
export const REMINDER_CHANNEL_GROUP_ID = 'routine-flow-reminders';

// Keep schedule reminders audible without changing the timer's silent reminders.
if (Platform.OS !== 'web') {
  setNotificationHandler({
    handleNotification: async (notification) => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: typeof notification.request.content.data?.scheduleId === 'string',
      shouldSetBadge: false,
    }),
  });
}

export const Notifications = {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  cancelScheduledNotificationAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelGroupAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
  clearLastNotificationResponseAsync,
};