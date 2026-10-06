import assert from 'node:assert/strict';
import test from 'node:test';
import { initialPeopleRegistry, parsePeopleRegistry } from './peopleRegistry';

test('legacy person profiles default playlist-end skill ratings on', () => {
  const registry = parsePeopleRegistry(JSON.stringify({
    version: 1,
    people: [{ id: 'me', name: 'Me' }, { id: 'person-2', name: 'Alex' }],
    activePersonId: 'person-2',
  }));

  assert.equal(registry.people[0].defaultRateSkillsAtPlaylistEnd, true);
  assert.equal(registry.people[1].defaultRateSkillsAtPlaylistEnd, true);
  assert.equal(initialPeopleRegistry.people[0].defaultRateSkillsAtPlaylistEnd, true);
});

test('person registry preserves an explicitly disabled playlist default', () => {
  const registry = parsePeopleRegistry(JSON.stringify({
    version: 1,
    people: [{ id: 'me', name: 'Me', defaultRateSkillsAtPlaylistEnd: false }],
    activePersonId: 'me',
  }));

  assert.equal(registry.people[0].defaultRateSkillsAtPlaylistEnd, false);
});

test('person registry rejects invalid playlist default values', () => {
  assert.throws(() => parsePeopleRegistry(JSON.stringify({
    version: 1,
    people: [{ id: 'me', name: 'Me', defaultRateSkillsAtPlaylistEnd: 'off' }],
    activePersonId: 'me',
  })));
});
