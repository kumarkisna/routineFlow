import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRunReminderRequests, requestRunReminderPermission } from './runReminders';

test('run reminders schedule step completion at the active step end', () => {
  const requests = buildRunReminderRequests({
    routineTitle: 'Morning Reset',
    steps: [{ title: 'Drink water' }, { title: 'Stretch' }],
    activeIndex: 0,
    stepEndsAt: 5000,
    now: 1000,
    settings: { stepCompletion: true, routineCompletion: true },
  });

  assert.deepEqual(requests.map(({ kind, title, body, date }) => ({
    kind, title, body, time: date.getTime(),
  })), [{
    kind: 'step',
    title: 'Step complete',
    body: 'Drink water is complete.',
    time: 5000,
  }]);
});

test('the final step can schedule both step and routine completion reminders', () => {
  const requests = buildRunReminderRequests({
    routineTitle: 'Morning Reset',
    steps: [{ title: 'Drink water' }, { title: 'Stretch' }],
    activeIndex: 1,
    stepEndsAt: 5000,
    now: 1000,
    settings: { stepCompletion: true, routineCompletion: true },
  });

  assert.deepEqual(requests.map(({ kind, title, body }) => ({ kind, title, body })), [
    { kind: 'step', title: 'Step complete', body: 'Morning Reset is complete.' },
    { kind: 'routine', title: 'Routine complete', body: 'Morning Reset is complete.' },
  ]);
  assert.equal(requests[0].date, requests[1].date);
});

test('run reminders skip disabled settings, expired timers, and invalid steps', () => {
  const base = {
    routineTitle: 'Morning Reset',
    steps: [{ title: 'Drink water' }],
    activeIndex: 0,
    stepEndsAt: 5000,
    now: 1000,
    settings: { stepCompletion: false, routineCompletion: false },
  };

  assert.deepEqual(buildRunReminderRequests(base), []);
  assert.deepEqual(buildRunReminderRequests({ ...base, stepEndsAt: 1000,
    settings: { stepCompletion: true, routineCompletion: true } }), []);
  assert.deepEqual(buildRunReminderRequests({ ...base, activeIndex: 1,
    settings: { stepCompletion: true, routineCompletion: true } }), []);
});

test('run reminder permission requests only when needed and possible', async () => {
  let requestCount = 0;
  const granted = await requestRunReminderPermission({
    getPermissionsAsync: async () => ({ granted: true }),
    requestPermissionsAsync: async () => { requestCount += 1; return { granted: true }; },
  });
  assert.equal(granted.granted, true);
  assert.equal(requestCount, 0);

  const newlyGranted = await requestRunReminderPermission({
    getPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
    requestPermissionsAsync: async () => { requestCount += 1; return { granted: true }; },
  });
  assert.equal(newlyGranted.granted, true);
  assert.equal(requestCount, 1);

  const blocked = await requestRunReminderPermission({
    getPermissionsAsync: async () => ({ granted: false, canAskAgain: false }),
    requestPermissionsAsync: async () => { requestCount += 1; return { granted: true }; },
  });
  assert.equal(blocked.granted, false);
  assert.equal(requestCount, 1);
});
