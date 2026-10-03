// Import only local-notification modules. The package root also initializes
// remote push modules, which throw on Android in Expo Go.
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { addNotificationResponseReceivedListener, getLastNotificationResponseAsync, clearLastNotificationResponseAsync } from 'expo-notifications/build/NotificationsEmitter';
import { Platform } from 'react-native';

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
  SchedulableTriggerInputTypes,
  cancelScheduledNotificationAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationHandler,
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
  clearLastNotificationResponseAsync,
};