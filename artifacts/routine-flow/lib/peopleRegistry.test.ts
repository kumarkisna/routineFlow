import assert from 'node:assert/strict';
import test from 'node:test';
import { initialPeopleRegistry, parsePeopleRegistry } from './peopleRegistry';

test('legacy person profiles keep skill ratings on and default playlist reminders off', () => {
  const registry = parsePeopleRegistry(JSON.stringify({
    version: 1,
    people: [{ id: 'me', name: 'Me' }, { id: 'person-2', name: 'Alex' }],
    activePersonId: 'person-2',
  }));

  assert.equal(registry.people[0].defaultRateSkillsAtPlaylistEnd, true);
  assert.equal(registry.people[1].defaultRateSkillsAtPlaylistEnd, true);
  assert.equal(registry.people[0].speechVoiceId, null);
  assert.equal(registry.people[1].speechVoiceId, null);
  assert.deepEqual(registry.people[0].defaultPlaylistReminderSettings, { stepCompletion: false, routineCompletion: false });
  assert.deepEqual(registry.people[1].defaultPlaylistReminderSettings, { stepCompletion: false, routineCompletion: false });
  assert.equal(initialPeopleRegistry.people[0].defaultRateSkillsAtPlaylistEnd, true);
  assert.deepEqual(initialPeopleRegistry.people[0].defaultPlaylistReminderSettings, { stepCompletion: false, routineCompletion: false });
});

test('person registry preserves an explicitly disabled playlist default', () => {
  const registry = parsePeopleRegistry(JSON.stringify({
    version: 1,
    people: [{ id: 'me', name: 'Me', defaultRateSkillsAtPlaylistEnd: false }],
    activePersonId: 'me',
  }));

  assert.equal(registry.people[0].defaultRateSkillsAtPlaylistEnd, false);
});

test('person registry preserves configured playlist reminder defaults', () => {
  const registry = parsePeopleRegistry(JSON.stringify({
    version: 1,
    people: [{
      id: 'me',
      name: 'Me',
      defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: false },
    }],
    activePersonId: 'me',
  }));

  assert.deepEqual(registry.people[0].defaultPlaylistReminderSettings, {
    stepCompletion: true,
    routineCompletion: false,
  });
});

test('person registry preserves a selected platform speech voice', () => {
  const registry = parsePeopleRegistry(JSON.stringify({
    version: 1,
    people: [{ id: 'me', name: 'Me', speechVoiceId: 'com.example.voice.enhanced' }],
    activePersonId: 'me',
  }));

  assert.equal(registry.people[0].speechVoiceId, 'com.example.voice.enhanced');
});

test('person registry rejects invalid playlist default values', () => {
  assert.throws(() => parsePeopleRegistry(JSON.stringify({
    version: 1,
    people: [{ id: 'me', name: 'Me', defaultRateSkillsAtPlaylistEnd: 'off' }],
    activePersonId: 'me',
  })));
  assert.throws(() => parsePeopleRegistry(JSON.stringify({
    version: 1,
    people: [{ id: 'me', name: 'Me', defaultPlaylistReminderSettings: { stepCompletion: true } }],
    activePersonId: 'me',
  })));
  assert.throws(() => parsePeopleRegistry(JSON.stringify({
    version: 1,
    people: [{ id: 'me', name: 'Me', speechVoiceId: '' }],
    activePersonId: 'me',
  })));
});
