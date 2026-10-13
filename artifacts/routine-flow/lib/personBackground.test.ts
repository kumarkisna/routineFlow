import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capturePersonBackground } from './personBackgroundCamera';
import { createPersonStorage, persistPersonBackgroundImage, PERSON_DATA_KEYS } from './personStorage';

function makeBackend(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const setFailureModes: ('before' | 'after')[] = [];
  const removeFailureModes: ('before' | 'after')[] = [];
  let successfulReadsBeforeFailure: number | null = null;
  return {
    values,
    failNextSetAfterCommit() { setFailureModes.push('after'); },
    failNextSetBeforeCommit() { setFailureModes.push('before'); },
    failNextRemoveAfterCommit() { removeFailureModes.push('after'); },
    failNextGetAfter(successfulReads: number) { successfulReadsBeforeFailure = successfulReads; },
    backend: {
      getItem: async (key: string) => {
        if (successfulReadsBeforeFailure === 0) {
          successfulReadsBeforeFailure = null;
          throw new Error('Temporary storage read failure.');
        }
        if (successfulReadsBeforeFailure !== null) successfulReadsBeforeFailure--;
        return values.get(key) ?? null;
      },
      setItem: async (key: string, value: string) => {
        const failureMode = setFailureModes.shift();
        if (failureMode === 'before') throw new Error('Temporary storage failure before save.');
        values.set(key, value);
        if (failureMode === 'after') throw new Error('Temporary storage failure after commit.');
      },
      removeItem: async (key: string) => {
        const failureMode = removeFailureModes.shift();
        if (failureMode === 'before') throw new Error('Temporary storage failure before removal.');
        values.delete(key);
        if (failureMode === 'after') throw new Error('Temporary storage failure after removal.');
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

test('a failed background save reports uncertainty if rollback and verification also fail', async () => {
  const backend = makeBackend({ [PERSON_DATA_KEYS.backgroundImage]: 'me-old-photo' });
  const me = createPersonStorage('me', backend.backend);
  backend.failNextSetAfterCommit();
  backend.failNextSetBeforeCommit();
  backend.failNextGetAfter(1);

  await assert.rejects(
    persistPersonBackgroundImage(me, 'me-new-photo'),
    error => {
      if (!(error instanceof Error)) return false;
      assert.match(error.message, /previous setting could not be verified/i);
      assert.doesNotMatch(error.message, /previous photo is still selected/i);
      return true;
    },
  );
  assert.equal(backend.values.get(PERSON_DATA_KEYS.backgroundImage), 'me-new-photo');
});

test('a failed background clear reports uncertainty if rollback and verification also fail', async () => {
  const backend = makeBackend({ [PERSON_DATA_KEYS.backgroundImage]: 'me-photo' });
  const me = createPersonStorage('me', backend.backend);
  backend.failNextRemoveAfterCommit();
  backend.failNextSetBeforeCommit();
  backend.failNextGetAfter(1);

  await assert.rejects(
    persistPersonBackgroundImage(me, null),
    error => {
      if (!(error instanceof Error)) return false;
      assert.match(error.message, /previous setting could not be verified/i);
      assert.doesNotMatch(error.message, /previous photo is still selected/i);
      return true;
    },
  );
  assert.equal(backend.values.has(PERSON_DATA_KEYS.backgroundImage), false);
});

test('denied camera permission leaves the selected background untouched and explains how to grant access', async () => {
  let selectedPhoto = 'saved-background-photo';
  let cameraLaunches = 0;
  const saving = capturePersonBackground(
    async () => ({ granted: false, canAskAgain: false }),
    async () => {
      cameraLaunches++;
      return { canceled: false, assets: ['new-photo'] };
    },
    async asset => { selectedPhoto = asset; },
  );

  await assert.rejects(saving, /camera access is blocked.*device settings.*try again/i);
  assert.equal(selectedPhoto, 'saved-background-photo');
  assert.equal(cameraLaunches, 0);
});

test('camera access changed in settings can be retried without restarting or losing the current photo', async () => {
  let selectedPhoto = 'saved-background-photo';
  let cameraPermission = { granted: false, canAskAgain: false };
  let cameraLaunches = 0;
  const capture = () => capturePersonBackground(
    async () => cameraPermission,
    async () => {
      cameraLaunches++;
      return { canceled: false, assets: ['new-photo'] };
    },
    async asset => { selectedPhoto = asset; },
  );

  await assert.rejects(capture(), /device settings.*try again/i);
  assert.equal(selectedPhoto, 'saved-background-photo');
  assert.equal(cameraLaunches, 0);

  cameraPermission = { granted: true, canAskAgain: true };
  assert.equal(selectedPhoto, 'saved-background-photo');
  const result = await capture();
  assert.equal(result, 'saved');
  assert.equal(selectedPhoto, 'new-photo');
  assert.equal(cameraLaunches, 1);
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
