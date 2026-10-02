import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router, useRootNavigationState } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications/build/Notifications.types';
import { Notifications } from '@/lib/localNotifications';
import { usePeople } from '@/context/PeopleContext';

/** A reminder opens the schedule list, never starts audio in the background. */
export function ScheduleNotificationLink() {
  const navigation = useRootNavigationState();
  const { people, activePerson, switchPerson } = usePeople();
  const lastHandled = useRef('');
  useEffect(() => {
    if (Platform.OS === 'web' || !navigation?.key) return;
    let active = true;
    function handle(response: NotificationResponse | null) {
      if (!active || !response) return;
      const request = response.notification.request;
      if (typeof request.content.data?.scheduleId !== 'string') return;
      const handledKey = `${activePerson.id}:${request.identifier}`;
      if (lastHandled.current === handledKey) return;
      const rawPersonId = request.content.data.personId;
      const ownerId = rawPersonId === undefined ? 'me'
        : typeof rawPersonId === 'string' && rawPersonId.length ? rawPersonId : null;
      const owner = ownerId ? people.find(person => person.id === ownerId) : undefined;
      if (!owner) {
        lastHandled.current = handledKey;
        console.warn(`Ignoring schedule notification with unknown person owner "${String(rawPersonId)}".`);
        return;
      }
      lastHandled.current = handledKey;
      if (owner.id !== activePerson.id) {
        void switchPerson(owner.id).catch(error => {
          console.error(`Could not switch to person "${owner.id}" for this schedule notification.`, error);
        });
        return;
      }
      router.push('/schedule');
      void Notifications.clearLastNotificationResponseAsync().catch(error => {
        console.error('Could not clear the handled schedule notification response.', error);
      });
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync().then(handle).catch(error => {
      console.error('Could not read the last schedule notification response.', error);
    });
    return () => { active = false; subscription.remove(); };
  }, [navigation?.key, activePerson.id, people, switchPerson]);
  return null;
}