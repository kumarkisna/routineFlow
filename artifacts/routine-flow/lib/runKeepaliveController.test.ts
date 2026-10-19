import assert from 'node:assert/strict';
import test from 'node:test';
import { createRunKeepaliveController, type AndroidRunKeepaliveBridge } from './runKeepaliveController';

test('Android locked playback is only available when the native service bridge exists', () => {
  assert.equal(createRunKeepaliveController('android', null).isAvailable, false);
  assert.equal(createRunKeepaliveController('android', {
    start: () => true,
    update: () => true,
    stop: () => true,
  }).isAvailable, true);
  assert.equal(createRunKeepaliveController('ios', null).isAvailable, true);
  assert.equal(createRunKeepaliveController('web', null).isAvailable, true);
});

test('the controller forwards start, progress updates, and stop to the Android service', () => {
  const calls: Array<string[]> = [];
  const bridge: AndroidRunKeepaliveBridge = {
    start: (title, body) => { calls.push(['start', title, body]); return true; },
    update: (title, body) => { calls.push(['update', title, body]); return true; },
    stop: () => { calls.push(['stop']); return true; },
  };
  const controller = createRunKeepaliveController('android', bridge);

  assert.equal(controller.start('Morning Reset', 'Step 1 of 3'), true);
  assert.equal(controller.update('Morning Reset', 'Step 2 of 3'), true);
  assert.equal(controller.stop(), true);
  assert.deepEqual(calls, [
    ['start', 'Morning Reset', 'Step 1 of 3'],
    ['update', 'Morning Reset', 'Step 2 of 3'],
    ['stop'],
  ]);
});

test('a native bridge failure is reported without throwing into the timer UI', () => {
  const controller = createRunKeepaliveController('android', {
    start: () => { throw new Error('service unavailable'); },
    update: () => false,
    stop: () => false,
  });
  assert.equal(controller.start('Routine', 'Step 1'), false);
  assert.equal(controller.update('Routine', 'Step 1'), false);
  assert.equal(controller.stop(), false);
});

test('stopping one run leaves the Android keepalive active for the other run', () => {
  const calls: Array<string[]> = [];
  const controller = createRunKeepaliveController('android', {
    start: (title, body) => { calls.push(['start', title, body]); return true; },
    update: (title, body) => { calls.push(['update', title, body]); return true; },
    stop: () => { calls.push(['stop']); return true; },
  });
  controller.start('Routine · Morning', 'Step 1 of 3', 'morning-session');
  controller.start('Routine · Evening', 'Step 1 of 2', 'evening-session');
  controller.stop('morning-session');
  controller.stop('evening-session');
  assert.deepEqual(calls, [
    ['start', 'Routine · Morning', 'Step 1 of 3'],
    ['start', '2 routines running', 'Morning · Evening'],
    ['update', 'Routine · Evening', 'Step 1 of 2'],
    ['stop'],
  ]);
});
