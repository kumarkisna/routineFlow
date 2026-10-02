import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router, useRootNavigationState } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications/build/Notifications.types';
import { Notifications } from '@/lib/localNotifications';

/** A reminder opens the schedule list, never starts audio in the background. */
export function ScheduleNotificationLink() {
  const navigation = useRootNavigationState();
  const lastHandled = useRef('');
  useEffect(() => {
    if (Platform.OS === 'web' || !navigation?.key) return;
    let active = true;
    function handle(response: NotificationResponse | null) {
      if (!active || !response) return;
      const request = response.notification.request;
      if (typeof request.content.data?.scheduleId !== 'string' || lastHandled.current === request.identifier) return;
      lastHandled.current = request.identifier;
      router.push('/schedule');
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => undefined);
    return () => { active = false; subscription.remove(); };
  }, [navigation?.key]);
  return null;
}