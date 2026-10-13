import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPersonStorage, persistPersonBackgroundImage, PERSON_DATA_KEYS } from './personStorage';

function makeBackend(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  let failNextSetAfterCommit = false;
  let failNextRemoveAfterCommit = false;
  return {
    values,
    failNextSetAfterCommit() { failNextSetAfterCommit = true; },
    failNextRemoveAfterCommit() { failNextRemoveAfterCommit = true; },
    backend: {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
        if (failNextSetAfterCommit) {
          failNextSetAfterCommit = false;
          throw new Error('Temporary storage failure after commit.');
        }
      },
      removeItem: async (key: string) => {
        values.delete(key);
        if (failNextRemoveAfterCommit) {
          failNextRemoveAfterCommit = false;
          throw new Error('Temporary storage failure after removal.');
        }
      },
    },
  };
}

test('a failed background save restores the selected profile and can be retried without changing another profile', async () => {
  const backend = makeBackend({
    [PERSON_DATA_KEYS.backgroundImage]: 'me-old-photo',
    [`@routine-flow/person/alex/${PERSON_DATA_KEYS.backgroundImage}`]: 'alex-photo',
  });
  const me = createPersonStorage('me', backend.backend);
  const alex = createPersonStorage('alex', backend.backend);

  backend.failNextSetAfterCommit();
  await assert.rejects(persistPersonBackgroundImage(me, 'me-new-photo'), /could not be saved.*previous photo is still selected/i);
  assert.equal(await me.getItem(PERSON_DATA_KEYS.backgroundImage), 'me-old-photo');
  assert.equal(await alex.getItem(PERSON_DATA_KEYS.backgroundImage), 'alex-photo');

  await persistPersonBackgroundImage(me, 'me-new-photo');
  assert.equal(await me.getItem(PERSON_DATA_KEYS.backgroundImage), 'me-new-photo');
  assert.equal(await alex.getItem(PERSON_DATA_KEYS.backgroundImage), 'alex-photo');
});

test('a failed background clear restores the selected photo and can be retried without changing another profile', async () => {
  const backend = makeBackend({
    [PERSON_DATA_KEYS.backgroundImage]: 'me-photo',
    [`@routine-flow/person/alex/${PERSON_DATA_KEYS.backgroundImage}`]: 'alex-photo',
  });
  const me = createPersonStorage('me', backend.backend);
  const alex = createPersonStorage('alex', backend.backend);

  backend.failNextRemoveAfterCommit();
  await assert.rejects(persistPersonBackgroundImage(me, null), /could not be cleared.*previous photo is still selected/i);
  assert.equal(await me.getItem(PERSON_DATA_KEYS.backgroundImage), 'me-photo');
  assert.equal(await alex.getItem(PERSON_DATA_KEYS.backgroundImage), 'alex-photo');

  await persistPersonBackgroundImage(me, null);
  assert.equal(await me.getItem(PERSON_DATA_KEYS.backgroundImage), null);
  assert.equal(await alex.getItem(PERSON_DATA_KEYS.backgroundImage), 'alex-photo');
});
