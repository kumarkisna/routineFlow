import assert from 'node:assert/strict';
import test from 'node:test';
import { mergePlaylistCatalog, nextPlaylistCursor, parsePlaylistQueue, parsePlaylists, playablePlaylistIds,
  remapPlaylistReferences, validatePlaylist } from './playlists';
import type { Routine } from '../types/routines';

const routine = (id: string, hidden = false, hiddenStep = false): Routine => ({
  id, title: id, subtitle: '', icon: 'sunny-outline', tone: 'coral',
  createdAt: '', hidden, steps: [{ id: `${id}-step`, title: 'Step', durationSeconds: 1, hidden: hiddenStep }],
});
test('playlist runs retain order and repeats, excluding missing or inactive routines', () => {
  assert.deepEqual(playablePlaylistIds(['b', 'gone', 'a', 'hidden', 'empty', 'b'],
    [routine('a'), routine('b'), routine('hidden', true), routine('empty', false, true)]),
  ['b', 'a', 'b']);
});
test('playlist names and at least one routine are required', () => {
  assert.throws(() => validatePlaylist(' ', ['a']));
  assert.throws(() => validatePlaylist('Morning', []));
  assert.throws(() => validatePlaylist('Morning', Array(101).fill('a')));
  assert.doesNotThrow(() => validatePlaylist('Morning', ['a', 'a']));
});
test('saved playlist parsing keeps ordered identifiers and rejects corrupt storage', () => {
  const list = [{ id: 'p', title: 'Morning', routineIds: ['b', 'a', 'b'] }];
  assert.deepEqual(parsePlaylists(JSON.stringify(list)), list);
  assert.equal(parsePlaylists(JSON.stringify(list))[0].rateSkillsAtPlaylistEnd, true);
  assert.equal(parsePlaylists(JSON.stringify([{ ...list[0], rateSkillsAtPlaylistEnd: true }]))[0].rateSkillsAtPlaylistEnd, true);
  assert.throws(() => parsePlaylists('{}'));
  assert.throws(() => parsePlaylists('[{"id":"p","title":"Morning","routineIds":[12]}]'));
  assert.throws(() => parsePlaylists('[{"id":"p","title":"Morning","routineIds":["a"],"rateSkillsAtPlaylistEnd":"yes"}]'));
});

test('playlist backup imports merge skill links and keep conflicting local playlists intact', () => {
  const existing = [
    { id: 'focus-local', title: 'Focus', routineIds: ['morning'], skillIds: ['local-skill'] },
    { id: 'evening', title: 'Evening', routineIds: ['wind-down'] },
  ];
  const incoming = [
    { id: 'focus-backup', title: 'Focus', routineIds: ['morning'], skillIds: ['backup-skill'] },
    { id: 'evening', title: 'Evening v2', routineIds: ['wind-down', 'stretch'], skillIds: ['mobility'] },
  ];
  let nextId = 0;
  const first = mergePlaylistCatalog(existing, incoming, () => `copy-${++nextId}`);

  assert.deepEqual(first.playlists, [
    { ...existing[0], skillIds: ['local-skill', 'backup-skill'] },
    existing[1],
    { ...incoming[1], id: 'copy-1' },
  ]);
  assert.deepEqual({ added: first.added, skipped: first.skipped, renamed: first.renamed, updated: first.updated }, {
    added: 1, skipped: 0, renamed: 1, updated: 1,
  });
  assert.equal(first.idMap['focus-backup'], 'focus-local');
  assert.equal(first.idMap.evening, 'copy-1');

  const retry = mergePlaylistCatalog(first.playlists, incoming, () => {
    throw new Error('Repeated import must not allocate another playlist ID');
  });
  assert.deepEqual({ added: retry.added, skipped: retry.skipped, renamed: retry.renamed, updated: retry.updated }, {
    added: 0, skipped: 2, renamed: 0, updated: 0,
  });
  assert.deepEqual(retry.playlists, first.playlists);
});

test('backup playlist references follow remapped routine and skill IDs', () => {
  assert.deepEqual(remapPlaylistReferences([{
    id: 'playlist', title: 'Focus', routineIds: ['routine-old', 'local-routine'],
    skillIds: ['skill-old', 'local-skill'],
  }], {
    'routine-old': 'routine-copy',
  }, {
    'skill-old': 'local-focus',
  }), [{
    id: 'playlist', title: 'Focus', routineIds: ['routine-copy', 'local-routine'],
    skillIds: ['local-focus', 'local-skill'],
  }]);
});

test('run queue parsing rejects invalid route data', () => {
  assert.deepEqual(parsePlaylistQueue('["b","a","b"]'), ['b', 'a', 'b']);
  assert.equal(parsePlaylistQueue('nope'), null);
  assert.equal(parsePlaylistQueue('[1]'), null);
  assert.equal(parsePlaylistQueue('[]'), null);
});
test('automatic progression skips removed/hidden routines and handles repeats and the final routine', () => {
  const routines = [routine('a'), routine('b'), routine('hidden', true)];
  const ids = ['a', 'gone', 'hidden', 'a', 'b'];
  assert.equal(nextPlaylistCursor(ids, 0, routines), 3);
  assert.equal(nextPlaylistCursor(ids, 3, routines), 4);
  assert.equal(nextPlaylistCursor(ids, 4, routines), -1);
});