import { scheduleNotificationRecords } from './scheduleAlerts';
import { parseSchedules } from './schedules';
import { PERSON_DATA_KEYS, personStorageKey } from './personStorage';

type PersonRemovalStorage = {
  getAllKeys: () => Promise<readonly string[]>;
  getItem: (key: string) => Promise<string | null>;
  multiRemove: (keys: string[]) => Promise<void>;
};

/**
 * Cancel one profile's saved schedule reminders, then remove only its storage.
 * The caller updates the people registry and cleans up orphaned attachments afterward.
 */
export async function removePersonSavedData(
  personId: string,
  storage: PersonRemovalStorage,
  cancelReminder: (notificationId: string) => Promise<void>,
) {
  if (personId === 'me') throw new Error('The default Me profile cannot be removed.');
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(personId)) {
    throw new Error('This profile has an invalid ID and cannot be safely removed.');
  }

  let schedules;
  try {
    const savedSchedules = await storage.getItem(personStorageKey(personId, PERSON_DATA_KEYS.schedules));
    schedules = savedSchedules ? parseSchedules(savedSchedules) : [];
  } catch {
    throw new Error('This profile’s schedules could not be checked safely. No profile data was removed.');
  }

  const notificationIds = [...new Set(schedules.flatMap(schedule =>
    scheduleNotificationRecords(schedule).map(notification => notification.id)))];
  try {
    for (const notificationId of notificationIds) await cancelReminder(notificationId);
  } catch {
    throw new Error('Could not cancel this profile’s phone reminders. Its saved data was kept; try again.');
  }

  const profilePrefix = `@routine-flow/person/${personId}/`;
  let keysToRemove: string[];
  try {
    keysToRemove = (await storage.getAllKeys()).filter(key => key.startsWith(profilePrefix));
    if (keysToRemove.length) await storage.multiRemove(keysToRemove);
    const remainingKeys = (await storage.getAllKeys()).filter(key => key.startsWith(profilePrefix));
    if (remainingKeys.length) throw new Error('Keys remain.');
  } catch {
    throw new Error('Could not confirm that this profile’s saved data was removed. Other profiles were not changed; try again.');
  }

  return { removedKeys: keysToRemove.length, cancelledReminders: notificationIds.length };
}
